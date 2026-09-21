import { describe, expect, it, vi } from 'vitest'
import { addNfoContext, idsFromNfo } from '../src/services/context'
import { createPlan } from '../src/services/plan-builder'
import { file } from './fixtures'

describe('NFO context boundaries', () => {
  it('keeps show IDs confined to the corresponding series folder', async () => {
    const files = [
      file('Dark/Season 01/01.mkv'),
      file('Dark/tvshow.nfo', '<uniqueid type="tmdb">70523</uniqueid>'),
      file('Other/Season 01/01.mkv'),
      file('Other/tvshow.nfo', '<uniqueid type="tmdb">1399</uniqueid>'),
      file('tvshow.nfo', '<uniqueid type="tmdb">999</uniqueid>'),
    ]
    const rows = createPlan(files, { root: '_clean' }, 'Media')
    await addNfoContext(rows, files)
    expect(rows[0].ids).toEqual([{ provider: 'tmdb', value: '70523' }])
    expect(rows[1].ids).toEqual([{ provider: 'tmdb', value: '1399' }])
  })

  it('reads a shared show NFO only once across multiple seasons', async () => {
    const nfo = file('Dark/tvshow.nfo', '<uniqueid type="tmdb">70523</uniqueid>')
    const read = vi.spyOn(nfo.handle, 'getFile')
    const files = [file('Dark/Season 01/01.mkv'), file('Dark/Season 02/01.mkv'), nfo]
    const rows = createPlan(files, { root: '_clean' }, 'Media')
    await addNfoContext(rows, files)
    expect(read).toHaveBeenCalledTimes(1)
    expect(rows.map((row) => row.ids)).toEqual([
      [{ provider: 'tmdb', value: '70523' }],
      [{ provider: 'tmdb', value: '70523' }],
    ])
  })

  it('does not assign an ambiguous movie.nfo to multiple movies', async () => {
    const nfo = file('movie.nfo', '<uniqueid type="tmdb">438631</uniqueid>')
    const read = vi.spyOn(nfo.handle, 'getFile')
    const files = [file('Dune.2021.mkv'), file('Arrival.2016.mkv'), nfo]
    const rows = createPlan(files, { root: '_clean' })
    await addNfoContext(rows, files)
    expect(rows.map((row) => row.ids)).toEqual([[], []])
    expect(read).not.toHaveBeenCalled()
  })

  it('uses movie-specific NFOs in a folder with several movies', async () => {
    const files = [
      file('Dune.2021.mkv'),
      file('Arrival.2016.mkv'),
      file('Dune.2021.nfo', '<tmdbid>438631</tmdbid>'),
      file('Arrival.2016.nfo', 'https://www.themoviedb.org/movie/329865'),
    ]
    const rows = createPlan(files, { root: '_clean' })
    await addNfoContext(rows, files)
    expect(rows[0].ids).toEqual([{ provider: 'tmdb', value: '438631' }])
    expect(rows[1].ids).toEqual([{ provider: 'tmdb', value: '329865', type: 'movie' }])
  })

  it('skips oversized NFOs before reading their contents', async () => {
    const nfo = file('movie.nfo')
    const text = vi.fn(async () => '<tmdbid>438631</tmdbid>')
    vi.spyOn(nfo.handle, 'getFile').mockResolvedValue({
      size: 1024 * 1024 + 1,
      text,
    } as unknown as File)
    const files = [file('Dune.2021.mkv'), nfo]
    const rows = createPlan(files, { root: '_clean' })
    await addNfoContext(rows, files)
    expect(text).not.toHaveBeenCalled()
    expect(rows[0].ids).toEqual([])
  })

  it('keeps the filename suggestion when an NFO cannot be read', async () => {
    const nfo = file('movie.nfo')
    vi.spyOn(nfo.handle, 'getFile').mockRejectedValue(
      new DOMException('Access denied', 'NotAllowedError'),
    )
    const files = [file('Dune.2021.mkv'), nfo]
    const rows = createPlan(files, { root: '_clean' })
    await expect(addNfoContext(rows, files)).resolves.toBeUndefined()
    expect(rows[0].ids).toEqual([])
    expect(rows[0].evidence).toContain('Could not read movie.nfo')
    expect(rows[0].target).toContain('Dune (2021).mkv')
    expect(rows[0].confidence).toBe('filename')
  })

  it('ignores invalid and unsupported provider IDs', () => {
    expect(
      idsFromNfo(
        '<uniqueid type="tmdb">no-id</uniqueid><uniqueid type="tvdb">123</uniqueid><uniqueid type="imdb">123</uniqueid>',
      ),
    ).toEqual([])
  })
})
