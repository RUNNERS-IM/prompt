import { createBrowserUuid } from '@/lib/browser-uuid'
import type { PromptLibraryItem } from '../../../../shared/prompt-library-types'
import type { SharedPromptItem } from '../../../../shared/prompt-shared-library'
import type { PromptLibraryDraft } from './PromptLibraryEditDialog'
import { promptUsageKey } from './prompt-library-auto'

export type PromptLibrarySectionKind = 'mine' | 'frequent' | 'shared'

export type PromptLibraryRow = {
  id: string
  title: string
  body: string
  /** 공용 줄은 파일에서 오므로 칸에서 고치거나 지울 수 없다. */
  readOnly: boolean
  item: PromptLibraryItem | null
}

export type PromptLibrarySection = {
  kind: PromptLibrarySectionKind
  rows: PromptLibraryRow[]
}

function matches(prompt: { title: string; body: string }, needle: string): boolean {
  return prompt.title.toLowerCase().includes(needle) || prompt.body.toLowerCase().includes(needle)
}

function bodyKey(body: string): string {
  return promptUsageKey(body) ?? body.replace(/\s+/g, '').toLowerCase()
}

/** 한 목록을 「내 것 · 자주 씀 · 공용」 순서로 나눈다. 같은 id · 같은 글의 공용 줄은 내 줄이 있으면 뺀다. */
export function buildPromptLibrarySections(
  library: readonly PromptLibraryItem[],
  shared: readonly SharedPromptItem[],
  query: string
): PromptLibrarySection[] {
  const needle = query.trim().toLowerCase()
  const ownIds = new Set(library.map((item) => item.id))
  const ownBodies = new Set(library.map((item) => bodyKey(item.body)))
  const mine: PromptLibraryRow[] = []
  const frequent: PromptLibraryRow[] = []
  for (const item of library) {
    if (needle && !matches(item, needle)) {
      continue
    }
    const row = { id: item.id, title: item.title, body: item.body, readOnly: false, item }
    ;(item.source === 'auto' ? frequent : mine).push(row)
  }
  const sharedRows = shared
    .filter((item) => !ownIds.has(item.id) && !ownBodies.has(bodyKey(item.body)))
    .filter((item) => !needle || matches(item, needle))
    .map((item) => ({ id: item.id, title: item.title, body: item.body, readOnly: true, item: null }))
  const sections: PromptLibrarySection[] = [
    { kind: 'mine', rows: mine },
    { kind: 'frequent', rows: frequent },
    { kind: 'shared', rows: sharedRows }
  ]
  return sections.filter((section) => section.rows.length > 0)
}

export function savePromptLibraryDraft(
  prompts: readonly PromptLibraryItem[],
  draft: PromptLibraryDraft,
  now: number
): PromptLibraryItem[] {
  const { id, title, body } = draft
  if (id) {
    // 자동으로 넣은 줄도 고치면 「내 것」이 된다. autoKey 는 남겨 같은 글을 다시 넣지 않는다.
    return prompts.map((prompt) =>
      prompt.id === id ? { ...prompt, title, body, updatedAt: now, source: undefined } : prompt
    )
  }
  return [{ id: createBrowserUuid(), title, body, updatedAt: now }, ...prompts]
}

const DISMISSED_MAX = 200

/** 줄을 지운다. 그 글의 열쇠를 남겨 자주 쳐도 다시 넣지 않는다. */
export function removePromptLibraryItem(
  prompts: readonly PromptLibraryItem[],
  dismissed: readonly string[],
  id: string
): { promptLibrary: PromptLibraryItem[]; promptLibraryDismissedAuto: string[] } {
  const target = prompts.find((prompt) => prompt.id === id)
  const keys = [target?.autoKey, target ? promptUsageKey(target.body) : null].filter(
    (key): key is string => Boolean(key) && !dismissed.includes(key as string)
  )
  return {
    promptLibrary: prompts.filter((prompt) => prompt.id !== id),
    promptLibraryDismissedAuto: [...dismissed, ...new Set(keys)].slice(-DISMISSED_MAX)
  }
}
