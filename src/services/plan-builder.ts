import {
  extensionOf,
  isSampleFile,
  parseMediaName,
  SIDECAR_EXTENSIONS,
  stemOf,
  VIDEO_EXTENSIONS,
} from '../lib/media'
import { buildTarget, defaultNamingPreset, type NamingPreset } from '../lib/naming'
import type { FoundFile, PlanRow } from '../types/plan'

export interface BaseFolders {
  root: string
  preset?: NamingPreset
}

export function createPlan(files: FoundFile[], baseFolders: BaseFolders, rootName = ''): PlanRow[] {
  const videos = files.filter(
    (file) => VIDEO_EXTENSIONS.has(extensionOf(file.name)) && !isSampleFile(file.name, file.path),
  )
  const rows = videos.map((source, index) => {
    const parsed = parseMediaName(source.name, source.path, rootName)
    const groupKey =
      parsed.kind === 'series'
        ? `series:${rootName}/${parsed.seriesFolder ?? ''}:${parsed.title.toLowerCase()}:${parsed.year ?? ''}`
        : `movie:${rootName}/${source.path}`
    const row: PlanRow = {
      id: `${index}-${source.path}`,
      source,
      sidecars: [],
      ...parsed,
      detection: structuredClone(parsed),
      groupKey,
      // A saved decision belongs to a source file. A file detected as a series episode may later
      // be deliberately changed into a movie, so a group-level key would be unsafe here.
      identityKey: `confirmed-v3:${rootName}/${source.path}`,
      legacyIdentityKey: `confirmed-v2:${groupKey}`,
      confidence: 'filename',
      matchReasons: [],
      episodeValidation: 'unvalidated',
      sidecarChoices: [],
      candidates: [],
      target: '',
      enabled: parsed.kind !== 'unknown' && Boolean(parsed.title || parsed.ids.length),
      searching: false,
      state:
        parsed.kind === 'unknown' || (!parsed.title && !parsed.ids.length)
          ? 'unrecognized'
          : parsed.inferredEpisode || parsed.airDate
            ? 'needs-choice'
            : 'ready',
    }
    rebuildTarget(row, undefined, baseFolders)
    return row
  })
  for (const file of files.filter(
    (item) =>
      SIDECAR_EXTENSIONS.has(extensionOf(item.name)) ||
      (VIDEO_EXTENSIONS.has(extensionOf(item.name)) && isSampleFile(item.name, item.path)),
  )) {
    const matches = rows
      .filter((row) => isMatchingSidecar(row.source, file))
      .sort((a, b) => stemOf(b.source.name).length - stemOf(a.source.name).length)
    if (!matches.length) continue
    const longest = matches.filter(
      (row) => stemOf(row.source.name).length === stemOf(matches[0].source.name).length,
    )
    if (longest.length === 1) longest[0].sidecars.push(file)
    else
      for (const row of longest) {
        row.sidecarChoices.push({ file, rowIds: longest.map((item) => item.id) })
        row.state = 'needs-choice'
      }
  }
  for (const row of rows) {
    if (row.kind === 'series' && row.inferredEpisode) {
      const explicitPeers = rows.filter(
        (other) =>
          other.id !== row.id &&
          other.kind === 'series' &&
          other.seriesFolder === row.seriesFolder &&
          other.season === row.season &&
          other.interpretations[0]?.source === 'filename',
      )
      const titles = new Map(explicitPeers.map((peer) => [peer.title.toLowerCase(), peer]))
      if (titles.size === 1) {
        const peer = [...titles.values()][0]
        row.interpretations.push({ title: peer.title, year: peer.year, source: 'neighbors' })
        row.detection.interpretations = row.interpretations
        row.evidence.push(
          'Consistent series title in neighboring filenames; episode numbering still needs validation',
        )
        if (!row.title) {
          row.title = row.detection.title = peer.title
          row.year = row.detection.year = peer.year
          row.groupKey = peer.groupKey
          row.identityKey = peer.identityKey
          row.enabled = true
          row.state = 'needs-choice'
          rebuildTarget(row, undefined, baseFolders)
        }
      }
    }
    const neighbors = rows.filter(
      (other) =>
        other.id !== row.id && other.groupKey === row.groupKey && other.season === row.season,
    )
    if (row.kind === 'series' && neighbors.length)
      row.evidence.push(
        `${neighbors.length} neighboring file(s) in the same season; numbering not yet verified`,
      )
  }
  return rows
}

