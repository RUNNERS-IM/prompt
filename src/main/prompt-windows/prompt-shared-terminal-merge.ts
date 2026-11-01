import {
  isRecord,
  PANE_KEYED_FIELDS,
  TAB_KEYED_FIELDS,
  type Entry,
  type Session
} from './prompt-session-fields'

/**
 * Prompt shared tabs: every window holds every terminal tab, so several windows save the same
 * terminal records. A save is merged against what the saving window last read or saved (its
 * "base"): a record it changed replaces the stored one, a record it left as it was keeps the
 * stored one (another window may have changed or removed it since), a record it dropped is
 * removed, and a record it never had stays. So a window that has not caught up yet neither undoes
 * another window's change nor brings back a tab another window closed.
 *
 * Shared records: terminal tabs (`tabsByWorktree`), their unified tab entries, and every per-tab
 * and per-pane terminal map. Editor and browser tabs stay with the window that owns them.
 */

export type PromptSharedBase = Map<string, Map<string, string>>

/** Per-tab and per-pane maps that belong to terminal tabs. */
export const SHARED_KEYED_FIELDS = [
  ...[...TAB_KEYED_FIELDS].filter((field) => field !== 'browserPagesByWorkspace'),
  ...PANE_KEYED_FIELDS
]

const SHARED_FIELDS = ['tabsByWorktree', 'unifiedTabs', ...SHARED_KEYED_FIELDS]

function lists(value: unknown): Record<string, unknown[]> {
  if (!isRecord(value)) {
    return {}
  }
  const out: Record<string, unknown[]> = {}
  for (const [key, list] of Object.entries(value)) {
    if (Array.isArray(list)) {
      out[key] = list
    }
  }
  return out
}

/** Terminal tab ids a session knows: tab entries, layouts and closed-tab marks. */
export function promptTerminalTabIds(...sessions: (Session | undefined)[]): Set<string> {
  const ids = new Set<string>()
  for (const session of sessions) {
    for (const list of Object.values(lists(session?.tabsByWorktree))) {
      for (const entry of list) {
        if (isRecord(entry) && typeof entry.id === 'string') {
          ids.add(entry.id)
        }
      }
    }
    for (const field of ['terminalLayoutsByTabId', 'closedTerminalTabTombstonesByTabId']) {
      const byTab = session?.[field]
      if (isRecord(byTab)) {
        Object.keys(byTab).forEach((id) => ids.add(id))
      }
    }
  }
  return ids
}

function isSharedEntry(field: string, entry: unknown, terminalIds: ReadonlySet<string>): boolean {
  if (field === 'tabsByWorktree') {
    return true
  }
  if (!isRecord(entry)) {
    return false
  }
  const id = entry.entityId ?? entry.id
  return entry.contentType === 'terminal' || (typeof id === 'string' && terminalIds.has(id))
}

function sharedKey(field: string, worktreeId: string, entry: Entry): string | null {
  const id = field === 'tabsByWorktree' ? entry.id : (entry.entityId ?? entry.id)
  return typeof id === 'string' ? `${worktreeId}\u0000${id}` : null
}

/** The shared records of a session as the base of the window that read or saved it. */
function recordsOf(
  field: string,
  value: unknown,
  terminalIds: ReadonlySet<string>
): Map<string, { key: string; worktreeId?: string; record: unknown; json: string }> {
  const out = new Map<string, { key: string; worktreeId?: string; record: unknown; json: string }>()
  if (field === 'tabsByWorktree' || field === 'unifiedTabs') {
    for (const [worktreeId, list] of Object.entries(lists(value))) {
      for (const entry of list) {
        const key =
          isSharedEntry(field, entry, terminalIds) && isRecord(entry)
            ? sharedKey(field, worktreeId, entry)
            : null
        if (key !== null) {
          out.set(key, { key, worktreeId, record: entry, json: JSON.stringify(entry) })
        }
      }
    }
    return out
  }
  for (const [key, record] of Object.entries(isRecord(value) ? value : {})) {
    out.set(key, { key, record, json: JSON.stringify(record) })
  }
  return out
}

/** Records the window has now, as its base for the fields `session` carries. */
export function promptUpdateSharedBase(
  base: PromptSharedBase,
  session: Session,
  terminalIds: ReadonlySet<string>,
  full: boolean
): void {
  for (const field of SHARED_FIELDS) {
    if (!(field in session) && !full) {
      continue
    }
    const records = recordsOf(field, session[field], terminalIds)
    base.set(field, new Map([...records].map(([key, { json }]) => [key, json])))
  }
}

function pick(
  stored: { record: unknown } | undefined,
  incoming: { record: unknown; json: string } | undefined,
  base: string | undefined
): { record: unknown } | undefined {
  if (incoming) {
    return incoming.json !== base ? incoming : stored
  }
  return base !== undefined ? undefined : stored
}

/**
 * Merges the shared records of one save into `out` (the scoped save, see prompt-session-scope.ts).
 * `out` already holds the window's own editor and browser entries; its shared entries are
 * replaced by the merge. Returns nothing; `out` is changed in place.
 */
export function promptMergeSharedTerminals(
  out: Session,
  incoming: Session,
  stored: Session,
  base: PromptSharedBase | undefined,
  full: boolean
): void {
  const terminalIds = promptTerminalTabIds(incoming, stored)
  for (const field of SHARED_FIELDS) {
    if (!(field in incoming) && !full) {
      continue
    }
    const fieldBase = base?.get(field) ?? new Map<string, string>()
    const inc = recordsOf(field, incoming[field], terminalIds)
    const sto = recordsOf(field, stored[field], terminalIds)
    const merged: { key: string; worktreeId?: string; record: unknown }[] = []
    for (const [key, entry] of sto) {
      const chosen = pick(entry, inc.get(key), fieldBase.get(key))
      if (chosen) {
        merged.push({ ...entry, record: chosen.record })
      }
    }
    for (const [key, entry] of inc) {
      if (!sto.has(key) && pick(undefined, entry, fieldBase.get(key))) {
        merged.push(entry)
      }
    }
    if (field === 'tabsByWorktree' || field === 'unifiedTabs') {
      const result: Record<string, unknown[]> = {}
      // The window's own editor and browser entries, as the ownership merge left them.
      for (const [worktreeId, list] of Object.entries(lists(out[field]))) {
        const own = list.filter((entry) => !isSharedEntry(field, entry, terminalIds))
        if (own.length > 0 || field in incoming) {
          result[worktreeId] = own
        }
      }
      for (const { worktreeId, record } of merged) {
        result[worktreeId!] = [...(result[worktreeId!] ?? []), record]
      }
      out[field] = result
    } else {
      out[field] = Object.fromEntries(merged.map(({ key, record }) => [key, record]))
    }
  }
}
