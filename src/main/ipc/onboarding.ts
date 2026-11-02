import { app, ipcMain } from 'electron'
import { sanitizeOnboardingUpdate } from '../persistence/applying-settings/onboarding-normalization'
import type { Store } from '../persistence/loading-store/store'
import type { OnboardingState } from '../../shared/onboarding-state-types'
import type { ChatUiLaunchTipVariant } from '../../shared/native-chat/chat-ui-launch-tip-audience'
import { isChatUiLaunchTipDeferredForConsent } from '../telemetry/chat-ui-launch-tip-cohort'
import {
  applyPromptFirstRunYoloDefault,
  notePromptOnboardingUpdate,
  withPromptFirstRun
} from '../prompt-onboarding/prompt-first-run-onboarding'

export function registerOnboardingHandlers(store: Store): void {
  ipcMain.removeHandler('onboarding:get')
  ipcMain.removeHandler('onboarding:update')
  ipcMain.removeHandler('onboarding:getChatUiLaunchTipVariant')
  // Prompt: before the first onboarding read, so its Yolo switch starts off on a new profile.
  applyPromptFirstRunYoloDefault(store, app.getPath('userData'))

  // Prompt: reads carry whether this is a brand-new profile, so upgrades never see onboarding.
  ipcMain.handle('onboarding:get', (): OnboardingState =>
    withPromptFirstRun(store.getOnboarding(), app.getPath('userData'))
  )
  // Sanitize untyped IPC keys and values before persisting onboarding state.
  ipcMain.handle('onboarding:update', (_event, updates: unknown): OnboardingState => {
    const sanitized = sanitizeOnboardingUpdate(updates)
    notePromptOnboardingUpdate(sanitized)
    return withPromptFirstRun(store.updateOnboarding(sanitized), app.getPath('userData'))
  })
  // 'none' skips the tip this launch without marking it seen, so it returns once consent resolves.
  ipcMain.handle('onboarding:getChatUiLaunchTipVariant', (): ChatUiLaunchTipVariant =>
    isChatUiLaunchTipDeferredForConsent() ? 'none' : store.getChatUiLaunchTipVariant()
  )
}
