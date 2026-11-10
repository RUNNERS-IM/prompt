import { TERMINAL_HTTP_URL_MAX_LENGTH } from './terminal-http-link-limits'
import { PROSE_HTTP_URL_SOURCE, PROSE_URL_REMAINDER } from './prose-url-boundary'

const HTTP_URL_AT_START = new RegExp(`^${PROSE_HTTP_URL_SOURCE}`, 'iu')

type ParsedTerminalHttpLink = {
  url: string
  startIndex: number
  endIndex: number
}

export function extractTerminalHttpLinks(lineText: string): ParsedTerminalHttpLink[] {
  const links: ParsedTerminalHttpLink[] = []
  for (const candidate of iterateTerminalHttpUrlCandidates(lineText)) {
    let parsed: URL
    try {
      parsed = new URL(candidate.url)
    } catch {
      continue
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      continue
    }
    links.push({
      url: parsed.toString(),
      startIndex: candidate.startIndex,
      endIndex: candidate.endIndex
    })
  }
  return links
}

function* iterateTerminalHttpUrlCandidates(
  lineText: string
): Generator<{ url: string; startIndex: number; endIndex: number }> {
  let searchStart = 0
  while (searchStart < lineText.length) {
    const startIndex = findNextHttpSchemeIndex(lineText, searchStart)
    if (startIndex === -1) {
      return
    }

    if (!hasHttpUrlWordBoundary(lineText, startIndex)) {
      searchStart = startIndex + 1
      continue
    }

    const matchedLength = matchHttpUrlLength(lineText, startIndex)
    const endIndex = startIndex + matchedLength
    searchStart = Math.max(endIndex, startIndex + 1)
    if (matchedLength === 0 || matchedLength > TERMINAL_HTTP_URL_MAX_LENGTH) {
      continue
    }

    yield {
      url: lineText.slice(startIndex, endIndex),
      startIndex,
      endIndex
    }
  }
}

function findNextHttpSchemeIndex(lineText: string, searchStart: number): number {
  const relativeIndex = lineText.slice(searchStart).search(/https?:\/\//i)
  return relativeIndex === -1 ? -1 : searchStart + relativeIndex
}

function hasHttpUrlWordBoundary(lineText: string, startIndex: number): boolean {
  return startIndex === 0 || !isAsciiWordCode(lineText.charCodeAt(startIndex - 1))
}

function matchHttpUrlLength(text: string, startIndex: number): number {
  const candidate = text.slice(startIndex, startIndex + TERMINAL_HTTP_URL_MAX_LENGTH + 1)
  return HTTP_URL_AT_START.exec(candidate)?.[0].length ?? 0
}

/** True when a program's explicit link target swallowed the prose after its url. */
export function hasProseAfterHttpUrl(uri: string): boolean {
  if (!/^https?:\/\//i.test(uri)) {
    return false
  }
  const remainder = uri.slice(matchHttpUrlLength(uri, 0))
  return remainder !== '' && remainder !== uri && PROSE_URL_REMAINDER.test(remainder)
}

export const TERMINAL_HTTP_URL_REGEX = new RegExp(PROSE_HTTP_URL_SOURCE, 'iu')

function isAsciiWordCode(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    code === 95 ||
    (code >= 97 && code <= 122)
  )
}
