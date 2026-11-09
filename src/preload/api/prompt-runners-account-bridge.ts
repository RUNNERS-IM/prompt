import { ipcRenderer } from 'electron'
import {
  PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_RESET_PASSWORD_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SEND_CODE_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL,
  type PromptRunnersAccountApi,
  type PromptRunnersCodePurpose,
  type PromptRunnersSendCodeResult,
  type PromptRunnersSignInResult,
  type PromptRunnersSignMode
} from '../../shared/prompt-runners-account'

export const promptRunnersAccountApi = {
  get: (): Promise<string | null> => ipcRenderer.invoke(PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL),
  signIn: (
    mode: PromptRunnersSignMode,
    email: string,
    password: string,
    code?: string
  ): Promise<PromptRunnersSignInResult> =>
    ipcRenderer.invoke(PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL, mode, email, password, code),
  sendCode: (
    purpose: PromptRunnersCodePurpose,
    email: string,
    locale: string
  ): Promise<PromptRunnersSendCodeResult> =>
    ipcRenderer.invoke(PROMPT_RUNNERS_ACCOUNT_SEND_CODE_CHANNEL, purpose, email, locale),
  resetPassword: (
    email: string,
    code: string,
    password: string
  ): Promise<PromptRunnersSignInResult> =>
    ipcRenderer.invoke(PROMPT_RUNNERS_ACCOUNT_RESET_PASSWORD_CHANNEL, email, code, password),
  signOut: (): Promise<void> => ipcRenderer.invoke(PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL)
} satisfies PromptRunnersAccountApi
