import { useSyncExternalStore } from 'react'
import type { PromptDecisionDraft } from '../../../../shared/prompt-decision-inbox'

const SENT_STORAGE_KEY = 'prompt.decisionInbox.sent'

let drafts: readonly PromptDecisionDraft[] = []
let visibleDrafts: readonly PromptDecisionDraft[] = []
let sentModifiedAtByPath = readSentModifiedAt()
let loaded: Promise<void> | null = null
const listeners = new Set<() => void>()

function readSentModifiedAt(): Record<string, number> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(SENT_STORAGE_KEY) ?? '{}')
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, number] => typeof entry[1] === 'number'
        )
      )
    }
  } catch {
    // A blocked or malformed entry only means answered pages stay listed.
  }
  return {}
}

function writeSentModifiedAt(): void {
  try {
    window.localStorage.setItem(SENT_STORAGE_KEY, JSON.stringify(sentModifiedAtByPath))
  } catch {
    // Without storage the page returns after a restart, until its session deletes it.
  }
}

function publish(): void {
  visibleDrafts = drafts.filter(
    (draft) => sentModifiedAtByPath[draft.filePath] !== draft.modifiedAt
  )
  for (const listener of listeners) {
    listener()
  }
}

function applyDrafts(next: readonly PromptDecisionDraft[]): void {
  drafts = next
  const present = new Set(next.map((draft) => draft.filePath))
  const kept = Object.entries(sentModifiedAtByPath).filter(([path]) => present.has(path))
  if (kept.length !== Object.keys(sentModifiedAtByPath).length) {
    sentModifiedAtByPath = Object.fromEntries(kept)
    writeSentModifiedAt()
  }
  publish()
}

export function refreshPromptDecisionDrafts(): Promise<void> {
  const list = window.api.promptDecisionInbox?.list()
  return list ? list.then(applyDrafts, () => undefined) : Promise.resolve()
}

/** Resolves once the first listing is in, so a restored page can find its draft. */
export function loadPromptDecisionDrafts(): Promise<void> {
  loaded ??= refreshPromptDecisionDrafts()
  return loaded
}

export function getPromptDecisionDraftByFileUrl(
  fileUrl: string,
  toFileUrl: (filePath: string) => string
): PromptDecisionDraft | null {
  return drafts.find((draft) => toFileUrl(draft.filePath) === fileUrl) ?? null
}

export function isPromptDecisionDraftSent(draft: PromptDecisionDraft): boolean {
  return sentModifiedAtByPath[draft.filePath] === draft.modifiedAt
}

/** Hidden only until the page changes: a session that rewrites it is asking again. */
export function markPromptDecisionDraftSent(draft: PromptDecisionDraft): void {
  sentModifiedAtByPath = { ...sentModifiedAtByPath, [draft.filePath]: draft.modifiedAt }
  writeSentModifiedAt()
  publish()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePromptDecisionDrafts(): readonly PromptDecisionDraft[] {
  return useSyncExternalStore(subscribe, () => visibleDrafts)
}
