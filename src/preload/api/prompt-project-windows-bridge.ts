import { ipcRenderer } from 'electron'
import {
  PROMPT_PROJECT_WINDOWS_CHANNELS as CH,
  type PromptProjectWindowsState
} from '../../shared/prompt-project-windows'

export type PromptProjectWindowsApi = {
  open: (repoId: string) => Promise<void>
  focus: (repoId: string) => Promise<void>
  getState: () => Promise<PromptProjectWindowsState>
  onChanged: (callback: (state: PromptProjectWindowsState) => void) => () => void
}

export const promptProjectWindowsApi: PromptProjectWindowsApi = {
  open: (repoId) => ipcRenderer.invoke(CH.open, repoId),
  focus: (repoId) => ipcRenderer.invoke(CH.focus, repoId),
  getState: () => ipcRenderer.invoke(CH.state),
  onChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: PromptProjectWindowsState): void =>
      callback(state)
    ipcRenderer.on(CH.changed, listener)
    return () => {
      ipcRenderer.removeListener(CH.changed, listener)
    }
  }
}
