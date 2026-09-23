import type { ParsedMedia } from '../lib/media'
import {
  getDetails,
  getSeason,
  resolveId,
  searchTmdb,
  TmdbError,
  type TmdbResult,
} from '../lib/tmdb'

const normalize = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  const grams = (s: string) =>
    new Set(Array.from({ length: Math.max(0, s.length - 1) }, (_, i) => s.slice(i, i + 2)))
  const x = grams(a),
    y = grams(b)
  return x.size + y.size ? (2 * [...x].filter((part) => y.has(part)).length) / (x.size + y.size) : 0
}
export function scoreCandidate(parsed: ParsedMedia, candidate: TmdbResult): TmdbResult {
  const names = [
    candidate.title,
    candidate.originalTitle ?? '',
    ...(candidate.alternativeTitles ?? []),
  ]
    .map(normalize)
    .filter(Boolean)
  const interpretations = parsed.interpretations.length
    ? parsed.interpretations
    : [{ title: parsed.title, year: parsed.year, source: 'filename' as const }]
  let best = { score: 0, reasons: [] as string[], contradictions: [] as string[] }
  for (const option of interpretations) {
    const exact = names.includes(normalize(option.title))
    const similarityScore = Math.max(
      0,
      ...names.map((name) => similarity(normalize(option.title), name)),
    )
    let score = exact ? 65 : Math.round(similarityScore * 40)
    const reasons = [exact ? 'Exact title or alternative title' : 'Similar title only']
    const contradictions: string[] = []
    const year = option.year ?? parsed.year
    if (year !== undefined && candidate.year !== undefined) {
      const delta = Math.abs(year - candidate.year)
      if (delta === 0) {
        score += 25
        reasons.push('Year matches')
      } else if (delta === 1) {
        score += 5
        reasons.push('Release year differs by one')
      } else {
        score -= 35
        contradictions.push('Release year contradicts the filename or folder')
      }
    }
    if (option.source === 'folder' && exact) {
      reasons.push('Series or movie folder matches')
      if (
        parsed.interpretations[0]?.source === 'filename' &&
        !names.includes(normalize(parsed.title))
      )
        contradictions.push('Folder title and filename disagree')
    }
    if (option.source === 'neighbors' && exact)
      reasons.push('Title agrees with neighboring filenames')
    if (candidate.verifiedId) {
      score += 100
      reasons.unshift('Provider ID verified')
      if (!exact && parsed.title) contradictions.push('Provider ID and title disagree')
    }
    if (score > best.score || best.reasons.length === 0) best = { score, reasons, contradictions }
  }
  return { ...candidate, ...best }
}
export function automaticMatch(candidates: TmdbResult[]): TmdbResult | undefined {
  const [first, second] = candidates
  // A broken or stale ID in an NFO is useful context, but must not outweigh an
  // otherwise unambiguous title-and-year match.  Actual ID disagreements (and
  // all other contradictions) remain blocking.
  const blockingContradictions = (first?.contradictions ?? []).filter(
    (reason) => reason !== 'Provider ID could not be resolved',
  )
  if (!first || (first.score ?? 0) < 65 || blockingContradictions.length) return undefined
  // TMDB can contain duplicate records with the same exact title and release
  // year. The filename cannot distinguish them, so prefer TMDB's ranked first
  // result rather than needlessly blocking an otherwise exact match.
  if (
    first.reasons?.includes('Exact title or alternative title') &&
    first.reasons?.includes('Year matches')
  )
    return first
  const runnerUpScore = (second?.score ?? 0) + (second?.episodeStatus === 'unvalidated' ? 20 : 0)
  if ((first.score ?? 0) - runnerUpScore < 20) return undefined
  return first.reasons?.some(
    (reason) => reason === 'Exact title or alternative title' || reason === 'Provider ID verified',
  )
    ? first
    : undefined
}
export async function findCandidates(parsed: ParsedMedia, token: string): Promise<TmdbResult[]> {
  const type = parsed.kind === 'series' ? 'tv' : 'movie'
  const found = new Map<number, TmdbResult>()
  let idUnresolved = false
  for (const id of parsed.ids) {
    try {
      const matches = await resolveId(type, id, token)
      if (!matches.length) idUnresolved = true
      for (const candidate of matches) found.set(candidate.id, candidate)
    } catch (error) {
      if (!(error instanceof TmdbError && error.status === 404)) throw error
      idUnresolved = true
    }
  }
  const rank = async () => {
    const preliminary = [...found.values()]
      .map((candidate) => scoreCandidate(parsed, candidate))
      .sort((a, b) => b.score! - a.score!)
    // Detail hydration supplies original/alternative names without changing search language.
    for (const candidate of preliminary.slice(0, 5)) {
      try {
        const detail = await getDetails(type, candidate.id, token)
        found.set(candidate.id, {
          ...candidate,
          ...detail,
          title: candidate.title || detail.title,
          alternativeTitles: [
            ...new Set([
              detail.title,
              ...(candidate.alternativeTitles ?? []),
              ...(detail.alternativeTitles ?? []),
            ]),
          ],
          verifiedId: candidate.verifiedId,
        })
      } catch (error) {
        if (!(error instanceof TmdbError && error.status === 404)) throw error
        found.delete(candidate.id)
      }
    }
    const evaluated = await evaluateCandidates(parsed, [...found.values()], token)
    const verified = [...found.values()].filter((item) => item.verifiedId)
    for (const candidate of evaluated) {
      if (!parsed.ids.length) continue
      if (verified.length > 1)
        candidate.contradictions!.push('Provider IDs resolve to different candidates')
      else if (verified.length === 1 && !candidate.verifiedId)
        candidate.contradictions!.push('Provider ID resolves to a different candidate')
      else if (idUnresolved) candidate.contradictions!.push('Provider ID could not be resolved')
    }
    return evaluated
  }
  let candidates = found.size ? await rank() : []
  for (const option of parsed.interpretations.slice(0, 4)) {
    if (automaticMatch(candidates)) break
    for (const candidate of await searchTmdb(type, option.title, option.year ?? parsed.year, token))
      found.set(candidate.id, { ...candidate, ...found.get(candidate.id) })
    candidates = await rank()
    if (!automaticMatch(candidates) && (option.year ?? parsed.year) !== undefined) {
      for (const candidate of await searchTmdb(type, option.title, undefined, token))
        found.set(candidate.id, { ...candidate, ...found.get(candidate.id) })
      candidates = await rank()
    }
  }
  return candidates
}

