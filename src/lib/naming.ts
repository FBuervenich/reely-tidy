import { pad, safeName, stemOf } from './media'
import { parseScene } from './scene'
import type { PlanRow } from '../types/plan'

export type TemplateToken =
  | 'title'
  | 'year'
  | 'season'
  | 'episode'
  | 'episodeTitle'
  | 'sceneTags'
  | 'releaseGroup'
  | 'sourceName'

export interface TemplatePiece {
  id: string
  type: 'token' | 'text'
  token?: TemplateToken
  value?: string
}

export interface NamingTemplate {
  folders: TemplatePiece[][]
  filename: TemplatePiece[]
}

export interface NamingPreset {
  id: string
  name: string
  version: number
  movie: NamingTemplate
  series: NamingTemplate
}

export const TOKEN_LABELS: Record<TemplateToken, string> = {
  title: 'Title',
  year: 'Year',
  season: 'Season',
  episode: 'Episode',
  episodeTitle: 'Episode title',
  sceneTags: 'Scene tags ({sceneTags})',
  releaseGroup: 'Release group ({releaseGroup})',
  sourceName: 'Original filename ({sourceName})',
}

const defaultMovie: NamingTemplate = {
  folders: [
    [{ id: 'movie-base-folder', type: 'text', value: 'Movies' }],
    [
      { id: 'movie-folder-title', type: 'token', token: 'title' },
      { id: 'movie-folder-open-year', type: 'text', value: ' (' },
      { id: 'movie-folder-year', type: 'token', token: 'year' },
      { id: 'movie-folder-close-year', type: 'text', value: ')' },
    ],
  ],
  filename: [
    { id: 'movie-file-title', type: 'token', token: 'title' },
    { id: 'movie-file-open-year', type: 'text', value: ' (' },
    { id: 'movie-file-year', type: 'token', token: 'year' },
    { id: 'movie-file-close-year', type: 'text', value: ')' },
  ],
}

const defaultSeries: NamingTemplate = {
  folders: [
    [{ id: 'series-base-folder', type: 'text', value: 'TV Shows' }],
    [
      { id: 'series-folder-title', type: 'token', token: 'title' },
      { id: 'series-folder-open-year', type: 'text', value: ' (' },
      { id: 'series-folder-year', type: 'token', token: 'year' },
      { id: 'series-folder-close-year', type: 'text', value: ')' },
    ],
    [
      { id: 'series-season-label', type: 'text', value: 'Season ' },
      { id: 'series-season', type: 'token', token: 'season' },
    ],
  ],
  filename: [
    { id: 'series-file-title', type: 'token', token: 'title' },
    { id: 'series-file-open-year', type: 'text', value: ' (' },
    { id: 'series-file-year', type: 'token', token: 'year' },
    { id: 'series-file-close-year', type: 'text', value: ')' },
    { id: 'series-file-separator', type: 'text', value: ' - S' },
    { id: 'series-file-season', type: 'token', token: 'season' },
    { id: 'series-file-episode-prefix', type: 'text', value: 'E' },
    { id: 'series-file-episode', type: 'token', token: 'episode' },
    { id: 'series-file-title-separator', type: 'text', value: ' - ' },
    { id: 'series-file-episode-title', type: 'token', token: 'episodeTitle' },
  ],
}

export function defaultNamingPreset(
  movieBaseFolder = 'Movies',
  showsBaseFolder = 'TV Shows',
): NamingPreset {
  const preset = cloneNamingPreset({
    id: 'standard',
    name: 'Standard',
    version: 2,
    movie: defaultMovie,
    series: defaultSeries,
  })
  preset.movie.folders[0][0].value = movieBaseFolder
  preset.series.folders[0][0].value = showsBaseFolder
  return preset
}

export function migratePresetBaseFolders(
  preset: NamingPreset,
  movieBaseFolder: string,
  showsBaseFolder: string,
): NamingPreset {
  if (preset.version === 2) return cloneNamingPreset(preset)
  const upgraded = cloneNamingPreset(preset)
  upgraded.version = 2
  upgraded.movie.folders.unshift([
    { id: `${upgraded.id}-movie-base-folder`, type: 'text', value: movieBaseFolder || 'Movies' },
  ])
  upgraded.series.folders.unshift([
    { id: `${upgraded.id}-series-base-folder`, type: 'text', value: showsBaseFolder || 'TV Shows' },
  ])
  return upgraded
}

export function cloneNamingPreset(preset: NamingPreset): NamingPreset {
  // Presets contain JSON data only. JSON cloning also works when the source is a Vue proxy.
  return JSON.parse(JSON.stringify(preset)) as NamingPreset
}

export function sceneTagsForFile(fileName: string): string {
  return parseScene(stemOf(fileName)).tags
}
export function releaseGroupForFile(fileName: string): string {
  return parseScene(stemOf(fileName)).releaseGroup
}

function tokenValue(token: TemplateToken | undefined, row: PlanRow, episodeTitle?: string): string {
  const title = safeName(row.targetTitle || row.title) || 'Unknown Title'
  switch (token) {
    case 'title':
      return title
    case 'year':
      return row.year ? String(row.year) : ''
    case 'season':
      return row.season !== undefined ? pad(row.season) : ''
    case 'episode':
      return (row.episodes ?? (row.episode !== undefined ? [row.episode] : [])).map(pad).join('E')
    case 'episodeTitle':
      return safeName(episodeTitle || (row.episode ? `Episode ${pad(row.episode)}` : ''))
    case 'sceneTags':
      return sceneTagsForFile(row.source.name)
    case 'releaseGroup':
      return releaseGroupForFile(row.source.name)
    case 'sourceName':
      return stemOf(row.source.name)
    default:
      return ''
  }
}

function tidyValue(value: string): string {
  return safeName(
    value
      .replace(/\(\s*\)/g, '')
      .replace(/\[\s*\]/g, '')
      .replace(/\{\s*\}/g, '')
      .replace(/\s{2,}/g, ' '),
  )
}

export function renderPieces(pieces: TemplatePiece[], row: PlanRow, episodeTitle?: string): string {
  const emptyToken = '\uE000'
  let rendered = pieces
    .map((piece) => {
      if (piece.type === 'text') return piece.value || ''
      return tokenValue(piece.token, row, episodeTitle) || emptyToken
    })
    .join('')

  // Square brackets in fixed text create an optional template block. Work from
  // the inside out so nested blocks behave predictably as well.
  while (true) {
    const open = rendered.lastIndexOf('[')
    const close = open === -1 ? -1 : rendered.indexOf(']', open)
    if (open === -1 || close === -1) break
    const content = rendered.slice(open + 1, close)
    rendered = `${rendered.slice(0, open)}${
      content.includes(emptyToken) ? emptyToken : content
    }${rendered.slice(close + 1)}`
  }

  return tidyValue(rendered.replaceAll(emptyToken, ''))
}

export function buildTarget(
  row: PlanRow,
  root: string,
  template: NamingTemplate,
  episodeTitle?: string,
): string {
  const folders = template.folders
    .map((folder) => renderPieces(folder, row, episodeTitle))
    .filter(Boolean)
  const filename = renderPieces(template.filename, row, episodeTitle) || 'Unknown Title'
  const extension = row.source.name.includes('.')
    ? row.source.name.slice(row.source.name.lastIndexOf('.') + 1).toLowerCase()
    : ''
  return [safeName(root) || '_clean', ...folders, `${filename}.${extension}`].join('/')
}
