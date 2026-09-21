import type { ProviderId } from './media'
export interface TmdbResult {
  id: number
  title: string
  originalTitle?: string
  alternativeTitles?: string[]
  year?: number
  posterPath?: string
  overview?: string
  seasons?: number[]
  verifiedId?: boolean
  episodeStatus?: 'valid' | 'missing' | 'unvalidated'
  score?: number
  reasons?: string[]
  contradictions?: string[]
}
export interface TmdbEpisode {
  name?: string
  episode_number: number
  season_number: number
  air_date?: string
}
interface RawResult {
  id: number
  title?: string
  name?: string
  original_title?: string
  original_name?: string
  release_date?: string
  first_air_date?: string
  poster_path?: string
  overview?: string
  seasons?: { season_number: number }[]
  alternative_titles?: { titles?: { title: string }[]; results?: { title: string }[] }
}
export class TmdbError extends Error {
  constructor(public status: number) {
    super(status === 401 ? 'TMDB token was rejected.' : `TMDB responded with HTTP ${status}.`)
  }
}
const base = 'https://api.themoviedb.org/3'
const pending = new Map<string, Promise<unknown>>()
let active = 0
const queue: (() => void)[] = []
export function clearTmdbCache(): void {
  pending.clear()
}
async function limited<T>(run: () => Promise<T>): Promise<T> {
  if (active >= 4) await new Promise<void>((resolve) => queue.push(resolve))
  else active++
  try {
    return await run()
  } finally {
    const next = queue.shift()
    if (next) next()
    else active--
  }
}
async function request<T>(path: string, token: string, lang = 'en-US'): Promise<T> {
  const key = `${token}:${lang}:${path}`
  let promise = pending.get(key)
  if (!promise) {
    promise = limited(async () => {
      const response = await fetch(
        `${base}${path}${path.includes('?') ? '&' : '?'}language=${lang}`,
        {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(20000),
        },
      )
      if (!response.ok) throw new TmdbError(response.status)
      return response.json()
    })
    pending.set(key, promise)
    void promise.catch((error: unknown) => {
      // A 404 is stable for this scan; transient failures remain retryable.
      if (!(error instanceof TmdbError && error.status === 404) && pending.get(key) === promise)
        pending.delete(key)
    })
  }
  return promise as Promise<T>
}
function mapped(item: RawResult, type: 'movie' | 'tv'): TmdbResult {
  const date = type === 'movie' ? item.release_date : item.first_air_date
  return {
    id: item.id,
    title:
      (type === 'movie' ? item.title : item.name) ||
      item.original_title ||
      item.original_name ||
      '',
    originalTitle: type === 'movie' ? item.original_title : item.original_name,
    year: date ? Number(date.slice(0, 4)) : undefined,
    posterPath: item.poster_path,
    overview: item.overview,
    alternativeTitles: (
      item.alternative_titles?.titles ??
      item.alternative_titles?.results ??
      []
    ).map((entry) => entry.title),
    seasons: item.seasons?.map((season) => season.season_number),
  }
}
export async function searchTmdb(
  type: 'movie' | 'tv',
  query: string,
  year: number | undefined,
  token: string,
): Promise<TmdbResult[]> {
  if (!query.trim()) return []
  const args = new URLSearchParams({
    query,
    ...(year ? { [type === 'movie' ? 'year' : 'first_air_date_year']: String(year) } : {}),
  })
  const data = await request<{ results: RawResult[] }>(`/search/${type}?${args}`, token, 'de-DE')
  return data.results.map((item) => mapped(item, type))
}
export async function getDetails(
  type: 'movie' | 'tv',
  id: number,
  token: string,
): Promise<TmdbResult> {
  return mapped(
    await request<RawResult>(`/${type}/${id}?append_to_response=alternative_titles`, token),
    type,
  )
}
export async function resolveId(
  type: 'movie' | 'tv',
  id: ProviderId,
  token: string,
): Promise<TmdbResult[]> {
  if (id.type && id.type !== type) return []
  if (id.provider === 'tmdb')
    return [{ ...(await getDetails(type, Number(id.value), token)), verifiedId: true }]
  const data = await request<{ movie_results: RawResult[]; tv_results: RawResult[] }>(
    `/find/${encodeURIComponent(id.value)}?external_source=imdb_id`,
    token,
  )
  return (type === 'movie' ? data.movie_results : data.tv_results).map((item) => ({
    ...mapped(item, type),
    verifiedId: true,
  }))
}
export async function getSeason(
  showId: number,
  season: number,
  token: string,
): Promise<TmdbEpisode[]> {
  return (await request<{ episodes: TmdbEpisode[] }>(`/tv/${showId}/season/${season}`, token))
    .episodes
}
export const posterUrl = (path?: string) =>
  path ? `https://image.tmdb.org/t/p/w185${path}` : undefined
