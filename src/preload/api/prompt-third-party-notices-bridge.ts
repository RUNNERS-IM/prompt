import { ipcRenderer } from 'electron'
import {
  PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL,
  type PromptThirdPartyNoticesApi
} from '../../shared/prompt-third-party-notices'

export const promptThirdPartyNoticesApi = {
  open: (): Promise<boolean> => ipcRenderer.invoke(PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL)
} satisfies PromptThirdPartyNoticesApi
