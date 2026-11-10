import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import {
  PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_RESET_PASSWORD_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SEND_CODE_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL,
  type PromptRunnersSendCodeResult,
  type PromptRunnersSignInResult
} from '../../shared/prompt-runners-account'
import {
  resetRunnersAccountPassword,
  runnersAccountEmail,
  sendRunnersAccountCode,
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
  ipcMain.removeHandler(PROMPT_RUNNERS_ACCOUNT_SEND_CODE_CHANNEL)
  ipcMain.removeHandler(PROMPT_RUNNERS_ACCOUNT_RESET_PASSWORD_CHANNEL)
  ipcMain.handle(PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL, (event) =>
    fromAppWindow(event) ? runnersAccountEmail() : null
  )
  ipcMain.handle(
    PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL,
    async (
      event,
      mode: unknown,
      email: unknown,
      password: unknown,
      code: unknown
    ): Promise<PromptRunnersSignInResult> => {
      if (!fromAppWindow(event) || typeof email !== 'string' || typeof password !== 'string') {
        return { ok: false, problem: 'bad' }
      }
      return signInRunnersAccount(
        mode === 'signup' ? 'signup' : 'login',
        email,
        password,
        typeof code === 'string' ? code : undefined
      )
    }
  )
  ipcMain.handle(
    PROMPT_RUNNERS_ACCOUNT_SEND_CODE_CHANNEL,
    async (
      event,
      purpose: unknown,
      email: unknown,
      locale: unknown
    ): Promise<PromptRunnersSendCodeResult> => {
      if (!fromAppWindow(event) || typeof email !== 'string') {
        return { ok: false, problem: 'bad' }
      }
      return sendRunnersAccountCode(
        purpose === 'reset' ? 'reset' : 'signup',
        email,
        typeof locale === 'string' ? locale : 'en'
      )
    }
  )
  ipcMain.handle(
    PROMPT_RUNNERS_ACCOUNT_RESET_PASSWORD_CHANNEL,
    async (
      event,
      email: unknown,
      code: unknown,
      password: unknown
    ): Promise<PromptRunnersSignInResult> => {
      if (
        !fromAppWindow(event) ||
        typeof email !== 'string' ||
        typeof code !== 'string' ||
        typeof password !== 'string'
      ) {
        return { ok: false, problem: 'bad' }
      }
      return resetRunnersAccountPassword(email, code, password)
    }
  )
  ipcMain.handle(PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL, async (event) => {
    if (fromAppWindow(event)) {
      await signOutRunnersAccount()
    }
  })
}
