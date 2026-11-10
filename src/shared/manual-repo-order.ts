import {
  getRepoExecutionHostId,
  LOCAL_EXECUTION_HOST_ID,
  normalizeExecutionHostId
} from './execution-host'
import { getRepoHostIdentityForParts } from './repo-host-identity'
import type { Repo } from './repo-types'
import type { ManualRepoOrderEntry } from './ui-chrome-types'

function getEntryKey(entry: ManualRepoOrderEntry): string {
  return getRepoHostIdentityForParts(entry.repoId, entry.hostId)
}

export function normalizeManualRepoOrder(value: unknown): ManualRepoOrderEntry[] {
  if (!Array.isArray(value)) {
    return []
  }
  const entries: ManualRepoOrderEntry[] = []
  const seen = new Set<string>()
  for (const candidate of value) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }
    const raw = candidate as { hostId?: unknown; repoId?: unknown }
    const hostId = typeof raw.hostId === 'string' ? normalizeExecutionHostId(raw.hostId) : null
    const repoId = typeof raw.repoId === 'string' ? raw.repoId : ''
    if (!hostId || !repoId.trim()) {
      continue
    }
    const entry = { hostId, repoId }
    const key = getEntryKey(entry)
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    entries.push(entry)
  }
  return entries
}

export function getManualRepoOrder(repos: readonly Repo[]): ManualRepoOrderEntry[] {
  return normalizeManualRepoOrder(
    repos.map((repo) => ({ hostId: getRepoExecutionHostId(repo), repoId: repo.id }))
  )
}

function inheritRemovedLocalSlots(
  repos: readonly Repo[],
  order: readonly ManualRepoOrderEntry[],
  rankByKey: Map<string, number>
): void {
  const localRepoKey = (repo: Repo): string =>
    getEntryKey({ hostId: LOCAL_EXECUTION_HOST_ID, repoId: repo.id })
  const localRepos = repos.filter(
    (repo) => getRepoExecutionHostId(repo) === LOCAL_EXECUTION_HOST_ID
  )
  const liveKeys = new Set(localRepos.map(localRepoKey))
  const removedSlots = order.flatMap((entry, index) =>
    entry.hostId === LOCAL_EXECUTION_HOST_ID && !liveKeys.has(getEntryKey(entry)) ? [index] : []
  )
  // Why: moving a project to another folder re-registers it under a new id; its old slot must not outrank it forever.
  const unrankedRepos = localRepos
    .filter((repo) => !rankByKey.has(localRepoKey(repo)))
    .sort((a, b) => a.addedAt - b.addedAt)
  unrankedRepos.slice(0, removedSlots.length).forEach((repo, index) => {
    rankByKey.set(localRepoKey(repo), removedSlots[index])
  })
}

export function applyManualRepoOrder(
  repos: readonly Repo[],
  order: readonly ManualRepoOrderEntry[] | null | undefined
): readonly Repo[] {
  const normalized = normalizeManualRepoOrder(order)
  // Preserve identity for no-op reorders: fresh arrays invalidate every identity-keyed repo memo downstream.
  if (normalized.length === 0) {
    return repos
  }
  const rankByKey = new Map(normalized.map((entry, index) => [getEntryKey(entry), index]))
  inheritRemovedLocalSlots(repos, normalized, rankByKey)
  const ordered = repos
    .map((repo, index) => ({
      repo,
      index,
      rank: rankByKey.get(getEntryKey({ hostId: getRepoExecutionHostId(repo), repoId: repo.id }))
    }))
    .sort((a, b) => {
      if (a.rank === undefined && b.rank === undefined) {
        return a.index - b.index
      }
      if (a.rank === undefined) {
        return 1
      }
      if (b.rank === undefined) {
        return -1
      }
      return a.rank - b.rank || a.index - b.index
    })
    .map(({ repo }) => repo)
  return ordered.every((repo, index) => repo === repos[index]) ? repos : ordered
}
