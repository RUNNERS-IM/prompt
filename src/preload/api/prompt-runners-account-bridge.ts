import { ipcRenderer } from 'electron'
import {
  PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL,
  PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL,
  type PromptRunnersAccountApi,
  type PromptRunnersSignInResult,
  type PromptRunnersSignMode
} from '../../shared/prompt-runners-account'

export const promptRunnersAccountApi = {
  get: (): Promise<string | null> => ipcRenderer.invoke(PROMPT_RUNNERS_ACCOUNT_GET_CHANNEL),
  signIn: (
    mode: PromptRunnersSignMode,
    email: string,
    password: string
  ): Promise<PromptRunnersSignInResult> =>
    ipcRenderer.invoke(PROMPT_RUNNERS_ACCOUNT_SIGN_IN_CHANNEL, mode, email, password),
  signOut: (): Promise<void> => ipcRenderer.invoke(PROMPT_RUNNERS_ACCOUNT_SIGN_OUT_CHANNEL)
} satisfies PromptRunnersAccountApi
