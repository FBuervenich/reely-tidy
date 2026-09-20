import { computed, ref, type Ref } from 'vue'
import { getEnglishTitle, getEpisode, type TmdbResult, searchTmdb } from '../lib/tmdb'
import { companionTargetName, createPlan, detectDuplicateTargets, rebuildTarget, type BaseFolders } from '../services/plan-builder'
import { fileExists, getDestination, listFiles, moveFile, pickSourceFolder, supportsNativeMove } from '../services/file-system'
import { readMappings, writeMapping } from '../services/storage'
import type { MoveLog, PlanFilter, PlanRow } from '../types/plan'

const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

export function useMediaPlan(token: Ref<string>, baseFolders: { root: Ref<string>; movies: Ref<string>; shows: Ref<string> }) {
  const root = ref<FileSystemDirectoryHandle>()
  const rootName = ref('No folder selected')
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

  async function chooseFolder(): Promise<boolean> {
    try {
      const selected = await pickSourceFolder()
      root.value = selected
      rootName.value = selected.name
      rows.value = []
      logs.value = []
      scanState.value = `Folder “${selected.name}” selected. Starting the preview — no files have been changed.`
      moveState.value = ''
      return true
    } catch (error) {
      const exception = error as DOMException
      if (exception.name === 'AbortError') return false
      if (exception.name === 'NotAllowedError') {
        const detail = exception.message ? ` (${exception.message})` : ''
        scanState.value = `The browser denied folder access${detail}. Open the app in a standalone Chromium tab and trigger the picker directly using “Choose folder and scan”.`
        return false
      }
      if (exception.name === 'SecurityError') {
        scanState.value = 'Folder access was blocked for security reasons. Open the app via http://localhost instead of a network address or file://.'
        return false
      }
      scanState.value = errorMessage(error)
      return false
    }
  }

  async function chooseAndScan(): Promise<void> {
    if (await chooseFolder()) await scan()
  }

  async function scan(): Promise<void> {
    if (!root.value) return
    scanning.value = true
    rows.value = []
    logs.value = []
    scanState.value = 'Reading files …'
    try {
      const baseFolders = currentBaseFolders()
      rows.value = createPlan(await listFiles(root.value, { ignoredRootDirectories: [baseFolders.root] }), baseFolders)
      if (token.value) await Promise.all(rows.value.filter((row) => row.kind !== 'unknown').map(enrich))
      detectDuplicateTargets(rows.value)
      scanState.value = ''
    } catch (error) { scanState.value = `Scan failed: ${errorMessage(error)}` }
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
        row.error = 'Select the correct TMDB match.'
      } else row.error = 'No TMDB match — using the filename suggestion.'
    } catch (error) { row.state = 'error'; row.error = errorMessage(error) }
    finally { row.searching = false }
  }

  async function selectMatch(row: PlanRow, match: TmdbResult, remember = true): Promise<void> {
    row.match = match
    row.title = match.title || row.title
    row.year = match.year ?? row.year
    row.state = 'ready'
    row.error = undefined
    // Make the destination visible immediately; richer English / episode metadata can refine it afterwards.
    rebuildTarget(row, undefined, currentBaseFolders())
    if (token.value) {
      try {
        row.targetTitle = await getEnglishTitle(row.kind === 'movie' ? 'movie' : 'tv', match.id, token.value)
      } catch (error) {
        row.error = `English title could not be loaded: ${errorMessage(error)}`
      }
    }
    if (row.kind === 'series' && row.season && row.episode && token.value) {
      try {
        const episodeTitle = await getEpisode(match.id, row.season, row.episode, token.value)
        if (!episodeTitle) row.error = 'Episode title is unavailable; the suggestion can be edited.'
        rebuildTarget(row, episodeTitle, currentBaseFolders())
      } catch (error) {
        row.error = `Episode title could not be loaded: ${errorMessage(error)}`
        rebuildTarget(row, undefined, currentBaseFolders())
      }
    } else rebuildTarget(row, undefined, currentBaseFolders())
    if (remember) writeMapping(row.identityKey, match)
    detectDuplicateTargets(rows.value)
  }

  function updateTarget(row: PlanRow, target: string): void {
    row.target = target
    if (target.trim()) { row.state = 'ready'; row.error = undefined; detectDuplicateTargets(rows.value) }
  }

  function currentBaseFolders(): BaseFolders {
    return { root: baseFolders.root.value, movies: baseFolders.movies.value, shows: baseFolders.shows.value }
  }

  function setEnabled(row: PlanRow, enabled: boolean): void { row.enabled = enabled }

  function resetPlanForSettingsChange(): void {
    if (!rows.value.length) return
    rows.value = []
    logs.value = []
    moveState.value = ''
    scanState.value = 'Settings changed. Scan again so the dry run uses the new folder structure.'
  }

  function releaseAccess(message = 'Folder access has been released in the app. Choose the folder again for another scan.'): void {
    // FileSystemDirectoryHandle has no close() API. Clearing every app reference is the
    // strongest release possible; the browser can then reclaim its native resources.
    root.value = undefined
    rootName.value = 'No folder selected'
    rows.value = []
    scanState.value = message
    moveState.value = ''
  }

  async function moveAll(): Promise<void> {
    if (!supportsMove) {
      moveState.value = 'This Chromium browser does not support native moving through the File System Access API. No files were changed.'
      return
    }
    if (!root.value) return
    const candidates = rows.value.filter((row) => row.enabled && row.state === 'ready')
    if (!candidates.length) return
    moving.value = true
    logs.value = []
    moveState.value = 'Checking destination conflicts …'
    try {
      for (const row of candidates) {
        const destination = await getDestination(root.value, row.target)
        const names = [destination.name, ...row.sidecars.map((file) => companionTargetName(row, file.name))]
        for (const name of names) if (await fileExists(destination.folder, name)) {
          row.state = 'conflict'
          row.error = `Destination file already exists: ${name}`
        }
      }
      const permitted = candidates.filter((row) => row.state === 'ready')
      if (!permitted.length) {
        moveState.value = 'Execution stopped: resolve destination conflicts manually first.'
        return
      }
      for (const row of permitted) {
        try {
          const destination = await getDestination(root.value, row.target)
          await moveFile(row.source.handle, destination.folder, destination.name)
          for (const sidecar of row.sidecars) await moveFile(sidecar.handle, destination.folder, companionTargetName(row, sidecar.name))
          row.state = 'done'
          logs.value.push({ source: row.source.path, target: row.target, result: 'Moved' })
        } catch (error) {
          row.state = 'error'
          row.error = `Move was denied: ${errorMessage(error)}`
          logs.value.push({ source: row.source.path, target: row.target, result: 'Error', message: row.error })
        }
      }
      const allSucceeded = logs.value.length === permitted.length && logs.value.every((entry) => entry.result === 'Moved')
      if (allSucceeded) {
        releaseAccess('Execution complete and folder access has been released in the app. The local log remains visible.')
      } else moveState.value = 'Execution complete. See the local log for details.'
    } catch (error) { moveState.value = `Execution stopped: ${errorMessage(error)}` }
    finally { moving.value = false }
  }

  return { root, rootName, rows, logs, filter, scanState, moveState, scanning, moving, supportsMove, visibleRows, readyCount, chooseAndScan, selectMatch, updateTarget, setEnabled, resetPlanForSettingsChange, releaseAccess, moveAll }
}
