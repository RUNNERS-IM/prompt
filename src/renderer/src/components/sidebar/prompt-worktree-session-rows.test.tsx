import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorktreeCardController } from './use-worktree-card-controller'

let state: Record<string, unknown> = {}
let agents: { tab: { id: string } }[] = []
const agentProps: Record<string, unknown>[] = []

vi.mock('@/store', () => ({
  useAppStore: Object.assign((selector: (s: unknown) => unknown) => selector(state), {
    getState: () => state
  })
}))
vi.mock('@/lib/worktree-activation', () => ({
  activateAndRevealWorktree: vi.fn()
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
    agents = [{ tab: { id: 't2' } }]
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
})
