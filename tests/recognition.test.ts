import { describe, expect, it, vi } from 'vitest'
import { parseMediaName } from '../src/lib/media'
import { sceneTagsForFile, releaseGroupForFile } from '../src/lib/naming'
import { createPlan, companionTargetName } from '../src/services/plan-builder'
import { idsFromNfo, addNfoContext } from '../src/services/context'
import {
  automaticMatch,
  findCandidates,
  scoreCandidate,
  validateEpisodes,
} from '../src/services/matching'
import { clearTmdbCache, getSeason, searchTmdb } from '../src/lib/tmdb'

import { file, setupPlan, response } from './fixtures'

describe('filename and folder parsing', () => {
  it.each([
    ['1917.2019.1080p.BluRay.mkv', '1917', 2019],
    ['2001.A.Space.Odyssey.1968.mkv', '2001 A Space Odyssey', 1968],
    ['English.Vinglish.2012.mkv', 'English Vinglish', 2012],
    ['Dune.1080p.BluRay.mkv', 'Dune', undefined],
  ])('%s preserves its title', (name, title, year) => {
    expect(parseMediaName(name)).toMatchObject({ kind: 'movie', title, year })
  })
  it('uses a show folder for an otherwise empty title', () => {
    expect(parseMediaName('S01E01.mkv', 'Dark/Season 01/S01E01.mkv')).toMatchObject({
      title: 'Dark',
      season: 1,
      episodes: [1],
    })
  })
  it('uses the selected root folder as context', () => {
    expect(parseMediaName('01.mkv', 'Season 02/01.mkv', 'Dark (2017)')).toMatchObject({
      title: 'Dark',
      year: 2017,
      season: 2,
      episode: 1,
      inferredEpisode: true,
    })
  })
  it.each(['Show.S01E01E02.mkv', 'Show.S01E01-E02.mkv', 'Show.1x01x02.mkv'])(
    'retains all episodes in %s',
    (name) => {
      const row = createPlan([file(name)], { root: '_clean' })[0]
      expect(row.episodes).toEqual([1, 2])
      expect(row.target).toContain('S01E01E02')
    },
  )
  it('supports explicit ranges', () => {
    expect(parseMediaName('Show.S01E01-E03.mkv').episodes).toEqual([1, 2, 3])
  })
  it('renders season zero', () => {
    const row = createPlan([file('Dark.S00E01.mkv')], { root: '_clean' })[0]
    expect(row.target).toContain('Season 00/')
    expect(row.target).toContain('S00E01')
  })
  it('recognizes dates before years and requires validation', () => {
    const row = createPlan([file('Show.2024.09.19.1080p.mkv')], { root: '_clean' })[0]
    expect(row).toMatchObject({
      title: 'Show',
      kind: 'series',
      airDate: '2024-09-19',
      state: 'needs-choice',
    })
    expect(row.year).toBeUndefined()
  })
  it('keeps folder numbering unvalidated despite neighbors', () => {
    const rows = createPlan(
      ['01', '02', '03'].map((name) => file(`Dark (2017)/Season 02/${name}.mkv`)),
      { root: '_clean' },
    )
    expect(rows.every((row) => row.state === 'needs-choice')).toBe(true)
    expect(rows[0].evidence.join()).toContain('2 neighboring')
  })
  it('extracts IDs from folders and retains source offsets', () => {
    const parsed = parseMediaName('Show.S01E02.mkv', 'Show {tmdb-1399}/Show.S01E02.mkv')
    expect(parsed.ids).toEqual([{ provider: 'tmdb', value: '1399', type: undefined }])
    expect(parsed.spans.some((span) => span.field === 'episodes')).toBe(true)
  })
})