export async function evaluateCandidates(
  parsed: ParsedMedia,
  candidates: TmdbResult[],
  token: string,
): Promise<TmdbResult[]> {
  const ranked = candidates
    .map((candidate) => scoreCandidate(parsed, candidate))
    .sort((a, b) => b.score! - a.score!)
  if (parsed.kind === 'series') {
    ranked.forEach((candidate) => {
      candidate.episodeStatus = 'unvalidated'
    })
    await Promise.all(
      ranked.slice(0, 5).map(async (candidate) => {
        if (
          !candidate.reasons?.includes('Exact title or alternative title') &&
          !candidate.verifiedId
        )
          return
        const validation = await validateEpisodes(parsed, candidate, token)
        candidate.episodeStatus = validation.status
        candidate.reasons!.push(validation.reason)
        if (validation.status === 'valid') candidate.score! += 20
        else if (validation.status === 'missing') {
          candidate.score! -= 40
          candidate.contradictions!.push(validation.reason)
        }
      }),
    )
  }
  return ranked.sort((a, b) => b.score! - a.score!)
}

export interface EpisodeValidation {
  status: 'valid' | 'missing' | 'unvalidated'
  season?: number
  episodes?: number[]
  title?: string
  reason: string
}

const normalizeEpisodeTitle = (value: string) =>
  value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')

