import type { OnboardingState } from '../../../../shared/onboarding-state-types'
import { isPromptFirstRunOnboarding } from '../../../../shared/prompt-first-run-onboarding'

// Keep the visibility gate separate so App can lazy-load the flow without eagerly importing its chunk.
// Prompt: only a brand-new profile sees the flow; profiles upgraded from Orca or an earlier Prompt
// never do, even when their saved onboarding was never closed.
export function shouldShowOnboarding(onboarding: OnboardingState | null): boolean {
  return (
    onboarding !== null && onboarding.closedAt === null && isPromptFirstRunOnboarding(onboarding)
  )
}
