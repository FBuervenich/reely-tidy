import { computed, ref, type Ref } from 'vue'
import { clearTmdbCache, getDetails, resolveId, type TmdbResult, searchTmdb } from '../lib/tmdb'
import {
  automaticMatch,
  findCandidates,
  evaluateCandidates,
  scoreCandidate,
  validateEpisodes,
} from '../services/matching'
import { addNfoContext } from '../services/context'
import { providerIds, type ParsedMedia } from '../lib/media'
import {
  companionTargetName,
  createPlan,
  detectDuplicateTargets,
  hasPlannedOutputNames,
  rebuildTarget,
  type BaseFolders,
} from '../services/plan-builder'
import type { NamingPreset } from '../lib/naming'
import {
  fileExists,
  getDestination,
  listFiles,
  moveFile,
  pickSourceFolder,
  supportsNativeMove,
} from '../services/file-system'
import { forgetMapping, readMappings, writeMapping } from '../services/storage'
import type { MoveLog, PlanFilter, PlanRow } from '../types/plan'

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

export function useMediaPlan(
  token: Ref<string>,
  baseFolders: {
    root: Ref<string>
    preset: Ref<NamingPreset>
  },
) {
  const root = ref<FileSystemDirectoryHandle>()
  const rootName = ref('No folder selected')
  const rows = ref<PlanRow[]>([])
  const logs = ref<MoveLog[]>([])
  const filter = ref<PlanFilter>('all')
  const scanState = ref('')
  const moveState = ref('')
  const scanning = ref(false)
  const readingFiles = ref(false)
  const loadingTmdb = ref(false)
  const tmdbLoaded = ref(0)
  const tmdbTotal = ref(0)
  const moving = ref(false)
  const supportsMove = supportsNativeMove()

  const readyCount = computed(
    () =>
      rows.value.filter(
        (row) => row.enabled && row.state === 'ready' && !row.searching && Boolean(row.target),
      ).length,
  )

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
        scanState.value =
          'Folder access was blocked for security reasons. Open the app via http://localhost instead of a network address or file://.'
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
    readingFiles.value = true
    rows.value = []
    logs.value = []
    scanState.value = ''
    tmdbLoaded.value = 0
    tmdbTotal.value = 0
    try {
      const baseFolders = currentBaseFolders()
      clearTmdbCache()
      const files = await listFiles(root.value, { ignoredRootDirectories: [baseFolders.root] })
      rows.value = createPlan(files, baseFolders, root.value.name)
      await addNfoContext(rows.value, files)
      readingFiles.value = false
      const rowsToEnrich = rows.value.filter((row) => row.kind !== 'unknown')
      if (token.value && rowsToEnrich.length) {
        loadingTmdb.value = true
        tmdbTotal.value = rowsToEnrich.length
        const groups = new Map<string, PlanRow[]>()
        for (const row of rowsToEnrich) {
          // Different explicit IDs must never silently share a match.
          const key = `${row.groupKey}:${JSON.stringify(row.ids)}`
          groups.set(key, [...(groups.get(key) ?? []), row])
        }
        const work = [...groups.values()]
        await Promise.all(
          Array.from({ length: Math.min(4, work.length) }, async () => {
            while (work.length) {
              const group = work.shift()!
              try {
                await enrichGroup(group)
              } finally {
                tmdbLoaded.value += group.length
              }
            }
          }),
        )
      }
      detectDuplicateTargets(rows.value)
      scanState.value = ''
    } catch (error) {
      scanState.value = `Scan failed: ${errorMessage(error)}`
    } finally {
      readingFiles.value = false
      loadingTmdb.value = false
      scanning.value = false
    }
  }

  function refreshState(row: PlanRow): void {
    if (
      row.matchPending ||
      row.sidecarChoices.length ||
      row.episodeValidation === 'missing' ||
      (row.kind === 'series' &&
        row.episodeValidation !== 'valid' &&
        (row.inferredEpisode ||
          row.airDate ||
          (row.kindOverride === 'series' && (row.season === undefined || !row.episodes?.length))))
    )
      row.state = 'needs-choice'
    else if (row.target && row.match && hasPlannedOutputNames(row)) row.state = 'already-named'
    else row.state = row.target ? 'ready' : 'unrecognized'
  }

  function groupKeyFor(row: PlanRow): string {
    if (row.kind !== 'series') return `movie:${rootName.value}/${row.source.path}`
    const parentFolder = row.source.path.slice(0, row.source.path.lastIndexOf('/'))
    const seriesFolder = row.seriesFolder ?? parentFolder
    return `series:${rootName.value}/${seriesFolder}:${row.title.toLowerCase()}:${row.year ?? ''}`
  }

  function matchingDetection(row: PlanRow): ParsedMedia {
    return {
      ...row.detection,
      kind: row.kind,
      season: row.season,
      episode: row.episode,
      episodes: row.episodes,
      airDate: row.airDate,
      calendarSeasonYear: row.calendarSeasonYear,
      episodeTitleHint: row.episodeTitleHint,
      inferredEpisode: row.inferredEpisode,
    }
  }

  function restoreSavedMediaType(
    row: PlanRow,
    kind: 'movie' | 'series',
    saved: { kind?: 'movie' | 'series'; season?: number; episodes?: number[] },
  ): void {
    row.kind = kind
    row.kindOverride = kind === row.detection.kind ? undefined : kind
    if (kind === 'series') {
      row.season = saved.season ?? row.detection.season
      row.episodes = saved.episodes ?? row.detection.episodes
      row.episode = row.episodes?.[0] ?? row.detection.episode
    } else {
      row.season = undefined
      row.episode = undefined
      row.episodes = undefined
      row.airDate = undefined
      row.inferredEpisode = undefined
    }
    row.groupKey = groupKeyFor(row)
  }

  function forgetSavedMappings(row: PlanRow): void {
    forgetMapping(row.identityKey)
    if (row.legacyIdentityKey) forgetMapping(row.legacyIdentityKey)
  }

  async function enrichGroup(group: PlanRow[]): Promise<void> {
    group.forEach((row) => {
      row.searching = true
      row.error = undefined
    })
    try {
      const first = group[0]
      const mappings = readMappings()
      const cached = mappings[first.identityKey] ?? mappings[first.legacyIdentityKey ?? '']
      if (cached) {
        const cachedKind = cached.kind ?? first.kind
        if (cachedKind === 'unknown') return
        const matchingRows = cached.kind && cached.kind !== first.kind ? [first] : group
        for (const row of matchingRows) restoreSavedMediaType(row, cachedKind, cached)
        const current = await getDetails(
          cachedKind === 'series' ? 'tv' : 'movie',
          cached.id,
          token.value,
        )
        await Promise.all(matchingRows.map((row) => applyMatch(row, current, 'confirmed')))
        const remaining = group.filter((row) => !matchingRows.includes(row))
        if (remaining.length) await enrichGroup(remaining)
        return
      }
      const candidates = await findCandidates(first.detection, token.value)
      for (const row of group) {
        row.candidates = await evaluateCandidates(row.detection, candidates, token.value)
        for (const candidate of row.candidates) {
          const providerWarnings =
            candidates
              .find((item) => item.id === candidate.id)
              ?.contradictions?.filter((reason) => reason.startsWith('Provider ID')) ?? []
          candidate.contradictions!.push(...providerWarnings)
        }
        const match = automaticMatch(row.candidates)
        if (match) await applyMatch(row, match, 'metadata')
        else if (candidates.length) {
          row.matchPending = true
          row.state = 'needs-choice'
          row.error = `Select a match or use the filename suggestion. ${row.candidates[0]?.contradictions?.join('; ') || 'Evidence is ambiguous or insufficient.'}`
        } else row.error = 'No TMDB match — unverified filename suggestion.'
      }
    } catch (error) {
      group.forEach((row) => {
        row.error = `Metadata not validated: ${errorMessage(error)}`
      })
    } finally {
      group.forEach((row) => {
        row.searching = false
      })
    }
  }

  async function applyMatch(
    row: PlanRow,
    match: TmdbResult,
    confidence: PlanRow['confidence'],
  ): Promise<void> {
    if (row.kind === 'unknown') {
      row.kind = row.detection.kind = 'movie'
      row.enabled = true
    }
    const detection = matchingDetection(row)
    row.match = match
    row.matchPending = false
    row.confidence = confidence
    row.matchReasons =
      confidence === 'confirmed'
        ? ['User-confirmed assignment for this folder']
        : [...(match.reasons ?? [])]
    row.title = match.title || detection.title
    row.targetTitle = undefined
    row.year = match.year ?? detection.year
    row.episodeTitle = undefined
    row.episodeValidation = 'unvalidated'
    row.season = detection.season
    row.episode = detection.episode
    row.episodes = detection.episodes
    row.error = undefined
    try {
      const detail = await getDetails(row.kind === 'series' ? 'tv' : 'movie', match.id, token.value)
      row.targetTitle = detail.title
      if (row.kind === 'series') {
        const validation = await validateEpisodes(detection, detail, token.value)
        row.episodeValidation = validation.status
        if (!row.matchReasons.includes(validation.reason)) row.matchReasons.push(validation.reason)
        if (validation.status === 'valid') {
          row.season = validation.season
          row.episodes = validation.episodes
          row.episode = validation.episodes?.[0]
          row.episodeTitle = validation.title
        } else if (validation.status === 'missing' && confidence === 'confirmed') {
          // A user may deliberately confirm a show even if TMDB cannot represent its episode
          // numbering (for example, daily shows with calendar-season release names). Keep the
          // filename's explicit number and leave a non-blocking validation note instead.
          row.episodeValidation = 'unvalidated'
          row.matchReasons.push('Manual assignment accepts the episode number from the filename')
        } else row.error = validation.reason
      }
    } catch (error) {
      row.error = `Metadata not yet validated: ${errorMessage(error)}`
    }
    rebuildTarget(row, row.episodeTitle, currentBaseFolders())
    refreshState(row)
  }

  async function selectMatch(
    row: PlanRow,
    match: TmdbResult,
    applyToMatchingEpisodes = true,
  ): Promise<void> {
    const group =
      row.kind === 'series' && applyToMatchingEpisodes
        ? rows.value.filter(
            (other) =>
              other.kind === 'series' &&
              other.state !== 'done' &&
              other.title.toLocaleLowerCase() === row.title.toLocaleLowerCase() &&
              (!other.ids.length || JSON.stringify(other.ids) === JSON.stringify(row.ids)),
          )
        : [row]
    group.forEach((item) => {
      item.searching = true
    })
    try {
      await Promise.all(group.map((item) => applyMatch(item, match, 'confirmed')))
      try {
        for (const item of group)
          writeMapping(item.identityKey, match, item.kind === 'series' ? 'series' : 'movie', {
            season: item.season,
            episodes: item.episodes,
          })
      } catch (error) {
        row.error = `Match applied, but could not be saved: ${errorMessage(error)}`
      }
    } finally {
      group.forEach((item) => {
        item.searching = false
      })
      detectDuplicateTargets(rows.value)
    }
  }

  async function searchMatches(row: PlanRow, query: string): Promise<void> {
    if (!token.value || !query.trim()) return
    row.searching = true
    row.lookupError = undefined
    try {
      const type = row.kind === 'series' ? 'tv' : 'movie'
      const ids = providerIds(query)
      row.candidates = (
        ids.length
          ? await resolveId(type, ids[0], token.value)
          : await searchTmdb(type, query, undefined, token.value)
      )
        .map((candidate) => scoreCandidate(matchingDetection(row), candidate))
        .sort((a, b) => b.score! - a.score!)
      if (!row.candidates.length) row.lookupError = 'No matches found.'
    } catch (error) {
      row.lookupError = errorMessage(error)
    } finally {
      row.searching = false
    }
  }

  function useFilename(row: PlanRow): void {
    forgetSavedMappings(row)
    Object.assign(
      row,
      {
        year: undefined,
        season: undefined,
        episode: undefined,
        episodes: undefined,
        airDate: undefined,
        calendarSeasonYear: undefined,
        inferredEpisode: undefined,
      },
      JSON.parse(JSON.stringify(row.detection)),
    )
    row.match = undefined
    row.kindOverride = undefined
    row.groupKey = groupKeyFor(row)
    row.matchPending = false
    row.targetTitle = undefined
    row.confidence = 'filename'
    row.matchReasons = []
    row.episodeTitle = undefined
    row.episodeValidation = 'unvalidated'
    row.error = 'Unverified filename suggestion selected by user.'
    rebuildTarget(row, undefined, currentBaseFolders())
    refreshState(row)
    detectDuplicateTargets(rows.value)
  }

  function setMediaKind(row: PlanRow, kind: 'movie' | 'series'): void {
    if (row.kind === kind && row.kindOverride === kind) return
    forgetSavedMappings(row)
    Object.assign(row, JSON.parse(JSON.stringify(row.detection)))
    row.kind = kind
    row.kindOverride = kind
    row.enabled = Boolean(row.title || row.ids.length)
    row.groupKey = groupKeyFor(row)
    row.match = undefined
    row.matchPending = false
    row.candidates = []
    row.targetTitle = undefined
    row.confidence = 'filename'
    row.matchReasons = []
    row.episodeTitle = undefined
    row.episodeValidation = 'unvalidated'
    row.lookupError = undefined
    row.error = undefined
    if (kind === 'movie') {
      row.season = undefined
      row.episode = undefined
      row.episodes = undefined
      row.airDate = undefined
      row.inferredEpisode = undefined
    } else if (row.season === undefined || !row.episodes?.length) {
      row.error = 'Set season and episode numbers before confirming this series match.'
    }
    if (kind === 'series' && (row.season === undefined || !row.episodes?.length)) row.target = ''
    else rebuildTarget(row, undefined, currentBaseFolders())
    refreshState(row)
    detectDuplicateTargets(rows.value)
  }

  function setEpisodes(row: PlanRow, season: number, episodes: number[]): void {
    if (
      !Number.isInteger(season) ||
      season < 0 ||
      season > 9999 ||
      !episodes.length ||
      episodes.some((episode) => !Number.isInteger(episode) || episode < 1 || episode > 999)
    )
      return
    if (!row.kindOverride)
      Object.assign(row.detection, {
        season,
        episode: episodes[0],
        episodes: [...new Set(episodes)],
        airDate: undefined,
        inferredEpisode: false,
      })
    Object.assign(row, {
      season,
      episode: episodes[0],
      episodes: [...new Set(episodes)],
      airDate: undefined,
      calendarSeasonYear: undefined,
      inferredEpisode: false,
    })
    if (row.match) void selectMatchForRow(row)
    else if (row.kindOverride) {
      row.error = 'Search for and select a TMDB match.'
      rebuildTarget(row, undefined, currentBaseFolders())
      refreshState(row)
      detectDuplicateTargets(rows.value)
    } else useFilename(row)
  }
  async function selectMatchForRow(row: PlanRow): Promise<void> {
    row.searching = true
    try {
      await applyMatch(row, row.match!, row.confidence)
    } finally {
      row.searching = false
      detectDuplicateTargets(rows.value)
    }
  }

  function assignSidecar(path: string, rowId: string): void {
    const choice = rows.value
      .flatMap((row) => row.sidecarChoices)
      .find((item) => item.file.path === path)
    if (!choice || (rowId && !choice.rowIds.includes(rowId))) return
    for (const row of rows.value) {
      const affected = row.sidecarChoices.some((item) => item.file.path === path)
      row.sidecarChoices = row.sidecarChoices.filter((item) => item.file.path !== path)
      if (row.id === rowId) row.sidecars.push(choice.file)
      if (affected) refreshState(row)
    }
    detectDuplicateTargets(rows.value)
  }

  function updateTarget(row: PlanRow, target: string): void {
    row.target = target
    if (target.trim()) {
      refreshState(row)
      detectDuplicateTargets(rows.value)
    }
  }

  function currentBaseFolders(): BaseFolders {
    return {
      root: baseFolders.root.value,
      preset: baseFolders.preset.value,
    }
  }

  function setEnabled(row: PlanRow, enabled: boolean): void {
    row.enabled = enabled
    detectDuplicateTargets(rows.value)
  }

  function resetPlanForSettingsChange(): void {
    if (!rows.value.length) return
    rows.value = []
    logs.value = []
    moveState.value = ''
    scanState.value = 'Settings changed. Scan again so the dry run uses the new folder structure.'
  }

  function releaseAccess(
    message = 'Folder access has been released in the app. Choose the folder again for another scan.',
  ): void {
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
      moveState.value =
        'This Chromium browser does not support native moving through the File System Access API. No files were changed.'
      return
    }
    if (!root.value) return
    const candidates = rows.value.filter(
      (row) => row.enabled && row.state === 'ready' && !row.searching && Boolean(row.target),
    )
    if (!candidates.length) return
    moving.value = true
    logs.value = []
    moveState.value = 'Checking destination conflicts …'
    try {
      for (const row of candidates) {
        const destination = await getDestination(root.value, row.target)
        const names = [
          destination.name,
          ...row.sidecars.map((file) => companionTargetName(row, file)),
        ]
        for (const name of names)
          if (await fileExists(destination.folder, name)) {
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
          for (const sidecar of row.sidecars)
            await moveFile(sidecar.handle, destination.folder, companionTargetName(row, sidecar))
          row.state = 'done'
          logs.value.push({ source: row.source.path, target: row.target, result: 'Moved' })
        } catch (error) {
          row.state = 'error'
          row.error = `Move was denied: ${errorMessage(error)}`
          logs.value.push({
            source: row.source.path,
            target: row.target,
            result: 'Error',
            message: row.error,
          })
        }
      }
      const allSucceeded =
        logs.value.length === permitted.length &&
        logs.value.every((entry) => entry.result === 'Moved')
      if (allSucceeded) {
        releaseAccess(
          'Execution complete and folder access has been released in the app. The local log remains visible.',
        )
      } else moveState.value = 'Execution complete. See the local log for details.'
    } catch (error) {
      moveState.value = `Execution stopped: ${errorMessage(error)}`
    } finally {
      moving.value = false
    }
  }

  return {
    root,
    rootName,
    rows,
    logs,
    filter,
    scanState,
    moveState,
    scanning,
    readingFiles,
    loadingTmdb,
    tmdbLoaded,
    tmdbTotal,
    moving,
    supportsMove,
    readyCount,
    chooseAndScan,
    selectMatch,
    searchMatches,
    useFilename,
    setEpisodes,
    setMediaKind,
    assignSidecar,
    updateTarget,
    setEnabled,
    resetPlanForSettingsChange,
    releaseAccess,
    moveAll,
  }
}
