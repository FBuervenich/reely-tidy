import { parseScene, type SceneInfo } from './scene'
export const VIDEO_EXTENSIONS = new Set(['mkv', 'mp4', 'avi', 'm4v', 'mov', 'wmv'])
export const SUBTITLE_EXTENSIONS = new Set(['srt', 'ass', 'ssa', 'sub'])
export const SIDECAR_EXTENSIONS = new Set([
  ...SUBTITLE_EXTENSIONS,
  'nfo',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'tbn',
])

/** Release samples are video files but belong to the main release, not the rename plan itself. */
export function isSampleFile(name: string, path = name): boolean {
  const stem = stemOf(name)
  if (/(?:^|[ ._-])samples?(?:$|[ ._-])/i.test(stem)) return true
  return path
    .replaceAll('\\', '/')
    .split('/')
    .slice(0, -1)
    .some((directory) => /^samples?$/i.test(directory))
}
export type MediaKind = 'movie' | 'series' | 'unknown'
export interface ProviderId {
  provider: 'tmdb' | 'imdb'
  value: string
  type?: 'movie' | 'tv'
}
export interface Interpretation {
  title: string
  year?: number
  source: 'filename' | 'folder' | 'neighbors'
}
export interface ParsedMedia {
  kind: MediaKind
  title: string
  year?: number
  season?: number
  episode?: number
  episodes?: number[]
  airDate?: string
  /** A four-digit season component such as S2000E15; may need resolving to a TMDB season. */
  calendarSeasonYear?: number
  /** Text between an episode marker and release tags, used to validate ambiguous long-running shows. */
  episodeTitleHint?: string
  ids: ProviderId[]
  interpretations: Interpretation[]
  scene: SceneInfo
  evidence: string[]
  inferredEpisode?: boolean
  seriesFolder?: string
  spans: { field: string; start: number; end: number }[]
}
export function extensionOf(name: string): string {
  return name.includes('.') ? name.slice(name.lastIndexOf('.') + 1).toLowerCase() : ''
}
/** macOS resource-fork sidecars, not user media files. */
export function isAppleDoubleFile(name: string): boolean {
  return name.startsWith('._')
}
export function stemOf(name: string): string {
  return name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name
}
export function providerIds(value: string): ProviderId[] {
  const ids: ProviderId[] = []
  for (const m of value.matchAll(/\b(tmdb)[-:= ](?:(movie|tv)[-:= /])?(\d+)\b|\b(tt\d{7,})\b/gi))
    ids.push(
      m[4]
        ? { provider: 'imdb', value: m[4].toLowerCase() }
        : {
            provider: 'tmdb',
            value: m[3],
            type: m[2]?.toLowerCase() as 'movie' | 'tv' | undefined,
          },
    )
  return ids
}
function titleText(value: string): string {
  return value
    .replace(/\b(?:tmdb[-:= ](?:(?:movie|tv)[-:= /])?\d+|(?:imdb[-:= ]?)?tt\d{7,})\b/gi, '')
    .replace(/[._()[\]{}]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[ -]+|[ -]+$/g, '')
}
function titleInterpretations(stem: string, source: Interpretation['source']): Interpretation[] {
  const scene = parseScene(stem)
  const prefix = stem.slice(0, scene.start ?? stem.length)
  const years = [...prefix.matchAll(/(?:^|[ ._(-])((?:19|20)\d{2})(?=$|[ ._)-])/g)].filter(
    (match) => titleText(prefix.slice(0, match.index)).length > 0,
  )
  const options: Interpretation[] = years.reverse().map((match) => ({
    title: titleText(prefix.slice(0, match.index)),
    year: Number(match[1]),
    source,
  }))
  if (!options.length) options.push({ title: titleText(prefix), year: undefined, source })
  return options.filter((option) => option.title)
}
export function parseMediaName(fileName: string, path = fileName, rootName = ''): ParsedMedia {
  const parts = path.replaceAll('\\', '/').split('/')
  const name = fileName.split(/[\\/]/).pop() ?? fileName
  const stem = stemOf(name)
  const scene = parseScene(stem)
  const parsed: ParsedMedia = {
    kind: 'unknown',
    title: '',
    ids: providerIds(`${rootName}/${path}`),
    interpretations: [],
    scene,
    evidence: [],
    spans: [],
  }
  const dirs = parts.slice(0, -1)
  if (rootName) dirs.unshift(rootName)
  const seasonIndex =
    dirs
      .map((dir, index) =>
        /^(?:season|staffel|s)[ ._-]*\d{1,4}$/i.test(dir) || /^specials$/i.test(dir) ? index : -1,
      )
      .filter((index) => index >= 0)
      .pop() ?? -1
  const folderSeason =
    seasonIndex >= 0 ? Number(dirs[seasonIndex].match(/\d+/)?.[0] ?? 0) : undefined
  const folderIndex = seasonIndex >= 0 ? seasonIndex - 1 : dirs.length - 1
  const folder = dirs[folderIndex] ?? ''
  const folderOptions = /^(?:movies|shows|series|tv|downloads|media|videos|filme|serien)$/i.test(
    folder,
  )
    ? []
    : titleInterpretations(folder, 'folder')
  const episodeMatch =
    /(?:^|[ ._-])(?:s(\d{1,4})[ ._-]*e(\d{1,3})((?:-\d{1,3})|(?:-?e\d{1,3})*)|(\d{1,4})x(\d{1,3})((?:-?x\d{1,3})*))(?=$|[ ._-])/i.exec(
      stem,
    )
  const dateMatch = /(?:^|[ ._-])((?:19|20)\d{2})[ ._-](\d{2})[ ._-](\d{2})(?=$|[ ._-])/.exec(stem)
  const numbered = folderSeason !== undefined ? /^(\d{1,3})(?:$|[ ._-])/.exec(stem) : null
  let titleStem = stem
  if (episodeMatch) {
    parsed.kind = 'series'
    parsed.season = Number(episodeMatch[1] ?? episodeMatch[4])
    parsed.episode = Number(episodeMatch[2] ?? episodeMatch[5])
    const seasonText = episodeMatch[1] ?? episodeMatch[4] ?? ''
    if (/^(?:19|20)\d{2}$/.test(seasonText)) parsed.calendarSeasonYear = parsed.season
    const suffix = episodeMatch[3] || episodeMatch[6] || ''
    const extra = [...suffix.matchAll(/\d+/g)].map((m) => Number(m[0]))
    parsed.episodes = [...new Set([parsed.episode, ...extra])]
    if (
      suffix.startsWith('-') &&
      extra.length === 1 &&
      extra[0] > parsed.episode &&
      extra[0] - parsed.episode < 100
    )
      parsed.episodes = Array.from(
        { length: extra[0] - parsed.episode + 1 },
        (_, i) => parsed.episode! + i,
      )
    titleStem = stem.slice(0, episodeMatch.index)
    const hint = titleText(
      stem.slice(episodeMatch.index + episodeMatch[0].length, scene.start ?? stem.length),
    )
    if (hint && !/^(?:folge|episode)\s*\d+$/i.test(hint)) parsed.episodeTitleHint = hint
    parsed.spans.push({
      field: 'episodes',
      start: episodeMatch.index,
      end: episodeMatch.index + episodeMatch[0].length,
    })
  } else if (dateMatch) {
    const date = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    if (!Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date) {
      parsed.kind = 'series'
      parsed.airDate = date
      parsed.season = folderSeason
      titleStem = stem.slice(0, dateMatch.index)
      parsed.evidence.push('Air date in filename; episode needs validation')
      parsed.spans.push({
        field: 'airDate',
        start: dateMatch.index,
        end: dateMatch.index + dateMatch[0].length,
      })
    }
  } else if (numbered) {
    parsed.kind = 'series'
    parsed.season = folderSeason
    parsed.episode = Number(numbered[1])
    parsed.episodes = [parsed.episode]
    parsed.inferredEpisode = true
    titleStem = ''
    parsed.evidence.push('Episode number inferred from season folder; needs validation')
  }
  parsed.interpretations = titleInterpretations(titleStem, 'filename')
  parsed.interpretations.push(...folderOptions)
  const primary = parsed.interpretations[0]
  parsed.title = primary?.title ?? ''
  parsed.year = primary?.year
  if (primary?.source === 'folder') parsed.evidence.push('Title from folder')
  if (primary?.source === 'filename') {
    const yearStart = parsed.year ? titleStem.lastIndexOf(String(parsed.year)) : -1
    const end =
      yearStart >= 0 ? yearStart : Math.min(titleStem.length, scene.start ?? titleStem.length)
    parsed.spans.push({
      field: 'title',
      start: 0,
      end: titleStem.slice(0, end).replace(/[ ._(-]+$/, '').length,
    })
    if (parsed.year) {
      const start = titleStem.lastIndexOf(String(parsed.year))
      if (start >= 0) parsed.spans.push({ field: 'year', start, end: start + 4 })
    }
  }
  if (parsed.kind === 'series') {
    if (folderIndex >= 0)
      parsed.seriesFolder = dirs.slice(rootName ? 1 : 0, folderIndex + 1).join('/')
    if (
      !parsed.year &&
      folderOptions.some((o) => o.title.toLowerCase() === parsed.title.toLowerCase())
    )
      parsed.year = folderOptions[0]?.year
  } else if (parsed.title || parsed.ids.length)
    parsed.kind = parsed.ids.some((id) => id.type === 'tv') ? 'series' : 'movie'
  return parsed
}
export function safeName(value: string): string {
  return (
    value
      // oxlint-disable-next-line no-control-regex -- Windows reserves control characters in filenames.
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/[. ]+$/g, '')
      .trim()
  )
}
export function pad(value: number): string {
  return String(value).padStart(2, '0')
}
