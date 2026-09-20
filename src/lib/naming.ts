import { pad, safeName } from './media'
import type { PlanRow } from '../types/plan'

export type TemplateToken = 'title' | 'year' | 'season' | 'episode' | 'episodeTitle'

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
  movie: NamingTemplate
  series: NamingTemplate
}

export const TOKEN_LABELS: Record<TemplateToken, string> = {
  title: 'Title',
  year: 'Year',
  season: 'Season',
  episode: 'Episode',
  episodeTitle: 'Episode title',
}

const defaultMovie: NamingTemplate = {
  folders: [
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

export function defaultNamingPreset(): NamingPreset {
  return cloneNamingPreset({
    id: 'standard',
    name: 'Standard',
    movie: defaultMovie,
    series: defaultSeries,
  })
}

export function cloneNamingPreset(preset: NamingPreset): NamingPreset {
  // Presets contain JSON data only. JSON cloning also works when the source is a Vue proxy.
  return JSON.parse(JSON.stringify(preset)) as NamingPreset
}

function tokenValue(token: TemplateToken | undefined, row: PlanRow, episodeTitle?: string): string {
  const title = safeName(row.targetTitle || row.title) || 'Unknown Title'
  switch (token) {
    case 'title':
      return title
    case 'year':
      return row.year ? String(row.year) : ''
    case 'season':
      return row.season ? pad(row.season) : ''
    case 'episode':
      return row.episode ? pad(row.episode) : ''
    case 'episodeTitle':
      return safeName(episodeTitle || (row.episode ? `Episode ${pad(row.episode)}` : ''))
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
  return tidyValue(
    pieces
      .map((piece) =>
        piece.type === 'token' ? tokenValue(piece.token, row, episodeTitle) : piece.value || '',
      )
      .join(''),
  )
}

export function buildTarget(
  row: PlanRow,
  root: string,
  baseFolder: string,
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
  return [
    safeName(root) || '_clean',
    safeName(baseFolder) || (row.kind === 'movie' ? 'Movies' : 'Shows'),
    ...folders,
    `${filename}.${extension}`,
  ].join('/')
}
