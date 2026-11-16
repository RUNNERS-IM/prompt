import type {
  PromptClaudeRestartRequest,
  PromptClaudeRestartResult
} from '../../shared/prompt-claude-login-sync'

type Handler = (request: PromptClaudeRestartRequest) => Promise<PromptClaudeRestartResult>

let handler: Handler | null = null

/** Why plain Node: the RPC layer also runs headless, where no window can restart a pane. */
export function setClaudeSessionRestartHandler(next: Handler | null): void {
  handler = next
}

/** Asks the window to move its Claude sessions onto the selected account; only the window owns its panes. */
export function requestClaudeSessionRestart(
  request: PromptClaudeRestartRequest
): Promise<PromptClaudeRestartResult> {
  if (!handler) {
    return Promise.reject(
      Object.assign(new Error('Open the Prompt window first; it restarts the sessions.'), {
        code: 'unavailable'
      })
    )
  }
  return handler(request)
}
