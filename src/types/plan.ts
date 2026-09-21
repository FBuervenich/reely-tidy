import type { ParsedMedia } from '../lib/media'
import type { TmdbResult } from '../lib/tmdb'

export type RowState = 'ready' | 'conflict' | 'unrecognized' | 'needs-choice' | 'error' | 'done'
export type PlanFilter = 'all' | 'ready' | 'conflict' | 'needs-choice' | 'unrecognized'

export interface FoundFile {
  name: string
  path: string
  handle: FileSystemFileHandle
  parent: FileSystemDirectoryHandle
}

export interface PlanRow extends ParsedMedia {
  id: string
  source: FoundFile
  sidecars: FoundFile[]
  title: string
  targetTitle?: string
  year?: number
  season?: number
  episode?: number
  identityKey: string
  groupKey: string
  detection: ParsedMedia
  confidence: 'filename' | 'metadata' | 'confirmed'
  matchPending?: boolean
  matchReasons: string[]
  episodeValidation: 'unvalidated' | 'valid' | 'missing'
  episodeTitle?: string
  sidecarChoices: { file: FoundFile; rowIds: string[] }[]
  lookupError?: string
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
  result: 'Moved' | 'Error'
  message?: string
}