describe('release tags and sidecars', () => {
  it('does not mistake WEB-DL for a release group', () => {
    expect(releaseGroupForFile('Movie.2020.1080p.WEB-DL.mkv')).toBe('')
  })
  it('separates the group and retains DDP5.1', () => {
    const name = 'Movie.2020.GERMAN.1080p.WEB-DL.DDP5.1.H.265-GROUP.mkv'
    expect(releaseGroupForFile(name)).toBe('GROUP')
    expect(sceneTagsForFile(name)).toBe('GERMAN 1080p WEB-DL DDP5.1 H.265')
  })
  it('chooses the longest matching video exactly once', () => {
    const rows = createPlan(
      ['Movie.mkv', 'Movie.Extended.mkv', 'Movie.Extended.en.srt'].map((name) => file(name)),
      { root: '_clean' },
    )
    expect(rows[0].sidecars).toHaveLength(0)
    expect(rows[1].sidecars.map((item) => item.name)).toEqual(['Movie.Extended.en.srt'])
    expect(companionTargetName(rows[1], 'Movie.Extended.en.srt')).toMatch(/\.en\.srt$/)
  })
  it('requires an explicit sidecar owner for tied stems', () => {
    const plan = setupPlan(['Movie.mkv', 'Movie.mp4', 'Movie.en.srt'])
    expect(
      plan.rows.value.every(
        (row) => row.sidecarChoices.length === 1 && row.state === 'needs-choice',
      ),
    ).toBe(true)
    plan.assignSidecar('Movie.en.srt', plan.rows.value[1].id)
    expect(plan.rows.value[0].sidecars).toHaveLength(0)
    expect(plan.rows.value[1].sidecars).toHaveLength(1)
    expect(plan.rows.value.every((row) => row.sidecarChoices.length === 0)).toBe(true)
  })
  it('does not attach sidecars in different folders', () => {
    const rows = createPlan([file('A/Movie.mkv'), file('B/Movie.en.srt')], { root: '_clean' })
    expect(rows[0].sidecars).toHaveLength(0)
  })
})

describe('context and candidate evidence', () => {
  it('reads common NFO ID formats', () => {
    expect(
      idsFromNfo('<uniqueid type="tmdb" default="true">1399</uniqueid><imdbid>tt0944947</imdbid>'),
    ).toEqual(
      expect.arrayContaining([
        { provider: 'tmdb', value: '1399' },
        { provider: 'imdb', value: 'tt0944947' },
      ]),
    )
  })
  it('reads a show NFO from the selected root', async () => {
    const files = [
      file('Season 01/01.mkv'),
      file('tvshow.nfo', '<uniqueid type="tmdb">1399</uniqueid>'),
    ]
    const rows = createPlan(files, { root: '_clean' }, 'Show')
    await addNfoContext(rows, files)
    expect(rows[0].ids).toContainEqual({ provider: 'tmdb', value: '1399' })
  })
  it('rejects a single unrelated search hit', () => {
    const parsed = parseMediaName('Dune.2021.mkv')
    expect(
      automaticMatch([
        scoreCandidate(parsed, { id: 1, title: 'Completely unrelated', year: 2021 }),
      ]),
    ).toBeUndefined()
  })
  it('accepts a clear title/year match among multiple results', () => {
    const parsed = parseMediaName('Dune.2021.mkv')
    const results = [
      { id: 1, title: 'Dune', year: 2021 },
      { id: 2, title: 'Dune', year: 1984 },
    ]
      .map((candidate) => scoreCandidate(parsed, candidate))
      .sort((a, b) => b.score! - a.score!)
    expect(automaticMatch(results)?.id).toBe(1)
  })
  it('does not auto-select an ambiguous remake without a year', () => {
    const parsed = parseMediaName('Dune.1080p.mkv')
    expect(
      automaticMatch(
        [
          { id: 1, title: 'Dune', year: 2021 },
          { id: 2, title: 'Dune', year: 1984 },
        ].map((candidate) => scoreCandidate(parsed, candidate)),
      ),
    ).toBeUndefined()
  })
  it('matches alternative titles', () => {
    expect(
      automaticMatch([
        scoreCandidate(parseMediaName('Die.Hard.1988.mkv'), {
          id: 1,
          title: 'Stirb langsam',
          alternativeTitles: ['Die Hard'],
          year: 1988,
        }),
      ])?.id,
    ).toBe(1)
  })
  it('treats a conflicting verified ID as reviewable', () => {
    expect(
      automaticMatch([
        scoreCandidate(parseMediaName('Dune.2021.mkv'), {
          id: 1,
          title: 'Other Movie',
          year: 1984,
          verifiedId: true,
        }),
      ]),
    ).toBeUndefined()
  })
})

