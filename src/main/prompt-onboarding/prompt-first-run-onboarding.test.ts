import { afterEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../shared/constants'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { getDefaultOnboardingState } from '../../shared/onboarding-defaults'
import type { PromptUserDataMarker } from '../../shared/prompt-user-data-location'
import {
  applyPromptFirstRunYoloDefault,
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

describe('applyPromptFirstRunYoloDefault', () => {
  function fakeStore(settings: Partial<GlobalSettings>) {
    let current = { ...getDefaultSettings('/tmp'), ...settings } as GlobalSettings
    return {
      getSettings: () => current,
      updateSettings: vi.fn((updates: Partial<GlobalSettings>) => {
        current = { ...current, ...updates }
        return current
      })
    }
  }

  it('turns Yolo off once on a profile this build created empty, then clears the flag', () => {
    const store = fakeStore({ agentPermissionDefault: 'full-access' })
    const write = vi.fn()
    const applied = applyPromptFirstRunYoloDefault(
      store,
      '/p',
      marker({ firstRunProfile: true, startYoloOff: true }),
      write
    )
    expect(applied).toBe(true)
    expect(store.getSettings().agentPermissionDefault).toBe('own')
    expect(write).toHaveBeenCalledWith('/p', {
      version: 1,
      createdAtMs: 1,
      migratedFrom: null,
      firstRunProfile: true
    })
  })

  it('leaves a later Yolo choice alone once the flag is cleared', () => {
    const store = fakeStore({ agentPermissionDefault: 'full-access' })
    expect(
      applyPromptFirstRunYoloDefault(store, '/p', marker({ firstRunProfile: true }), vi.fn())
    ).toBe(false)
    expect(store.updateSettings).not.toHaveBeenCalled()
  })

  it('never touches a profile from an earlier build or copied from Orca', () => {
    for (const read of [marker({}), marker({ migratedFrom: '/orca' }), () => null]) {
      const store = fakeStore({ agentPermissionDefault: 'full-access' })
      expect(applyPromptFirstRunYoloDefault(store, '/p', read, vi.fn())).toBe(false)
      expect(store.getSettings().agentPermissionDefault).toBe('full-access')
    }
  })
})
