import type { PostProcessorModule } from 'i18next'

// Prompt keeps upstream catalogs untouched so daily merges stay conflict-free; the brand is swapped as strings render.
export const PROMPT_BRAND_POST_PROCESSOR = 'promptBrand'

export function applyPromptBrand(value: string): string {
  return value.replace(/\bOrca\b/g, 'Prompt')
}

export const promptBrandPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: PROMPT_BRAND_POST_PROCESSOR,
  process: (value: string) => applyPromptBrand(value)
}