describe('TMDB strategy and validation', () => {
  it('retries a restrictive year search without that filter', async () => {
    const fetch = vi.fn(async (url: string) => {
      const parsed = new URL(url)
      if (parsed.pathname.includes('/search/'))
        return response({
          results: parsed.searchParams.has('year')
            ? []
            : [{ id: 1, title: 'Dune', release_date: '2021-01-01' }],
        })
      return response({
        id: 1,
        title: 'Dune',
        release_date: '2021-01-01',
        alternative_titles: { titles: [] },
      })
    })
    vi.stubGlobal('fetch', fetch)
    const candidates = await findCandidates(parseMediaName('Dune.2020.mkv'), 'token')
    expect(candidates[0].id).toBe(1)
    expect(fetch.mock.calls.filter(([url]) => url.includes('/search/'))).toHaveLength(2)
  })
  it('resolves IMDb IDs using Find', async () => {
    const fetch = vi.fn(async (url: string) =>
      response(
        url.includes('/find/')
          ? {
              movie_results: [{ id: 1, title: 'Dune', release_date: '2021-01-01' }],
              tv_results: [],
            }
          : { id: 1, title: 'Dune', release_date: '2021-01-01' },
      ),
    )
    vi.stubGlobal('fetch', fetch)
    const candidates = await findCandidates(parseMediaName('Dune.2021.tt1160419.mkv'), 'token')
    expect(candidates[0].verifiedId).toBe(true)
    expect(
      fetch.mock.calls.some(([url]) => url.includes('/find/tt1160419?external_source=imdb_id')),
    ).toBe(true)
    expect(fetch.mock.calls.some(([url]) => url.includes('/search/'))).toBe(false)
  })
  it('deduplicates simultaneous and completed requests', async () => {
    const fetch = vi.fn(async () => response({ results: [] }))
    vi.stubGlobal('fetch', fetch)
    await Promise.all([
      searchTmdb('tv', 'Dark', 2017, 'token'),
      searchTmdb('tv', 'Dark', 2017, 'token'),
    ])
    await searchTmdb('tv', 'Dark', 2017, 'token')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('caps network concurrency at four', async () => {
    let active = 0,
      peak = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        active++
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active--
        return response({ results: [] })
      }),
    )
    await Promise.all(
      Array.from({ length: 12 }, (_, i) => searchTmdb('movie', `Movie ${i}`, undefined, 'token')),
    )
    expect(peak).toBe(4)
  })
  it('does not cache transient failures', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({}, 503))
      .mockResolvedValueOnce(response({ episodes: [] }))
    vi.stubGlobal('fetch', fetch)
    await expect(getSeason(1, 1, 'token')).rejects.toThrow('503')
    await expect(getSeason(1, 1, 'token')).resolves.toEqual([])
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('separates nonexistent episodes from network failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({}, 404)),
    )
    const parsed = parseMediaName('Dark.S01E99.mkv')
    expect((await validateEpisodes(parsed, { id: 1, title: 'Dark' }, 'token')).status).toBe(
      'missing',
    )
    clearTmdbCache()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      }),
    )
    expect((await validateEpisodes(parsed, { id: 1, title: 'Dark' }, 'token')).status).toBe(
      'unvalidated',
    )
  })
  it('validates every episode in a combined file', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({ episodes: [{ season_number: 1, episode_number: 1, name: 'First' }] }),
      ),
    )
    expect(
      (
        await validateEpisodes(
          parseMediaName('Show.S01E01E02.mkv'),
          { id: 1, title: 'Show' },
          'token',
        )
      ).status,
    ).toBe('missing')
  })
  it('maps an air date only when the episode is unique', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          episodes: [
            { season_number: 4, episode_number: 2, air_date: '2024-09-19', name: 'Second' },
          ],
        }),
      ),
    )
    expect(
      await validateEpisodes(
        parseMediaName('Show.2024.09.19.mkv'),
        { id: 1, title: 'Show', seasons: [4] },
        'token',
      ),
    ).toMatchObject({ status: 'valid', season: 4, episodes: [2] })
  })
  it('requires review for multiple episodes on an air date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          episodes: [1, 2].map((number) => ({
            season_number: 1,
            episode_number: number,
            air_date: '2024-09-19',
          })),
        }),
      ),
    )
    expect(
      (
        await validateEpisodes(
          parseMediaName('Show.2024.09.19.mkv'),
          { id: 1, title: 'Show', seasons: [1] },
          'token',
        )
      ).status,
    ).toBe('missing')
  })
  it('applies a manual show choice to its group with one detail and one season request', async () => {
    const fetch = vi.fn(async (url: string) =>
      response(
        url.includes('/season/')
          ? {
              episodes: [1, 2, 3].map((number) => ({
                season_number: 1,
                episode_number: number,
                name: `Episode ${number}`,
              })),
            }
          : { id: 1, name: 'Dark', first_air_date: '2017-01-01' },
      ),
    )
    vi.stubGlobal('fetch', fetch)
    const plan = setupPlan([1, 2, 3].map((n) => `Dark/Season 01/Dark.S01E0${n}.mkv`))
    await plan.selectMatch(plan.rows.value[0], { id: 1, title: 'Dark', year: 2017 })
    expect(
      plan.rows.value.every(
        (row) =>
          row.state === 'ready' &&
          row.episodeValidation === 'valid' &&
          row.confidence === 'confirmed',
      ),
    ).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
  it('never marks S01E99 ready after a TMDB 404', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/season/') ? response({}, 404) : response({ id: 1, name: 'Dark' }),
      ),
    )
    const plan = setupPlan(['Dark.S01E99.mkv'])
    await plan.selectMatch(plan.rows.value[0], { id: 1, title: 'Dark' })
    expect(plan.rows.value[0].state).toBe('needs-choice')
    plan.updateTarget(plan.rows.value[0], '_clean/Manual.mkv')
    expect(plan.rows.value[0].state).toBe('needs-choice')
  })
})

