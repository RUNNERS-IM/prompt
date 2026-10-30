import { ipcRenderer } from 'electron'
import { PROMPT_LOCAL_HOST_NAME_CHANNEL } from '../../shared/prompt-computers'

export type PromptComputersApi = {
  /** This Mac's short network name (LocalHostName), e.g. `m2-pro-1`. */
  localHostName: () => Promise<string>
}

export const promptComputersApi: PromptComputersApi = {
  localHostName: () => ipcRenderer.invoke(PROMPT_LOCAL_HOST_NAME_CHANNEL)
}
