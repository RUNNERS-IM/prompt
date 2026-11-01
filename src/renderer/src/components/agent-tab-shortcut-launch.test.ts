import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import type { TuiAgent } from '../../../shared/tui-agent'
import {
  launchAgentTabShortcut,
  launchFloatingWorkspaceAgentShortcut
} from './agent-tab-shortcut-launch'

const mocks = vi.hoisted(() => {
  const activeGroupIdByWorktree: Record<string, string> = {}
  return {
    state: {
      activeGroupIdByWorktree,
      groupsByWorktree: {},
      settings: { floatingTerminalEnabled: true },
      floatingWorkspacePanelOpen: true
    },
    launchAgentInNewTab: vi.fn(),
    cancelFocusIntent: vi.fn(),
    openStartTab: vi.fn(),
    webRuntimeActive: vi.fn(() => false)
  }
})

vi.mock('../store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: mocks.launchAgentInNewTab }))
vi.mock('@/components/native-chat/use-native-chat-composer-reveal-focus', () => ({
  captureNativeChatComposerFocusIntent: () => ({
    request: vi.fn(),
    cancel: mocks.cancelFocusIntent
  })
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), message: vi.fn() } }))
vi.mock('./prompt-claude-start/prompt-claude-start-tabs', () => ({
  openPromptClaudeStartTab: mocks.openStartTab
}))
vi.mock('@/runtime/web-runtime-session-environment', () => ({
  isWebRuntimeSessionActive: mocks.webRuntimeActive
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  runtimeEnvironmentIdOrLocalUnlessTwin: () => null
}))

function pendingDetection(): {
  pendingAgent: Promise<TuiAgent | null>
  settle: (agent: TuiAgent | null) => Promise<void>
} {
  let resolve: (agent: TuiAgent | null) => void = () => undefined
  const pendingAgent = new Promise<TuiAgent | null>((settle) => {
    resolve = settle
  })
  return {
    pendingAgent,
    settle: async (agent) => {
      resolve(agent)
      await pendingAgent
    }
  }
}

describe('launchFloatingWorkspaceAgentShortcut while detection is pending', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.launchAgentInNewTab.mockReturnValue({ surface: { kind: 'local-terminal', tabId: 't' } })
    mocks.state.activeGroupIdByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: 'group-a' }
    mocks.state.floatingWorkspacePanelOpen = true
  })

  it('opens the agent in the floating group the shortcut was pressed in', async () => {
    const detection = pendingDetection()
    launchFloatingWorkspaceAgentShortcut({ agent: null, pendingAgent: detection.pendingAgent })
    mocks.state.activeGroupIdByWorktree = { [FLOATING_TERMINAL_WORKTREE_ID]: 'group-b' }

    await detection.settle('claude')

    expect(mocks.launchAgentInNewTab).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        agent: 'claude',
        worktreeId: FLOATING_TERMINAL_WORKTREE_ID,
        groupId: 'group-a'
      })
    )
  })

  it('drops the launch when the panel closed before detection settled', async () => {
    const detection = pendingDetection()
    launchFloatingWorkspaceAgentShortcut({ agent: null, pendingAgent: detection.pendingAgent })
    mocks.state.floatingWorkspacePanelOpen = false

    await detection.settle('claude')

    expect(mocks.launchAgentInNewTab).not.toHaveBeenCalled()
    expect(mocks.cancelFocusIntent).toHaveBeenCalledTimes(1)
  })
})

describe('launchAgentTabShortcut for a new Claude session', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.webRuntimeActive.mockReturnValue(false)
    mocks.launchAgentInNewTab.mockReturnValue({ surface: { kind: 'local-terminal', tabId: 't' } })
    mocks.state.activeGroupIdByWorktree = { 'wt-1': 'group-a' }
  })

  it('opens the start box in the pressed pane instead of launching Claude', () => {
    launchAgentTabShortcut('wt-1', { agent: 'claude' }, () => true)
    expect(mocks.openStartTab).toHaveBeenCalledExactlyOnceWith('wt-1', 'group-a')
    expect(mocks.launchAgentInNewTab).not.toHaveBeenCalled()
    expect(mocks.cancelFocusIntent).toHaveBeenCalledTimes(1)
  })

  it('opens the box once a pending detection settles on Claude', async () => {
    const detection = pendingDetection()
    launchAgentTabShortcut(
      'wt-1',
      { agent: null, pendingAgent: detection.pendingAgent },
      () => true
    )
    await detection.settle('claude')
    expect(mocks.openStartTab).toHaveBeenCalledExactlyOnceWith('wt-1', 'group-a')
  })

  it('launches other agents straight away', () => {
    launchAgentTabShortcut('wt-1', { agent: 'codex' }, () => true)
    expect(mocks.openStartTab).not.toHaveBeenCalled()
    expect(mocks.launchAgentInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'codex', worktreeId: 'wt-1' })
    )
  })

  it("launches Claude straight away in a paired host's workspace", () => {
    mocks.webRuntimeActive.mockReturnValue(true)
    launchAgentTabShortcut('wt-1', { agent: 'claude' }, () => true)
    expect(mocks.openStartTab).not.toHaveBeenCalled()
    expect(mocks.launchAgentInNewTab).toHaveBeenCalledTimes(1)
  })

  it('launches Claude straight away in the floating panel', () => {
    launchFloatingWorkspaceAgentShortcut({ agent: 'claude' })
    expect(mocks.openStartTab).not.toHaveBeenCalled()
    expect(mocks.launchAgentInNewTab).toHaveBeenCalledWith(
      expect.objectContaining({ agent: 'claude', worktreeId: FLOATING_TERMINAL_WORKTREE_ID })
    )
  })
})
