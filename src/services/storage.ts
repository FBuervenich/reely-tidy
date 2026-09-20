import type { TmdbResult } from '../lib/tmdb'
import { cloneNamingPreset, defaultNamingPreset, type NamingPreset } from '../lib/naming'

const TOKEN_KEY = 'mediaRenamer.tmdbReadToken'
const MAP_KEY = 'mediaRenamer.tmdbMappings'
const ROOT_FOLDER_KEY = 'mediaRenamer.rootFolder'
const MOVIES_FOLDER_KEY = 'mediaRenamer.moviesBaseFolder'
const SHOWS_FOLDER_KEY = 'mediaRenamer.showsBaseFolder'
const NAMING_PRESETS_KEY = 'mediaRenamer.namingPresets'
const ACTIVE_PRESET_KEY = 'mediaRenamer.activeNamingPreset'

export interface AppSettings {
  token: string
  rootFolder: string
  moviesBaseFolder: string
  showsBaseFolder: string
  namingPresets: NamingPreset[]
  activeNamingPresetId: string
}

export function readTmdbToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? ''
}
export function writeTmdbToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function readSettings(): AppSettings {
  const namingPresets = readNamingPresets()
  const savedActivePreset = localStorage.getItem(ACTIVE_PRESET_KEY)
  return {
    token: readTmdbToken(),
    rootFolder: localStorage.getItem(ROOT_FOLDER_KEY) ?? '_clean',
    moviesBaseFolder: localStorage.getItem(MOVIES_FOLDER_KEY) ?? 'Movies',
    showsBaseFolder: localStorage.getItem(SHOWS_FOLDER_KEY) ?? 'Shows',
    namingPresets,
    activeNamingPresetId: namingPresets.some((preset) => preset.id === savedActivePreset)
      ? savedActivePreset!
      : namingPresets[0].id,
  }
}

export function writeSettings(settings: AppSettings): void {
  writeTmdbToken(settings.token)
  localStorage.setItem(ROOT_FOLDER_KEY, settings.rootFolder)
  localStorage.setItem(MOVIES_FOLDER_KEY, settings.moviesBaseFolder)
  localStorage.setItem(SHOWS_FOLDER_KEY, settings.showsBaseFolder)
  localStorage.setItem(NAMING_PRESETS_KEY, JSON.stringify(settings.namingPresets))
  localStorage.setItem(ACTIVE_PRESET_KEY, settings.activeNamingPresetId)
}

function isPreset(value: unknown): value is NamingPreset {
  if (!value || typeof value !== 'object') return false
  const preset = value as Partial<NamingPreset>
  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    Boolean(
      preset.movie && Array.isArray(preset.movie.folders) && Array.isArray(preset.movie.filename),
    ) &&
    Boolean(
      preset.series &&
      Array.isArray(preset.series.folders) &&
      Array.isArray(preset.series.filename),
    )
  )
}

function readNamingPresets(): NamingPreset[] {
  try {
    const stored = JSON.parse(localStorage.getItem(NAMING_PRESETS_KEY) ?? '[]')
    if (Array.isArray(stored) && stored.length && stored.every(isPreset))
      return stored.map(cloneNamingPreset)
  } catch {
    /* Fall back to the original naming structure. */
  }
  return [defaultNamingPreset()]
}

export function readMappings(): Record<string, TmdbResult> {
  try {
    return JSON.parse(localStorage.getItem(MAP_KEY) ?? '{}')
  } catch {
    return {}
  }
}
export function writeMapping(key: string, match: TmdbResult): void {
  const mappings = readMappings()
  mappings[key] = match
  localStorage.setItem(MAP_KEY, JSON.stringify(mappings))
}
