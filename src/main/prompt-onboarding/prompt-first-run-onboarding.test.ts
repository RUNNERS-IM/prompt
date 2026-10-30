import { afterEach, describe, expect, it } from 'vitest'
import { getDefaultOnboardingState } from '../../shared/onboarding-defaults'
import type { PromptUserDataMarker } from '../../shared/prompt-user-data-location'
import {
  notePromptOnboardingUpdate,
  resetPromptFirstRunOnboardingForTest,
  withPromptFirstRun
} from './prompt-first-run-onboarding'

const unclosed = getDefaultOnboardingState()

function marker(fields: Partial<PromptUserDataMarker>): () => PromptUserDataMarker {
  return () => ({ version: 1, createdAtMs: 1, migratedFrom: null, ...fields })
}

describe('withPromptFirstRun', () => {
  afterEach(() => resetPromptFirstRunOnboardingForTest())

  it('marks a profile whose folder was created empty by this build', () => {
    expect(
      withPromptFirstRun(unclosed, '/p', marker({ firstRunProfile: true })).promptFirstRun
    ).toBe(true)
  })

  it('never marks a profile upgraded from Orca, even with onboarding never closed', () => {
    const copied = marker({ migratedFrom: '/Users/me/Library/Application Support/orca' })
    expect(withPromptFirstRun(unclosed, '/p', copied).promptFirstRun).toBe(false)
  })

  it('never marks a Prompt folder made by an earlier build', () => {
    expect(withPromptFirstRun(unclosed, '/p', marker({})).promptFirstRun).toBe(false)
  })

  it('never marks a launch still running on the Orca folder (no marker)', () => {
    expect(withPromptFirstRun(unclosed, '/orca', () => null).promptFirstRun).toBe(false)
  })

  it('keeps the saved onboarding fields as they are', () => {
    const closed = { ...unclosed, closedAt: 5, outcome: 'dismissed' as const }
    expect(withPromptFirstRun(closed, '/p', () => null)).toEqual({
      ...closed,
      promptFirstRun: false
    })
  })

  it('shows the flow for the rest of the launch after Help → Show onboarding', () => {
    notePromptOnboardingUpdate({})
    expect(withPromptFirstRun(unclosed, '/p', () => null).promptFirstRun).toBe(false)
    notePromptOnboardingUpdate({ closedAt: null })
    expect(withPromptFirstRun(unclosed, '/p', () => null).promptFirstRun).toBe(true)
  })
})
