import { describe, expect, it, vi } from 'vitest'
import type { PersistedState } from '../../../shared/persisted-state-types'
import {
  PROMPT_DEFAULTS_VERSION,
  PROMPT_FORCED_DEFAULTS,
  applyPromptDefaultsOnce
} from './prompt-defaults-migration'

type Settings = PersistedState['settings']

// SAFETY: partial settings fixtures; the migration only reads and writes the keys under test.
describe('applyPromptDefaultsOnce', () => {
  it('switches the hidden Orca features off once and picks Claude', () => {
    const markNeedsSave = vi.fn()
    const loaded = {
      showMobileButton: true,
      pluginSystemEnabled: true,
      experimentalPet: true,
      defaultTuiAgent: null,
      theme: 'light'
    } as unknown as Settings
    const result = applyPromptDefaultsOnce(loaded, markNeedsSave) as Settings & {
      promptDefaultsVersion?: number
    }
    expect(result).toMatchObject(PROMPT_FORCED_DEFAULTS)
    expect(result.defaultTuiAgent).toBe('claude')
    expect(result.theme).toBe('light')
    expect(result.promptDefaultsVersion).toBe(PROMPT_DEFAULTS_VERSION)
    expect(markNeedsSave).toHaveBeenCalledOnce()
  })

  it('keeps an agent the user already chose', () => {
    const result = applyPromptDefaultsOnce(
      { defaultTuiAgent: 'codex' } as unknown as Settings,
      () => {}
    )
    expect(result.defaultTuiAgent).toBe('codex')
  })

  it('does not run again, so a later choice sticks', () => {
    const markNeedsSave = vi.fn()
    const loaded = {
      showMobileButton: true,
      promptDefaultsVersion: PROMPT_DEFAULTS_VERSION
    } as unknown as Settings
    expect(applyPromptDefaultsOnce(loaded, markNeedsSave)).toBe(loaded)
    expect(markNeedsSave).not.toHaveBeenCalled()
  })
})
