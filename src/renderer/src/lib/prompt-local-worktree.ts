import type { AppState } from '@/store/types'
import { getRepoExecutionHostId, isLocalExecutionHost } from '../../../shared/execution-host'

/** True only when the workspace and its project run on this machine (not SSH, not a runtime host). */
export function isPromptLocalWorktree(
  state: Pick<AppState, 'repos' | 'getKnownWorktreeById'>,
  worktreeId: string
): boolean {
  const worktree = state.getKnownWorktreeById?.(worktreeId)
  if (!worktree) {
    return false
  }
  if (worktree.hostId && !isLocalExecutionHost(worktree.hostId)) {
    return false
  }
  const repo = (state.repos ?? []).find((candidate) => candidate.id === worktree.repoId)
  return repo ? isLocalExecutionHost(getRepoExecutionHostId(repo)) : false
}
