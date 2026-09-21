import { afterEach, beforeEach, expect, vi } from 'vitest'
import { clearTmdbCache } from '../src/lib/tmdb'

const unexpectedFetch = vi.fn(() => {
  throw new Error('Unexpected network request: stub fetch explicitly in this test.')
})

beforeEach(() => {
  clearTmdbCache()
  unexpectedFetch.mockClear()
  vi.stubGlobal('fetch', unexpectedFetch)
  const saved = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value),
    removeItem: (key: string) => saved.delete(key),
  })
})

afterEach(() => {
  // Assert even if application error handling caught the unexpected request.
  expect(unexpectedFetch).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})
