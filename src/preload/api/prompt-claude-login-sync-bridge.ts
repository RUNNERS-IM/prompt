import { ipcRenderer } from 'electron'
import {
  PROMPT_CLAUDE_ACCOUNT_SWITCHED_CHANNEL,
  PROMPT_CLAUDE_LOGIN_CHANNEL,
  PROMPT_CLAUDE_RESTART_REPLY_CHANNEL,
  PROMPT_CLAUDE_RESTART_REQUEST_CHANNEL,
  type PromptClaudeAccountSwitchedEvent,
  type PromptClaudeLoginEvent,
  type PromptClaudeLoginSyncApi,
  type PromptClaudeRestartRequest,
  type PromptClaudeRestartResult
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
    subscribe(PROMPT_CLAUDE_ACCOUNT_SWITCHED_CHANNEL, callback),
  onRestartRequest: (
    callback: (request: PromptClaudeRestartRequest) => Promise<PromptClaudeRestartResult>
  ) =>
    subscribe<PromptClaudeRestartRequest & { requestId: string }>(
      PROMPT_CLAUDE_RESTART_REQUEST_CHANNEL,
      ({ requestId, ...request }) => {
        void callback(request).then(
          (result) => ipcRenderer.send(PROMPT_CLAUDE_RESTART_REPLY_CHANNEL, { requestId, result }),
          (error: unknown) =>
            ipcRenderer.send(PROMPT_CLAUDE_RESTART_REPLY_CHANNEL, {
              requestId,
              error: error instanceof Error ? error.message : String(error)
            })
        )
      }
    )
} satisfies PromptClaudeLoginSyncApi