describe('complete scans and corrections', () => {
  function folder(
    name: string,
    entries: (string | { name: string; kind: string; entries?: unknown })[],
  ): FileSystemDirectoryHandle {
    return {
      name,
      kind: 'directory',
      async *entries() {
        for (const entry of entries) {
          const value = typeof entry === 'string' ? { name: entry, kind: 'file' } : entry
          yield [value.name, value]
        }
      },
    } as FileSystemDirectoryHandle
  }
  async function scan(paths: string[], fetch: (url: string) => Promise<Response>) {
    vi.stubGlobal('window', {
      isSecureContext: true,
      showDirectoryPicker: async () => folder('Media', paths),
    })
    vi.stubGlobal('fetch', vi.fn(fetch))
    const plan = setupPlan([])
    await plan.chooseAndScan()
    return plan
  }
  it('searches and validates three episodes with three total requests', async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes('/search/'))
        return response({ results: [{ id: 1, name: 'Dark', first_air_date: '2017-01-01' }] })
      if (url.includes('/season/'))
        return response({
          episodes: [1, 2, 3].map((n) => ({
            season_number: 1,
            episode_number: n,
            name: `Episode ${n}`,
          })),
        })
      return response({ id: 1, name: 'Dark', first_air_date: '2017-01-01' })
    })
    const plan = await scan(
      [1, 2, 3].map((n) => `Dark.S01E0${n}.mkv`),
      fetch,
    )
    expect(plan.rows.value).toHaveLength(3)
    expect(
      plan.rows.value.every((row) => row.confidence === 'metadata' && row.state === 'ready'),
    ).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(localStorage.getItem('mediaRenamer.tmdbMappings')).toBeNull()
  })
  it('does not accept an unrelated sole result during a scan', async () => {
    const plan = await scan(['Dune.2021.mkv'], async (url) =>
      response(
        url.includes('/search/')
          ? { results: [{ id: 1, title: 'Alien', release_date: '2021-01-01' }] }
          : { id: 1, title: 'Alien', release_date: '2021-01-01' },
      ),
    )
    expect(plan.rows.value[0].match).toBeUndefined()
    expect(plan.rows.value[0].state).toBe('needs-choice')
    plan.updateTarget(plan.rows.value[0], '_clean/Dune.mkv')
    expect(plan.rows.value[0].state).toBe('needs-choice')
    plan.useFilename(plan.rows.value[0])
    expect(plan.rows.value[0].state).toBe('ready')
    expect(plan.rows.value[0].confidence).toBe('filename')
  })
  it('searches movies without a release year', async () => {
    const fetch = vi.fn(async (url: string) =>
      response(
        url.includes('/search/')
          ? { results: [{ id: 1, title: 'Dune' }] }
          : { id: 1, title: 'Dune' },
      ),
    )
    const plan = await scan(['Dune.1080p.mkv'], fetch)
    expect(plan.rows.value[0].match?.id).toBe(1)
    expect(fetch.mock.calls.some(([url]) => url.includes('query=Dune'))).toBe(true)
  })
  it('keeps absent episodes pending even when another episode in the group exists', async () => {
    const plan = await scan(['Dark.S01E01.mkv', 'Dark.S01E99.mkv'], async (url) => {
      if (url.includes('/search/')) return response({ results: [{ id: 1, name: 'Dark' }] })
      if (url.includes('/season/'))
        return response({ episodes: [{ episode_number: 1, season_number: 1, name: 'First' }] })
      return response({ id: 1, name: 'Dark' })
    })
    expect(plan.rows.value[0].state).toBe('ready')
    expect(plan.rows.value[1].state).toBe('needs-choice')
    expect(plan.rows.value[1].error).toContain('Episode not found')
  })
  it('uses episode existence to distinguish otherwise identical shows', async () => {
    const plan = await scan(['Show.S03E01.mkv'], async (url) => {
      if (url.includes('/search/'))
        return response({
          results: [
            { id: 1, name: 'Show' },
            { id: 2, name: 'Show' },
          ],
        })
      if (url.includes('/tv/2/season/')) return response({}, 404)
      if (url.includes('/season/'))
        return response({ episodes: [{ season_number: 3, episode_number: 1, name: 'First' }] })
      return response({ id: url.includes('/tv/2?') ? 2 : 1, name: 'Show' })
    })
    expect(plan.rows.value[0].match?.id).toBe(1)
    expect(plan.rows.value[0].matchReasons).toContain('All episodes exist in season metadata')
  })
  it('can replace and forget a saved manual choice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => response({ id: url.includes('/2?') ? 2 : 1, title: 'Dune' })),
    )
    const plan = setupPlan(['Dune.mkv'])
    const row = plan.rows.value[0]
    await plan.selectMatch(row, { id: 1, title: 'Dune' })
    await plan.selectMatch(row, { id: 2, title: 'Dune' })
    expect(JSON.parse(localStorage.getItem('mediaRenamer.tmdbMappings')!)[row.identityKey].id).toBe(
      2,
    )
    plan.useFilename(row)
    expect(
      JSON.parse(localStorage.getItem('mediaRenamer.tmdbMappings')!)[row.identityKey],
    ).toBeUndefined()
    expect(row.match).toBeUndefined()
  })
  it('does not confuse movie.nfo with episode-level IDs', async () => {
    const files = [
      file('Show.S01E01.mkv'),
      file('Show.S01E01.nfo', '<uniqueid type="tmdb">12345</uniqueid>'),
    ]
    const rows = createPlan(files, { root: '_clean' })
    await addNfoContext(rows, files)
    expect(rows[0].ids).toEqual([])
  })
  it('retains hyphenated release groups', () => {
    expect(releaseGroupForFile('Movie.1080p.H.265-SOME-GROUP.mkv')).toBe('SOME-GROUP')
  })
  it('parses numeric episode ranges without truncating the endpoint', () => {
    expect(parseMediaName('Show.S01E01-03.mkv').episodes).toEqual([1, 2, 3])
  })
  it('does not automatically substitute a conflicting folder title', () => {
    const parsed = parseMediaName('Dune.mkv', 'Titanic (1997)/Dune.mkv')
    expect(
      automaticMatch([scoreCandidate(parsed, { id: 1, title: 'Titanic', year: 1997 })]),
    ).toBeUndefined()
  })
})

