import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { inspect, toastError, state } = vi.hoisted(() => ({
  inspect: vi.fn(),
  toastError: vi.fn(),
  state: {
    terminalLayoutsByTabId: { tab: { ptyIdsByLeafId: { leaf: 'pty' } } },
    tabsByWorktree: {},
    queuePaneAccountRestarts: vi.fn()
  }
}))

vi.mock('sonner', () => ({ toast: { error: toastError, dismiss: vi.fn() } }))
vi.mock('@/components/ui/sonner', () => ({ INLINE_ACTION_CLASS_NAMES: {} }))
vi.mock('@/i18n/i18n', () => ({ translate: (_key: string, fallback: string) => fallback }))
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/runtime/runtime-terminal-inspection', () => ({ inspectRuntimeTerminalProcess: inspect }))

import {
  getClaudeResumeFailures,
  retryClaudeResume,
  takeClaudeResumeRetryStartup,
  watchClaudeResumeStart
} from './claude-resume-failure'

const startup = {
  command: 'claude --resume id',
  startupCommandDelivery: 'shell-ready' as const,
  launchAgent: 'claude' as const
}
const pane = { tabId: 'tab', leafId: 'leaf', ptyId: 'pty', startup }

function foregroundSequence(names: string[]): void {
  let index = 0
  inspect.mockImplementation(async () => ({
    foregroundProcess: names[Math.min(index++, names.length - 1)]
  }))
}

describe('watchClaudeResumeStart', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    toastError.mockClear()
  })

  afterEach(() => {
    retryClaudeResume('pty')
    takeClaudeResumeRetryStartup('pty')
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('reports a Claude that exits back to the shell', async () => {
    foregroundSequence(['zsh', 'claude', 'zsh'])
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(4000)
    expect(getClaudeResumeFailures().map((failure) => failure.ptyId)).toEqual(['pty'])
    expect(toastError).toHaveBeenCalledOnce()
  })

  it('stays quiet once Claude keeps running', async () => {
    foregroundSequence(['zsh', 'claude'])
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(getClaudeResumeFailures()).toEqual([])
  })

  it('does not blame the resume for startup tools run by the shell profile', async () => {
    foregroundSequence(['zsh', 'git', 'zsh', 'claude'])
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(getClaudeResumeFailures()).toEqual([])
  })

  it('reports a shell that never starts Claude only at the deadline', async () => {
    foregroundSequence(['zsh'])
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(40_000)
    expect(getClaudeResumeFailures()).toEqual([])
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getClaudeResumeFailures()).toHaveLength(1)
  })

  it('retries with the startup that failed', async () => {
    foregroundSequence(['claude', 'zsh'])
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(4000)
    retryClaudeResume('pty')
    expect(state.queuePaneAccountRestarts).toHaveBeenCalledWith(['pty'], 'claude')
    expect(takeClaudeResumeRetryStartup('pty')).toBe(startup)
    expect(getClaudeResumeFailures()).toEqual([])
  })
})
