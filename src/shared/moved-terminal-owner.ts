/**
 * Terminals moved to another workspace keep their id, which is minted as "<first workspace>@@…".
 * The tab that took such a terminal lists it in `adoptedPtyIds`, and the workspace holding that tab
 * is the terminal's current owner. Everything that decides "whose terminal is this" (teardown,
 * restart inventory, restore placement, reattach) asks here before reading the id's prefix.
 *
 * Each process installs its own copy of the workspace session: main the saved session, the window its
 * store. With none installed every terminal belongs to its id's prefix.
 */

type OwnerTab = { id: string; ptyId: string | null; adoptedPtyIds?: readonly string[] }

export type MovedTerminalOwnerSession = {
  tabsByWorktree?: Readonly<Record<string, readonly OwnerTab[] | undefined>>
  terminalLayoutsByTabId?: Readonly<
    Record<string, { ptyIdsByLeafId?: Readonly<Record<string, string>> } | undefined>
  >
}

type CachedOwners = {
  layouts: MovedTerminalOwnerSession['terminalLayoutsByTabId']
  owners: ReadonlyMap<string, string>
}

const EMPTY_OWNERS: ReadonlyMap<string, string> = new Map()
const ownersByTabs = new WeakMap<object, CachedOwners>()

/**
 * Terminal id → workspace that took it. A listed id counts only while the tab still binds it (its
 * own ptyId or one of its panes), so a pane that later started a fresh terminal drops the record.
 * An id two workspaces both claim is left to its prefix.
 */
export function movedTerminalOwnersOf(
  session: MovedTerminalOwnerSession | null | undefined
): ReadonlyMap<string, string> {
  const tabsByWorktree = session?.tabsByWorktree
  if (!tabsByWorktree) {
    return EMPTY_OWNERS
  }
  const layouts = session.terminalLayoutsByTabId
  const cached = ownersByTabs.get(tabsByWorktree)
  if (cached && cached.layouts === layouts) {
    return cached.owners
  }
  const owners = new Map<string, string>()
  const contested = new Set<string>()
  for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
    for (const tab of tabs ?? []) {
      if (!tab.adoptedPtyIds || tab.adoptedPtyIds.length === 0) {
        continue
      }
      const bound = new Set(Object.values(layouts?.[tab.id]?.ptyIdsByLeafId ?? {}))
      if (tab.ptyId) {
        bound.add(tab.ptyId)
      }
      for (const ptyId of tab.adoptedPtyIds) {
        if (!bound.has(ptyId) || contested.has(ptyId)) {
          continue
        }
        const prior = owners.get(ptyId)
        if (prior !== undefined && prior !== worktreeId) {
          owners.delete(ptyId)
          contested.add(ptyId)
          continue
        }
        owners.set(ptyId, worktreeId)
      }
    }
  }
  const result = owners.size > 0 ? owners : EMPTY_OWNERS
  ownersByTabs.set(tabsByWorktree, { layouts, owners: result })
  return result
}

let getInstalledSession: (() => MovedTerminalOwnerSession | null | undefined) | null = null

/** Install this process's session (main: the saved local session; window: its store). Null removes it. */
export function setMovedTerminalOwnerSession(
  getSession: (() => MovedTerminalOwnerSession | null | undefined) | null
): void {
  getInstalledSession = getSession
}

function installedOwners(): ReadonlyMap<string, string> {
  if (!getInstalledSession) {
    return EMPTY_OWNERS
  }
  try {
    return movedTerminalOwnersOf(getInstalledSession())
  } catch {
    // An unreadable session must not stop teardown or restore; the prefix still answers.
    return EMPTY_OWNERS
  }
}

/** The workspace a moved terminal now belongs to, or null when it was never moved. */
export function movedTerminalOwnerOf(ptyId: string): string | null {
  return ptyId ? (installedOwners().get(ptyId) ?? null) : null
}

/**
 * Workspaces named by the ids of terminals that moved away. A live moved shell still writes the
 * command history file of the workspace its id names, so that workspace's history must outlive it.
 */
export function worktreeIdsNamedByMovedTerminals(): Set<string> {
  const named = new Set<string>()
  for (const ptyId of installedOwners().keys()) {
    const separator = ptyId.lastIndexOf('@@')
    if (separator > 0) {
      named.add(ptyId.slice(0, separator))
    }
  }
  return named
}
