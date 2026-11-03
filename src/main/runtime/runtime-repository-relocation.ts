import { stat } from 'node:fs/promises'
import { isAbsolute } from 'node:path'
import { getRepoExecutionHostId, LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { isFolderRepo } from '../../shared/repo-kind'
import type { Repo } from '../../shared/repo-types'
import {
  getRepoIdFromWorktreeId,
  getRepoMainWorktreeId,
  rewriteWorktreeIdPath
} from '../../shared/worktree/id'
import { inspectGitRepoForRegistrationAsync } from '../git/repo'
import { invalidateAuthorizedRootsCache } from '../ipc/registered-worktree-roots-cache'
import {
  hostWorktreeTargetForRepo,
  readAllWorktreeMetaForHost
} from '../persistence/host-qualified-worktree-meta'
import { assertWslMoveRepoWritable } from '../persistence/moving-wsl-projects/wsl-move-scope-guard'
import { relocatedPath } from '../persistence/tracking-repos/repo-path-relocation'
import { findProjectAtSameRealPath } from '../project-realpath-identity'
import type { RuntimeRepoSelector } from './runtime-repo-selector'
import type { RuntimeStore } from './runtime-store-contract'
import { runtimePathsEqual } from './runtime-worktree-path-identity'
import { runtimeRepoIsRegistrationCandidate } from './runtime-worktree-selection'
import { refuseWslHostWindowsDrivePath } from './wsl-host-windows-drive-guard'

export type RepoRelocationResult = {
  repo: Repo
  previousPath: string
  /** False when the project already used that path; nothing was written. */
  moved: boolean
  worktreeCount: number
  sessionTabCount: number
}

export type RepoRelocationDependencies = {
  getStore: () => RuntimeStore | null
  resolveRepo: (selector: RuntimeRepoSelector) => Promise<Repo>
  invalidateResolvedWorktrees: () => void
  invalidateWorktreeScan: (repoId: string) => void
  notifyReposChanged: () => void
  /** Re-keys renderer and client tab state so the id change is not read as a deletion. */
  notifyWorktreeRenamed?: (repoId: string, oldWorktreeId: string, newWorktreeId: string) => void
}

async function pathExists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false
  )
}

/** Resolve the new path the way `repo.add` does: git's toplevel for that folder. */
async function resolveRelocationTarget(repo: Repo, requestedPath: string): Promise<string> {
  if (!isAbsolute(requestedPath)) {
    throw new Error('Project path must be an absolute path')
  }
  await refuseWslHostWindowsDrivePath(requestedPath)
  if (!(await pathExists(requestedPath))) {
    throw new Error(`Path does not exist: ${requestedPath}`)
  }
  const gitInfo = await inspectGitRepoForRegistrationAsync(requestedPath)
  if (!gitInfo.isRepo) {
    throw new Error(`Not a valid git repository: ${requestedPath}`)
  }
  const newPath = gitInfo.rootPath
  if (runtimePathsEqual(repo.path, newPath)) {
    return newPath
  }
  // Same real folder (a symlink alias) is the only proof that this is the same checkout, not a clone or linked worktree.
  if (!(await findProjectAtSameRealPath([repo], newPath))) {
    if (!(await pathExists(repo.path))) {
      throw new Error(
        `The current path ${repo.path} no longer exists, so Prompt cannot confirm that ${newPath} is the same checkout.`
      )
    }
    throw new Error(
      `${newPath} is a different folder than ${repo.path}. A project can only be moved to another path that leads to the same checkout (for example through a symlink).`
    )
  }
  return newPath
}

function collectWorktreeIdMoves(
  store: RuntimeStore,
  repo: Repo,
  mapPath: (path: string) => string
): [string, string][] {
  const hostId = getRepoExecutionHostId(repo)
  const session = store.getWorkspaceSession?.(hostId)
  const candidates = new Set<string>([
    getRepoMainWorktreeId(repo),
    ...Object.keys(readAllWorktreeMetaForHost(store, hostId)),
    ...Object.keys(session?.tabsByWorktree ?? {}),
    ...Object.keys(session?.unifiedTabs ?? {})
  ])
  const moves: [string, string][] = []
  for (const worktreeId of candidates) {
    if (getRepoIdFromWorktreeId(worktreeId) !== repo.id) {
      continue
    }
    const next = rewriteWorktreeIdPath(worktreeId, mapPath)
    if (next !== worktreeId) {
      moves.push([worktreeId, next])
    }
  }
  return moves
}

function countSessionTabs(store: RuntimeStore, repo: Repo, worktreeIds: string[]): number {
  const session = store.getWorkspaceSession?.(getRepoExecutionHostId(repo))
  let count = 0
  for (const worktreeId of worktreeIds) {
    count +=
      session?.unifiedTabs?.[worktreeId]?.length ??
      session?.tabsByWorktree?.[worktreeId]?.length ??
      0
  }
  return count
}

/** `prompt project move`: point a project at another path to the same checkout and carry its worktree state along. */
export async function relocateRepository(
  deps: RepoRelocationDependencies,
  selector: RuntimeRepoSelector,
  requestedPath: string
): Promise<RepoRelocationResult> {
  const store = deps.getStore()
  if (!store?.relocateRepoPath || !store.migrateWorktreeIdentity) {
    throw new Error('runtime_unavailable')
  }
  const repo = await deps.resolveRepo(selector)
  assertWslMoveRepoWritable(store, repo)
  const hostId = getRepoExecutionHostId(repo)
  if (hostId !== LOCAL_EXECUTION_HOST_ID) {
    throw new Error('Only projects on this machine can be moved.')
  }
  if (isFolderRepo(repo)) {
    throw new Error('Only git projects can be moved. Remove the folder project and add it again.')
  }
  const previousPath = repo.path
  const newPath = await resolveRelocationTarget(repo, requestedPath)
  if (runtimePathsEqual(previousPath, newPath)) {
    return { repo, previousPath, moved: false, worktreeCount: 0, sessionTabCount: 0 }
  }
  // Re-read after the awaits: a concurrent add may have claimed the path meanwhile.
  const taken = store
    .getRepos()
    .find(
      (candidate) =>
        candidate.id !== repo.id &&
        runtimeRepoIsRegistrationCandidate(candidate, hostId) &&
        runtimePathsEqual(candidate.path, newPath)
    )
  if (taken) {
    throw new Error(
      `${newPath} is already used by the project ${taken.displayName} (${taken.id}). Remove that project first.`
    )
  }
  assertWslMoveRepoWritable(store, repo)
  const mapPath = (path: string): string => relocatedPath(path, previousPath, newPath)
  const moves = collectWorktreeIdMoves(store, repo, mapPath)
  const sessionTabCount = countSessionTabs(
    store,
    repo,
    moves.map(([oldId]) => oldId)
  )
  const updated = store.relocateRepoPath(repo, newPath, mapPath)
  if (!updated) {
    throw new Error('repo_not_found')
  }
  for (const [oldId, newId] of moves) {
    store.migrateWorktreeIdentity(hostWorktreeTargetForRepo(oldId, repo), newId)
  }
  invalidateAuthorizedRootsCache()
  deps.invalidateResolvedWorktrees()
  deps.invalidateWorktreeScan(repo.id)
  // Renames first so clients re-key their tabs before the repo list shows the new path.
  for (const [oldId, newId] of moves) {
    deps.notifyWorktreeRenamed?.(repo.id, oldId, newId)
  }
  deps.notifyReposChanged()
  return { repo: updated, previousPath, moved: true, worktreeCount: moves.length, sessionTabCount }
}
