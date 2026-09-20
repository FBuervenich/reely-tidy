import { computed, ref, type Ref } from 'vue'
import { getEpisode, type TmdbResult, searchTmdb } from '../lib/tmdb'
import { companionTargetName, createPlan, detectDuplicateTargets, rebuildTarget } from '../services/plan-builder'
import { fileExists, getDestination, listFiles, moveFile, pickSourceFolder, supportsNativeMove } from '../services/file-system'
import { readMappings, writeMapping } from '../services/storage'
import type { MoveLog, PlanFilter, PlanRow } from '../types/plan'

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export function useMediaPlan(token: Ref<string>) {
  const root = ref<FileSystemDirectoryHandle>()
  const rootName = ref('Noch kein Ordner gewählt')
  const rows = ref<PlanRow[]>([])
  const logs = ref<MoveLog[]>([])
  const filter = ref<PlanFilter>('all')
  const scanState = ref('')
  const moveState = ref('')
  const scanning = ref(false)
  const moving = ref(false)
  const supportsMove = supportsNativeMove()

  const visibleRows = computed(() => filter.value === 'all' ? rows.value : rows.value.filter((row) => row.state === filter.value))
  const readyCount = computed(() => rows.value.filter((row) => row.enabled && row.state === 'ready').length)

  async function chooseFolder(): Promise<void> {
    try {
      const selected = await pickSourceFolder()
      root.value = selected
      rootName.value = selected.name
      rows.value = []
      logs.value = []
      scanState.value = `Ordner „${selected.name}“ ausgewählt. Als Nächstes den Scan starten; es wurde noch nichts verändert.`
      moveState.value = ''
    } catch (error) {
      const exception = error as DOMException
      if (exception.name === 'AbortError') return
      if (exception.name === 'NotAllowedError') {
        const detail = exception.message ? ` (${exception.message})` : ''
        scanState.value = `Der Browser hat den Ordnerzugriff abgelehnt${detail}. Bitte die App in einem eigenständigen Chromium-Tab öffnen und den Picker direkt über „Ordner auswählen“ auslösen.`
        return
      }
      if (exception.name === 'SecurityError') {
        scanState.value = 'Ordnerzugriff wurde aus Sicherheitsgründen blockiert. Bitte die App über http://localhost statt über eine Netzwerkadresse oder file:// öffnen.'
        return
      }
      scanState.value = errorMessage(error)
    }
  }

  async function scan(): Promise<void> {
    if (!root.value) return
    scanning.value = true
    rows.value = []
    logs.value = []
    scanState.value = 'Dateien werden gelesen …'
    try {
      rows.value = createPlan(await listFiles(root.value))
      if (token.value) await Promise.all(rows.value.filter((row) => row.kind !== 'unknown').map(enrich))
      detectDuplicateTargets(rows.value)
      scanState.value = `${rows.value.length} Videodatei(en) geplant. Dies ist nur eine Vorschau — es wurde nichts verändert.`
    } catch (error) { scanState.value = `Scan fehlgeschlagen: ${errorMessage(error)}` }
    finally { scanning.value = false }
  }

  async function enrich(row: PlanRow): Promise<void> {
    if (!token.value || row.kind === 'unknown') return
    row.searching = true
    row.error = undefined
    try {
      const cached = readMappings()[row.identityKey]
      if (cached) { await selectMatch(row, cached, false); return }
      row.candidates = await searchTmdb(row.kind === 'movie' ? 'movie' : 'tv', row.title, row.year, token.value)
      if (row.candidates.length === 1) await selectMatch(row, row.candidates[0])
      else if (row.candidates.length > 1) {
        row.state = 'needs-choice'
        row.target = ''
        row.error = 'Bitte passenden TMDB-Treffer auswählen.'
      } else row.error = 'Kein TMDB-Treffer — Dateinamen-Vorschlag wird verwendet.'
    } catch (error) { row.state = 'error'; row.error = errorMessage(error) }
    finally { row.searching = false }
  }

  async function selectMatch(row: PlanRow, match: TmdbResult, remember = true): Promise<void> {
    row.match = match
    row.title = match.title || row.title
    row.year = match.year ?? row.year
    row.state = 'ready'
    row.error = undefined
    if (row.kind === 'series' && row.season && row.episode && token.value) {
      try {
        const episodeTitle = await getEpisode(match.id, row.season, row.episode, token.value)
        if (!episodeTitle) row.error = 'Episodentitel nicht verfügbar; Vorschlag kann bearbeitet werden.'
        rebuildTarget(row, episodeTitle)
      } catch (error) {
        row.error = `Episodentitel nicht geladen: ${errorMessage(error)}`
        rebuildTarget(row)
      }
    } else rebuildTarget(row)
    if (remember) writeMapping(row.identityKey, match)
    detectDuplicateTargets(rows.value)
  }

  function updateTarget(row: PlanRow, target: string): void {
    row.target = target
    if (target.trim()) { row.state = 'ready'; row.error = undefined; detectDuplicateTargets(rows.value) }
  }

  function setEnabled(row: PlanRow, enabled: boolean): void { row.enabled = enabled }

  async function moveAll(): Promise<void> {
    if (!supportsMove) {
      moveState.value = 'Dieses Chromium unterstützt echtes Verschieben über die File System Access API nicht. Es wurde nichts verändert.'
      return
    }
    if (!root.value) return
    const candidates = rows.value.filter((row) => row.enabled && row.state === 'ready')
    if (!candidates.length) return
    moving.value = true
    logs.value = []
    moveState.value = 'Prüfe Zielkonflikte …'
    try {
      for (const row of candidates) {
        const destination = await getDestination(root.value, row.target)
        const names = [destination.name, ...row.sidecars.map((file) => companionTargetName(row, file.name))]
        for (const name of names) if (await fileExists(destination.folder, name)) {
          row.state = 'conflict'
          row.error = `Zieldatei existiert bereits: ${name}`
        }
      }
      const permitted = candidates.filter((row) => row.state === 'ready')
      if (!permitted.length) {
        moveState.value = 'Ausführung abgebrochen: Zielkonflikte müssen zuerst manuell gelöst werden.'
        return
      }
      for (const row of permitted) {
        try {
          const destination = await getDestination(root.value, row.target)
          await moveFile(row.source.handle, destination.folder, destination.name)
          for (const sidecar of row.sidecars) await moveFile(sidecar.handle, destination.folder, companionTargetName(row, sidecar.name))
          row.state = 'done'
          logs.value.push({ source: row.source.path, target: row.target, result: 'Verschoben' })
        } catch (error) {
          row.state = 'error'
          row.error = `Verschieben verweigert: ${errorMessage(error)}`
          logs.value.push({ source: row.source.path, target: row.target, result: 'Fehler', message: row.error })
        }
      }
      moveState.value = 'Ausführung beendet. Details stehen im lokalen Protokoll.'
    } catch (error) { moveState.value = `Ausführung abgebrochen: ${errorMessage(error)}` }
    finally { moving.value = false }
  }

  return { root, rootName, rows, logs, filter, scanState, moveState, scanning, moving, supportsMove, visibleRows, readyCount, chooseFolder, scan, selectMatch, updateTarget, setEnabled, moveAll }
}
