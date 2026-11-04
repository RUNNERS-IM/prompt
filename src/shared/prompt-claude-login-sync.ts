// A `/login` in one Claude pane changes the login only that pane holds in memory; main reads the
// transcript record so the window can move the other panes on the same folder to the new login.

import type { ClaudeRateLimitAccountsState } from './managed-account-types'

export const PROMPT_CLAUDE_LOGIN_CHANNEL = 'prompt:claudeLogin'
export const PROMPT_CLAUDE_ACCOUNT_SWITCHED_CHANNEL = 'prompt:claudeAccountSwitched'

export type PromptClaudeLoginEvent = {
  paneKey: string
  sessionId: string
}

/** A switch made outside the window (`prompt account select`), which the window did not see. */
export type PromptClaudeAccountSwitchedEvent = {
  before: ClaudeRateLimitAccountsState
  after: ClaudeRateLimitAccountsState
}

export type PromptClaudeLoginSyncApi = {
  onLogin: (callback: (event: PromptClaudeLoginEvent) => void) => () => void
  onAccountSwitched: (callback: (event: PromptClaudeAccountSwitchedEvent) => void) => () => void
}
