import React from 'react'
import { useAppStore } from '@/store'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import WorktreeContextMenu from './WorktreeContextMenu'

const EMPTY_WORKTREES: readonly Worktree[] = []

/**
 * Prompt two-level sidebar: the workspace row is gone, so its right-click menu (rename, status,
 * sleep, close terminals, project grouping, remove …) moves to the project header. It targets the
 * project's main worktree, or its first one when no main worktree is listed.
 */
export function PromptProjectHeaderContextMenu({
  repo,
  children
}: {
  repo: Repo
  children: React.ReactNode
}): React.JSX.Element {
  const worktrees = useAppStore((s) => s.worktreesByRepo?.[repo.id] ?? EMPTY_WORKTREES)
  const target = worktrees.find((worktree) => worktree.isMainWorktree) ?? worktrees[0]
  if (!target) {
    return <>{children}</>
  }
  return <WorktreeContextMenu worktree={target}>{children}</WorktreeContextMenu>
}

/** Wraps a project header so right-click opens the workspace menu (Prompt two-level sidebar). */
export function withPromptProjectHeaderMenu(
  repo: Repo | undefined,
  header: React.JSX.Element
): React.JSX.Element {
  return repo ? (
    <PromptProjectHeaderContextMenu repo={repo}>{header}</PromptProjectHeaderContextMenu>
  ) : (
    header
  )
}