async function resolveCalendarSeasonEpisode(
  parsed: ParsedMedia,
  match: TmdbResult,
  token: string,
): Promise<EpisodeValidation> {
  const year = parsed.calendarSeasonYear!
  const seasons = match.seasons ?? (await getDetails('tv', match.id, token)).seasons ?? []
  const episodes = (
    await Promise.all(
      seasons.map(async (season) => {
        try {
          return await getSeason(match.id, season, token)
        } catch (error) {
          if (error instanceof TmdbError && error.status === 404) return []
          throw error
        }
      }),
    )
  ).flat()
  const candidates = episodes.filter(
    (episode) =>
      episode.episode_number === parsed.episode && episode.air_date?.startsWith(`${year}-`),
  )
  const hint = parsed.episodeTitleHint && normalizeEpisodeTitle(parsed.episodeTitleHint)
  const titleMatches = hint
    ? candidates.filter((episode) => normalizeEpisodeTitle(episode.name ?? '') === hint)
    : []
  const resolved = titleMatches.length ? titleMatches : candidates
  if (resolved.length === 1)
    return {
      status: 'valid',
      season: resolved[0].season_number,
      episodes: [resolved[0].episode_number],
      title: resolved[0].name,
      reason: 'Calendar-season year, episode number, and TMDB metadata match',
    }
  return {
    status: 'missing',
    reason: resolved.length
      ? 'Calendar-season episode is ambiguous on TMDB'
      : 'Calendar-season episode does not exist on TMDB',
  }
}
export async function validateEpisodes(
  parsed: ParsedMedia,
  match: TmdbResult,
  token: string,
): Promise<EpisodeValidation> {
  try {
    if (parsed.airDate) {
      const seasons =
        parsed.season !== undefined
          ? [parsed.season]
          : (match.seasons ?? (await getDetails('tv', match.id, token)).seasons ?? [])
      if (!seasons.length)
        return { status: 'unvalidated', reason: 'Season list unavailable; air date not validated' }
      const episodes = (
        await Promise.all(seasons.map((season) => getSeason(match.id, season, token)))
      )
        .flat()
        .filter((episode) => episode.air_date === parsed.airDate)
      if (episodes.length !== 1)
        return {
          status: 'missing',
          reason: episodes.length
            ? 'Multiple episodes have this air date; choose episode numbers'
            : 'No episode exists for this air date',
        }
      return {
        status: 'valid',
        season: episodes[0].season_number,
        episodes: [episodes[0].episode_number],
        title: episodes[0].name,
        reason: 'Air date and episode verified',
      }
    }
    if (parsed.season === undefined || parsed.episode === undefined)
      return { status: 'unvalidated', reason: 'Episode numbers are missing' }
    const season = await getSeason(match.id, parsed.season, token)
    const numbers = parsed.episodes ?? [parsed.episode]
    const episodes = numbers.map((number) =>
      season.find((episode) => episode.episode_number === number),
    )
    if (episodes.some((episode) => !episode)) {
      if (parsed.calendarSeasonYear) return resolveCalendarSeasonEpisode(parsed, match, token)
      return {
        status: 'missing',
        reason: `Episode not found: S${parsed.season}E${numbers.filter((_, i) => !episodes[i]).join(', E')}`,
      }
    }
    return {
      status: 'valid',
      season: parsed.season,
      episodes: numbers,
      title: episodes
        .map((episode) => episode!.name)
        .filter(Boolean)
        .join(' / '),
      reason: 'All episodes exist in season metadata',
    }
  } catch (error) {
    if (parsed.calendarSeasonYear && error instanceof TmdbError && error.status === 404)
      return resolveCalendarSeasonEpisode(parsed, match, token)
    return error instanceof TmdbError && error.status === 404
      ? { status: 'missing', reason: 'Season or episode does not exist on TMDB' }
      : {
          status: 'unvalidated',
          reason: `Episode not yet validated: ${error instanceof Error ? error.message : String(error)}`,
        }
  }
}
