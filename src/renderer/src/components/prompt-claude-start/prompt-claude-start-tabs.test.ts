import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  state: {} as Record<string, unknown>,
  storage: new Map<string, string>(),
  launch: vi.fn(),
  insertAfter: vi.fn(),
  persistOrder: vi.fn(),
  toastError: vi.fn()
}))

vi.mock('@/store', () => ({ useAppStore: { getState: () => mocks.state } }))
vi.mock('@/lib/browser-uuid', () => ({ createBrowserUuid: () => 'box-tab' }))
vi.mock('@/lib/launch-agent-tab-order', () => ({ persistAgentLaunchTabOrder: mocks.persistOrder }))
vi.mock('@/lib/launch-agent-in-new-tab', () => ({ launchAgentInNewTab: mocks.launch }))
vi.mock('@/lib/agent-launch-request-id', () => ({ newAgentLaunchRequestId: () => 'request-1' }))
vi.mock('@/lib/unified-tab-anchor-insertion', () => ({
  insertUnifiedTabAfterAnchor: mocks.insertAfter
}))
vi.mock('@/store/github/worktree-refresh', () => ({
  findWorktreeById: (_state: unknown, id: string) =>
    id === 'wt-1' || id === 'wt-2' ? { id, repoId: 'repo-a' } : null
}))
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }))

import {
  isPromptClaudeStartTab,
  openPromptClaudeStartTab,
  promptClaudeStartProjectKey,
  readPromptClaudeStartChoices,
  resetPromptClaudeStartTabsForTest,
  startPromptClaudeFromBox,
  writePromptClaudeStartChoices
} from './prompt-claude-start-tabs'

type FakeTab = { id: string }
let terminalTabs: FakeTab[]
let unifiedTabs: { id: string; entityId: string; groupId: string; contentType: string }[]

function addTab(id: string): void {
  terminalTabs.push({ id })
  unifiedTabs.push({ id: `u-${id}`, entityId: id, groupId: 'group-1', contentType: 'terminal' })
}

const createTab = vi.fn(
  (_worktreeId: string, _groupId?: string, _shell?: string, options?: { id?: string }) => {
    addTab(options?.id ?? 'unnamed')
    return { id: options?.id }
  }
)
const closeTab = vi.fn()
const setActiveTabType = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mocks.storage.clear()
  vi.stubGlobal('window', {
    localStorage: {
      getItem: (key: string) => mocks.storage.get(key) ?? null,
      setItem: (key: string, value: string) => mocks.storage.set(key, value)
    }
  })
  resetPromptClaudeStartTabsForTest()
  terminalTabs = []
  unifiedTabs = []
  mocks.state = {
    get tabsByWorktree() {
      return { 'wt-1': terminalTabs }
    },
    get unifiedTabsByWorktree() {
      return { 'wt-1': unifiedTabs }
    },
    createTab,
    closeTab,
    setActiveTabType
  }
})

describe('openPromptClaudeStartTab', () => {
  it('opens a Claude-labelled tab that shows the box instead of a shell', () => {
    expect(openPromptClaudeStartTab('wt-1', 'group-1')).toBe('box-tab')
    expect(createTab).toHaveBeenCalledWith('wt-1', 'group-1', undefined, {
      id: 'box-tab',
      launchAgent: 'claude'
    })
    expect(setActiveTabType).toHaveBeenCalledWith('terminal', 'wt-1')
    expect(mocks.persistOrder).toHaveBeenCalledWith('wt-1', 'box-tab')
    expect(isPromptClaudeStartTab('box-tab')).toBe(true)
  })

  it('remembers box tabs across a restart', () => {
    openPromptClaudeStartTab('wt-1', 'group-1')
    resetPromptClaudeStartTabsForTest()
    expect(isPromptClaudeStartTab('box-tab')).toBe(true)
    expect(isPromptClaudeStartTab('other')).toBe(false)
  })
})

describe('startPromptClaudeFromBox', () => {
  it('opens Claude with the picks where the box was and closes the box tab', () => {
    openPromptClaudeStartTab('wt-1', 'group-1')
    mocks.launch.mockImplementation(() => {
      addTab('claude-tab')
      return { surface: { kind: 'local-terminal', tabId: 'claude-tab' } }
    })

    const started = startPromptClaudeFromBox({
      tabId: 'box-tab',
      worktreeId: 'wt-1',
      launch: { sessionOptions: { model: 'opus' }, agentArgs: '--chrome' }
    })

    expect(started).toBe(true)
    expect(mocks.launch).toHaveBeenCalledWith({
      requestId: 'request-1',
      agent: 'claude',
      worktreeId: 'wt-1',
      groupId: 'group-1',
      sessionOptions: { model: 'opus' },
      agentArgs: '--chrome',
      launchSource: 'shortcut'
    })
    expect(mocks.insertAfter).toHaveBeenCalledWith('wt-1', 'u-claude-tab', 'u-box-tab')
    expect(closeTab).toHaveBeenCalledWith('box-tab', {
      recordInteraction: false,
      captureRecentlyClosed: false
    })
    expect(isPromptClaudeStartTab('box-tab')).toBe(false)
  })

  it('passes no flags for an untouched box', () => {
    openPromptClaudeStartTab('wt-1', 'group-1')
    mocks.launch.mockReturnValue({ surface: { kind: 'host-published' } })
    startPromptClaudeFromBox({ tabId: 'box-tab', worktreeId: 'wt-1', launch: {} })
    const args = mocks.launch.mock.calls[0]![0]
    expect(args).not.toHaveProperty('sessionOptions')
    expect(args).not.toHaveProperty('agentArgs')
    expect(mocks.insertAfter).not.toHaveBeenCalled()
    expect(closeTab).toHaveBeenCalledTimes(1)
  })

  it('keeps the box when the launch cannot be built', () => {
    openPromptClaudeStartTab('wt-1', 'group-1')
    mocks.launch.mockReturnValue(null)
    expect(startPromptClaudeFromBox({ tabId: 'box-tab', worktreeId: 'wt-1', launch: {} })).toBe(
      false
    )
    expect(mocks.toastError).toHaveBeenCalledTimes(1)
    expect(closeTab).not.toHaveBeenCalled()
    expect(isPromptClaudeStartTab('box-tab')).toBe(true)
  })
})

describe('remembered picks', () => {
  it('are shared by the worktrees of one project', () => {
    expect(promptClaudeStartProjectKey('wt-1')).toBe('repo-a')
    expect(promptClaudeStartProjectKey('folder-x')).toBe('folder-x')
    writePromptClaudeStartChoices('repo-a', {
      model: 'opus',
      effort: 'high',
      switches: { chrome: true }
    })
    expect(readPromptClaudeStartChoices(promptClaudeStartProjectKey('wt-2'))).toEqual({
      model: 'opus',
      effort: 'high',
      switches: { chrome: true }
    })
    expect(readPromptClaudeStartChoices('repo-b')).toEqual({
      model: null,
      effort: null,
      switches: {}
    })
  })

  it('survive unreadable storage', () => {
    mocks.storage.set('orca.prompt.claude-start.choices.v1', '{not json')
    expect(readPromptClaudeStartChoices('repo-a')).toEqual({
      model: null,
      effort: null,
      switches: {}
    })
  })
})
