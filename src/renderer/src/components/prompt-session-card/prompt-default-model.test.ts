import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store', () => ({ useAppStore: vi.fn() }))

import {
  PROMPT_FALLBACK_DEFAULT_MODEL_ID,
  promptVisibleModelLabel,
  resolvePromptDefaultModelId
} from './prompt-default-model'

describe('resolvePromptDefaultModelId', () => {
  it('falls back to Opus when nothing is saved', () => {
    expect(resolvePromptDefaultModelId(undefined)).toBe(PROMPT_FALLBACK_DEFAULT_MODEL_ID)
    expect(resolvePromptDefaultModelId('  ')).toBe('opus')
  })

  it('keeps a saved catalog model and drops an unknown one', () => {
    expect(resolvePromptDefaultModelId('sonnet')).toBe('sonnet')
    expect(resolvePromptDefaultModelId('gpt-9')).toBe('opus')
  })
})

describe('promptVisibleModelLabel', () => {
  it('hides the label when the session runs the default model', () => {
    expect(promptVisibleModelLabel('Opus 5.5', 'opus')).toBe('')
    expect(promptVisibleModelLabel('opus', 'opus')).toBe('')
  })

  it('shows the reported name when the model differs from the default', () => {
    expect(promptVisibleModelLabel('Sonnet 5.5', 'opus')).toBe('Sonnet 5.5')
    expect(promptVisibleModelLabel('Opus 5.5', 'sonnet')).toBe('Opus 5.5')
  })

  it('shows models outside the Claude catalog and nothing when no model is reported', () => {
    expect(promptVisibleModelLabel('GPT-5.5', 'opus')).toBe('GPT-5.5')
    expect(promptVisibleModelLabel(undefined, 'opus')).toBe('')
    expect(promptVisibleModelLabel('  ', 'opus')).toBe('')
  })
})
