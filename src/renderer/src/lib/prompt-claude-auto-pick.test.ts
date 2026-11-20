import { describe, expect, it, vi } from 'vitest'
import type { ClaudeRateLimitAccountsState } from '../../../shared/managed-account-types'
import type { ProviderRateLimits } from '../../../shared/rate-limit-types'

vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('sonner', () => ({ toast: { info: vi.fn() } }))

const { runClaudeAutoPick } = await import('./prompt-claude-auto-pick')

const NOW = 1_000_000
const HOUR = 3_600_000

const account = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  email: `${id}@example.com`,
  managedAuthRuntime: 'host' as const,
  wslDistro: null,
  authMethod: 'subscription-oauth' as const,
  createdAt: 1,
  updatedAt: 1,
  lastAuthenticatedAt: 1,
  ...extra
})

function roster(activeId: string, ...accounts: ReturnType<typeof account>[]) {
  return {
    accounts,
    activeAccountId: activeId,
    activeAccountIdsByRuntime: { host: activeId, wsl: {} }
  } as ClaudeRateLimitAccountsState
}

function limits(weekly: number, weeklyResetIn: number): ProviderRateLimits {
  return {
    provider: 'claude',
    session: { usedPercent: 10, windowMinutes: 300, resetsAt: NOW + HOUR, resetDescription: null },
    weekly: {
      usedPercent: weekly,
      windowMinutes: 10080,
      resetsAt: NOW + weeklyResetIn,
      resetDescription: null
    },
    updatedAt: NOW,
    error: null,
    status: 'ok'
  }
}

describe('runClaudeAutoPick', () => {
  it('switches to the account whose weekly limit resets soonest and reports it', async () => {
    const before = roster('a', account('a'), account('b'))
    const after = roster('b', account('a'), account('b'))
    const select = vi.fn(async () => after)
    const onSwitched = vi.fn()

    const picked = await runClaudeAutoPick({
      listAccounts: async () => before,
      select,
      readUsage: () => ({
        active: limits(30, 6 * 24 * HOUR),
        inactive: [
          { accountId: 'b', rateLimits: limits(70, 3 * HOUR), updatedAt: NOW, isFetching: false }
        ]
      }),
      onSwitched,
      now: () => NOW
    })

    expect(picked).toEqual({ accountId: 'b', rescued: false })
    expect(select).toHaveBeenCalledWith('b')
    expect(onSwitched).toHaveBeenCalledWith(before, after, false)
  })

  it('does not switch to an account that needs a sign-in', async () => {
    const select = vi.fn()
    const picked = await runClaudeAutoPick({
      listAccounts: async () => roster('a', account('a'), account('b', { needsSignIn: true })),
      select,
      readUsage: () => ({
        active: limits(30, 6 * 24 * HOUR),
        inactive: [
          { accountId: 'b', rateLimits: limits(70, 3 * HOUR), updatedAt: NOW, isFetching: false }
        ]
      }),
      onSwitched: vi.fn(),
      now: () => NOW
    })

    expect(picked).toBeNull()
    expect(select).not.toHaveBeenCalled()
  })

  describe('rescue mode (auto-pick off)', () => {
    const usage = (activeWeekly: number) => () => ({
      active: limits(activeWeekly, 6 * 24 * HOUR),
      inactive: [
        { accountId: 'b', rateLimits: limits(40, 5 * 24 * HOUR), updatedAt: NOW, isFetching: false }
      ]
    })

    it('stays on an account that still has room, even when another resets sooner', async () => {
      const select = vi.fn()
      const picked = await runClaudeAutoPick(
        {
          listAccounts: async () => roster('a', account('a'), account('b')),
          select,
          readUsage: usage(60),
          onSwitched: vi.fn(),
          now: () => NOW
        },
        { mode: 'rescue' }
      )

      expect(picked).toBeNull()
      expect(select).not.toHaveBeenCalled()
    })

    it('moves off a full account to one with room and marks it as a rescue', async () => {
      const before = roster('a', account('a'), account('b'))
      const after = roster('b', account('a'), account('b'))
      const onSwitched = vi.fn()
      const picked = await runClaudeAutoPick(
        {
          listAccounts: async () => before,
          select: vi.fn(async () => after),
          readUsage: usage(100),
          onSwitched,
          now: () => NOW
        },
        { mode: 'rescue' }
      )

      expect(picked).toEqual({ accountId: 'b', rescued: true })
      expect(onSwitched).toHaveBeenCalledWith(before, after, true)
    })

    it('trusts a session stopped at its limit before the usage reading shows 100%', async () => {
      const after = roster('b', account('a'), account('b'))
      const picked = await runClaudeAutoPick(
        {
          listAccounts: async () => roster('a', account('a'), account('b')),
          select: vi.fn(async () => after),
          readUsage: usage(97),
          onSwitched: vi.fn(),
          now: () => NOW
        },
        { mode: 'rescue', currentReportedFull: true }
      )

      expect(picked).toEqual({ accountId: 'b', rescued: true })
    })

    it('stays put when every other account is full too', async () => {
      const select = vi.fn()
      const picked = await runClaudeAutoPick(
        {
          listAccounts: async () => roster('a', account('a'), account('b')),
          select,
          readUsage: () => ({
            active: limits(100, 6 * 24 * HOUR),
            inactive: [
              {
                accountId: 'b',
                rateLimits: limits(100, 5 * 24 * HOUR),
                updatedAt: NOW,
                isFetching: false
              }
            ]
          }),
          onSwitched: vi.fn(),
          now: () => NOW
        },
        { mode: 'rescue', currentReportedFull: true }
      )

      expect(picked).toBeNull()
      expect(select).not.toHaveBeenCalled()
    })
  })

  it('in soonest mode a full current account loses even when it resets first', async () => {
    const after = roster('b', account('a'), account('b'))
    const picked = await runClaudeAutoPick(
      {
        listAccounts: async () => roster('a', account('a'), account('b')),
        select: vi.fn(async () => after),
        readUsage: () => ({
          active: limits(50, 2 * HOUR),
          inactive: [
            { accountId: 'b', rateLimits: limits(40, 5 * 24 * HOUR), updatedAt: NOW, isFetching: false }
          ]
        }),
        onSwitched: vi.fn(),
        now: () => NOW
      },
      { mode: 'soonest', currentReportedFull: true }
    )

    expect(picked).toEqual({ accountId: 'b', rescued: true })
  })
})
