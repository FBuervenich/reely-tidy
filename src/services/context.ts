import { providerIds, type ProviderId } from '../lib/media'
import type { FoundFile, PlanRow } from '../types/plan'

export function idsFromNfo(text: string): ProviderId[] {
  const ids = providerIds(text)
  for (const match of text.matchAll(/<uniqueid\b([^>]*)>([^<]+)<\/uniqueid>/gi)) {
    const type = /\btype\s*=\s*["'](tmdb|imdb)["']/i.exec(match[1])?.[1].toLowerCase()
    const value = match[2].trim()
    if (type === 'tmdb' && /^\d+$/.test(value)) ids.push({ provider: 'tmdb', value })
    if (type === 'imdb' && /^tt\d{7,}$/.test(value)) ids.push({ provider: 'imdb', value })
  }
  for (const match of text.matchAll(/<(?:tmdbid|tmdb)>(\d+)<\/(?:tmdbid|tmdb)>/gi))
    ids.push({ provider: 'tmdb', value: match[1] })
  for (const match of text.matchAll(/themoviedb\.org\/(movie|tv)\/(\d+)/gi))
    ids.push({ provider: 'tmdb', value: match[2], type: match[1] as 'movie' | 'tv' })
  return [...new Map(ids.map((id) => [`${id.provider}:${id.value}:${id.type ?? ''}`, id])).values()]
}
const directory = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))
export async function addNfoContext(rows: PlanRow[], files: FoundFile[]): Promise<void> {
  const cache = new Map<string, Promise<ProviderId[]>>()
  for (const row of rows) {
    const candidates = files.filter((file) => {
      if (!file.name.toLowerCase().endsWith('.nfo')) return false
      if (row.kind === 'movie' && row.sidecars.includes(file)) return true
      const dir = directory(file.path)
      if (row.kind === 'movie')
        return (
          file.name.toLowerCase() === 'movie.nfo' &&
          dir === directory(row.source.path) &&
          rows.filter((item) => directory(item.source.path) === dir).length === 1
        )
      const folder = row.seriesFolder ?? ''
      return file.name.toLowerCase() === 'tvshow.nfo' && dir === folder
    })
    for (const file of candidates) {
      try {
        if (!cache.has(file.path))
          cache.set(
            file.path,
            file.handle.getFile().then(async (data) => {
              if (data.size > 1024 * 1024) return []
              return idsFromNfo(await data.text())
            }),
          )
        const ids = await cache.get(file.path)!
        row.ids.push(...ids)
        if (ids.length) row.evidence.push(`Provider ID from ${file.name}`)
      } catch {
        row.evidence.push(`Could not read ${file.name}`)
      }
    }
    row.ids = [...new Map(row.ids.map((id) => [`${id.provider}:${id.value}`, id])).values()]
    row.ids.sort((a, b) => `${a.provider}:${a.value}`.localeCompare(`${b.provider}:${b.value}`))
    row.detection.ids = row.ids
    row.identityKey += `:ids=${row.ids.map((id) => `${id.provider}:${id.value}`).join(',')}`
  }
}
