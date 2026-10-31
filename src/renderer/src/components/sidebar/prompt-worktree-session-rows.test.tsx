import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorktreeCardController } from './use-worktree-card-controller'

let state: Record<string, unknown> = {}
type FakeAgent = {
  paneKey: string
  tab: { id: string }
  entry: { orchestration?: { parentPaneKey?: string } }
}
let agents: FakeAgent[] = []
const agent = (paneKey: string, tabId: string, parentPaneKey?: string): FakeAgent => ({
  paneKey,
  tab: { id: tabId },
  entry: parentPaneKey ? { orchestration: { parentPaneKey } } : {}
})
const agentProps: Record<string, unknown>[] = []

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (s: unknown) => unknown) => selector(state), {
    getState: () => state
  })
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
}))
vi.mock('../tab-bar/web-runtime-tab-move-mirror', () => ({
  mirrorWebRuntimeTabMove: vi.fn()
}))
vi.mock('../tab-group/tab-group-layout-owner-commands', () => ({
  dropTabThroughLayoutOwner: vi.fn(() => false)
}))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({
  activateTabAndFocusPane: vi.fn()
}))
vi.mock('./useWorktreeAgentRows', () => ({
  useWorktreeAgentRows: () => agents
}))
vi.mock('./use-worktree-activity-status', () => ({
  useWorktreeActivityStatus: () => 'active'
}))
vi.mock('./StatusIndicator', () => ({
  default: ({ status }: { status: string }) => <span data-status-dot={status} />
}))
vi.mock('./prompt-sidebar-new-menu', () => ({
  PROMPT_WORKSPACE_ROW_GROUP_CLASS: 'group/prompt-workspace-row',
  PromptNewSessionMenuButton: ({ worktreeId }: { worktreeId: string }) => (
    <span data-new-menu-for={worktreeId} />
  )
}))
vi.mock('./prompt-session-row-menu', () => ({
  PromptSessionRowMenu: ({
    tab,
    name,
    children
  }: {
    tab: { id: string }
    name: string
    children: unknown
  }) => (
    <div data-row-menu={tab.id} data-row-menu-name={name}>
      {children as never}
    </div>
  )
}))
vi.mock('./WorktreeCardAgents', () => ({
  default: (props: Record<string, unknown>) => {
    agentProps.push(props)
    return null
  }
}))

function card(): WorktreeCardController {
  return {
    worktree: {
      id: 'wt-1',
      displayName: 'feature-x',
      branch: 'refs/heads/feature/x',
      path: '/src/app',
      isMainWorktree: true
    },
    repo: { id: 'repo-1', kind: 'git' },
    branchIdentityDisplay: 'feature/x'
  } as unknown as WorktreeCardController
}

