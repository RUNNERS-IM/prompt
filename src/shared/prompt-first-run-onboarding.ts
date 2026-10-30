import type { OnboardingState } from './onboarding-state-types'

/**
 * Prompt shows first-run onboarding only on a brand-new profile: no Prompt data and nothing
 * copied from Orca. Main adds this flag to every onboarding read; it is never saved, so profiles
 * upgraded from Orca or an earlier Prompt keep their state untouched and never see the flow.
 */
export type PromptOnboardingView = OnboardingState & { promptFirstRun?: boolean }

export function isPromptFirstRunOnboarding(onboarding: OnboardingState): boolean {
  return (onboarding as PromptOnboardingView).promptFirstRun === true
}
