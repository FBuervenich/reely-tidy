import type { TmdbResult } from '../lib/tmdb'

const TOKEN_KEY = 'mediaRenamer.tmdbReadToken'
const MAP_KEY = 'mediaRenamer.tmdbMappings'
const ROOT_FOLDER_KEY = 'mediaRenamer.rootFolder'
const MOVIES_FOLDER_KEY = 'mediaRenamer.moviesBaseFolder'
const SHOWS_FOLDER_KEY = 'mediaRenamer.showsBaseFolder'

export interface AppSettings {
  token: string
  rootFolder: string
  moviesBaseFolder: string
  showsBaseFolder: string
}

export function readTmdbToken(): string { return localStorage.getItem(TOKEN_KEY) ?? '' }
export function writeTmdbToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function readSettings(): AppSettings {
  return {
    token: readTmdbToken(),
    rootFolder: localStorage.getItem(ROOT_FOLDER_KEY) ?? '_clean',
    moviesBaseFolder: localStorage.getItem(MOVIES_FOLDER_KEY) ?? 'Movies',
    showsBaseFolder: localStorage.getItem(SHOWS_FOLDER_KEY) ?? 'Shows'
  }
}

export function writeSettings(settings: AppSettings): void {
  writeTmdbToken(settings.token)
  localStorage.setItem(ROOT_FOLDER_KEY, settings.rootFolder)
  localStorage.setItem(MOVIES_FOLDER_KEY, settings.moviesBaseFolder)
  localStorage.setItem(SHOWS_FOLDER_KEY, settings.showsBaseFolder)
}

export function readMappings(): Record<string, TmdbResult> {
  try { return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}') } catch { return {} }
}
export function writeMapping(key: string, match: TmdbResult): void {
  const mappings = readMappings()
  mappings[key] = match
  localStorage.setItem(MAP_KEY, JSON.stringify(mappings))
}
