import { useEffect } from 'react'
import { toast } from 'sonner'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'
import type { InactiveAccountUsage, ProviderRateLimits } from '../../../shared/rate-limit-types'
import {
  isClaudeLimitsFull,
  pickClaudeAccountBySoonestReset
} from '../../../shared/claude-account-auto-pick'
import { agentRetryableFailureKind } from '../../../shared/agent-main-agent-verdict'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
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
  onSwitched: (
    before: ClaudeRateLimitAccountsState,
    after: ClaudeRateLimitAccountsState,
    rescued: boolean
  ) => void
  now: () => number
}

/**
 * `soonest`: the auto-pick setting is on, so move to whichever account's weekly limit resets first.
 * `rescue`: the setting is off, so move only when the current account is full and another has room.
 */
export type ClaudeAutoPickMode = 'soonest' | 'rescue'

export type ClaudeAutoPickOptions = {
  mode: ClaudeAutoPickMode
  /** A session just stopped at its usage limit; the usage reading may not show 100% yet. */
  currentReportedFull?: boolean
}

export type ClaudeAutoPickResult = { accountId: string; rescued: boolean }

/** One check: switch this Mac's host Claude account when another one should be used first. */
export async function runClaudeAutoPick(
  deps: ClaudeAutoPickDeps,
  options: ClaudeAutoPickOptions = { mode: 'soonest' }
): Promise<ClaudeAutoPickResult | null> {
  const before = await deps.listAccounts()
  const current = getProviderAccountActiveIdForView(before, HOST_VIEW)
  const usage = deps.readUsage()
  const now = deps.now()
  // Only a saved account can be the current one here; System default has no usage reading to judge.
  const currentFull =
    current !== null && (options.currentReportedFull === true || isClaudeLimitsFull(usage.active, now))
  if (options.mode === 'rescue' && !currentFull) {
    return null
  }
  const candidates = before.accounts
    .filter((account) => account.managedAuthRuntime !== 'wsl' && !account.needsSignIn)
    // A full current account must not win a tie against itself.
    .filter((account) => !(currentFull && account.id === current))
    .map((account) => ({
      accountId: account.id,
      limits:
        account.id === current
          ? usage.active
          : (usage.inactive.find((entry) => entry.accountId === account.id)?.rateLimits ?? null)
    }))
  const picked = pickClaudeAccountBySoonestReset(candidates, current, now)
  if (picked === null || picked === current) {
    return null
  }
  const after = await deps.select(picked)
  deps.onSwitched(before, after, currentFull)
  return { accountId: picked, rescued: currentFull }
}

/** Panes whose last turn the hook reported as stopped at the usage limit, local Claude only. */
function usageLimitedPaneKeys(rows: Record<string, AgentStatusEntry | undefined>): Set<string> {
  const keys = new Set<string>()
  for (const [paneKey, row] of Object.entries(rows)) {
    if (row && row.agentType === 'claude' && !row.connectionId) {
      if (agentRetryableFailureKind(row) === 'usage-limit') {
        keys.add(paneKey)
      }
    }
  }
  return keys
}

export function startPromptClaudeAutoPick(): () => void {
  // The web client and a window driving a remote server do not own this Mac's login.
  if (!window.api?.claudeAccounts) {
    return () => {}
  }
  let running = false
  // A limit seen while a check runs gets its own check afterwards instead of being dropped.
  let limitPending = false
  let settleTimer: number | undefined
  const readUsage = (): ReturnType<ClaudeAutoPickDeps['readUsage']> => {
    const { rateLimits } = useAppStore.getState()
    return {
      active: rateLimits.claudeTarget.runtime === 'host' ? rateLimits.claude : null,
      inactive: rateLimits.inactiveClaudeAccounts
    }
  }
  const check = (limitReported = false): void => {
    const store = useAppStore.getState()
    const settings = store.settings
    if (!settings || settings.activeRuntimeEnvironmentId?.trim()) {
      return
    }
    if (running) {
      limitPending ||= limitReported
      return
    }
    const mode: ClaudeAutoPickMode = settings.claudeAccountAutoPick === true ? 'soonest' : 'rescue'
    // Why: with the setting off, other accounts' usage is only fetched once this one is full.
    if (mode === 'rescue' && !limitReported && !isClaudeLimitsFull(readUsage().active, Date.now())) {
      return
    }
    running = true
    void store.fetchInactiveClaudeAccountUsage()
    window.clearTimeout(settleTimer)
    settleTimer = window.setTimeout(() => {
      void runClaudeAutoPick(
        {
          listAccounts: () => window.api.claudeAccounts.list(),
          select: (accountId) =>
            window.api.claudeAccounts.select({ accountId, runtime: 'host', wslDistro: null }),
          readUsage,
          onSwitched: (before, after, rescued) => announceAutoPick(before, after, rescued),
          now: () => Date.now()
        },
        { mode, currentReportedFull: limitReported }
      )
        .catch((error: unknown) => {
          console.warn('[claude-auto-pick] check failed:', error)
        })
        .finally(() => {
          running = false
          if (limitPending) {
            limitPending = false
            check(true)
          }
        })
    }, USAGE_SETTLE_MS)
  }
  check()
  const interval = window.setInterval(() => check(), CHECK_INTERVAL_MS)
  let limitedPanes = usageLimitedPaneKeys(useAppStore.getState().agentStatusByPaneKey)
  const stopStore = useAppStore.subscribe((state, previous) => {
    // Turning the setting on checks right away instead of waiting for the next round.
    if (
      state.settings?.claudeAccountAutoPick === true &&
      previous.settings?.claudeAccountAutoPick !== true
    ) {
      check()
    }
    if (state.agentStatusByPaneKey !== previous.agentStatusByPaneKey) {
      const next = usageLimitedPaneKeys(state.agentStatusByPaneKey)
      const newlyLimited = [...next].some((paneKey) => !limitedPanes.has(paneKey))
      limitedPanes = next
      // A session stopped at its limit moves the account now, not at the next 5-minute round.
      // Why not with 'keep': sessions may still run on an older account, whose limit says nothing about this one.
      if (newlyLimited && state.settings?.claudeAccountSwitchRunningSessions !== 'keep') {
        check(true)
      }
    }
    if (state.rateLimits.claude !== previous.rateLimits.claude) {
      const now = Date.now()
      if (
        isClaudeLimitsFull(state.rateLimits.claude, now) &&
        !isClaudeLimitsFull(previous.rateLimits.claude, now)
      ) {
        check()
      }
    }
  })
  return () => {
    window.clearInterval(interval)
    window.clearTimeout(settleTimer)
    stopStore()
  }
}

function announceAutoPick(
  before: ClaudeRateLimitAccountsState,
  after: ClaudeRateLimitAccountsState,
  rescued: boolean
): void {
  const previousId = getProviderAccountActiveIdForView(before, HOST_VIEW)
  const nextId = getProviderAccountActiveIdForView(after, HOST_VIEW)
  void useAppStore.getState().fetchSettings()
  const previous = getClaudeAccountLabel(before, previousId)
  const next = getClaudeAccountLabel(after, nextId)
  toast.info(
    translate('prompt.claudeAccount.autoPickSwitched', 'Switched Claude to {{next}}', { next }),
    {
      description: rescued
        ? translate(
            'prompt.claudeAccount.limitRescuedReason',
            '{{previous}} reached its usage limit. Sessions stopped at the limit continue on {{next}}.',
            { previous, next }
          )
        : translate(
            'prompt.claudeAccount.autoPickSwitchedReason',
            '{{previous}} → {{next}}. Its weekly limit resets sooner.',
            { previous, next }
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
