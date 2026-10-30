import type { PostProcessorModule } from 'i18next'

// Prompt keeps upstream catalogs untouched so daily merges stay conflict-free; the brand is swapped as strings render.
export const PROMPT_BRAND_POST_PROCESSOR = 'promptBrand'

/** The product name shown where upstream code wrote "Orca" without going through translations. */
export const PROMPT_APP_NAME = 'Prompt'

// Only whole words change, so env names (ORCA_WORKSPACE_NAME), files (orca.yaml) and the `orca` CLI stay as they are.
const BRAND_REPLACEMENTS: readonly (readonly [RegExp, string])[] = [
  [/github\.com\/stablyai\/orca\b/g, 'github.com/RUNNERS-IM/prompt'],
  // Pairing links: desktop and mobile both use the prompt:// scheme.
  [/\borca:\/\//g, 'prompt://'],
  [/\bOrca\b/g, PROMPT_APP_NAME],
  // German genitive ("Orcas Terminaldienst") and plural "Orcas" use the same word with an s.
  [/\bOrcas\b/g, `${PROMPT_APP_NAME}s`],
  // Some catalogs (en title, machine-translated ko) spell the brand in capitals. A hyphen on either
  // side means an identifier such as the Jira/Linear issue key ORCA-123, which must stay as typed.
  [/(?<![\w-])ORCA(?![\w-])/g, 'PROMPT'],
  // French catalog translated the brand itself.
  [/\bOrque\b/g, PROMPT_APP_NAME],
  // Korean catalog transliterated the brand once; both words end in a vowel, so particles still fit.
  // Written as \u escapes because the orcad server bundle must stay ASCII (orcad-entry-build.mjs).
  [/\uC624\uB974\uCE74/g, '\uD504\uB86C\uD504\uD2B8']
]

export function applyPromptBrand(value: string): string {
  let result = value
  for (const [pattern, replacement] of BRAND_REPLACEMENTS) {
    result = result.replace(pattern, replacement)
  }
  return result
}

export const promptBrandPostProcessor: PostProcessorModule = {
  type: 'postProcessor',
  name: PROMPT_BRAND_POST_PROCESSOR,
  process: (value: string) => applyPromptBrand(value)
}
