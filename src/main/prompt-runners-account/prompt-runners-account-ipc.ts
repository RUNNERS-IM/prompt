import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL,
  type PromptRunnersSignInResult
} from '../../shared/prompt-runners-account'
import {
  runnersAccountEmail,
  signInRunnersAccount,
  signOutRunnersAccount
} from './prompt-runners-account-server'

// Why: only app windows hold the account; browser-pane guests (webviews) must not read or change it.
function fromAppWindow(event: IpcMainInvokeEvent): boolean {
  return !event.sender.isDestroyed() && event.sender.getType() === 'window'
}

/** The RUNNERS account sign-in for the desktop window. */
export function registerPromptRunnersAccountHandlers(): void {
  ipcMain.removeHandler(PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL)
  ipcMain.removeHandler(PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL)
  ipcMain.removeHandler(PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL)
  ipcMain.handle(PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL, (event) =>
    fromAppWindow(event) ? runnersAccountEmail() : null
  )
  ipcMain.handle(
    PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL,
    async (
      event,
      mode: unknown,
      email: unknown,
      password: unknown
    ): Promise<PromptRunnersSignInResult> => {
      if (!fromAppWindow(event) || typeof email !== 'string' || typeof password !== 'string') {
        return { ok: false, problem: 'bad' }
      }
      return signInRunnersAccount(mode === 'signup' ? 'signup' : 'login', email, password)
    }
  )
  ipcMain.handle(PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL, async (event) => {
    if (fromAppWindow(event)) {
      await signOutRunnersAccount()
    }
  })
}
