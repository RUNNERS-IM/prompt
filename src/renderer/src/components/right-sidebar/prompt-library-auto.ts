import { createBrowserUuid } from '@/lib/browser-uuid'
import type {
  PromptLibraryItem,
  PromptLibraryUsageEntry
} from '../../../../shared/prompt-library-types'
import type { SharedPromptItem } from '../../../../shared/prompt-shared-library'

// 자주 친 글을 「자주 씀」 줄로 넣는 규칙. 친 글은 이 맥 설정 파일에만 남는다.

/** 같은 글을 이만큼 치면 넣는다. */
export const AUTO_PROMPT_MIN_COUNT = 5
/** 「자주 씀」 줄은 이만큼까지. */
export const AUTO_PROMPT_MAX_ITEMS = 10
/** 센 기록은 이만큼만 두고, 적게 · 오래전에 친 것부터 버린다. */
export const PROMPT_USAGE_MAX_ENTRIES = 200
const MIN_KEY_LENGTH = 4
const MAX_TEXT_LENGTH = 300
const MAX_VARIANTS = 5
const MAX_TURNS = 5
const TITLE_MAX_LENGTH = 40
// 앞에 붙어도 뜻이 같은 말. 「일단 싹다 풀 받아줘」 = 「싹다 풀 받아줘」.
const LEADING_FILLERS = ['일단', '그럼', '이제', '자', '그리고', 'ok', 'okay']
const TRAILING_PUNCTUATION = /[\s.!?。！？~…,]+$/u
// 「1B 2A 3C」 같은 선택지 답은 매번 달라 모아 둘 뜻이 없다.
const CHOICE_ANSWER = /^(\d+\s*[a-z]?[\s,.]*)+$/i
const URL_ONLY = /^\S+:\/\/\S+$/

function compact(text: string): string {
  return text.replace(/\s+/g, '').toLowerCase()
}

function stripLeadingFillers(text: string): string {
  let rest = text
  for (;;) {
    const lower = rest.toLowerCase()
    const filler = LEADING_FILLERS.find(
      (word) => lower.startsWith(word) && /[\s,]/.test(rest.charAt(word.length))
    )
    if (!filler) {
      return rest
    }
    rest = rest.slice(filler.length).replace(/^[\s,]+/, '')
  }
}

/** 띄어쓰기 · 끝 문장부호 · 대소문자 · 앞말을 지워 같은 뜻의 글을 한 열쇠로 묶는다. 셀 글이 아니면 null. */
export function promptUsageKey(text: string): string | null {
  const trimmed = text.trim().replace(/\s+/g, ' ')
  if (
    trimmed.length > MAX_TEXT_LENGTH ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('<') ||
    URL_ONLY.test(trimmed) ||
    CHOICE_ANSWER.test(trimmed)
  ) {
    return null
  }
  const body = stripLeadingFillers(trimmed).replace(TRAILING_PUNCTUATION, '')
  // 「그룹별로 커밋해줘. Claude 문구는 빼줘」처럼 뒤에 덧붙인 말이 매번 다르면 첫 문장으로 묶는다.
  const firstSentence = body.split(/[.!?。！？]\s+|\n/u)[0]?.replace(TRAILING_PUNCTUATION, '') ?? ''
  const firstKey = compact(firstSentence)
  const key = firstKey.length >= 6 ? firstKey : compact(body)
  return key.length >= MIN_KEY_LENGTH ? key : null
}

function mostUsedVariant(variants: Record<string, number>): string {
  let best = ''
  let bestCount = -1
  for (const [text, count] of Object.entries(variants)) {
    if (count > bestCount) {
      best = text
      bestCount = count
    }
  }
  return best
}

/** 한 차례 친 글을 센다. 이미 센 차례거나 셀 글이 아니면 null(바뀐 것 없음). */
export function recordPromptUse(
  usage: Readonly<Record<string, PromptLibraryUsageEntry>>,
  text: string,
  turnKey: string,
  now: number
): Record<string, PromptLibraryUsageEntry> | null {
  const key = promptUsageKey(text)
  if (!key) {
    return null
  }
  const previous = usage[key]
  if (previous?.turns.includes(turnKey)) {
    return null
  }
  const variant = text.trim()
  const variants = { ...previous?.variants, [variant]: (previous?.variants[variant] ?? 0) + 1 }
  const keptVariants = Object.fromEntries(
    Object.entries(variants)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_VARIANTS)
  )
  const next: Record<string, PromptLibraryUsageEntry> = {
    ...usage,
    [key]: {
      text: mostUsedVariant(keptVariants),
      count: (previous?.count ?? 0) + 1,
      lastAt: now,
      variants: keptVariants,
      turns: [...(previous?.turns ?? []), turnKey].slice(-MAX_TURNS)
    }
  }
  const keys = Object.keys(next)
  if (keys.length <= PROMPT_USAGE_MAX_ENTRIES) {
    return next
  }
  keys.sort((a, b) => next[b].count - next[a].count || next[b].lastAt - next[a].lastAt)
  return Object.fromEntries(keys.slice(0, PROMPT_USAGE_MAX_ENTRIES).map((k) => [k, next[k]]))
}

function promptTitle(text: string): string {
  const line = text.split('\n')[0]?.trim() ?? ''
  return line.length > TITLE_MAX_LENGTH ? `${line.slice(0, TITLE_MAX_LENGTH - 1)}…` : line
}

/** 넣을 만큼 친 글을 「자주 씀」 줄로 만든다. 이미 있는 글 · 지운 글은 넣지 않는다. */
export function pickAutoPrompts(input: {
  usage: Readonly<Record<string, PromptLibraryUsageEntry>>
  library: readonly PromptLibraryItem[]
  shared: readonly SharedPromptItem[]
  dismissed: readonly string[]
  now: number
}): PromptLibraryItem[] {
  const taken = new Set(input.dismissed)
  let autoCount = 0
  for (const item of input.library) {
    if (item.autoKey) {
      taken.add(item.autoKey)
    }
    const key = promptUsageKey(item.body)
    if (key) {
      taken.add(key)
    }
    if (item.source === 'auto') {
      autoCount += 1
    }
  }
  for (const item of input.shared) {
    const key = promptUsageKey(item.body)
    if (key) {
      taken.add(key)
    }
  }
  const candidates = Object.entries(input.usage)
    .filter(([key, entry]) => entry.count >= AUTO_PROMPT_MIN_COUNT && !taken.has(key))
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, Math.max(0, AUTO_PROMPT_MAX_ITEMS - autoCount))
  return candidates.map(([key, entry]) => ({
    id: createBrowserUuid(),
    title: promptTitle(entry.text),
    body: entry.text,
    updatedAt: input.now,
    source: 'auto' as const,
    autoKey: key
  }))
}
