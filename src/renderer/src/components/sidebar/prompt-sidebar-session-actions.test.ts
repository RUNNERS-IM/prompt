import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Worktree } from '../../../../shared/worktree/types'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  activate: vi.fn(),
  dispatch: vi.fn(),
  closeTerminalTab: vi.fn(),
  resolveShortcut: vi.fn(),
  launch: vi.fn(),
  webActive: vi.fn(),
  webCreate: vi.fn(),
  focus: vi.fn(),
  persistOrder: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: mocks.activate
}))
vi.mock('@/lib/workspace-tab-commands', () => ({
  dispatchWorkspaceTabCommand: mocks.dispatch
}))
vi.mock('@/lib/focus-terminal-tab-surface', () => ({
  focusTerminalTabSurface: mocks.focus
}))
vi.mock('@/lib/browser-uuid', () => ({ createBrowserUuid: () => 'new-tab' }))
vi.mock('@/lib/launch-agent-tab-order', () => ({
  persistAgentLaunchTabOrder: mocks.persistOrder
}))
vi.mock('@/runtime/web-runtime-terminal-creation', () => ({
  createWebRuntimeSessionTerminal: mocks.webCreate
}))
vi.mock('@/runtime/web-runtime-session-environment', () => ({
  isWebRuntimeSessionActive: mocks.webActive
}))
vi.mock('@/components/terminal/terminal-tab-actions', () => ({
  closeTerminalTab: mocks.closeTerminalTab
}))
vi.mock('@/components/terminal-agent-tab-shortcut', () => ({
  resolveTerminalAgentTabShortcut: mocks.resolveShortcut
}))
vi.mock('@/components/agent-tab-shortcut-launch', () => ({
  launchAgentTabShortcut: mocks.launch
}))
vi.mock('@/components/terminal-workspace-model', () => ({
  getActiveWorktreeRuntimeEnvironmentId: () => null
}))

import {
  closePromptSession,
  promptHeaderTargetWorktree,
  setPromptSessionColor,
  startPromptClaudeSession,
  startPromptTerminal
} from './prompt-sidebar-session-actions'

describe('prompt sidebar session actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.activate.mockReturnValue({ primaryTabId: null })
    mocks.webActive.mockReturnValue(false)
    mocks.state = {
      keybindings: { custom: true },
      activeWorktreeId: 'wt-1',
      activeGroupIdByWorktree: {},
      groupsByWorktree: { 'wt-1': [{ id: 'group-1' }] },
      unifiedTabsByWorktree: {
        'wt-1': [{ id: 'unified-1', entityId: 'term-1', contentType: 'terminal' }]
      },
      terminalLayoutsByTabId: { 'term-1': { activeLeafId: 'leaf-1' } },
      openNewTerminalTabInActiveWorkspace: vi.fn(),
      createTab: vi.fn(),
      setActiveTabType: vi.fn(),
      setTabColor: vi.fn()
    }
  })

  it('aims a project header "+" at the main workspace, else the first one', () => {
    const a = { id: 'a', isMainWorktree: false } as Worktree
    const b = { id: 'b', isMainWorktree: true } as Worktree
    expect(promptHeaderTargetWorktree([a, b])?.id).toBe('b')
    expect(promptHeaderTargetWorktree([a])?.id).toBe('a')
    expect(promptHeaderTargetWorktree([])).toBeUndefined()
  })

  it('closes a session through the same tab close command as ⌘W, by its unified tab id', () => {
    closePromptSession('wt-1', 'term-1')
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: 'close',
      target: { kind: 'tab', worktreeId: 'wt-1', tabId: 'unified-1' }
    })
    expect(mocks.closeTerminalTab).not.toHaveBeenCalled()
  })

  it('falls back to the terminal close when the unified tab is not there yet', () => {
    closePromptSession('wt-1', 'term-9')
    expect(mocks.dispatch).not.toHaveBeenCalled()
    expect(mocks.closeTerminalTab).toHaveBeenCalledWith('term-9')
  })

  it('starts a Claude session the way the new-agent-tab shortcut does, in that workspace', () => {
    const shortcut = { actionId: 'tab.newAgent', agent: 'claude' }
    mocks.resolveShortcut.mockReturnValue(shortcut)
    startPromptClaudeSession('wt-2')
    expect(mocks.activate).toHaveBeenCalledWith('wt-2')
    const args = mocks.resolveShortcut.mock.calls[0][0]
    expect(args.activeWorktreeId).toBe('wt-2')
    expect(args.keybindings).toEqual({ custom: true })
    expect(args.matchShortcut('tab.newAgent')).toBe(true)
    expect(args.matchShortcut('tab.newTerminal')).toBe(false)
    expect(mocks.launch).toHaveBeenCalledWith('wt-2', shortcut, expect.any(Function))
    const isCurrent = mocks.launch.mock.calls[0][2] as () => boolean
    expect(isCurrent()).toBe(false)
    mocks.state.activeWorktreeId = 'wt-2'
    expect(isCurrent()).toBe(true)
  })

  it('does nothing when the workspace cannot be opened', () => {
    mocks.activate.mockReturnValue(false)
    startPromptClaudeSession('gone')
    startPromptTerminal('gone')
    expect(mocks.launch).not.toHaveBeenCalled()
    expect(mocks.state.openNewTerminalTabInActiveWorkspace).not.toHaveBeenCalled()
  })

  it('opens a new terminal in the workspace group, like ⌘T', () => {
    startPromptTerminal('wt-1')
    expect(mocks.activate).toHaveBeenCalledWith('wt-1')
    expect(mocks.state.openNewTerminalTabInActiveWorkspace).toHaveBeenCalledWith('group-1')
  })

  it('creates the terminal tab directly when the workspace has no group yet', () => {
    startPromptTerminal('wt-3')
    expect(mocks.state.createTab).toHaveBeenCalledWith('wt-3', undefined, undefined, {
      id: 'new-tab'
    })
    expect(mocks.state.setActiveTabType).toHaveBeenCalledWith('terminal', 'wt-3')
    expect(mocks.persistOrder).toHaveBeenCalledWith('wt-3', 'new-tab')
    expect(mocks.focus).toHaveBeenCalledWith('new-tab')
  })

  it('asks the host for the terminal in a web runtime session', () => {
    mocks.webActive.mockReturnValue(true)
    startPromptTerminal('wt-1')
    expect(mocks.webCreate).toHaveBeenCalledWith(
      {
        worktreeId: 'wt-1',
        environmentId: null,
        targetGroupId: 'group-1',
        activate: true
      },
      { userAct: true }
    )
    expect(mocks.state.openNewTerminalTabInActiveWorkspace).not.toHaveBeenCalled()
  })

  it('sets the tab color through the store', () => {
    setPromptSessionColor('term-1', '#3b82f6')
    expect(mocks.state.setTabColor).toHaveBeenCalledWith('term-1', '#3b82f6')
  })
})
