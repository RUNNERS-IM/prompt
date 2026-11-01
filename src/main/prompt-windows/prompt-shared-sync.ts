import { LOCAL_EXECUTION_HOST_ID, normalizeExecutionHostId } from '../../shared/execution-host'
import { isRecord, type Session } from './prompt-session-fields'

/**
 * Prompt shared tabs: which windows are behind the others. A window learns about a terminal tab
 * another window opened, split, renamed or closed by reloading (the path Orca already uses to
 * rebuild a window from the saved session and re-attach running terminals; see prompt-windows.ts
 * for when it reloads).
 *
 * Per session partition (host) this keeps what every window was last seen holding, per terminal
 * tab: its panes and its name and color. "Announced" is what the others should catch up to:
 * - a new tab or a new pane is announced only once its terminal is running, so a window that
 *   reloads attaches that terminal instead of starting a second shell (and the window that opened
 *   it still runs its startup command);
 * - a name or color change is announced at once;
 * - a closed tab or pane is not announced: the other windows close it themselves when its
 *   terminal exits. A window still holding it a few seconds later is behind (`late`).
 */

type TabSig = { meta: string; leaves: Set<string> }
type Holding = Map<string, TabSig>

type Partition = {
  announced: Holding
  /** Tabs and their panes in the stored session. */
  present: Map<string, Set<string>>
  seenByWindow: Map<string, Holding>
}

const partitions = new Map<string, Partition>()
/** Windows reloading: their unload save does not count as what they hold. */
const reloading = new Set<string>()
let savedListener: () => void = () => {}

/** Called after every shared save, to check which windows are behind (prompt-shared-reload.ts). */
export function setPromptSharedSavedListener(listener: () => void): void {
  savedListener = listener
}

/** One key per session partition, however the host id was spelled. */
export function promptPartitionKey(hostId: string | null | undefined): string {
  return normalizeExecutionHostId(hostId) ?? LOCAL_EXECUTION_HOST_ID
}

function partitionOf(hostId: string | null | undefined): Partition {
  const key = promptPartitionKey(hostId)
  let partition = partitions.get(key)
  if (!partition) {
    partition = { announced: new Map(), present: new Map(), seenByWindow: new Map() }
    partitions.set(key, partition)
  }
  return partition
}

function leavesOf(node: unknown, out: Set<string>): Set<string> {
  if (isRecord(node)) {
    if (node.type === 'leaf' && typeof node.leafId === 'string') {
      out.add(node.leafId)
    } else {
      leavesOf(node.first, out)
      leavesOf(node.second, out)
    }
  }
  return out
}

/** Terminal tabs of a session with their panes, name and color. */
function holdingOf(session: Session): Holding {
  const layouts = isRecord(session.terminalLayoutsByTabId) ? session.terminalLayoutsByTabId : {}
  const holding: Holding = new Map()
  for (const list of Object.values(
    isRecord(session.tabsByWorktree) ? session.tabsByWorktree : {}
  )) {
    for (const tab of Array.isArray(list) ? list : []) {
      if (!isRecord(tab) || typeof tab.id !== 'string') {
        continue
      }
      const layout = layouts[tab.id]
      holding.set(tab.id, {
        meta: JSON.stringify([tab.worktreeId, tab.customTitle ?? null, tab.color ?? null]),
        leaves: leavesOf(isRecord(layout) ? layout.root : null, new Set())
      })
    }
  }
  return holding
}

function runningLeaves(session: Session, tabId: string): Set<string> {
  const layouts = isRecord(session.terminalLayoutsByTabId) ? session.terminalLayoutsByTabId : {}
  const layout = layouts[tabId]
  const ptys = isRecord(layout) && isRecord(layout.ptyIdsByLeafId) ? layout.ptyIdsByLeafId : {}
  return new Set(Object.keys(ptys).filter((leafId) => typeof ptys[leafId] === 'string'))
}

