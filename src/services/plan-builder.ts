import { extensionOf, pad, parseMediaName, safeName, stemOf, SUBTITLE_EXTENSIONS, VIDEO_EXTENSIONS } from '../lib/media'
import type { FoundFile, PlanRow } from '../types/plan'

export function createPlan(files: FoundFile[]): PlanRow[] {
  return files
    .filter((file) => VIDEO_EXTENSIONS.has(extensionOf(file.name)))
    .map((source, index) => {
      const parsed = parseMediaName(source.name)
      const subtitles = files.filter((other) => other.parent === source.parent && SUBTITLE_EXTENSIONS.has(extensionOf(other.name)) && stemOf(other.name) === stemOf(source.name))
      const row: PlanRow = {
        id: `${index}-${source.path}`,
        source,
        subtitles,
        ...parsed,
        identityKey: `${parsed.kind}:${parsed.title.toLowerCase()}:${parsed.year ?? ''}`,
        candidates: [],
        target: '',
        enabled: parsed.kind !== 'unknown',
        searching: false,
        state: parsed.kind === 'unknown' ? 'unrecognized' : 'ready'
      }
      rebuildTarget(row)
      return row
    })
}

export function rebuildTarget(row: PlanRow, episodeTitle?: string): void {
  const title = safeName(row.title) || 'Unbekannter Titel'
  const label = row.year ? `${title} (${row.year})` : title
  const extension = extensionOf(row.source.name)
  if (row.kind === 'movie') row.target = `${label}/${label}.${extension}`
  else if (row.kind === 'series' && row.season && row.episode) {
    const episode = safeName(episodeTitle || `Episode ${pad(row.episode)}`)
    row.target = `${label}/Season ${pad(row.season)}/${label} - S${pad(row.season)}E${pad(row.episode)} - ${episode}.${extension}`
  } else row.target = ''
}

export function companionTargetName(row: PlanRow, originalName: string): string {
  return `${row.target.replace(/\.[^.]+$/, '')}.${extensionOf(originalName)}`
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
