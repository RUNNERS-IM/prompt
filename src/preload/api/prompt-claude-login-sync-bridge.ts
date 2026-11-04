import { ipcRenderer } from 'electron'
import {
  PROMPT_CLAUDE_ACCOUNT_SWITCHED_CHANNEL,
  PROMPT_CLAUDE_LOGIN_CHANNEL,
  type PromptClaudeAccountSwitchedEvent,
  type PromptClaudeLoginEvent,
  type PromptClaudeLoginSyncApi
} from '../../shared/prompt-claude-login-sync'

function subscribe<T>(channel: string, callback: (event: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, data: T) => callback(data)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

export const promptClaudeLoginSyncApi = {
  onLogin: (callback: (event: PromptClaudeLoginEvent) => void) =>
    subscribe(PROMPT_CLAUDE_LOGIN_CHANNEL, callback),
  onAccountSwitched: (callback: (event: PromptClaudeAccountSwitchedEvent) => void) =>
    subscribe(PROMPT_CLAUDE_ACCOUNT_SWITCHED_CHANNEL, callback)
} satisfies PromptClaudeLoginSyncApi