/** A window read the session: it holds what it read. The first read also sets "announced". */
export function notePromptSharedRead(
  windowKey: string,
  hostId: string | null | undefined,
  view: Session,
  stored: Session
): void {
  reloading.delete(windowKey)
  const partition = partitionOf(hostId)
  const holding = holdingOf(view)
  partition.seenByWindow.set(windowKey, holding)
  if (partition.announced.size === 0 && partition.present.size === 0) {
    const all = holdingOf(stored)
    partition.announced = all
    partition.present = new Map([...all].map(([id, sig]) => [id, new Set(sig.leaves)]))
  }
}

/**
 * A window saved: `incoming` is what it sent, `merged` what is stored now. Updates what the window
 * holds (for the fields it sent) and what is announced.
 */
export function notePromptSharedWrite(
  windowKey: string,
  hostId: string | null | undefined,
  incoming: Session,
  merged: Session
): void {
  const partition = partitionOf(hostId)
  if (reloading.has(windowKey)) {
    // Its unload save: what it held is gone with the reload.
  } else if ('tabsByWorktree' in incoming) {
    const sent = holdingOf(incoming)
    const before = partition.seenByWindow.get(windowKey)
    if (!('terminalLayoutsByTabId' in incoming) && before) {
      for (const [id, sig] of sent) {
        sig.leaves = before.get(id)?.leaves ?? sig.leaves
      }
    }
    partition.seenByWindow.set(windowKey, sent)
  } else if ('terminalLayoutsByTabId' in incoming) {
    const seen = partition.seenByWindow.get(windowKey)
    const sent = holdingOf({ ...merged, terminalLayoutsByTabId: incoming.terminalLayoutsByTabId })
    for (const [id, sig] of seen ?? []) {
      sig.leaves = sent.get(id)?.leaves ?? sig.leaves
    }
  }
  const now = holdingOf(merged)
  partition.present = new Map([...now].map(([id, sig]) => [id, new Set(sig.leaves)]))
  for (const id of partition.announced.keys()) {
    if (!now.has(id)) {
      partition.announced.delete(id)
    }
  }
  for (const [id, sig] of now) {
    const before = partition.announced.get(id)
    const running = runningLeaves(merged, id)
    const ready = [...sig.leaves].every((leaf) => before?.leaves.has(leaf) || running.has(leaf))
    if (ready) {
      partition.announced.set(id, sig)
    } else if (before) {
      // Panes still starting wait; a name or color change does not.
      partition.announced.set(id, {
        meta: sig.meta,
        leaves: new Set([...before.leaves].filter((leaf) => sig.leaves.has(leaf)))
      })
    }
  }
  savedListener()
}

/**
 * Whether a window is behind: it misses an announced tab, pane, name or color, or (`late`, a few
 * seconds after a save) it still holds a tab or pane that was closed.
 */
export function isPromptWindowBehind(windowKey: string, late: boolean): boolean {
  for (const partition of partitions.values()) {
    const seen = partition.seenByWindow.get(windowKey)
    if (!seen) {
      continue
    }
    for (const [id, sig] of partition.announced) {
      const mine = seen.get(id)
      if (!mine || mine.meta !== sig.meta || [...sig.leaves].some((l) => !mine.leaves.has(l))) {
        return true
      }
    }
    if (late) {
      for (const [id, sig] of seen) {
        const present = partition.present.get(id)
        if (!present || [...sig.leaves].some((leaf) => !present.has(leaf))) {
          return true
        }
      }
    }
  }
  return false
}

/** The window reloads (or closed): it holds nothing until it reads the session again. */
export function forgetPromptSharedWindow(windowKey: string, closed = false): void {
  if (!closed) {
    reloading.add(windowKey)
  } else {
    reloading.delete(windowKey)
  }
  for (const partition of partitions.values()) {
    partition.seenByWindow.delete(windowKey)
  }
}

/** Test seam. */
export function resetPromptSharedSyncForTests(): void {
  partitions.clear()
  reloading.clear()
  savedListener = () => {}
}
