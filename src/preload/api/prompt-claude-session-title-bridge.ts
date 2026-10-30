import { ipcRenderer } from 'electron'
import {
  PROMPT_CLAUDE_SESSION_TITLE_CHANNEL,
  type PromptClaudeSessionTitleApi,
  type PromptClaudeSessionTitleEvent
} from '../../shared/prompt-claude-session-title'

export const promptClaudeSessionTitleApi = {
  onTitle: (callback: (event: PromptClaudeSessionTitleEvent) => void): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: PromptClaudeSessionTitleEvent) =>
      callback(data)
    ipcRenderer.on(PROMPT_CLAUDE_SESSION_TITLE_CHANNEL, listener)
    return () => ipcRenderer.removeListener(PROMPT_CLAUDE_SESSION_TITLE_CHANNEL, listener)
  }
} satisfies PromptClaudeSessionTitleApi