describe('additional context and execution safeguards', () => {
  it('uses consistent named neighbors without approving bare episode numbers', () => {
    const rows = createPlan(
      [file('Shows/Season 01/01.mkv'), file('Shows/Season 01/Dark.S01E02.mkv')],
      { root: '_clean' },
    )
    expect(rows[0]).toMatchObject({ title: 'Dark', state: 'needs-choice', inferredEpisode: true })
    expect(rows[0].interpretations).toContainEqual({
      title: 'Dark',
      year: undefined,
      source: 'neighbors',
    })
  })
  it('does not generate Unknown Title destinations for empty show names', () => {
    const row = createPlan([file('S01E01.mkv')], { root: '_clean' })[0]
    expect(row.target).toBe('')
    expect(row.state).toBe('unrecognized')
  })
  it('keeps valid explicit episode numbers unvalidated on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/season/')) throw new Error('offline')
        return response({ id: 1, name: 'Dark' })
      }),
    )
    const plan = setupPlan(['Dark.S01E01.mkv'])
    await plan.selectMatch(plan.rows.value[0], { id: 1, title: 'Dark' })
    expect(plan.rows.value[0]).toMatchObject({ state: 'ready', episodeValidation: 'unvalidated' })
    expect(plan.rows.value[0].error).toContain('offline')
  })
  it('keeps inferred numbering pending on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/season/') ? response({}, 503) : response({ id: 1, name: 'Dark' }),
      ),
    )
    const plan = setupPlan(['Dark/Season 01/01.mkv'])
    await plan.selectMatch(plan.rows.value[0], { id: 1, title: 'Dark' })
    expect(plan.rows.value[0]).toMatchObject({
      state: 'needs-choice',
      episodeValidation: 'unvalidated',
    })
  })
  it('clears resolved date episode numbers when reverting to the filename', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.includes('/season/')
          ? response({
              episodes: [{ season_number: 1, episode_number: 2, air_date: '2024-09-19' }],
            })
          : response({ id: 1, name: 'Show', seasons: [{ season_number: 1 }] }),
      ),
    )
    const plan = setupPlan(['Show.2024.09.19.mkv'])
    const row = plan.rows.value[0]
    await plan.selectMatch(row, { id: 1, title: 'Show' })
    expect(row.episode).toBe(2)
    plan.useFilename(row)
    expect(row.episode).toBeUndefined()
    expect(row.target).toBe('')
    expect(row.state).toBe('needs-choice')
  })
  it('preserves language words before a real title and reports precise title offsets', () => {
    const name = 'English.Vinglish.2012.1080p.mkv'
    const parsed = parseMediaName(name)
    const span = parsed.spans.find((item) => item.field === 'title')!
    expect(name.slice(span.start, span.end)).toBe('English.Vinglish')
  })
})

