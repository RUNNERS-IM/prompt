import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  startupWorktreeRefreshCompleted: true,
  repos: [] as unknown[],
  folderWorkspaces: [] as unknown[]
}))

vi.mock('@/store', () => ({
  useAppStore: (select: (s: typeof state) => unknown) => select(state)
}))

import { SidebarWorktreeListEmptyState } from './EmptyState'

function renderEmptyState(projects: number): string {
  state.repos = Array.from({ length: projects }, (_, i) => ({ id: `repo-${i}` }))
  return renderToStaticMarkup(
    <SidebarWorktreeListEmptyState hasFilters onClearFilters={() => {}} />
  )
}

// A first launch showed "No workspaces found" and "Clear Filters" under an empty project list,
// though no filter can hide rows before any project exists.
describe('SidebarWorktreeListEmptyState', () => {
  it('says nothing about filters before the first project is added', () => {
    const html = renderEmptyState(0)
    expect(html).not.toContain('No workspaces found')
    expect(html).not.toContain('Clear Filters')
  })

  it('offers to clear filters once a project exists and filters hide every workspace', () => {
    const html = renderEmptyState(1)
    expect(html).toContain('No workspaces found')
    expect(html).toContain('Clear Filters')
  })
})
