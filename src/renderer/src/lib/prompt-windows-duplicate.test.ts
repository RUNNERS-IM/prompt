import { beforeEach, describe, expect, it, vi } from 'vitest'

const WT = 'wt-1'
const COMMAND = 'claude --resume fb734d47-9c9f-462d-a948-faab45a52682 --fork-session'

const mocks = vi.hoisted(() => {
  const state = {
    tabBarOrderByWorktree: {} as Record<string, string[]>,
    createTab: vi.fn(),
    setActiveTabType: vi.fn(),
    setActiveTab: vi.fn(),
    setTabBarOrder: vi.fn((worktreeId: string, order: string[]) => {
      state.tabBarOrderByWorktree[worktreeId] = order
    })
  }
  return { state, reveal: vi.fn(), focus: vi.fn() }
})

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/workspace-surface-reveal', () => ({ revealWorkspaceSurface: mocks.reveal }))
vi.mock('@/hooks/ipc-events/terminal-command-state', () => ({
  focusTerminalInitiatedTab: mocks.focus
}))
// A new tab first lands at the end of the order, as persistAgentLaunchTabOrder does.
vi.mock('@/lib/launch-agent-tab-order', () => ({
  persistAgentLaunchTabOrder: (worktreeId: string, tabId: string) => {
    const order = mocks.state.tabBarOrderByWorktree[worktreeId] ?? []
    mocks.state.tabBarOrderByWorktree[worktreeId] = [...order, tabId]
  }
}))

import { duplicatePromptSession } from './prompt-windows'

describe('duplicatePromptSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.state.tabBarOrderByWorktree = { [WT]: ['a', 'b', 'c'] }
    mocks.state.createTab.mockReturnValue({ id: 'copy' })
  })

  it('starts the copy in a new tab right after the source tab and shows it', () => {
    expect(duplicatePromptSession(WT, 'a', COMMAND)).toBe('copy')
    expect(mocks.state.createTab).toHaveBeenCalledWith(WT, undefined, undefined, {
      pendingStartup: { command: COMMAND }
    })
    expect(mocks.state.tabBarOrderByWorktree[WT]).toEqual(['a', 'copy', 'b', 'c'])
    expect(mocks.state.setActiveTab).toHaveBeenCalledWith('copy')
  })

  it('leaves the copy at the end when the source tab is not in the order', () => {
    duplicatePromptSession(WT, 'gone', COMMAND)
    expect(mocks.state.tabBarOrderByWorktree[WT]).toEqual(['a', 'b', 'c', 'copy'])
  })

  it('does nothing for a command that is not a session copy', () => {
    expect(duplicatePromptSession(WT, 'a', 'rm -rf ~')).toBeNull()
    expect(mocks.state.createTab).not.toHaveBeenCalled()
  })
})
