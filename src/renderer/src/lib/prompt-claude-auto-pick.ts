import { useEffect } from 'react'
import { toast } from 'sonner'
import { getIntlLocale, translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'
import type { InactiveAccountUsage, ProviderRateLimits } from '../../../shared/rate-limit-types'
import {
  claudeLimitsFreeAt,
  claudeLimitsNextResetAt,
  isClaudeLimitsFull,
  pickClaudeAccountBySoonestReset
} from '../../../shared/claude-account-auto-pick'
import { agentRetryableFailureKind } from '../../../shared/agent-main-agent-verdict'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import { getProviderAccountActiveIdForView } from '@/components/settings/provider-account-visibility'
import { getClaudeAccountLabel } from './claude-account-label'
import { handleRunningClaudeSessionsAfterSwitch } from './claude-account-switch-sessions'
import { localClaudePanes } from './claude-session-account-move'
import { handleClaudeSessionRestartRequest } from './claude-session-restart-command'
import { findClaudeSessionsStoppedAtUsageLimit } from './claude-usage-limit-sessions'

const HOST_VIEW = { runtime: 'host' } as const
// Why 5 minutes: weekly resets are hours apart, and a 5-hour window freeing up can wait this long.
const CHECK_INTERVAL_MS = 5 * 60_000
// Main fills other accounts' usage in the background; check once it has had time to answer.
const USAGE_SETTLE_MS = 20_000
// Past the reset: the provider's clock and the usage reading need a moment to agree it freed up.
const RESUME_SLACK_MS = 2 * 60_000
// Why a cap: a sleeping Mac stretches long timers, so a far reset is re-aimed at least daily.
const RESUME_MAX_WAIT_MS = 24 * 60 * 60_000
// Why apart: dozens of sessions resuming at once would load the Mac and spend the fresh limit in a burst.
const RESUME_STAGGER_MS = 20_000

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
  /**
   * The current login is full and no other account has room. `resumeAt` is when the first one
   * frees up, or null when no reset time is known.
   */
  onAllFull?: (resumeAt: number | null) => void
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
  // System default counts too: a session stopped on it is just as stuck, and a saved account can take over.
  const currentFull = options.currentReportedFull === true || isClaudeLimitsFull(usage.active, now)
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
    if (currentFull) {
      deps.onAllFull?.(firstFreeAt(usage, candidates, now))
    }
    return null
  }
  const after = await deps.select(picked)
  deps.onSwitched(before, after, currentFull)
  return { accountId: picked, rescued: currentFull }
}

/** When the first full login frees up: the current one, or a saved account that also ran out. */
function firstFreeAt(
  usage: ReturnType<ClaudeAutoPickDeps['readUsage']>,
  candidates: readonly { limits: ProviderRateLimits | null }[],
  now: number
): number | null {
  const times = [
    claudeLimitsFreeAt(usage.active, now) ?? claudeLimitsNextResetAt(usage.active, now),
    ...candidates.map((candidate) => claudeLimitsFreeAt(candidate.limits, now))
  ].filter((at): at is number => at !== null)
  return times.length > 0 ? Math.min(...times) : null
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
  let resumeTimer: number | undefined
  let resumeAt: number | null = null
  const readUsage = (): ReturnType<ClaudeAutoPickDeps['readUsage']> => {
    const { rateLimits } = useAppStore.getState()
    return {
      active: rateLimits.claudeTarget.runtime === 'host' ? rateLimits.claude : null,
      inactive: rateLimits.inactiveClaudeAccounts
    }
  }
  const scheduleResume = (at: number | null): void => {
    // Unknown reset: the 5-minute round and the next limit report still check.
    if (at === null || at === resumeAt) {
      return
    }
    const first = resumeAt === null
    resumeAt = at
    window.clearTimeout(resumeTimer)
    const wait = Math.min(Math.max(0, at - Date.now()) + RESUME_SLACK_MS, RESUME_MAX_WAIT_MS)
    resumeTimer = window.setTimeout(() => {
      if (resumeAt !== null && Date.now() < resumeAt) {
        // Woke early from the daily cap: aim again at the same reset.
        const target = resumeAt
        resumeAt = null
        scheduleResume(target)
        return
      }
      resumeAt = null
      check(false, true)
    }, wait)
    if (first) {
      announceAllFull(at)
    }
  }
  const check = (limitReported = false, resume = false): void => {
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
    if (
      mode === 'rescue' &&
      !limitReported &&
      !resume &&
      !isClaudeLimitsFull(readUsage().active, Date.now())
    ) {
      return
    }
    let allFull = false
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
          now: () => Date.now(),
          onAllFull: (at) => {
            allFull = true
            scheduleResume(at)
          }
        },
        { mode, currentReportedFull: limitReported }
      )
        .then((picked) => {
          // The login it is on freed up, so no switch: the sessions it stopped carry on where they are.
          if (resume && picked === null && !allFull) {
            void resumeStoppedSessions()
          }
        })
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
    window.clearTimeout(resumeTimer)
    stopStore()
  }
}

/**
 * Restart, one at a time, the sessions stopped at their usage limit, once the limit freed up while no
 * one was there. Each gets the continue line. Left alone when sessions are set to stay on their account.
 */
async function resumeStoppedSessions(): Promise<void> {
  const state = useAppStore.getState()
  if (state.settings?.claudeAccountSwitchRunningSessions === 'keep') {
    return
  }
  const panes = [...localClaudePanes(state, { kind: 'local' }, HOST_VIEW)].filter(
    (pane) => pane.inLane
  )
  const stopped = await findClaudeSessionsStoppedAtUsageLimit(panes)
  if (stopped.length === 0) {
    return
  }
  toast.info(translate('prompt.claudeAccount.limitResumed', 'Claude usage limit reset'), {
    description: translate(
      'prompt.claudeAccount.limitResumedReason',
      '{{count}} sessions stopped at the limit continue one by one.',
      { count: stopped.length }
    )
  })
  const listAccounts = (): Promise<ClaudeRateLimitAccountsState> => window.api.claudeAccounts.list()
  for (const [index, pane] of stopped.entries()) {
    if (index > 0) {
      await new Promise((resolve) => window.setTimeout(resolve, RESUME_STAGGER_MS))
    }
    await handleClaudeSessionRestartRequest(
      { limitedOnly: true, panes: [{ tabId: pane.tabId, leafId: pane.leafId }] },
      listAccounts
    ).catch((error: unknown) => {
      console.warn('[claude-auto-pick] resume failed:', error)
    })
  }
}

function announceAllFull(resumeAt: number): void {
  const time = new Date(resumeAt).toLocaleString(getIntlLocale(), {
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit'
  })
  toast.info(
    translate('prompt.claudeAccount.allLimitsFull', 'Every Claude account has reached its limit'),
    {
      description: translate(
        'prompt.claudeAccount.allLimitsFullReason',
        'Sessions stopped at the limit continue on their own at {{time}}, when the first one resets.',
        { time }
      )
    }
  )
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
