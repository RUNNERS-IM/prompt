import { describe, expect, it } from 'vitest'
import { resolveStepIndex } from './onboarding-flow-state'
import { STEPS } from './use-onboarding-flow-types'

const macOptions = { skipIntegrations: false, skipWindowsTerminal: true }

describe('Prompt onboarding steps', () => {
  it('starts on the Yolo mode step, then theme, then notifications', () => {
    const first = resolveStepIndex(0, macOptions, 'forward')
    expect(STEPS[first]?.id).toBe('agent')
    const second = resolveStepIndex(first + 1, macOptions, 'forward')
    expect(STEPS[second]?.id).toBe('theme')
    const third = resolveStepIndex(second + 1, macOptions, 'forward')
    expect(STEPS[third]?.id).toBe('notifications')
  })

  it('never lands on the integrations step', () => {
    const reachable = STEPS.map((_, index) => resolveStepIndex(index, macOptions, 'forward'))
    const ids = new Set(reachable.map((index) => STEPS[index]?.id))
    expect([...ids].sort()).toEqual(['agent', 'notifications', 'theme'])
  })
})
