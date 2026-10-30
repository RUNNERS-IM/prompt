import { app, ipcMain } from 'electron'
import { sanitizeOnboardingUpdate, type Store } from '../persistence'
import type { OnboardingState } from '../../shared/onboarding-state-types'
import type { NativeChatUpgradeTipVariant } from '../../shared/native-chat/native-chat-upgrade-tip-audience'
import {
  notePromptOnboardingUpdate,
  withPromptFirstRun
} from '../prompt-onboarding/prompt-first-run-onboarding'

export function registerOnboardingHandlers(store: Store): void {
  ipcMain.removeHandler('onboarding:get')
  ipcMain.removeHandler('onboarding:update')
  ipcMain.removeHandler('onboarding:getNativeChatUpgradeTipVariant')

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
  ipcMain.handle('onboarding:getNativeChatUpgradeTipVariant', (): NativeChatUpgradeTipVariant =>
    store.getNativeChatUpgradeTipVariant()
  )
}