describe('PromptWorktreeSessionRows', () => {
  beforeEach(() => {
    agents = []
    agentProps.length = 0
    state = { worktreesByRepo: { 'repo-1': [{}] }, tabsByWorktree: {} }
  })

  it('shows one row per plain terminal, named like its tab', async () => {
    const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
    state.tabsByWorktree = {
      'wt-1': [
        { id: 't1', title: 'zsh', customTitle: 'Build server' },
        { id: 't2', title: 'claude', customTitle: null }
      ]
    }
    agents = [agent('t2:1', 't2')]
    const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
    expect(markup).toContain('Build server')
    expect(markup).not.toContain('>claude<')
    expect(agentProps[0]).toMatchObject({ expandAll: true })
    expect(agentProps[0].trailingLabel).toBeUndefined()
  })

  it('keeps a one-workspace project to its header: no workspace row here', async () => {
    const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
    state.tabsByWorktree = { 'wt-1': [{ id: 't1', title: 'zsh' }] }
    const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
    expect(markup).not.toContain('data-prompt-workspace-row')
    expect(markup).not.toContain('feature/x')
  })

  it('with several workspaces, shows one workspace line with its branch, dot and Default chip', async () => {
    const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
    state.worktreesByRepo = { 'repo-1': [{}, {}] }
    state.tabsByWorktree = { 'wt-1': [{ id: 't1', title: 'zsh' }] }
    agents = [agent('t1:1', 't1')]
    const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
    expect(markup).toContain('data-prompt-workspace-row')
    expect(markup).toMatch(
      /data-prompt-workspace-row[^>]*>.*feature-x.*data-status-dot.*primary.*feature\/x/s
    )
    expect(agentProps[0].trailingLabel).toBeUndefined()
  })

  it('offers a way in when the workspace has no sessions', async () => {
    const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
    const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
    expect(markup).toContain('data-prompt-terminal-row="empty"')
    expect(markup).toContain('Open a terminal')
  })

  it('gives each terminal row its right-click menu and hover ×, labeled by its name', async () => {
    const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
    state.tabsByWorktree = { 'wt-1': [{ id: 't1', title: 'zsh' }] }
    const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
    expect(markup).toContain('data-row-menu="t1" data-row-menu-name="zsh"')
  })

  it('calls a just-launched Claude tab "New Session" until it has a name', async () => {
    const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
    state.tabsByWorktree = {
      'wt-1': [
        {
          id: 't1',
          title: 'Terminal 2',
          defaultTitle: 'Terminal 2',
          launchAgent: 'claude'
        },
        { id: 't2', title: 'Terminal 3', defaultTitle: 'Terminal 3' }
      ]
    }
    const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
    expect(markup).toContain('New Session')
    expect(markup).toContain('Terminal 3')
    expect(markup).not.toContain('Terminal 2')
  })

  it('puts the "+" menu on a workspace line, aimed at that workspace', async () => {
    const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
    state.worktreesByRepo = { 'repo-1': [{}, {}] }
    const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
    expect(markup).toMatch(/data-prompt-workspace-row[^>]*>.*data-new-menu-for="wt-1"/s)
    expect(markup).toContain('group/prompt-workspace-row')
  })

  describe('order and drag (decision 1C)', () => {
    const unified = (id: string, entityId: string, contentType = 'terminal') => ({
      id,
      entityId,
      contentType,
      groupId: 'g1'
    })

    function seedTabBar(tabOrder: string[]): void {
      state.tabsByWorktree = {
        'wt-1': [
          { id: 't1', title: 'one', sortOrder: 0 },
          { id: 't2', title: 'two', sortOrder: 1 },
          { id: 't3', title: 'three', sortOrder: 2 }
        ]
      }
      state.unifiedTabsByWorktree = {
        'wt-1': [
          unified('u1', 't1'),
          unified('u2', 't2'),
          unified('u3', 't3'),
          unified('/src/app/README.md', '/src/app/README.md', 'editor')
        ]
      }
      state.groupsByWorktree = { 'wt-1': [{ id: 'g1', worktreeId: 'wt-1', tabOrder }] }
      state.reorderUnifiedTabs = vi.fn((groupId: string, next: string[]) => {
        const groups = (state.groupsByWorktree as Record<string, { id: string }[]>)['wt-1']
        state.groupsByWorktree = {
          'wt-1': groups.map((group) =>
            group.id === groupId ? { ...group, tabOrder: next } : group
          )
        }
      })
      state.reorderTabs = vi.fn((worktreeId: string, ids: string[]) => {
        const current = (state.tabsByWorktree as Record<string, { id: string }[]>)[worktreeId]
        state.tabsByWorktree = {
          [worktreeId]: ids.map((id, sortOrder) => ({
            ...current.find((tab) => tab.id === id),
            sortOrder
          }))
        }
      })
    }

    function rowOrder(markup: string): string[] {
      return [...markup.matchAll(/data-prompt-session-drag-item="([^"]+)"/g)].map((m) => m[1])
    }

    it('lists sessions in the tab bar order, not by start time', async () => {
      const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
      seedTabBar(['u3', '/src/app/README.md', 'u1', 'u2'])
      const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
      expect(rowOrder(markup)).toEqual(['t3', 't1', 't2'])
    })

    it('a drop reorders the tab bar and the terminals, keeping the editor tab in its place', async () => {
      const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
      const { handlePromptSessionDragEnd } = await import('./prompt-session-row-drag')
      seedTabBar(['u1', '/src/app/README.md', 'u2', 'u3'])
      const moved = handlePromptSessionDragEnd('wt-1', ['t1', 't2', 't3'], {
        active: { id: 't3' },
        over: { id: 't1' }
      } as never)
      expect(moved).toBe(true)
      expect(state.reorderUnifiedTabs).toHaveBeenCalledWith('g1', [
        'u3',
        '/src/app/README.md',
        'u1',
        'u2'
      ])
      expect(
        (state.tabsByWorktree as Record<string, { id: string }[]>)['wt-1'].map((tab) => tab.id)
      ).toEqual(['t3', 't1', 't2'])
      const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
      expect(rowOrder(markup)).toEqual(['t3', 't1', 't2'])
    })

    it('releasing outside the workspace changes nothing', async () => {
      const { handlePromptSessionDragEnd } = await import('./prompt-session-row-drag')
      seedTabBar(['u1', 'u2', 'u3'])
      const moved = handlePromptSessionDragEnd('wt-1', ['t1', 't2', 't3'], {
        active: { id: 't3' },
        over: null
      } as never)
      expect(moved).toBe(false)
      expect(state.reorderUnifiedTabs).not.toHaveBeenCalled()
      expect(state.reorderTabs).not.toHaveBeenCalled()
    })

    it('moves a tab as one item: its split-pane agents and a helper drawn under it', async () => {
      const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
      seedTabBar(['u2', 'u1', 'u3'])
      agents = [agent('t1:1', 't1'), agent('t1:2', 't1'), agent('t3:1', 't3', 't1:1')]
      const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
      expect(rowOrder(markup)).toEqual(['t2', 't1'])
      expect(agentProps).toHaveLength(1)
      expect((agentProps[0].agents as FakeAgent[]).map((row) => row.paneKey)).toEqual([
        't1:1',
        't1:2',
        't3:1'
      ])
    })
  })
})
