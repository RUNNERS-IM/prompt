import { describe, expect, it } from 'vitest'
import { getDefaultOnboardingState } from '../../../../shared/onboarding-defaults'
import type { PromptOnboardingView } from '../../../../shared/prompt-first-run-onboarding'
import { shouldShowOnboarding } from './should-show-onboarding'

const unclosed = getDefaultOnboardingState()

describe('shouldShowOnboarding (Prompt)', () => {
  it('shows the flow on a brand-new profile that has not closed it', () => {
    const fresh: PromptOnboardingView = { ...unclosed, promptFirstRun: true }
    expect(shouldShowOnboarding(fresh)).toBe(true)
  })

  it('never shows it to an upgraded profile, even when onboarding was never closed', () => {
    const upgraded: PromptOnboardingView = { ...unclosed, promptFirstRun: false }
    expect(shouldShowOnboarding(upgraded)).toBe(false)
    // A read without the flag (web client, older main) counts as an upgrade too.
    expect(shouldShowOnboarding(unclosed)).toBe(false)
  })

  it('stays closed once the person closed it', () => {
    const closed: PromptOnboardingView = { ...unclosed, closedAt: 1, promptFirstRun: true }
    expect(shouldShowOnboarding(closed)).toBe(false)
    expect(shouldShowOnboarding(null)).toBe(false)
  })
})
