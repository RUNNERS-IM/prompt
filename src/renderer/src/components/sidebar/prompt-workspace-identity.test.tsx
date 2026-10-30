import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Repo } from '../../../../shared/repo-types'

let state: Record<string, unknown> = {}

vi.mock('@/store', () => ({
  useAppStore: (selector: (s: unknown) => unknown) => selector(state)
}))
vi.mock('./use-worktree-activity-status', () => ({ useWorktreeActivityStatus: () => 'active' }))
vi.mock('./StatusIndicator', () => ({
  default: ({ status }: { status: string }) => <span data-status-dot={status} />
}))

const gitRepo = { id: 'repo-1', kind: 'git' } as unknown as Repo
const main = { id: 'wt-1', branch: 'refs/heads/sense', path: '/src/sense', isMainWorktree: true }

describe('PromptProjectHeaderIdentity', () => {
  beforeEach(() => {
    state = { worktreesByRepo: { 'repo-1': [main] } }
  })

  it('puts the only workspace on the header line: dot, Default chip, branch in mono grey', async () => {
    const { PromptProjectHeaderIdentity } = await import('./prompt-workspace-identity')
    const markup = renderToStaticMarkup(<PromptProjectHeaderIdentity repo={gitRepo} />)
    expect(markup).toContain('data-status-dot="active"')
    expect(markup).toContain('data-prompt-default-chip')
    expect(markup).toMatch(/font-mono[^>]*>sense</)
  })

  it('shows nothing on the header when the project has several workspaces', async () => {
    const { PromptProjectHeaderIdentity } = await import('./prompt-workspace-identity')
    state = { worktreesByRepo: { 'repo-1': [main, { ...main, id: 'wt-2' }] } }
    expect(renderToStaticMarkup(<PromptProjectHeaderIdentity repo={gitRepo} />)).toBe('')
  })

  it('uses the folder name for a folder project and no Default chip', async () => {
    const { promptWorkspaceLocationLabel } = await import('./prompt-workspace-identity')
    const folder = { id: 'repo-2', kind: 'folder' } as unknown as Repo
    expect(
      promptWorkspaceLocationLabel({ ...main, path: '/Users/me/runners' } as never, folder)
    ).toBe('runners')
  })
})
