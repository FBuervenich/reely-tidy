import { describe, expect, it, vi } from 'vitest'
import { clearTmdbCache, getSeason, resolveId, searchTmdb, TmdbError } from '../src/lib/tmdb'
import { response } from './fixtures'

describe('TMDB request contracts', () => {
  it('does not share cached results across access tokens', async () => {
    const fetch = vi.fn(async () => response({ results: [] }))
    vi.stubGlobal('fetch', fetch)
    await searchTmdb('tv', 'Dark', 2017, 'token-a')
    await searchTmdb('tv', 'Dark', 2017, 'token-b')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('starts with fresh metadata when a new scan clears the cache', async () => {
    const fetch = vi.fn(async () => response({ episodes: [] }))
    vi.stubGlobal('fetch', fetch)
    await getSeason(70523, 1, 'token')
    clearTmdbCache()
    await getSeason(70523, 1, 'token')
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('sends authorization in the header and encodes search text separately', async () => {
    const fetch = vi.fn(async (_url: string, _options: RequestInit) => response({ results: [] }))
    vi.stubGlobal('fetch', fetch)
    await searchTmdb('movie', 'A & B / C?', 2021, 'test-secret')
    const [address, options] = fetch.mock.calls[0]
    const url = new URL(address)
    expect(url.pathname).toBe('/3/search/movie')
    expect(url.searchParams.get('query')).toBe('A & B / C?')
    expect(url.searchParams.get('year')).toBe('2021')
    expect(address).not.toContain('test-secret')
    expect(options.headers).toMatchObject({ Authorization: 'Bearer test-secret' })
  })

  it('uses the TV first-air-year parameter', async () => {
    const fetch = vi.fn(async (_url: string) => response({ results: [] }))
    vi.stubGlobal('fetch', fetch)
    await searchTmdb('tv', 'Dark', 2017, 'token')
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.searchParams.get('first_air_date_year')).toBe('2017')
    expect(url.searchParams.has('year')).toBe(false)
  })

  it('resolves direct TMDB IDs without title search', async () => {
    const fetch = vi.fn(async (_url: string) =>
      response({ id: 70523, name: 'Dark', first_air_date: '2017-12-01' }),
    )
    vi.stubGlobal('fetch', fetch)
    expect(
      await resolveId('tv', { provider: 'tmdb', value: '70523', type: 'tv' }, 'token'),
    ).toEqual([expect.objectContaining({ id: 70523, title: 'Dark', year: 2017, verifiedId: true })])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe('/3/tv/70523')
  })

  it('rejects typed IDs for a different media kind without a request', async () => {
    expect(
      await resolveId('movie', { provider: 'tmdb', value: '70523', type: 'tv' }, 'token'),
    ).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips blank search queries', async () => {
    expect(await searchTmdb('movie', '  ', undefined, 'token')).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports authentication errors distinctly from missing metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({}, 401)),
    )
    await expect(searchTmdb('movie', 'Dune', 2021, 'bad-token')).rejects.toMatchObject({
      status: 401,
      message: 'TMDB token was rejected.',
    } satisfies Partial<TmdbError>)
  })
})
