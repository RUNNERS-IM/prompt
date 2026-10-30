// Prompt: settings pages laid out as macOS System Settings (shared decision `[SPLIT] 설정 칸 제목 통일` 1A):
// each group of rows is its own rounded box with a small grey title above it, instead of one big
// card per page. prompt-mac.css draws the boxes under [data-prompt-cards]; a page joins once every
// group on it starts with a title ([data-prompt-group-title]). Pages not listed keep one card.
export const PROMPT_CARD_SECTION_IDS: ReadonlySet<string> = new Set(['general', 'terminal'])
