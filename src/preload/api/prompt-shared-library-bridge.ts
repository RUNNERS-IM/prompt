import { ipcRenderer } from 'electron'
import {
  PROMPT_SHARED_LIBRARY_CHANGED_CHANNEL,
  PROMPT_SHARED_LIBRARY_READ_CHANNEL,
  type PromptSharedLibraryApi,
  type SharedPromptItem
} from '../../shared/prompt-shared-library'

export const promptSharedLibraryApi = {
  read: (): Promise<SharedPromptItem[]> => ipcRenderer.invoke(PROMPT_SHARED_LIBRARY_READ_CHANNEL),
  onChanged: (listener: (items: SharedPromptItem[]) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, items: SharedPromptItem[]): void =>
      listener(items)
    ipcRenderer.on(PROMPT_SHARED_LIBRARY_CHANGED_CHANNEL, handler)
    return () => ipcRenderer.removeListener(PROMPT_SHARED_LIBRARY_CHANGED_CHANNEL, handler)
  }
} satisfies PromptSharedLibraryApi
