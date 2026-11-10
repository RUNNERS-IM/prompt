import { describe, expect, it } from 'vitest'
import type { GitWorktreeInfo } from '../../shared/worktree/types'
import { mergeWorktree } from './worktree-metadata-merge'

const git: GitWorktreeInfo = {
  path: '/workspace/feature',
  head: 'abc123',
  branch: 'refs/heads/feature',
  isBare: false,
  isMainWorktree: false
}

describe('mergeWorktree identity projection', () => {
  it('re-derives an automatic display name from the current branch', () => {
    const worktree = mergeWorktree(
      'repo-1',
      { ...git, branch: 'refs/heads/main' },
      {
        displayName: 'feature',
        displayNameIsPinned: false,
        comment: '',
        linkedIssue: null,
        linkedPR: null,
        linkedLinearIssue: null,
        isArchived: false,
        isUnread: false,
        isPinned: false,
        sortOrder: 0,
        lastActivityAt: 0
      }
    )

    expect(worktree.displayName).toBe('main')
    expect(worktree.displayNameMode).toBe('automatic')
  })

  it('treats legacy CLI labels as fixed display names', () => {
    const worktree = mergeWorktree('repo-1', git, {
      displayName: 'feature',
      cliProvenance: { kind: 'created-by-cli', createdAt: 1 },
      comment: '',
      linkedIssue: null,
      linkedPR: null,
      linkedLinearIssue: null,
      isArchived: false,
      isUnread: false,
      isPinned: false,
      sortOrder: 0,
      lastActivityAt: 0
    })

    expect(worktree.displayNameMode).toBe('fixed')
  })

  it('names a linked worktree without a branch after its folder, not the project', () => {
    const worktree = mergeWorktree(
      'repo-1',
      { ...git, path: '/workspace/runners-web-sheet.noindex', branch: '' },
      undefined,
      '러너스'
    )

    expect(worktree.displayName).toBe('runners-web-sheet.noindex')
  })

  it('keeps the project name for a main worktree without a branch', () => {
    const worktree = mergeWorktree(
      'repo-1',
      { ...git, path: '/Users/me/sense', branch: '', isMainWorktree: true },
      undefined,
      '센스'
    )

    expect(worktree.displayName).toBe('센스')
  })
})
