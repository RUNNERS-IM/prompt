import type { PersistedState } from '../../../shared/persisted-state-types'
import type { Repo } from '../../../shared/repo-types'
import type { RepoHostTarget } from '../../../shared/repo-host-identity'
import { getRepoExecutionHostId } from '../../../shared/execution-host'

export type RepoPathRelocationOperations = {
  state: Pick<PersistedState, 'repos'>
  bumpLocalWorktreeScanGeneration: (repoId: string) => void
  syncProjectHostSetupCompatibilityState: () => void
  scheduleSave: () => void
  hydrateRepo: (repo: Repo) => Repo
}

/** `path` with its `oldRoot` prefix swapped for `newRoot`; paths outside `oldRoot` are returned unchanged. */
export function relocatedPath(path: string, oldRoot: string, newRoot: string): string {
  if (path === oldRoot) {
    return newRoot
  }
  for (const separator of ['/', '\\']) {
    const prefix = oldRoot.endsWith(separator) ? oldRoot : `${oldRoot}${separator}`
    if (path.startsWith(prefix)) {
      const rest = path.slice(prefix.length)
      return newRoot.endsWith(separator) ? `${newRoot}${rest}` : `${newRoot}${separator}${rest}`
    }
  }
  return path
}

/** Re-point a project row at another path to the same checkout. Id, name, color, icon, hooks and base ref stay. */
export function relocateRepoPathInState(
  operations: RepoPathRelocationOperations,
  target: RepoHostTarget,
  newPath: string,
  mapPath: (path: string) => string
): Repo | null {
  const hostId = getRepoExecutionHostId(target)
  const repo = operations.state.repos.find(
    (candidate) => candidate.id === target.id && getRepoExecutionHostId(candidate) === hostId
  )
  if (!repo) {
    return null
  }
  repo.path = newPath
  // Imported/baseline worktree paths under the old spelling would otherwise read as new, hidden worktrees.
  for (const key of [
    'importedExternalWorktreePaths',
    'externalWorktreeInboxBaselinePaths'
  ] as const) {
    const paths = repo[key]
    if (paths) {
      repo[key] = [...new Set(paths.map(mapPath))]
    }
  }
  operations.bumpLocalWorktreeScanGeneration(repo.id)
  operations.syncProjectHostSetupCompatibilityState()
  operations.scheduleSave()
  return operations.hydrateRepo(repo)
}
