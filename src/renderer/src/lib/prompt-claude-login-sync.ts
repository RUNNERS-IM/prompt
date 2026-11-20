import { useEffect } from 'react'
import type { PromptClaudeLoginSyncApi } from '../../../shared/prompt-claude-login-sync'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'
import { getProviderAccountActiveIdForView } from '@/components/settings/provider-account-visibility'
import {
  handleRunningClaudeSessionsAfterLogin,
  handleRunningClaudeSessionsAfterSwitch
} from './claude-account-switch-sessions'
import { handleClaudeSessionRestartRequest } from './claude-session-restart-command'
import { startPromptClaudeSystemLoginWatch } from './prompt-claude-system-login-watch'

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
  // A login changed outside every pane (a plain terminal's `claude /login`) has no transcript record.
  const systemLogin = startPromptClaudeSystemLoginWatch({
    listAccounts: deps.listAccounts,
    restart: (request) => handleClaudeSessionRestartRequest(request, deps.listAccounts)
  })
  const stopLogin = deps.api.onLogin((event) => {
    void deps
      .listAccounts()
      .catch(() => undefined)
      .then((host) => {
        // This login already moves the other sessions; the watch must not restart them a second time.
        if (host) {
          systemLogin.acknowledge(host)
        }
        return handleRunningClaudeSessionsAfterLogin({ paneKey: event.paneKey, host })
      })
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
  // `prompt session restart` asks the window, which owns the panes.
  const stopRestart =
    deps.api.onRestartRequest?.((request) =>
      handleClaudeSessionRestartRequest(request, deps.listAccounts)
    ) ?? (() => {})
  return () => {
    systemLogin.stop()
    stopLogin()
    stopSwitch()
    stopRestart()
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
