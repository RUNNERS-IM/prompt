import { ipcRenderer } from 'electron'
import {
  PROMPT_LOCAL_HOST_NAME_CHANNEL,
  PROMPT_TAILNET_COMPUTERS_CHANNEL,
  PROMPT_TAILNET_CONNECT_CHANNEL,
  type PromptTailnetComputer,
  type PromptTailnetConnectResult
} from '../../shared/prompt-computers'

export type PromptComputersApi = {
  /** This Mac's short network name (LocalHostName), e.g. `m2-pro-1`. */
  localHostName: () => Promise<string>
  /** Computers of this Tailscale network that are not in the picker yet. */
  tailnetComputers: () => Promise<PromptTailnetComputer[]>
  /** Pairs one of them now; it then shows up as a normal computer row. */
  connectTailnetComputer: (id: string) => Promise<PromptTailnetConnectResult>
}

export const promptComputersApi: PromptComputersApi = {
  localHostName: () => ipcRenderer.invoke(PROMPT_LOCAL_HOST_NAME_CHANNEL),
  tailnetComputers: () => ipcRenderer.invoke(PROMPT_TAILNET_COMPUTERS_CHANNEL),
  connectTailnetComputer: (id) => ipcRenderer.invoke(PROMPT_TAILNET_CONNECT_CHANNEL, id)
}
