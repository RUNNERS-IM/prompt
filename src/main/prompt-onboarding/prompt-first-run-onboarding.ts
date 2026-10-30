import type { OnboardingState } from '../../shared/onboarding-state-types'
import type { PromptOnboardingView } from '../../shared/prompt-first-run-onboarding'
import {
  readPromptUserDataMarker,
  writePromptUserDataMarker,
  type PromptUserDataMarker
} from '../../shared/prompt-user-data-location'
import { applyAllAgentsPermission } from '../../shared/tui-agent-permission-choice'
import type { Store } from '../persistence'

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

type YoloDefaultStore = Pick<Store, 'getSettings' | 'updateSettings'>

/**
 * Prompt: a brand-new profile starts with Yolo mode off (user decision 3A). The folder marker
 * carries `startYoloOff` only when this build created the folder empty; it is applied once and
 * then cleared, so a later choice and every profile from an earlier build stay as they are.
 */
export function applyPromptFirstRunYoloDefault(
  store: YoloDefaultStore,
  userDataPath: string,
  readMarker: (path: string) => PromptUserDataMarker | null = readPromptUserDataMarker,
  writeMarker: (path: string, marker: PromptUserDataMarker) => void = writePromptUserDataMarker
): boolean {
  const marker = readMarker(userDataPath)
  if (!marker?.startYoloOff) {
    return false
  }
  store.updateSettings(applyAllAgentsPermission(store.getSettings(), 'own'))
  const { startYoloOff: _applied, ...rest } = marker
  try {
    writeMarker(userDataPath, rest)
  } catch {
    // A marker that cannot be rewritten only means the same default is set again next launch.
  }
  return true
}
