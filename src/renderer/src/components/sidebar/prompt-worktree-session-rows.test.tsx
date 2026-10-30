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
vi.mock('@/lib/worktree-activation', () => ({ activateAndRevealWorktree: vi.fn() }))
vi.mock('@/lib/activate-tab-and-focus-pane', () => ({ activateTabAndFocusPane: vi.fn() }))
vi.mock('./useWorktreeAgentRows', () => ({ useWorktreeAgentRows: () => agents }))
vi.mock('./WorktreeCardAgents', () => ({
  default: (props: Record<string, unknown>) => {
    agentProps.push(props)
    return null
  }
}))

function card(): WorktreeCardController {
  return {
    worktree: { id: 'wt-1', displayName: 'feature-x' },
    repo: { id: 'repo-1' },
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
    expect(agentProps[0]).toMatchObject({ expandAll: true, trailingLabel: undefined })
  })

  it('labels rows with the branch only when the project has several workspaces', async () => {
    const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
    state.worktreesByRepo = { 'repo-1': [{}, {}] }
    state.tabsByWorktree = { 'wt-1': [{ id: 't1', title: 'zsh' }] }
    const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
    expect(markup).toContain('feature/x')
    expect(agentProps[0]).toMatchObject({ trailingLabel: 'feature/x' })
  })

  it('offers a way in when the workspace has no sessions', async () => {
    const { PromptWorktreeSessionRows } = await import('./prompt-worktree-session-rows')
    const markup = renderToStaticMarkup(<PromptWorktreeSessionRows card={card()} />)
    expect(markup).toContain('data-prompt-terminal-row="empty"')
    expect(markup).toContain('Open a terminal')
  })
})
