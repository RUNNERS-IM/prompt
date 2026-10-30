// @vitest-environment happy-dom
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getDefaultSettings } from '../../../../shared/constants'
import {
  ONBOARDING_FLOW_VERSION,
  getDefaultOnboardingState
} from '../../../../shared/onboarding-defaults'
import type { OnboardingState } from '../../../../shared/onboarding-state-types'
import type { PromptOnboardingView } from '../../../../shared/prompt-first-run-onboarding'
import { useAppStore } from '@/store'
import { i18n } from '@/i18n/i18n'
import OnboardingFlow from './OnboardingFlow'
import { shouldShowOnboarding } from './should-show-onboarding'

vi.mock('@/components/terminal-pane/TerminalPane', () => ({
  default: () => {
    throw new Error('This suite must not render a terminal pane')
  }
}))

const onboardingUpdate = vi.fn()
const settingsSet = vi.fn()

// Any window.api call the flow makes that this suite does not care about resolves to undefined.
function permissiveApi(overrides: Record<string, unknown>): unknown {
  const make = (path: string): unknown =>
    new Proxy(() => Promise.resolve(undefined), {
      get: (_target, key) => {
        const next = path ? `${path}.${String(key)}` : String(key)
        if (key === 'then') {
          return undefined
        }
        return next in overrides ? overrides[next] : make(next)
      }
    })
  return make('')
}

function themeStepState(): PromptOnboardingView {
  return {
    ...getDefaultOnboardingState(),
    flowVersion: ONBOARDING_FLOW_VERSION,
    lastCompletedStep: 1,
    promptFirstRun: true
  }
}

// Mirrors the App gate: the flow stays mounted only while shouldShowOnboarding is true.
function Gate({ initial }: { initial: OnboardingState }): React.JSX.Element | null {
  const [onboarding, setOnboarding] = useState<OnboardingState>(initial)
  if (!shouldShowOnboarding(onboarding)) {
    return null
  }
  return (
    <TooltipProvider>
      <OnboardingFlow onboarding={onboarding} onOnboardingChange={setOnboarding} />
    </TooltipProvider>
  )
}

describe('Prompt onboarding theme step', () => {
  beforeEach(async () => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState({ repos: [], settings: getDefaultSettings('/tmp') })
    onboardingUpdate.mockReset().mockImplementation(async (update: Partial<OnboardingState>) => ({
      ...themeStepState(),
      ...update
    }))
    settingsSet.mockReset().mockImplementation(async (update: object) => ({
      ...getDefaultSettings('/tmp'),
      ...update
    }))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: permissiveApi({
        'onboarding.update': onboardingUpdate,
        'settings.set': settingsSet
      })
    })
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    cleanup()
    useAppStore.setState(useAppStore.getInitialState(), true)
    vi.restoreAllMocks()
  })

  it('stays open and saves no dismissal when a theme is picked', async () => {
    render(<Gate initial={themeStepState()} />)
    expect(screen.getByRole('dialog')).toBeTruthy()

    for (const label of ['Light', 'Dark', 'System']) {
      const option = screen.getByText(label).closest('button')
      expect(option).toBeTruthy()
      await act(async () => {
        fireEvent.click(option!)
      })
    }

    expect(settingsSet).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    for (const [update] of onboardingUpdate.mock.calls) {
      expect(update).not.toMatchObject({ outcome: 'dismissed' })
      expect(update.closedAt ?? null).toBeNull()
    }
  })

  it('stays open when settings change from outside the flow', async () => {
    render(<Gate initial={themeStepState()} />)
    await act(async () => {
      await useAppStore.getState().updateSettings({ theme: 'light' })
    })
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(onboardingUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'dismissed' })
    )
  })

  // Control: the harness does see a close, so the two cases above are meaningful.
  it('closes and saves a dismissal only from the close button', async () => {
    render(<Gate initial={themeStepState()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    })
    expect(onboardingUpdate).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'dismissed' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
