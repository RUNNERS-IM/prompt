import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'
import type {
  PromptClaudeRestartRequest,
  PromptClaudeRestartResult
} from '../../../shared/prompt-claude-login-sync'
import { getProviderAccountActiveIdForView } from '@/components/settings/provider-account-visibility'

const HOST_VIEW = { runtime: 'host' } as const
// Why a minute: a login changed in a plain terminal is noticed soon enough, and the read is throttled in main.
const POLL_MS = 60_000

export type SystemLoginWatchDeps = {
  listAccounts: () => Promise<ClaudeRateLimitAccountsState>
  restart: (request: PromptClaudeRestartRequest) => Promise<PromptClaudeRestartResult>
  onChanged: (email: string, result: PromptClaudeRestartResult) => void
}

/** Email and organization together: one email can hold a personal and a team login. */
function systemLoginKey(state: ClaudeRateLimitAccountsState): string | null {
  const email = state.systemDefaultEmail?.trim().toLowerCase()
  return email ? `${email}|${state.systemDefaultOrganizationUuid ?? ''}` : null
}

/**
 * Follow the System default login (`~/.claude`, the keychain) when it changes outside the window,
 * such as `claude /login` in a plain terminal. Running sessions keep the old token in memory, so
 * the ones stopped at their usage limit restart on the new login and are told to continue.
 * Only while System default is the selected login; a saved account's sessions do not use it.
 */
export function createSystemLoginWatch(deps: SystemLoginWatchDeps): {
  poll: () => Promise<void>
  /** Take the current login as known, after the window already moved sessions for it. */
  acknowledge: (state: ClaudeRateLimitAccountsState) => void
} {
  let known: string | null | undefined
  let polling = false
  const acknowledge = (state: ClaudeRateLimitAccountsState): void => {
    known = systemLoginKey(state) ?? known
  }
  const poll = async (): Promise<void> => {
    if (polling) {
      return
    }
    polling = true
    try {
      const state = await deps.listAccounts()
      const key = systemLoginKey(state)
      // A sign-out has nothing to restart onto; keep the last login so the next sign-in compares to it.
      if (key === null) {
        return
      }
      const previous = known
      known = key
      const onSystemDefault = getProviderAccountActiveIdForView(state, HOST_VIEW) === null
      // The first read only learns the login.
      if (!onSystemDefault || previous === undefined || previous === null) {
        return
      }
      if (key !== previous && state.systemDefaultEmail) {
        const result = await deps.restart({ limitedOnly: true, restartLimited: true })
        deps.onChanged(state.systemDefaultEmail, result)
      }
    } finally {
      polling = false
    }
  }
  return { poll, acknowledge }
}

export function startPromptClaudeSystemLoginWatch(
  deps: Omit<SystemLoginWatchDeps, 'onChanged'>
): { stop: () => void; acknowledge: (state: ClaudeRateLimitAccountsState) => void } {
  const watch = createSystemLoginWatch({
    ...deps,
    onChanged: (email, result) => {
      const restarted = result.sessions.filter((session) => session.outcome === 'restarting')
      toast.info(
        translate('prompt.claudeAccount.systemLoginChanged', 'Claude login changed to {{next}}', {
          next: email
        }),
        restarted.length > 0
          ? {
              description: translate(
                'prompt.claudeAccount.systemLoginChangedReason',
                'Sessions stopped at their usage limit restart on the new login and continue.'
              )
            }
          : undefined
      )
    }
  })
  const run = (): void => {
    void watch.poll().catch((error: unknown) => {
      console.warn('[claude-system-login] check failed:', error)
    })
  }
  run()
  const interval = window.setInterval(run, POLL_MS)
  return { stop: () => window.clearInterval(interval), acknowledge: watch.acknowledge }
}
