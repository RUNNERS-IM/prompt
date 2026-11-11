import { createBrowserUuid } from '@/lib/browser-uuid'
import type { PromptLibraryItem } from '../../../../shared/prompt-library-types'
import type { PromptLibraryDraft } from './PromptLibraryEditDialog'

export function filterPromptLibrary(
  prompts: readonly PromptLibraryItem[],
  query: string
): readonly PromptLibraryItem[] {
  const needle = query.trim().toLowerCase()
  if (!needle) {
    return prompts
  }
  return prompts.filter(
    (prompt) =>
      prompt.title.toLowerCase().includes(needle) || prompt.body.toLowerCase().includes(needle)
  )
}

export function savePromptLibraryDraft(
  prompts: readonly PromptLibraryItem[],
  draft: PromptLibraryDraft,
  now: number
): PromptLibraryItem[] {
  const { id, title, body } = draft
  if (id) {
    return prompts.map((prompt) =>
      prompt.id === id ? { ...prompt, title, body, updatedAt: now } : prompt
    )
  }
  return [{ id: createBrowserUuid(), title, body, updatedAt: now }, ...prompts]
}
