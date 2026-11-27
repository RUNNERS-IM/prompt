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
vi.mock('@/i18n/i18n', () => ({
  translate: (_key: string, fallback: string) => fallback
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => state } }))
vi.mock('@/runtime/runtime-terminal-inspection', () => ({
  inspectRuntimeTerminalProcess: inspect
}))

import {
  getClaudeResumeFailures,
  isClaudeResumeStartPending,
  retryClaudeResume,
  takeClaudeResumeRetryStartup,
  watchBareShellClaudeRestore,
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

const recordAgentResume = vi.fn(async () => {})

function recordedStages(): string[] {
  return recordAgentResume.mock.calls.map(
    (call) => (call as unknown as [{ stage: string }])[0].stage
  )
}

describe('watchClaudeResumeStart', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('window', globalThis)
    vi.stubGlobal('api', { diagnostics: { recordAgentResume } })
    toastError.mockClear()
    recordAgentResume.mockClear()
    state.queuePaneAccountRestarts.mockClear()
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

  it('treats a verified empty foreground as the shell', async () => {
    let polls = 0
    inspect.mockImplementation(async () =>
      polls++ === 0
        ? { foregroundProcess: 'claude' }
        : {
            foregroundProcess: null,
            foregroundProcessEvidence: { verdict: 'live' }
          }
    )
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(4000)
    expect(getClaudeResumeFailures()).toHaveLength(1)
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
    expect(isClaudeResumeStartPending('tab', 'leaf')).toBe(true)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(getClaudeResumeFailures()).toHaveLength(1)
    expect(isClaudeResumeStartPending('tab', 'leaf')).toBe(false)
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

  it('records a failed resume on this computer only', async () => {
    foregroundSequence(['zsh', 'claude', 'zsh'])
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(4000)
    expect(recordedStages()).toEqual(['resume-failed'])
  })

  it('reopens a bare-shell Claude tab once when it stays at the shell', async () => {
    foregroundSequence(['zsh'])
    watchBareShellClaudeRestore(pane)
    await vi.advanceTimersByTimeAsync(40_000)
    expect(state.queuePaneAccountRestarts).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(state.queuePaneAccountRestarts).toHaveBeenCalledWith(['pty'], 'claude')
    expect(takeClaudeResumeRetryStartup('pty')).toBe(startup)
    // 다시 연 탭은 기존 감시가 이어 받는다. 떴으면 회복으로 기록한다.
    foregroundSequence(['claude'])
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(recordedStages()).toEqual(['bare-shell-auto-retry', 'auto-retry-recovered'])
    expect(getClaudeResumeFailures()).toEqual([])
  })

  it('shows the retry row when the automatic reopen also fails', async () => {
    foregroundSequence(['zsh'])
    watchBareShellClaudeRestore(pane)
    await vi.advanceTimersByTimeAsync(50_000)
    takeClaudeResumeRetryStartup('pty')
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(50_000)
    expect(recordedStages()).toEqual(['bare-shell-auto-retry', 'auto-retry-failed'])
    expect(getClaudeResumeFailures()).toHaveLength(1)
    expect(toastError).toHaveBeenCalledOnce()
  })

  it('leaves a bare-shell tab alone once the user starts something', async () => {
    foregroundSequence(['zsh', 'claude'])
    watchBareShellClaudeRestore(pane)
    await vi.advanceTimersByTimeAsync(60_000)
    foregroundSequence(['zsh', 'vim'])
    watchBareShellClaudeRestore(pane)
    await vi.advanceTimersByTimeAsync(60_000)
    expect(state.queuePaneAccountRestarts).not.toHaveBeenCalled()
    expect(recordedStages()).toEqual([])
  })

  it('keeps working when the diagnostics bridge is missing', async () => {
    vi.stubGlobal('api', undefined)
    foregroundSequence(['zsh', 'claude', 'zsh'])
    watchClaudeResumeStart(pane)
    await vi.advanceTimersByTimeAsync(4000)
    expect(getClaudeResumeFailures()).toHaveLength(1)
  })
})
