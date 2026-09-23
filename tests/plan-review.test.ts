import { describe, expect, it, vi } from 'vitest'
import { readMappings } from '../src/services/storage'
import { response, setupPlan } from './fixtures'

describe('review and correction workflows', () => {
  it('detects sidecar collisions even when video destinations differ', () => {
    const plan = setupPlan(['First.mkv', 'First.en.srt', 'Second.mp4', 'Second.en.srt'])
    const [first, second] = plan.rows.value
    plan.updateTarget(first, '_clean/Shared.mkv')
    plan.updateTarget(second, '_clean/Shared.mp4')
    expect(first.state).toBe('conflict')
    expect(second.state).toBe('conflict')
    expect(plan.readyCount.value).toBe(0)
    plan.setEnabled(second, false)
    expect(first.state).toBe('ready')
    expect(plan.readyCount.value).toBe(1)
  })

  it('lets the user leave an ambiguous sidecar in place', () => {
    const plan = setupPlan(['Movie.mkv', 'Movie.mp4', 'Movie.en.srt'])
    plan.assignSidecar('Movie.en.srt', '')
    expect(
      plan.rows.value.every((row) => row.sidecars.length === 0 && row.sidecarChoices.length === 0),
    ).toBe(true)
    expect(plan.readyCount.value).toBe(2)
  })

  it('rejects sidecar assignments outside the eligible video set', () => {
    const plan = setupPlan(['Movie.mkv', 'Movie.mp4', 'Movie.en.srt', 'Other.mkv'])
    plan.assignSidecar('Movie.en.srt', plan.rows.value[2].id)
    expect(plan.rows.value[2].sidecars).toEqual([])
    expect(
      plan.rows.value
        .slice(0, 2)
        .every((row) => row.state === 'needs-choice' && row.sidecarChoices.length === 1),
    ).toBe(true)
  })

  it('keeps an existing match while searching a different provider ID', async () => {
    const fetch = vi.fn(async (address: string) => {
      const id = Number(new URL(address).pathname.split('/').at(-1))
      return response({ id, title: 'Dune', release_date: id === 1 ? '2021-01-01' : '1984-01-01' })
    })
    vi.stubGlobal('fetch', fetch)
    const plan = setupPlan(['Dune.2021.mkv'])
    const row = plan.rows.value[0]
    await plan.selectMatch(row, { id: 1, title: 'Dune', year: 2021 })
    const target = row.target
    await plan.searchMatches(row, 'tmdb:2')
    expect(row.match?.id).toBe(1)
    expect(row.target).toBe(target)
    expect(row.candidates).toEqual([expect.objectContaining({ id: 2, verifiedId: true })])
    expect(readMappings()[row.identityKey].id).toBe(1)
    expect(row.searching).toBe(false)
  })

  it('preserves an existing match if a manual search fails', async () => {
    const fetch = vi.fn(async () => response({ id: 1, title: 'Dune' }))
    vi.stubGlobal('fetch', fetch)
    const plan = setupPlan(['Dune.mkv'])
    const row = plan.rows.value[0]
    await plan.selectMatch(row, { id: 1, title: 'Dune' })
    const target = row.target
    fetch.mockRejectedValueOnce(new Error('Network unavailable'))
    await plan.searchMatches(row, 'Arrival')
    expect(row.lookupError).toBe('Network unavailable')
    expect(row.match?.id).toBe(1)
    expect(row.target).toBe(target)
    expect(row.searching).toBe(false)
  })

  it('searches the other TMDB catalogue after changing the detected media type', async () => {
    const fetch = vi.fn(async (url: string) =>
      response(
        url.includes('/search/tv')
          ? { results: [{ id: 1, name: 'Dune: Prophecy', first_air_date: '2024-01-01' }] }
          : { id: 1, name: 'Dune: Prophecy' },
      ),
    )
    vi.stubGlobal('fetch', fetch)
    const plan = setupPlan(['Dune.mkv'])
    const row = plan.rows.value[0]

    plan.setMediaKind(row, 'series')
    expect(row).toMatchObject({ kind: 'series', kindOverride: 'series', state: 'needs-choice' })
    plan.setEpisodes(row, 1, [1])
    expect(row.detection.kind).toBe('movie')
    expect(row.kind).toBe('series')

    await plan.searchMatches(row, 'Dune: Prophecy')
    expect(fetch.mock.calls.some(([url]) => url.includes('/search/tv'))).toBe(true)

    await plan.selectMatch(row, { id: 1, title: 'Dune: Prophecy', year: 2024 })
    expect(readMappings()[row.identityKey]).toMatchObject({
      id: 1,
      kind: 'series',
      season: 1,
      episodes: [1],
    })
  })

  it('clears episode data and uses the movie preset after changing a show into a movie', () => {
    const plan = setupPlan(['Dark.S01E02.mkv'])
    const row = plan.rows.value[0]

    plan.setMediaKind(row, 'movie')

    expect(row).toMatchObject({
      kind: 'movie',
      kindOverride: 'movie',
      season: undefined,
      episode: undefined,
      episodes: undefined,
    })
    expect(row.target).toContain('/Movies/')
  })

  it('does not propagate a manual match over a different explicit provider ID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        response(
          url.includes('/season/')
            ? {
                episodes: [1, 2].map((episode_number) => ({
                  season_number: 1,
                  episode_number,
                  name: `Episode ${episode_number}`,
                })),
              }
            : { id: 1, name: 'Dark' },
        ),
      ),
    )
    const plan = setupPlan([
      'Dark/Season 01/Dark.{tmdb-1}.S01E01.mkv',
      'Dark/Season 01/Dark.{tmdb-2}.S01E02.mkv',
    ])
    const [first, second] = plan.rows.value
    expect(first.groupKey).toBe(second.groupKey)
    await plan.selectMatch(first, { id: 1, title: 'Dark' })
    expect(first.match?.id).toBe(1)
    expect(second.match).toBeUndefined()
    expect(second.confidence).toBe('filename')
  })

  it('can limit a manual show choice to one episode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        response(
          url.includes('/season/')
            ? { episodes: [{ season_number: 1, episode_number: 1, name: 'First' }] }
            : { id: 1, name: 'Dark' },
        ),
      ),
    )
    const plan = setupPlan(['Season 01/Dark.S01E01.mkv', 'Archive/Dark.S01E01.mkv'])

    await plan.selectMatch(plan.rows.value[0], { id: 1, title: 'Dark' }, false)

    expect(plan.rows.value[0].match?.id).toBe(1)
    expect(plan.rows.value[1].match).toBeUndefined()
  })

  it('applies a manual show choice to matching episodes in other folders when requested', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        response(
          url.includes('/season/')
            ? {
                episodes: [1, 2].map((episode_number) => ({
                  season_number: 1,
                  episode_number,
                  name: `Episode ${episode_number}`,
                })),
              }
            : { id: 1, name: 'Dark' },
        ),
      ),
    )
    const plan = setupPlan(['Season 01/Dark.S01E01.mkv', 'Archive/Dark.S01E02.mkv'])

    await plan.selectMatch(plan.rows.value[0], { id: 1, title: 'Dark' }, true)

    expect(plan.rows.value.every((row) => row.match?.id === 1)).toBe(true)
    expect(plan.rows.value.every((row) => row.state === 'ready')).toBe(true)
  })

  it('reports local persistence failures without discarding the applied match', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ id: 1, title: 'Dune' })),
    )
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError')
    })
    const plan = setupPlan(['Dune.mkv'])
    const row = plan.rows.value[0]
    await plan.selectMatch(row, { id: 1, title: 'Dune' })
    expect(row.match?.id).toBe(1)
    expect(row.error).toContain('could not be saved')
    expect(row.searching).toBe(false)
    expect(row.target).toContain('Dune.mkv')
  })

  it.each([
    { season: -1, episodes: [1] },
    { season: 1, episodes: [] },
    { season: 1, episodes: [1000] },
  ])('does not apply invalid episode corrections: %j', ({ season, episodes }) => {
    const plan = setupPlan(['Dark/Season 01/01.mkv'])
    const row = plan.rows.value[0]
    plan.setEpisodes(row, season, episodes)
    expect(row).toMatchObject({
      season: 1,
      episodes: [1],
      inferredEpisode: true,
      state: 'needs-choice',
    })
  })
})
