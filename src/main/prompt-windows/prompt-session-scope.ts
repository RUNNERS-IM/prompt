/**
 * Prompt windows share one saved workspace session. Main's Orca code (pane ownership, pty
 * bindings, restore) reads that session and must keep seeing every tab of every window, so the
 * stored session stays the union of all windows. Each window only sees and writes its own part:
 * - session read: the stored session cut down to the window's own tabs (see `promptSessionView`);
 *   an extra window also gets its own selection (active workspace, tab groups …) instead of the
 *   main window's.
 * - session save: the window's own tabs replace their stored copies; other windows' tabs stay
 *   (see `promptScopeSessionWrite`). A tab the window did not have yet is new and becomes its own.
 *
 * With shared tabs (the default) terminal tabs are in every window instead and their records are
 * merged per save (prompt-session-shared.ts); editor and browser tabs still work as above.
 *
 * Which window owns a tab comes from the tab owner table (prompt-window-registry.ts). Records are
 * matched to tabs by their key: per-workspace lists by each entry's entity id (terminal tab id,
 * editor file path, browser workspace id), per-tab maps by tab id, per-pane maps by the tab id
 * before the ":" of "<tabId>:<leafId>".
 */

import { PROMPT_MAIN_WINDOW_KEY as MAIN } from '../../shared/prompt-windows'
import {
  clearPromptTabPending,
  isPromptTabPending,
  promptExtraWindowCount,
  promptTabOwnerKey,
  promptTabOwnerTable,
  promptWindowKeyOfSender,
  promptWindowView,
  setPromptTabOwner,
  setPromptWindowView
} from './prompt-window-registry'
import {
  entityIds,
  entryId,
  isRecord,
  LIST_FIELDS,
  PANE_KEYED_FIELDS,
  TAB_KEYED_FIELDS,
  tabIdOfPaneKey,
  VIEW_FIELDS,
  type PromptSessionOwnership,
  type PromptWindowView,
  type Session
} from './prompt-session-fields'
import { promptFixSharedGroups, promptSessionView } from './prompt-session-view'
import { isPromptSharedTabs } from './prompt-pty-viewers'
import { promptSharedScopeWrite, promptSharedSessionView } from './prompt-session-shared'

export { PROMPT_WINDOW_VIEW_FIELDS } from './prompt-session-fields'
export type { PromptSessionOwnership, PromptWindowView } from './prompt-session-fields'
export { promptFixSharedGroups, promptSessionView } from './prompt-session-view'

// ---- save -------------------------------------------------------------------------------------

function mergeLists(
  field: string,
  incoming: unknown,
  stored: unknown,
  storedIds: ReadonlySet<string>,
  ctx: PromptSessionOwnership
): Record<string, unknown[]> {
  const inc = isRecord(incoming) ? incoming : {}
  const sto = isRecord(stored) ? stored : {}
  const result: Record<string, unknown[]> = {}
  const incomingIds = new Set<string>()
  const accepted = (id: string | null): boolean => {
    if (id === null) {
      return ctx.windowKey === MAIN
    }
    const owner = ctx.ownerOf(id)
    if (owner === ctx.windowKey) {
      ctx.seen(id)
      return true
    }
    if (ctx.windowKey !== MAIN && owner === MAIN && !storedIds.has(id)) {
      ctx.claim(id)
      return true
    }
    return false
  }
  for (const worktreeId of new Set([...Object.keys(inc), ...Object.keys(sto)])) {
    const mine = (Array.isArray(inc[worktreeId]) ? (inc[worktreeId] as unknown[]) : []).filter(
      (entry) => accepted(entryId(field, entry))
    )
    mine.forEach((entry) => {
      const id = entryId(field, entry)
      if (id !== null) {
        incomingIds.add(id)
      }
    })
    const theirs = (Array.isArray(sto[worktreeId]) ? (sto[worktreeId] as unknown[]) : []).filter(
      (entry) => {
        const id = entryId(field, entry)
        if (id === null) {
          return ctx.windowKey !== MAIN
        }
        if (incomingIds.has(id)) {
          return false
        }
        return ctx.ownerOf(id) !== ctx.windowKey || ctx.isPending(id)
      }
    )
    const list = [...mine, ...theirs]
    if (list.length > 0 || Array.isArray(inc[worktreeId])) {
      result[worktreeId] = list
    }
  }
  return result
}

function mergeKeyed(
  incoming: unknown,
  stored: unknown,
  tabOf: (key: string) => string,
  ctx: PromptSessionOwnership
): Record<string, unknown> {
  const inc = isRecord(incoming) ? incoming : {}
  const sto = isRecord(stored) ? stored : {}
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(sto)) {
    const tabId = tabOf(key)
    if (ctx.ownerOf(tabId) !== ctx.windowKey || (ctx.isPending(tabId) && !(key in inc))) {
      result[key] = value
    }
  }
  for (const [key, value] of Object.entries(inc)) {
    if (ctx.ownerOf(tabOf(key)) === ctx.windowKey) {
      result[key] = value
    }
  }
  return result
}

