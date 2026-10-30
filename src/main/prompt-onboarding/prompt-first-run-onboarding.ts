import type { OnboardingState } from '../../shared/onboarding-state-types'
import type { PromptOnboardingView } from '../../shared/prompt-first-run-onboarding'
import {
  readPromptUserDataMarker,
  type PromptUserDataMarker
} from '../../shared/prompt-user-data-location'

// Help → Show onboarding writes closedAt: null; honour it for the rest of this launch.
let reopenedThisLaunch = false

/** Call with every sanitized onboarding update before it is saved. */
export function notePromptOnboardingUpdate(update: { closedAt?: number | null }): void {
  if (update.closedAt === null) {
    reopenedThisLaunch = true
  }
}

/**
 * Adds `promptFirstRun` to an onboarding read. True only when the userData folder was created
 * empty by this build (marker `firstRunProfile`), or the person reopened onboarding this launch.
 * Upgraded profiles (copied from Orca, an earlier Prompt folder, or still on the Orca folder)
 * have no such marker and get false.
 */
export function withPromptFirstRun(
  state: OnboardingState,
  userDataPath: string,
  readMarker: (path: string) => PromptUserDataMarker | null = readPromptUserDataMarker
): PromptOnboardingView {
  const promptFirstRun = reopenedThisLaunch || readMarker(userDataPath)?.firstRunProfile === true
  return { ...state, promptFirstRun }
}

/** Test seam. */
export function resetPromptFirstRunOnboardingForTest(): void {
  reopenedThisLaunch = false
}
