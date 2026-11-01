import { PROMPT_MAIN_WINDOW_KEY as MAIN } from '../../shared/prompt-windows'
import {
  isRecord,
  type PromptSessionOwnership,
  type PromptWindowView,
  type Session
} from './prompt-session-fields'
import { promptFixSharedGroups, promptSessionView } from './prompt-session-view'
import {
  promptMergeSharedTerminals,
  promptTerminalTabIds,
  promptUpdateSharedBase,
  type PromptSharedBase
} from './prompt-shared-terminal-merge'
import {
  notePromptSharedRead,
  notePromptSharedWrite,
  promptPartitionKey
} from './prompt-shared-sync'

/**
 * Prompt shared tabs, session read and save (see prompt-session-scope.ts for the per-window part):
 * every window reads every terminal tab; editor and browser tabs stay with their window. Saves
 * merge the terminal records against what the saving window last read or saved
 * (prompt-shared-terminal-merge.ts).
 */

const bases = new Map<string, PromptSharedBase>()

function baseKey(windowKey: string, hostId: string | null | undefined): string {
  return `${windowKey}\u0000${promptPartitionKey(hostId)}`
}

function unifiedIds(unified: unknown): Set<string> {
  const ids = new Set<string>()
  for (const list of Object.values(isRecord(unified) ? unified : {})) {
    for (const tab of Array.isArray(list) ? list : []) {
      for (const id of isRecord(tab) ? [tab.id, tab.entityId] : []) {
        if (typeof id === 'string') {
          ids.add(id)
        }
      }
    }
  }
  return ids
}

/** Every tab of `session` sits in one of its groups (a tab another window opened, too). */
function groupEveryTab(session: Session, isTab: (id: string) => boolean): void {
  const fixed = promptFixSharedGroups(session.tabGroups, session.unifiedTabs, (id) =>
    isTab(id) ? 'shared' : MAIN
  )
  session.tabGroups = fixed.tabGroups
  session.unifiedTabs = fixed.unifiedTabs
}

/** `session:get` with shared tabs. */
export function promptSharedSessionView<T extends object>(
  storedSession: T,
  windowKey: string,
  hostId: string | null | undefined,
  ownerOf: (tabId: string) => string,
  view: PromptWindowView | undefined
): T {
  const stored = storedSession as unknown as Session
  if (!isRecord(stored)) {
    return storedSession
  }
  const terminalIds = promptTerminalTabIds(stored)
  const out = promptSessionView(
    stored,
    windowKey,
    (id) => (terminalIds.has(id) ? windowKey : ownerOf(id)),
    windowKey === MAIN ? undefined : view
  ) as Session
  const tabs = unifiedIds(out.unifiedTabs)
  groupEveryTab(out, (id) => tabs.has(id))
  const base: PromptSharedBase = new Map()
  promptUpdateSharedBase(base, out, terminalIds, true)
  bases.set(baseKey(windowKey, hostId), base)
  notePromptSharedRead(windowKey, hostId, out, stored)
  return out as unknown as T
}

/** A session save with shared tabs; `scope` is the per-window merge for everything else. */
export function promptSharedScopeWrite<T extends object>(
  incomingSession: T,
  storedSession: object | undefined,
  ctx: PromptSessionOwnership,
  full: boolean,
  hostId: string | null | undefined,
  scope: (incoming: T, ctx: PromptSessionOwnership) => { session: T; view?: PromptWindowView }
): { session: T; view?: PromptWindowView } {
  const incoming = incomingSession as unknown as Session
  const stored = (isRecord(storedSession) ? storedSession : {}) as Session
  if (!isRecord(incoming)) {
    return { session: incomingSession }
  }
  const terminalIds = promptTerminalTabIds(incoming, stored)
  const shared: PromptSessionOwnership = {
    ...ctx,
    ownerOf: (id) => (terminalIds.has(id) ? ctx.windowKey : ctx.ownerOf(id)),
    claim: (id) => {
      if (!terminalIds.has(id)) {
        ctx.claim(id)
      }
    }
  }
  const scoped = scope(incomingSession, shared)
  const out = scoped.session as unknown as Session
  const key = baseKey(ctx.windowKey, hostId)
  promptMergeSharedTerminals(out, incoming, stored, bases.get(key), full)
  if ('unifiedTabs' in out || 'tabGroups' in out) {
    // The stored groups are the main window's: every terminal tab sits in one of them.
    const groups = { tabGroups: out.tabGroups ?? stored.tabGroups, unifiedTabs: out.unifiedTabs }
    const fixed = promptFixSharedGroups(
      groups.tabGroups,
      groups.unifiedTabs ?? stored.unifiedTabs,
      (id) => (terminalIds.has(id) ? 'shared' : ctx.ownerOf(id))
    )
    out.tabGroups = fixed.tabGroups
    out.unifiedTabs = fixed.unifiedTabs
  }
  const base = bases.get(key) ?? new Map()
  promptUpdateSharedBase(base, incoming, terminalIds, full)
  bases.set(key, base)
  notePromptSharedWrite(ctx.windowKey, hostId, incoming, full ? out : { ...stored, ...out })
  return scoped
}

/** A window closed: forget what it read. */
export function forgetPromptSharedBases(windowKey: string): void {
  for (const key of bases.keys()) {
    if (key.startsWith(`${windowKey}\u0000`)) {
      bases.delete(key)
    }
  }
}

/** Test seam. */
export function resetPromptSessionSharedForTests(): void {
  bases.clear()
}
