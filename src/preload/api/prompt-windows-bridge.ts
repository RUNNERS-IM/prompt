import { ipcRenderer } from 'electron'
import {
  PROMPT_WINDOWS_CHANNELS as CH,
  type PromptWindowFocusRequest,
  type PromptWindowSummary
} from '../../shared/prompt-windows'

export type PromptWindowsApi = {
  newWindow: () => Promise<void>
  openProject: (repoId: string) => Promise<void>
  list: () => Promise<PromptWindowSummary[]>
  /** `target` is a window key, or "new" for a new window. */
  moveTab: (tabId: string, target: string) => Promise<void>
  takeFocusRequest: () => Promise<PromptWindowFocusRequest | null>
}

export const promptWindowsApi: PromptWindowsApi = {
  newWindow: () => ipcRenderer.invoke(CH.newWindow),
  openProject: (repoId) => ipcRenderer.invoke(CH.openProject, repoId),
  list: () => ipcRenderer.invoke(CH.list),
  moveTab: (tabId, target) => ipcRenderer.invoke(CH.moveTab, tabId, target),
  takeFocusRequest: () => ipcRenderer.invoke(CH.takeFocusRequest)
}
