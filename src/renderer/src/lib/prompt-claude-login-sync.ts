import { useEffect } from 'react'
import type { PromptClaudeLoginSyncApi } from '../../../shared/prompt-claude-login-sync'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'
import { getProviderAccountActiveIdForView } from '@/components/settings/provider-account-visibility'
import {
  handleRunningClaudeSessionsAfterLogin,
  handleRunningClaudeSessionsAfterSwitch
} from './claude-account-switch-sessions'

const HOST_VIEW = { runtime: 'host' } as const

/**
 * Keep running Claude panes on one login: a `/login` in any pane, or `prompt account select`, applies
 * the Accounts running-session policy to the other local panes, as a switch in the Accounts pane does.
 */
export function startPromptClaudeLoginSync(deps: {
  api: PromptClaudeLoginSyncApi | undefined
  listAccounts: () => Promise<ClaudeRateLimitAccountsState>
}): () => void {
  // The web client has no main process to read transcripts or run the CLI.
  if (!deps.api) {
    return () => {}
  }
  const stopLogin = deps.api.onLogin((event) => {
    void deps
      .listAccounts()
      .catch(() => undefined)
      .then((host) => handleRunningClaudeSessionsAfterLogin({ paneKey: event.paneKey, host }))
  })
  const stopSwitch = deps.api.onAccountSwitched((event) => {
    void handleRunningClaudeSessionsAfterSwitch({
      owner: { kind: 'local' },
      target: HOST_VIEW,
      before: {
        state: event.before,
        accountId: getProviderAccountActiveIdForView(event.before, HOST_VIEW)
      },
      after: {
        state: event.after,
        accountId: getProviderAccountActiveIdForView(event.after, HOST_VIEW)
      }
    })
  })
  return () => {
    stopLogin()
    stopSwitch()
  }
}

export function PromptClaudeLoginSyncGate(): null {
  useEffect(
    () =>
      startPromptClaudeLoginSync({
        api: window.api.promptClaudeLoginSync,
        listAccounts: () => window.api.claudeAccounts.list()
      }),
    []
  )
  return null
}
