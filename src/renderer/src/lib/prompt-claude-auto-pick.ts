import { useEffect } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'
import type { InactiveAccountUsage, ProviderRateLimits } from '../../../shared/rate-limit-types'
import { pickClaudeAccountBySoonestReset } from '../../../shared/claude-account-auto-pick'
import { getProviderAccountActiveIdForView } from '@/components/settings/provider-account-visibility'
import { getClaudeAccountLabel } from './claude-account-label'
import { handleRunningClaudeSessionsAfterSwitch } from './claude-account-switch-sessions'

const HOST_VIEW = { runtime: 'host' } as const
// Why 5 minutes: weekly resets are hours apart, and a 5-hour window freeing up can wait this long.
const CHECK_INTERVAL_MS = 5 * 60_000
// Main fills other accounts' usage in the background; check once it has had time to answer.
const USAGE_SETTLE_MS = 20_000

export type ClaudeAutoPickDeps = {
  listAccounts: () => Promise<ClaudeRateLimitAccountsState>
  select: (accountId: string) => Promise<ClaudeRateLimitAccountsState>
  readUsage: () => { active: ProviderRateLimits | null; inactive: InactiveAccountUsage[] }
  onSwitched: (before: ClaudeRateLimitAccountsState, after: ClaudeRateLimitAccountsState) => void
  now: () => number
}

/** One check: switch this Mac's host Claude account when another one should be used first. */
export async function runClaudeAutoPick(deps: ClaudeAutoPickDeps): Promise<string | null> {
  const before = await deps.listAccounts()
  const current = getProviderAccountActiveIdForView(before, HOST_VIEW)
  const usage = deps.readUsage()
  const candidates = before.accounts
    .filter((account) => account.managedAuthRuntime !== 'wsl' && !account.needsSignIn)
    .map((account) => ({
      accountId: account.id,
      limits:
        account.id === current
          ? usage.active
          : (usage.inactive.find((entry) => entry.accountId === account.id)?.rateLimits ?? null)
    }))
  const picked = pickClaudeAccountBySoonestReset(candidates, current, deps.now())
  if (picked === null || picked === current) {
    return null
  }
  const after = await deps.select(picked)
  deps.onSwitched(before, after)
  return picked
}

export function startPromptClaudeAutoPick(): () => void {
  // The web client and a window driving a remote server do not own this Mac's login.
  if (!window.api?.claudeAccounts) {
    return () => {}
  }
  let running = false
  let settleTimer: number | undefined
  const check = (): void => {
    const store = useAppStore.getState()
    const settings = store.settings
    if (
      running ||
      settings?.claudeAccountAutoPick !== true ||
      settings.activeRuntimeEnvironmentId?.trim()
    ) {
      return
    }
    running = true
    void store.fetchInactiveClaudeAccountUsage()
    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      void runClaudeAutoPick({
        listAccounts: () => window.api.claudeAccounts.list(),
        select: (accountId) =>
          window.api.claudeAccounts.select({ accountId, runtime: 'host', wslDistro: null }),
        readUsage: () => {
          const { rateLimits } = useAppStore.getState()
          return {
            active: rateLimits.claudeTarget.runtime === 'host' ? rateLimits.claude : null,
            inactive: rateLimits.inactiveClaudeAccounts
          }
        },
        onSwitched: (before, after) => announceAutoPick(before, after),
        now: () => Date.now()
      })
        .catch((error: unknown) => {
          console.warn('[claude-auto-pick] check failed:', error)
        })
        .finally(() => {
          running = false
        })
    }, USAGE_SETTLE_MS)
  }
  check()
  const interval = window.setInterval(check, CHECK_INTERVAL_MS)
  // Turning the setting on checks right away instead of waiting for the next round.
  const stopSettings = useAppStore.subscribe((state, previous) => {
    if (
      state.settings?.claudeAccountAutoPick === true &&
      previous.settings?.claudeAccountAutoPick !== true
    ) {
      check()
    }
  })
  return () => {
    window.clearInterval(interval)
    window.clearTimeout(settleTimer)
    stopSettings()
  }
}

function announceAutoPick(
  before: ClaudeRateLimitAccountsState,
  after: ClaudeRateLimitAccountsState
): void {
  const previousId = getProviderAccountActiveIdForView(before, HOST_VIEW)
  const nextId = getProviderAccountActiveIdForView(after, HOST_VIEW)
  void useAppStore.getState().fetchSettings()
  toast.info(
    translate('accounts.claude.autoPick.switched', 'Switched Claude to {{next}}', {
      next: getClaudeAccountLabel(after, nextId)
    }),
    {
      description: translate(
        'accounts.claude.autoPick.switchedReason',
        '{{previous}} → {{next}}. Its weekly limit resets sooner.',
        {
          previous: getClaudeAccountLabel(before, previousId),
          next: getClaudeAccountLabel(after, nextId)
        }
      )
    }
  )
  void handleRunningClaudeSessionsAfterSwitch({
    owner: { kind: 'local' },
    target: HOST_VIEW,
    before: { state: before, accountId: previousId },
    after: { state: after, accountId: nextId }
  })
}

export function PromptClaudeAutoPickGate(): null {
  useEffect(() => startPromptClaudeAutoPick(), [])
  return null
}
