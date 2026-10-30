import type { OnboardingState } from '../../../../shared/onboarding-state-types'

// Keep the visibility gate separate so App can lazy-load the flow without eagerly importing its chunk.
// Prompt skips the first-run flow and opens straight to the workspace: Claude is the only agent and
// the theme follows the system, so there is nothing left to ask before the first project.
export function shouldShowOnboarding(_onboarding: OnboardingState | null): boolean {
  return false
}
