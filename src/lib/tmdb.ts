export interface TmdbResult {
  id: number
  title: string
  year?: number
  posterPath?: string
  overview?: string
}

export interface TmdbEpisode { name?: string }
interface TmdbDetail { title?: string; name?: string }

const base = 'https://api.themoviedb.org/3'

async function request<T>(path: string, token: string, lang: 'de-DE' | 'en-US'): Promise<T> {
  const separator = path.includes('?') ? '&' : '?'
  const response = await fetch(`${base}${path}${separator}language=${lang}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
  })
  if (!response.ok) throw new Error(response.status === 401 ? 'TMDB token was rejected.' : `TMDB responded with HTTP ${response.status}.`)
  return response.json() as Promise<T>
}

function mapped(item: any, type: 'movie' | 'tv'): TmdbResult {
  const date = type === 'movie' ? item.release_date : item.first_air_date
  return { id: item.id, title: type === 'movie' ? item.title : item.name, year: date ? Number(date.slice(0, 4)) : undefined, posterPath: item.poster_path ?? undefined, overview: item.overview }
}

export async function searchTmdb(type: 'movie' | 'tv', query: string, year: number | undefined, token: string): Promise<TmdbResult[]> {
  const args = new URLSearchParams({ query, ...(year ? { [type === 'movie' ? 'year' : 'first_air_date_year']: String(year) } : {}) })
  const data = await request<{ results: any[] }>(`/search/${type}?${args}`, token, 'de-DE')
  const german = data.results.map((item) => mapped(item, type))
  if (german.some((result) => !result.title?.trim())) {
    const english = await request<{ results: any[] }>(`/search/${type}?${args}`, token, 'en-US')
    const englishById = new Map(english.results.map((item) => [item.id, mapped(item, type)]))
    return german.map((result) => result.title?.trim() ? result : (englishById.get(result.id) ?? result))
  }
  return german
}

export async function getEpisode(showId: number, season: number, episode: number, token: string): Promise<string | undefined> {
  const english = await request<TmdbEpisode>(`/tv/${showId}/season/${season}/episode/${episode}`, token, 'en-US')
  if (english.name?.trim()) return english.name
  const german = await request<TmdbEpisode>(`/tv/${showId}/season/${season}/episode/${episode}`, token, 'de-DE')
  return german.name?.trim()
}

export async function getEnglishTitle(type: 'movie' | 'tv', id: number, token: string): Promise<string | undefined> {
  const english = await request<TmdbDetail>(`/${type}/${id}`, token, 'en-US')
  const title = type === 'movie' ? english.title : english.name
  if (title?.trim()) return title
  const german = await request<TmdbDetail>(`/${type}/${id}`, token, 'de-DE')
  return type === 'movie' ? german.title?.trim() : german.name?.trim()
}

export const posterUrl = (path?: string) => path ? `https://image.tmdb.org/t/p/w185${path}` : undefined
