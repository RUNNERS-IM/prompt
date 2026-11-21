// A `/login` in one Claude pane changes the login only that pane holds in memory; main reads the
// transcript record so the window can move the other panes on the same folder to the new login.

import type { ClaudeRateLimitAccountsState } from './managed-account-types'

export const PROMPT_CLAUDE_LOGIN_CHANNEL = 'prompt:claudeLogin'
export const PROMPT_CLAUDE_ACCOUNT_SWITCHED_CHANNEL = 'prompt:claudeAccountSwitched'
export const PROMPT_CLAUDE_RESTART_REQUEST_CHANNEL = 'prompt:claudeRestartRequest'
export const PROMPT_CLAUDE_RESTART_REPLY_CHANNEL = 'prompt:claudeRestartReply'

export type PromptClaudeLoginEvent = {
  paneKey: string
  sessionId: string
}

/** A switch made outside the window (`prompt account select`), which the window did not see. */
export type PromptClaudeAccountSwitchedEvent = {
  before: ClaudeRateLimitAccountsState
  after: ClaudeRateLimitAccountsState
}

export type PromptClaudeRestartPane = { tabId: string; leafId: string }

/** `prompt session restart`: move Claude sessions onto the selected account and pick their work back up. */
export type PromptClaudeRestartRequest = {
  /** The sessions to look at; every local Claude session when absent. */
  panes?: PromptClaudeRestartPane[]
  /** Only sessions stopped at their usage limit, the limit picker included. */
  limitedOnly: boolean
  /** The line sent to sessions stopped at the limit; the window's own wording when absent. */
  continueText?: string
  /**
   * Restart sessions stopped at the limit even when already on the selected folder. The login behind
   * that folder changed, and a running Claude keeps the old token in memory, so the line alone fails.
   */
  restartLimited?: boolean
}

/**
 * `continued`: already on the selected login, so the continue line alone resumes it.
 * `restarting`: on another account folder, or waiting on the limit picker, so it restarts on the selected one.
 * `current`: already on the selected login and not stopped; nothing to do.
 * `skipped`: can't be moved (own config folder, unknown account, no session to resume).
 */
export type PromptClaudeRestartOutcome = 'continued' | 'restarting' | 'current' | 'skipped'

export type PromptClaudeRestartResult = {
  sessions: (PromptClaudeRestartPane & {
    limited: boolean
    outcome: PromptClaudeRestartOutcome
    reason?: string
  })[]
}

export type PromptClaudeLoginSyncApi = {
  onLogin: (callback: (event: PromptClaudeLoginEvent) => void) => () => void
  onAccountSwitched: (callback: (event: PromptClaudeAccountSwitchedEvent) => void) => () => void
  /** Answers each request with the callback's result. */
  onRestartRequest?: (
    callback: (request: PromptClaudeRestartRequest) => Promise<PromptClaudeRestartResult>
  ) => () => void
}
