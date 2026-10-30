import React from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { isFolderRepo } from '../../../../shared/repo-kind'
import { getWorktreeGitIdentityDisplay } from '../../../../shared/worktree/git-identity-display'
import StatusIndicator from './StatusIndicator'
import { useWorktreeActivityStatus } from './use-worktree-activity-status'
import { isPromptTwoLevelSidebar } from './prompt-sidebar-layout'
import { RepoScanUnavailableIndicator } from './worktree-list/rows/RepoScanUnavailableIndicator'

/** Branch name, or the folder's name for a folder project; '' when neither is known. */
export function promptWorkspaceLocationLabel(worktree: Worktree, repo: Repo | undefined): string {
  if (repo && isFolderRepo(repo)) {
    const parts = worktree.path.split(/[\\/]+/).filter(Boolean)
    return parts.at(-1) ?? ''
  }
  const identity = getWorktreeGitIdentityDisplay(worktree)
  return identity?.kind === 'branch' ? identity.branchName : ''
}

/**
 * Prompt sidebar: what used to fill the workspace row and the branch line, packed onto one line —
 * the connection dot, the "Default" chip for the original clone, and the branch or folder name in
 * small grey monospace.
 */
export function PromptWorkspaceIdentity({
  worktree,
  repo,
  className
}: {
  worktree: Worktree
  repo: Repo | undefined
  className?: string
}): React.JSX.Element {
  const status = useWorktreeActivityStatus(worktree.id)
  const location = promptWorkspaceLocationLabel(worktree, repo)
  const isDefault = worktree.isMainWorktree && !(repo && isFolderRepo(repo))
  return (
    <span
      className={cn('flex min-w-0 shrink items-center gap-1.5', className)}
      data-prompt-workspace-identity=""
    >
      <StatusIndicator status={status} tooltipSide="right" />
      {isDefault ? (
        <span
          className="shrink-0 rounded border border-foreground/20 bg-foreground/[0.06] px-1 text-[10px] leading-[14px] text-foreground/70"
          data-prompt-default-chip=""
        >
          {translate('auto.components.sidebar.WorktreeCard.7d517f82e2', 'primary')}
        </span>
      ) : null}
      {location ? (
        <span
          className="min-w-0 truncate font-mono text-[10px] text-muted-foreground/70"
          title={location}
          data-prompt-workspace-location=""
        >
          {location}
        </span>
      ) : null}
    </span>
  )
}

const NO_WORKTREES: readonly Worktree[] = []

/** Project header end: the identity of the project's only workspace; nothing when it has several. */
export function PromptProjectHeaderIdentity({ repo }: { repo: Repo }): React.JSX.Element | null {
  const worktrees = useAppStore(useShallow((s) => s.worktreesByRepo?.[repo.id] ?? NO_WORKTREES))
  if (worktrees.length !== 1) {
    return null
  }
  return <PromptWorkspaceIdentity worktree={worktrees[0]} repo={repo} className="ml-auto" />
}

/** End of a repo header line: the upstream scan warning, then (two-level sidebar) the workspace marks. */
export function PromptRepoHeaderEnd({ repo }: { repo: Repo }): React.JSX.Element {
  return (
    <>
      <RepoScanUnavailableIndicator repo={repo} />
      {isPromptTwoLevelSidebar() ? <PromptProjectHeaderIdentity repo={repo} /> : null}
    </>
  )
}
