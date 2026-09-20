import { extensionOf, pad, parseMediaName, safeName, SIDECAR_EXTENSIONS, stemOf, VIDEO_EXTENSIONS } from '../lib/media'
import type { FoundFile, PlanRow } from '../types/plan'

export interface BaseFolders { root: string; movies: string; shows: string }

export function createPlan(files: FoundFile[], baseFolders: BaseFolders): PlanRow[] {
  return files
    .filter((file) => VIDEO_EXTENSIONS.has(extensionOf(file.name)))
    .map((source, index) => {
      const parsed = parseMediaName(source.name)
      const sidecars = files.filter((other) => isMatchingSidecar(source, other))
      const row: PlanRow = {
        id: `${index}-${source.path}`,
        source,
        sidecars,
        ...parsed,
        identityKey: `${parsed.kind}:${parsed.title.toLowerCase()}:${parsed.year ?? ''}`,
        candidates: [],
        target: '',
        enabled: parsed.kind !== 'unknown',
        searching: false,
        state: parsed.kind === 'unknown' ? 'unrecognized' : 'ready'
      }
      rebuildTarget(row, undefined, baseFolders)
      return row
    })
}

function isMatchingSidecar(source: FoundFile, candidate: FoundFile): boolean {
  if (candidate.parent !== source.parent || !SIDECAR_EXTENSIONS.has(extensionOf(candidate.name))) return false
  const sourceName = source.name.toLocaleLowerCase()
  const candidateStem = stemOf(candidate.name).toLocaleLowerCase()
  return candidateStem === stemOf(source.name).toLocaleLowerCase() || candidateStem === sourceName
}

export function rebuildTarget(row: PlanRow, episodeTitle: string | undefined, baseFolders: BaseFolders): void {
  const title = safeName(row.title) || 'Unbekannter Titel'
  const label = row.year ? `${title} (${row.year})` : title
  const extension = extensionOf(row.source.name)
  const rootFolder = safeName(baseFolders.root) || '_clean'
  const moviesFolder = safeName(baseFolders.movies) || 'Movies'
  const showsFolder = safeName(baseFolders.shows) || 'Shows'
  if (row.kind === 'movie') row.target = `${rootFolder}/${moviesFolder}/${label}/${label}.${extension}`
  else if (row.kind === 'series' && row.season && row.episode) {
    const episode = safeName(episodeTitle || `Episode ${pad(row.episode)}`)
    row.target = `${rootFolder}/${showsFolder}/${label}/Season ${pad(row.season)}/${label} - S${pad(row.season)}E${pad(row.episode)} - ${episode}.${extension}`
  } else row.target = ''
}

export function companionTargetName(row: PlanRow, originalName: string): string {
  const targetName = row.target.split('/').pop()
  if (!targetName) throw new Error('Ungültiger Zielpfad für Begleitdatei.')
  return `${targetName.replace(/\.[^.]+$/, '')}.${extensionOf(originalName)}`
}

export function detectDuplicateTargets(rows: PlanRow[]): void {
  for (const row of rows) if (row.state === 'conflict') { row.state = 'ready'; row.error = undefined }
  const seen = new Map<string, PlanRow>()
  for (const row of rows) {
    if (['unrecognized', 'needs-choice', 'error'].includes(row.state) || !row.target) continue
    const prior = seen.get(row.target.toLowerCase())
    if (prior) {
      row.state = prior.state = 'conflict'
      row.error = prior.error = 'Zwei Einträge haben dasselbe Ziel.'
    } else seen.set(row.target.toLowerCase(), row)
  }
}
