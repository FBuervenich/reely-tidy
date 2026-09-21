export type SceneField =
  | 'source'
  | 'resolution'
  | 'video'
  | 'audio'
  | 'language'
  | 'edition'
  | 'group'
export interface SceneToken {
  field: SceneField
  value: string
  start: number
  end: number
}
export interface SceneInfo {
  tokens: SceneToken[]
  start?: number
  releaseGroup: string
  tags: string
}

const patterns: [SceneField, string][] = [
  ['source', 'WEB[ ._-]?DL|WEBRIP|BLU[ ._-]?RAY|BRRIP|DVDRIP|HDTV|REMUX'],
  ['resolution', '2160p|1080[pi]|720p|576p|480p|4K'],
  ['video', 'x26[45]|h[ ._-]?26[45]|HEVC|AV1|HDR10\\+?|HDR|DOLBY[ ._-]?VISION|DV'],
  ['audio', '(?:DDP|DD|AAC|E-?AC-?3|AC-?3|DTS(?:-HD)?|TRUEHD)(?:[ ._-]?(?:[257]\\.[01]))?|ATMOS'],
  ['edition', 'PROPER|REPACK|EXTENDED|REMASTERED|UNCUT|DIRECTORS[ ._-]?CUT'],
]
const languages =
  /(?:^|[ ._-])(GERMAN|DEUTSCH|ENGLISH|FRENCH|SPANISH|ITALIAN|JAPANESE|KOREAN|MULTI|DUBBED|GER|ENG|JPN|DL)(?=$|[ ._-])/gi

/** Offsets refer to the original stem; language words alone never truncate a title. */
export function parseScene(stem: string): SceneInfo {
  const tokens: SceneToken[] = []
  for (const [field, pattern] of patterns) {
    const regex = new RegExp(`(?:^|[ ._\\-])(${pattern})(?=$|[ ._\\-])`, 'gi')
    for (const match of stem.matchAll(regex)) {
      const start = match.index! + match[0].length - match[1].length
      tokens.push({ field, value: match[1], start, end: start + match[1].length })
    }
  }
  tokens.sort((a, b) => a.start - b.start)
  // Require a technical tag for a release suffix, avoiding titles such as "Extended".
  const first = tokens.find((token) => token.field !== 'edition')
  if (!first) return { tokens: [], releaseGroup: '', tags: '' }
  for (const match of stem.matchAll(languages)) {
    const start = match.index! + match[0].length - match[1].length
    if (!tokens.some((token) => start >= token.start && start < token.end))
      tokens.push({ field: 'language', value: match[1], start, end: start + match[1].length })
  }
  tokens.sort((a, b) => a.start - b.start)
  let start = first.start
  for (const token of [...tokens].reverse()) {
    if (token.end <= start && /^[ ._-]*$/.test(stem.slice(token.end, start))) start = token.start
  }
  const suffixTokens = tokens.filter((token) => token.start >= start)
  const end = Math.max(...suffixTokens.map((token) => token.end))
  const groupMatch = /^-([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(stem.slice(end))
  const releaseGroup = groupMatch?.[1] ?? ''
  if (releaseGroup)
    suffixTokens.push({ field: 'group', value: releaseGroup, start: end + 1, end: stem.length })
  return {
    tokens: suffixTokens,
    start,
    releaseGroup,
    tags: suffixTokens
      .filter((token) => token.field !== 'group')
      .map((token) => token.value)
      .join(' '),
  }
}
