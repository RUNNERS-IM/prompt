/**
 * Prompt project windows share one saved workspace session with the main window. Every window's
 * renderer saves whole maps (tabs by worktree, layouts by tab …), so without this the last window
 * to save would erase the other's tabs. Before a save is stored:
 * - a project window's save keeps only the records of its own project and the stored rest;
 * - the main window's save keeps the stored records of projects open in other windows.
 * A record belongs to a project when its key is one of the project's worktree ids
 * ("<repoId>::<path>"), the project id itself, or one of the project's tab ids (also
 * "<tabId>:<leafId>" pane keys).
 */

import {
  promptProjectRepoIdOfSender,
  promptReposMainWindowMustNotWrite
} from './prompt-project-window-registry'

type SessionLike = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function idsOfEntries(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value
    .map((entry) => (isRecord(entry) && typeof entry.id === 'string' ? entry.id : null))
    .filter((id): id is string => id !== null)
}

const TAB_LIST_KEYS = ['tabsByWorktree', 'unifiedTabs', 'browserTabsByWorktree'] as const

function collectOwnedTabIds(
  sessions: readonly (SessionLike | undefined)[],
  isOwnedWorktree: (key: string) => boolean
): Set<string> {
  const tabIds = new Set<string>()
  for (const session of sessions) {
    for (const listKey of TAB_LIST_KEYS) {
      const byWorktree = session?.[listKey]
      if (!isRecord(byWorktree)) {
        continue
      }
      for (const [worktreeId, list] of Object.entries(byWorktree)) {
        if (isOwnedWorktree(worktreeId)) {
          idsOfEntries(list).forEach((id) => tabIds.add(id))
        }
      }
    }
  }
  return tabIds
}

export function createPromptRecordOwnership(
  ownedRepoIds: ReadonlySet<string>,
  sessions: readonly (SessionLike | undefined)[]
): (key: string) => boolean {
  const isOwnedWorktree = (key: string): boolean => {
    const index = key.indexOf('::')
    return index > 0 && ownedRepoIds.has(key.slice(0, index))
  }
  const tabIds = collectOwnedTabIds(sessions, isOwnedWorktree)
  return (key: string): boolean => {
    if (ownedRepoIds.has(key) || isOwnedWorktree(key) || tabIds.has(key)) {
      return true
    }
    const colon = key.lastIndexOf(':')
    return colon > 0 && tabIds.has(key.slice(0, colon))
  }
}

function mergeRecord(
  keepFrom: Record<string, unknown> | undefined,
  takeOwnedFrom: Record<string, unknown> | undefined,
  isOwned: (key: string) => boolean
): Record<string, unknown> {
  const merged: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(keepFrom ?? {})) {
    if (!isOwned(key)) {
      merged[key] = value
    }
  }
  for (const [key, value] of Object.entries(takeOwnedFrom ?? {})) {
    if (isOwned(key)) {
      merged[key] = value
    }
  }
  return merged
}

/**
 * Scopes one session save. `windowRepoId` is the project of the saving window (null for the main
 * window); `mainMustNotWrite` lists projects the main window may not write. `full` is true for a
 * whole-session save, false for a patch (only the keys it carries).
 */
export function scopePromptSessionWrite<T extends SessionLike>(
  incoming: T,
  stored: SessionLike | undefined,
  windowRepoId: string | null,
  mainMustNotWrite: ReadonlySet<string>,
  full: boolean
): T {
  const ownedRepoIds = windowRepoId ? new Set([windowRepoId]) : mainMustNotWrite
  if (ownedRepoIds.size === 0 || !incoming) {
    return incoming
  }
  const isOwned = createPromptRecordOwnership(ownedRepoIds, [stored, incoming])
  const fromProject = windowRepoId !== null
  const result: SessionLike = fromProject ? (full ? { ...stored } : {}) : { ...incoming }
  const keys = new Set([...Object.keys(incoming), ...(full && stored ? Object.keys(stored) : [])])
  for (const key of keys) {
    const mine = incoming[key]
    const theirs = stored?.[key]
    if (isRecord(mine) || isRecord(theirs)) {
      const recordMine = isRecord(mine) ? mine : undefined
      const recordTheirs = isRecord(theirs) ? theirs : undefined
      if (!full && !(key in incoming)) {
        continue
      }
      result[key] = fromProject
        ? mergeRecord(recordTheirs, recordMine, isOwned)
        : mergeRecord(recordMine, recordTheirs, isOwned)
    } else if (!fromProject) {
      if (key in incoming) {
        result[key] = mine
      }
    }
    // A project window never writes the shared scalars (active workspace, histories …).
  }
  return result as T
}

/** Session save from a renderer: scoped by which window sent it (see above). */
export function scopePromptWindowSessionWrite<T extends object>(
  sender: { id: number } | null | undefined,
  incoming: T,
  stored: object | undefined,
  full: boolean
): T {
  return scopePromptSessionWrite(
    incoming as unknown as SessionLike,
    stored as SessionLike | undefined,
    promptProjectRepoIdOfSender(sender),
    promptReposMainWindowMustNotWrite(),
    full
  ) as unknown as T
}
