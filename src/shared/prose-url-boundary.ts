// Why not all non-ascii punctuation: titles keep `・`, `–` and `·` unencoded in a url
// (`/wiki/ジョン・スミス`), so only brackets, quotes, spaces and sentence marks end one.
// Escaped CJK sentence marks 、。，．！？：；｡､…‥— keep this module's chunk one-byte in V8.
const PROSE_URL_TERMINATOR_SOURCE = String.raw`(?![\0-\x7f])[\p{Ps}\p{Pe}\p{Pi}\p{Pf}\p{Z}\u3001\u3002\uFF0C\uFF0E\uFF01\uFF1F\uFF1A\uFF1B\uFF61\uFF64\u2026\u2025\u2014]`

const NOT_PROSE_URL_TERMINATOR = `(?!${PROSE_URL_TERMINATOR_SOURCE})`

const CJK_LETTER_SOURCE = String.raw`[\p{Script=Hangul}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]`

// Why: CJK text has no space before particles, so `https://a.im에` must end at the ASCII host; `abc한글.com` is still a host.
const NOT_CJK_PROSE_AFTER_HOST = String.raw`(?!(?=${CJK_LETTER_SOURCE})(?<=https?:\/\/[^\s\/?#]*[a-z0-9\]-])(?![\p{L}\p{N}-]*[.@][\p{L}\p{N}]))`

const URL_END_GUARD = `${NOT_PROSE_URL_TERMINATOR}${NOT_CJK_PROSE_AFTER_HOST}`
const URL_BODY_CHAR = String.raw`${URL_END_GUARD}[^\s"'!*(){}|\\^<>\x60]`

// Why: `/foo(v=1)` and `/서울_(동음이의)` are paths, while `/docs(설명)` and `a.im(운영)` are prose annotations.
const URL_PATH_PAREN_GROUP = String.raw`(?<=\/\/[^\s\/?#]+[\/?#]\S*)(?:(?<=[_-])\((?:${URL_BODY_CHAR})*\)|\((?:(?=[\x21-\x7e])${URL_BODY_CHAR})*\))`

/** xterm's default web-links url pattern, also ended by prose punctuation; needs the `u` flag. */
export const PROSE_HTTP_URL_SOURCE =
  String.raw`https?:\/\/(?:${URL_PATH_PAREN_GROUP}|${URL_BODY_CHAR})*` +
  String.raw`(?:${URL_END_GUARD}[^\s"'*:,.!?{}|\\^~\[\]\x60()<>]|(?<=\)))`

/** The text left after a url's end is prose when it is a stray `)` or CJK letters with no url structure. */
export const PROSE_URL_REMAINDER = new RegExp(
  String.raw`^(?:\)|${CJK_LETTER_SOURCE})[^\/?#=&]*$`,
  'u'
)

const PROSE_URL_END = new RegExp(String.raw`\s|${PROSE_URL_TERMINATOR_SOURCE}`, 'u')
const PROSE_URL_TERMINATOR_RUN = new RegExp(`((?:${PROSE_URL_TERMINATOR_SOURCE})+)`, 'u')

/** Index of the first whitespace or terminator, where a url starting the text ends, or -1. */
export function findProseUrlEnd(text: string): number {
  return text.search(PROSE_URL_END)
}

/** The text cut around each run of terminators; odd entries are the runs. */
export function splitAtProseUrlTerminators(text: string): string[] {
  return text.split(PROSE_URL_TERMINATOR_RUN)
}
