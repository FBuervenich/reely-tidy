import type { TmdbResult } from '../lib/tmdb'

const TOKEN_KEY = 'mediaRenamer.tmdbReadToken'
const MAP_KEY = 'mediaRenamer.tmdbMappings'

export function readTmdbToken(): string { return localStorage.getItem(TOKEN_KEY) ?? '' }
export function writeTmdbToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function readMappings(): Record<string, TmdbResult> {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}') } catch { return {} }
}
export function writeMapping(key: string, match: TmdbResult): void {
  const mappings = readMappings()
  mappings[key] = match
  localStorage.setItem(MAP_KEY, JSON.stringify(mappings))
}