/**
 * Scopes one session save from window `ctx.windowKey`. `full` is true for a whole-session save
 * (fields it leaves out are empty), false for a patch (only the fields it carries change). Returns
 * what to store (a whole session or a patch, like the input) and, for an extra window, its own
 * selection to keep outside the session.
 */
export function promptScopeSessionWrite<T extends object>(
  incomingSession: T,
  storedSession: object | undefined,
  ctx: PromptSessionOwnership,
  full: boolean
): { session: T; view?: PromptWindowView } {
  const incoming = incomingSession as unknown as Session
  const stored = (isRecord(storedSession) ? storedSession : {}) as Session
  if (!isRecord(incoming)) {
    return { session: incomingSession }
  }
  const fromMain = ctx.windowKey === MAIN
  const storedIds = entityIds(stored)
  const out: Session = fromMain || !full ? {} : { ...stored }
  const fields = new Set([...Object.keys(incoming), ...(full ? Object.keys(stored) : [])])
  // Lists first: they decide which new tabs the window claims before per-tab maps are merged.
  const ordered = [
    ...[...fields].filter((field) => field in LIST_FIELDS),
    ...[...fields].filter((field) => !(field in LIST_FIELDS))
  ]
  let view: PromptWindowView | undefined
  for (const field of ordered) {
    const present = field in incoming
    if (field in LIST_FIELDS) {
      out[field] = mergeLists(field, incoming[field], stored[field], storedIds, ctx)
    } else if (TAB_KEYED_FIELDS.has(field)) {
      out[field] = mergeKeyed(incoming[field], stored[field], (key) => key, ctx)
    } else if (PANE_KEYED_FIELDS.has(field)) {
      out[field] = mergeKeyed(incoming[field], stored[field], tabIdOfPaneKey, ctx)
    } else if (VIEW_FIELDS.has(field)) {
      if (fromMain) {
        if (present) {
          out[field] = incoming[field]
        }
      } else {
        if (present) {
          view = { ...view, [field]: incoming[field] }
        }
        if (field in stored) {
          out[field] = stored[field]
        }
      }
    } else if (fromMain) {
      if (present) {
        out[field] = incoming[field]
      }
    } else if (present && isRecord(incoming[field])) {
      // Shared per-workspace facts (visit times, default-tab marks …): add, never remove.
      out[field] = { ...(isRecord(stored[field]) ? stored[field] : {}), ...incoming[field] }
    } else if (field in stored) {
      out[field] = stored[field]
    }
  }
  if ('unifiedTabs' in out || 'tabGroups' in out) {
    const fixed = promptFixSharedGroups(
      'tabGroups' in out ? out.tabGroups : stored.tabGroups,
      'unifiedTabs' in out ? out.unifiedTabs : stored.unifiedTabs,
      ctx.ownerOf
    )
    out.tabGroups = fixed.tabGroups
    out.unifiedTabs = fixed.unifiedTabs
  }
  return { session: out as unknown as T, ...(view ? { view } : {}) }
}

// ---- wiring -----------------------------------------------------------------------------------

function ownershipFor(sender: { id: number } | null | undefined): PromptSessionOwnership {
  const windowKey = promptWindowKeyOfSender(sender)
  return {
    windowKey,
    ownerOf: promptTabOwnerKey,
    isPending: (tabId) => isPromptTabPending(windowKey, tabId),
    claim: (tabId) => setPromptTabOwner(tabId, windowKey),
    seen: (tabId) => clearPromptTabPending(windowKey, tabId)
  }
}

/** `session:get`: the stored session as the asking window sees it. */
export function promptWindowSessionView<T extends object>(
  sender: { id: number } | null | undefined,
  stored: T,
  hostId?: string | null
): T {
  const windowKey = promptWindowKeyOfSender(sender)
  if (isPromptSharedTabs()) {
    const view = promptWindowView(windowKey)
    return promptSharedSessionView(stored, windowKey, hostId, promptTabOwnerKey, view)
  }
  if (windowKey === MAIN && promptExtraWindowCount() === 0 && promptTabsOwnedByAny() === 0) {
    return stored
  }
  return promptSessionView(stored, windowKey, promptTabOwnerKey, promptWindowView(windowKey))
}

function promptTabsOwnedByAny(): number {
  return Object.keys(promptTabOwnerTable()).length
}

/** Session save from a renderer: scoped by which window sent it (see above). */
export function scopePromptWindowSessionWrite<T extends object>(
  sender: { id: number } | null | undefined,
  incoming: T,
  stored: object | undefined,
  full: boolean,
  hostId?: string | null
): T {
  const ctx = ownershipFor(sender)
  const shared = isPromptSharedTabs()
  if (
    !shared &&
    ctx.windowKey === MAIN &&
    promptExtraWindowCount() === 0 &&
    promptTabsOwnedByAny() === 0
  ) {
    return incoming
  }
  const { session, view } = shared
    ? promptSharedScopeWrite(incoming, stored, ctx, full, hostId, (inc, scopedCtx) =>
        promptScopeSessionWrite(inc, stored, scopedCtx, full)
      )
    : promptScopeSessionWrite(incoming, stored, ctx, full)
  if (view) {
    setPromptWindowView(ctx.windowKey, {
      ...(full ? {} : promptWindowView(ctx.windowKey)),
      ...view
    })
  }
  return session
}
