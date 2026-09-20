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

export type MediaKind = 'movie' | 'series' | 'unknown'

export interface ParsedMedia {
  kind: MediaKind
  title: string
  year?: number
  season?: number
  episode?: number
}

export function extensionOf(name: string): string {
  const part = name.lastIndexOf('.')
  return part === -1 ? '' : name.slice(part + 1).toLowerCase()
}

export function stemOf(name: string): string {
  const part = name.lastIndexOf('.')
  return part === -1 ? name : name.slice(0, part)
}

export function parseMediaName(fileName: string): ParsedMedia {
  const stem = stemOf(fileName)
  const seriesMatch =
    stem.match(/(?:^|[ ._-])s(\d{1,2})\s*[ ._-]*e(\d{1,3})(?:$|[ ._-])/i) ??
    stem.match(/(?:^|[ ._-])(\d{1,2})\s*x\s*(\d{1,3})(?:$|[ ._-])/i)
  if (seriesMatch) {
    const before = stem
      .slice(0, seriesMatch.index)
      .replace(/[._-]+/g, ' ')
      .trim()
    return {
      kind: 'series',
      title: cleanTitle(before),
      season: Number(seriesMatch[1]),
      episode: Number(seriesMatch[2]),
    }
  }

  const yearMatch = stem.match(/(?:^|[ ._\-(])((?:19|20)\d{2})(?:$|[ ._\-)])/)
  if (yearMatch) {
    const before = stem
      .slice(0, yearMatch.index)
      .replace(/[._-]+/g, ' ')
      .trim()
    return { kind: 'movie', title: cleanTitle(before), year: Number(yearMatch[1]) }
  }
  return { kind: 'unknown', title: cleanTitle(stem) }
}

function cleanTitle(value: string): string {
  return value
    .replace(
      /\b(2160p|1080p|720p|480p|web[ .-]?dl|webrip|bluray|brrip|dvdrip|x264|x265|h[ .-]?264|h[ .-]?265|hevc|aac|dts|proper|repack|german|deutsch|english|multi)\b.*$/i,
      '',
    )
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
