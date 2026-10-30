import { ipcRenderer } from 'electron'
import {
  PROMPT_OPEN_CHROMIUM_LICENSES_CHANNEL,
  PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL,
  PROMPT_READ_THIRD_PARTY_NOTICES_CHANNEL,
  type PromptThirdPartyNoticesApi
} from '../../shared/prompt-third-party-notices'

export const promptThirdPartyNoticesApi = {
  open: (): Promise<void> => ipcRenderer.invoke(PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL),
  read: (): Promise<string | null> => ipcRenderer.invoke(PROMPT_READ_THIRD_PARTY_NOTICES_CHANNEL),
  openChromiumLicenses: (): Promise<boolean> =>
    ipcRenderer.invoke(PROMPT_OPEN_CHROMIUM_LICENSES_CHANNEL)
} satisfies PromptThirdPartyNoticesApi
