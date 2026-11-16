import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaudeResumeFailure } from './claude-resume-failure'
import {
  announceRestart,
  resetClaudeAccountRestartToastForTests
} from './claude-account-restart-toast'

const store = vi.hoisted(() => ({ pendingPaneAccountRestarts: {} as Record<string, string> }))
const failures = vi.hoisted(() => ({ list: [] as ClaudeResumeFailure[] }))
const toast = vi.hoisted(() => ({
  loading: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  warning: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => store, subscribe: () => () => {} } }))
vi.mock('sonner', () => ({ toast }))
vi.mock('@/components/ui/sonner', () => ({ INLINE_ACTION_CLASS_NAMES: {} }))
vi.mock('./claude-resume-failure', () => ({
  getClaudeResumeFailures: () => failures.list,
  subscribeClaudeResumeFailures: () => () => {}
}))

const pane = (n: number) => ({ ptyId: `pty-${n}`, tabId: `tab-${n}`, leafId: `leaf-${n}` })

describe('announceRestart', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    resetClaudeAccountRestartToastForTests()
    store.pendingPaneAccountRestarts = {}
    failures.list = []
  })

  afterEach(() => {
    resetClaudeAccountRestartToastForTests()
    vi.useRealTimers()
  })

  it('shows one toast for every restart and adds later sessions to it', () => {
    store.pendingPaneAccountRestarts = { 'pty-1': 'claude', 'pty-2': 'claude', 'pty-3': 'claude' }
    announceRestart([pane(1), pane(2)], 'b@example.com', 0, undefined)
    announceRestart([pane(2), pane(3)], 'b@example.com', 0, undefined)

    expect(toast.loading).toHaveBeenLastCalledWith(
      'Restarting 3 Claude sessions on b@example.com',
      expect.objectContaining({ id: 'claude-account-restart' })
    )
    expect(new Set(toast.loading.mock.calls.map(([, options]) => options.id)).size).toBe(1)
  })

  it('turns into the result once every session has run, and closes after 5 seconds', () => {
    store.pendingPaneAccountRestarts = { 'pty-1': 'claude', 'pty-2': 'claude' }
    announceRestart([pane(1), pane(2)], 'b@example.com', 0, undefined)
    vi.advanceTimersByTime(30_000)
    expect(toast.success).not.toHaveBeenCalled()

    store.pendingPaneAccountRestarts = {}
    vi.advanceTimersByTime(21_000)

    expect(toast.success).toHaveBeenCalledWith(
      'Restarted 2 Claude sessions on b@example.com',
      expect.objectContaining({ id: 'claude-account-restart', duration: 5_000 })
    )
  })

  it('counts sessions whose conversation did not come back as failed', () => {
    announceRestart([pane(1), pane(2), pane(3)], 'b@example.com', 0, undefined)
    failures.list = [
      { ...pane(2), startup: {} as ClaudeResumeFailure['startup'], failedAt: Date.now() + 1 }
    ]
    vi.advanceTimersByTime(21_000)

    expect(toast.warning).toHaveBeenCalledWith(
      'Restarted 2 Claude sessions · 1 failed',
      expect.objectContaining({ duration: 5_000 })
    )
  })

  it('stops waiting on sessions that are still mid-turn after two minutes', () => {
    store.pendingPaneAccountRestarts = { 'pty-2': 'claude' }
    announceRestart([pane(1), pane(2)], 'b@example.com', 0, undefined)
    vi.advanceTimersByTime(2 * 60_000 + 1_000)

    expect(toast.info).toHaveBeenCalledWith(
      expect.stringContaining('Restarted 1 of 2 Claude sessions'),
      expect.objectContaining({ duration: 5_000 })
    )
  })
})
