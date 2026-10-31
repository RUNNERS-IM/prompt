import { homedir } from 'node:os'
import { resolveCliLocale, type CliLocale } from './cli-surface'

const SHORT_ID_LENGTH = 8

/** The id body users type: terminal handles drop their `term_` prefix, identities their host. */
export function idBody(id: string): string {
  if (id.startsWith('term_')) {
    return id.slice('term_'.length)
  }
  // Workspace identity keys are `wt2:<host>:<instance>`; the instance is the unique part.
  const identity = /^wt2:[^:]*:(.+)$/.exec(id)
  return identity ? decodeURIComponent(identity[1]) : id
}

export function shortId(id: string): string {
  return idBody(id).slice(0, SHORT_ID_LENGTH)
}

export function shortenHomePath(path: string, home: string = homedir()): string {
  if (!home || home === '/') {
    return path
  }
  if (path === home) {
    return '~'
  }
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path
}

// Hangul, CJK, and fullwidth forms occupy two terminal columns.
function charWidth(codePoint: number): number {
  return (codePoint >= 0x1100 && codePoint <= 0x115f) ||
    (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xff60) ||
    (codePoint >= 0xffe0 && codePoint <= 0xffe6) ||
    (codePoint >= 0x1f300 && codePoint <= 0x1faff)
    ? 2
    : 1
}

export function displayWidth(text: string): number {
  let width = 0
  for (const char of text) {
    width += charWidth(char.codePointAt(0) ?? 0)
  }
  return width
}

/** An aligned table with a header row; cells are single lines. */
export function formatTable(headers: readonly string[], rows: readonly string[][]): string {
  const clean = rows.map((row) => row.map((cell) => cell.replace(/\s+/g, ' ').trim()))
  const widths = headers.map((header, column) =>
    Math.max(displayWidth(header), ...clean.map((row) => displayWidth(row[column] ?? '')))
  )
  const line = (cells: readonly string[]): string =>
    cells
      .map((cell, column) =>
        column === cells.length - 1
          ? cell
          : `${cell}${' '.repeat(widths[column] - displayWidth(cell))}`
      )
      .join('  ')
      .trimEnd()
  return [line(headers), ...clean.map(line)].join('\n')
}

export function formatRelativeTime(
  timestamp: number | null | undefined,
  now: number = Date.now(),
  locale: CliLocale = resolveCliLocale()
): string {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return '-'
  }
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000))
  const [value, unit] =
    seconds < 60
      ? [seconds, 's']
      : seconds < 3600
        ? [Math.floor(seconds / 60), 'm']
        : seconds < 86_400
          ? [Math.floor(seconds / 3600), 'h']
          : [Math.floor(seconds / 86_400), 'd']
  if (locale === 'ko') {
    const koUnit = { s: '초', m: '분', h: '시간', d: '일' }[unit]
    return seconds < 60 ? '방금' : `${value}${koUnit} 전`
  }
  return seconds < 60 ? 'just now' : `${value}${unit} ago`
}

type ColumnKey =
  | 'id'
  | 'name'
  | 'kind'
  | 'path'
  | 'project'
  | 'branch'
  | 'state'
  | 'last'
  | 'agent'
  | 'resume'

const COLUMN_LABELS: Readonly<Record<CliLocale, Readonly<Record<ColumnKey, string>>>> = {
  en: {
    id: 'ID',
    name: 'NAME',
    kind: 'KIND',
    path: 'PATH',
    project: 'PROJECT',
    branch: 'BRANCH',
    state: 'STATE',
    last: 'LAST',
    agent: 'AGENT',
    resume: 'RESUME ID'
  },
  ko: {
    id: 'ID',
    name: '이름',
    kind: '종류',
    path: '경로',
    project: '프로젝트',
    branch: '브랜치',
    state: '상태',
    last: '마지막',
    agent: '에이전트',
    resume: '재개 ID'
  }
}

export function columnHeaders(
  keys: readonly ColumnKey[],
  locale: CliLocale = resolveCliLocale()
): string[] {
  return keys.map((key) => COLUMN_LABELS[locale][key])
}

const EMPTY_LIST_TEXT: Readonly<Record<CliLocale, string>> = {
  en: 'Nothing to list.',
  ko: '목록이 비어 있습니다.'
}

export function emptyListText(locale: CliLocale = resolveCliLocale()): string {
  return EMPTY_LIST_TEXT[locale]
}

// Present-tense state words; the JSON keeps the stable English values.
const STATE_LABELS: Readonly<Record<CliLocale, Readonly<Record<string, string>>>> = {
  en: { running: 'running', exited: 'exited' },
  ko: { running: '실행 중', exited: '끝남' }
}

export function stateLabel(state: string, locale: CliLocale = resolveCliLocale()): string {
  return STATE_LABELS[locale][state] ?? state
}

let jsonListShape = false

/** Moved list commands keep their handlers; `prompt` still prints their list as `result.items`. */
export function setPromptJsonListShape(enabled: boolean): void {
  jsonListShape = enabled
}

export function applyPromptJsonListShape<T>(result: T): T {
  if (!jsonListShape || !result || typeof result !== 'object' || Array.isArray(result)) {
    return result
  }
  const entries = Object.entries(result as Record<string, unknown>)
  const lists = entries.filter(([, value]) => Array.isArray(value))
  // Only an unambiguous single list is renamed; anything else keeps its documented shape.
  if (lists.length !== 1 || 'items' in (result as object)) {
    return result
  }
  const [listKey] = lists[0]
  return Object.fromEntries(
    entries.map(([key, value]) => (key === listKey ? ['items', value] : [key, value]))
  ) as T
}
