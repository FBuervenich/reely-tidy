import type { MediaKind } from '../lib/media'
import type { TmdbResult } from '../lib/tmdb'

export type RowState = 'ready' | 'conflict' | 'unrecognized' | 'needs-choice' | 'error' | 'done'
export type PlanFilter = 'all' | 'ready' | 'conflict' | 'unrecognized'

export interface FoundFile {
  name: string
  path: string
  handle: FileSystemFileHandle
  parent: FileSystemDirectoryHandle
}

export interface PlanRow {
  id: string
  source: FoundFile
  sidecars: FoundFile[]
  kind: MediaKind
  title: string
  year?: number
  season?: number
  episode?: number
  identityKey: string
  match?: TmdbResult
  candidates: TmdbResult[]
  target: string
  state: RowState
  error?: string
  enabled: boolean
  searching: boolean
}

export interface MoveLog {
  source: string
  target: string
  result: 'Verschoben' | 'Fehler'
  message?: string
}
