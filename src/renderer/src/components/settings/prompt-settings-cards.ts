import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'

// Prompt: settings pages laid out as macOS System Settings (shared decision `[SPLIT] 설정 칸 제목 통일` 1A):
// each group of rows is its own rounded box with a small grey title above it, instead of one big
// card per page. prompt-mac.css draws the boxes under [data-prompt-cards]; every group on a page
// starts with a title ([data-prompt-group-title], left empty for an untitled box). In Prompt builds
// every page is laid out this way; under unit tests only the two first pages are, as before.
export const PROMPT_CARD_SECTION_IDS: ReadonlySet<string> = new Set(['general', 'terminal'])

export function isPromptCardSection(sectionId: string): boolean {
  return PROMPT_SIMPLE_SETTINGS || PROMPT_CARD_SECTION_IDS.has(sectionId)
}
