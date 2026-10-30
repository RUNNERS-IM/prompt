import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { getDefaultSettings } from '../../../../shared/constants'
import { getDefaultOnboardingState } from '../../../../shared/onboarding-defaults'
import { useAppStore } from '@/store'
import OnboardingFlow from './OnboardingFlow'

vi.mock('@/components/terminal-pane/TerminalPane', () => ({
  default: () => {
    throw new Error('This suite must not render a terminal pane')
  }
}))

function renderFirstStep(): string {
  return renderToStaticMarkup(
    <TooltipProvider>
      <OnboardingFlow onboarding={getDefaultOnboardingState()} onOnboardingChange={vi.fn()} />
    </TooltipProvider>
  )
}

describe('Prompt onboarding flow', () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    useAppStore.setState({ repos: [], settings: getDefaultSettings('/tmp') })
    vi.stubGlobal('navigator', { userAgent: 'Macintosh' })
  })

  afterEach(() => {
    useAppStore.setState(useAppStore.getInitialState(), true)
    vi.unstubAllGlobals()
  })

  it('opens on Yolo mode without the agent picker', () => {
    const html = renderFirstStep()
    expect(html).toContain('Before you start')
    expect(html).toContain('Yolo mode')
    expect(html).not.toContain('Pick your default agent')
    expect(html).not.toContain('Popular agents')
    expect(html).not.toContain('Detected on your system')
    expect(html).not.toMatch(/Show \d+ more agents?/)
  })

  it('has a visible close button and no skip confirmation', () => {
    const html = renderFirstStep()
    expect(html).toContain('data-onboarding-close')
    expect(html).toContain('aria-label="Close"')
    expect(html).not.toContain('Skip onboarding?')
  })

  it('darkens and blurs the backdrop', () => {
    const html = renderFirstStep()
    expect(html).toContain('bg-black/70')
    expect(html).toContain('backdrop-blur-[8px]')
    expect(html).not.toContain('bg-black/50')
  })

  it('keeps project setup reachable', () => {
    expect(renderFirstStep()).toContain('Skip to project setup')
  })
})