describe('language and confidence boundaries', () => {
  it('retains a localized search title when English details are hydrated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        response(
          url.includes('/search/')
            ? { results: [{ id: 1, title: 'Stirb langsam', release_date: '1988-01-01' }] }
            : { id: 1, title: 'Die Hard', original_title: 'Die Hard', release_date: '1988-01-01' },
        ),
      ),
    )
    const candidates = await findCandidates(parseMediaName('Stirb.langsam.1988.mkv'), 'token')
    expect(automaticMatch(candidates)?.id).toBe(1)
    expect(candidates[0].alternativeTitles).toContain('Die Hard')
  })
  it('keeps known 404 responses shared for the scan', async () => {
    const fetch = vi.fn(async () => response({}, 404))
    vi.stubGlobal('fetch', fetch)
    await expect(getSeason(1, 1, 'token')).rejects.toThrow('404')
    await expect(getSeason(1, 1, 'token')).rejects.toThrow('404')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not treat unvalidated runner-up episodes as negative evidence', () => {
    expect(
      automaticMatch([
        {
          id: 1,
          title: 'Show',
          score: 85,
          episodeStatus: 'valid',
          reasons: ['Exact title or alternative title'],
        },
        {
          id: 2,
          title: 'Show',
          score: 65,
          episodeStatus: 'unvalidated',
          reasons: ['Exact title or alternative title'],
        },
      ]),
    ).toBeUndefined()
  })
})