function isMatchingSidecar(source: FoundFile, candidate: FoundFile): boolean {
  const candidateIsSample = isSampleFile(candidate.name, candidate.path)
  const sourceDirectory = parentDirectory(source.path)
  const candidateDirectory = parentDirectory(candidate.path)
  const sampleDirectory = sampleOwnerDirectory(candidate.path)
  if (
    !SIDECAR_EXTENSIONS.has(extensionOf(candidate.name)) &&
    !(candidateIsSample && VIDEO_EXTENSIONS.has(extensionOf(candidate.name)))
  )
    return false
  if (
    candidateDirectory !== sourceDirectory &&
    (!candidateIsSample || sampleDirectory !== sourceDirectory)
  )
    return false
  const sourceName = source.name.toLocaleLowerCase()
  const sourceStem = stemOf(source.name).toLocaleLowerCase()
  const candidateStem = stemOf(candidate.name).toLocaleLowerCase()
  return (
    candidateStem === sourceStem ||
    candidateStem === sourceName ||
    candidateStem.startsWith(`${sourceStem}.`) ||
    // A bare sample file in the source or a dedicated Sample(s) folder is associated with the
    // sole video there; multiple videos deliberately produce the existing owner choice.
    (candidateIsSample && /^(?:samples?)$/i.test(candidateStem))
  )
}

function parentDirectory(path: string): string {
  const normalized = path.replaceAll('\\', '/')
  const separator = normalized.lastIndexOf('/')
  return separator < 0 ? '' : normalized.slice(0, separator)
}

function sampleOwnerDirectory(path: string): string | undefined {
  const directories = path.replaceAll('\\', '/').split('/').slice(0, -1)
  const sampleIndex = directories
    .map((directory) => /^samples?$/i.test(directory))
    .lastIndexOf(true)
  return sampleIndex >= 0 ? directories.slice(0, sampleIndex).join('/') : undefined
}

export function rebuildTarget(
  row: PlanRow,
  episodeTitle: string | undefined,
  baseFolders: BaseFolders,
): void {
  if (!row.title && !row.targetTitle) {
    row.target = ''
    return
  }
  const preset = baseFolders.preset ?? defaultNamingPreset()
  if (row.kind === 'movie')
    row.target = buildTarget(row, baseFolders.root, preset.movie, episodeTitle ?? row.episodeTitle)
  else if (row.kind === 'series' && row.season !== undefined && row.episode !== undefined)
    row.target = buildTarget(row, baseFolders.root, preset.series, episodeTitle ?? row.episodeTitle)
  else row.target = ''
}

export function companionTargetName(row: PlanRow, original: FoundFile | string): string {
  const targetName = row.target.split('/').pop()
  if (!targetName) throw new Error('Invalid destination path for sidecar file.')
  const originalName = typeof original === 'string' ? original : original.name
  const sourceStem = stemOf(row.source.name)
  const sidecarStem = stemOf(originalName)
  const sample = isSampleFile(
    originalName,
    typeof original === 'string' ? originalName : original.path,
  )
  const qualifier = sidecarStem.toLocaleLowerCase().startsWith(`${sourceStem.toLocaleLowerCase()}.`)
    ? sidecarStem.slice(sourceStem.length)
    : sample
      ? '.sample'
      : ''
  return `${targetName.replace(/\.[^.]+$/, '')}${qualifier}.${extensionOf(originalName)}`
}

export function detectDuplicateTargets(rows: PlanRow[]): void {
  for (const row of rows)
    if (row.state === 'conflict') {
      row.state = 'ready'
      row.error = undefined
    }
  const seen = new Map<string, PlanRow>()
  for (const row of rows) {
    if (
      !row.enabled ||
      ['unrecognized', 'needs-choice', 'error', 'done'].includes(row.state) ||
      !row.target
    )
      continue
    const folder = row.target.slice(0, row.target.lastIndexOf('/') + 1)
    const targets = [
      row.target,
      ...row.sidecars.map((file) => folder + companionTargetName(row, file)),
    ]
    for (const target of targets) {
      const prior = seen.get(target.toLowerCase())
      if (prior) {
        row.state = prior.state = 'conflict'
        row.error = prior.error = 'Two files have the same destination (including sidecars).'
      } else seen.set(target.toLowerCase(), row)
    }
  }
}
