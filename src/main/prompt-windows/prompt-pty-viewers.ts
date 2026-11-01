/**
 * Prompt shared tabs (the default, `setPromptSharedTabs`): every window holds every terminal tab,
 * so a pty has a set of viewers (each window that opened or attached it gets its output) and one
 * size owner (the window used last; only it resizes the pty). Windows are kept by web contents id.
 * Kept free of Electron imports; prompt-window-registry.ts turns ids into windows.
 */

type PtyViewers = { ids: Set<number>; sizeOwner: number }

let sharedTabs = false
const viewersByPtyId = new Map<string, PtyViewers>()
const viewersListeners = new Set<(ptyId: string, added: number | null) => void>()

function onViewersChanged(ptyId: string, added: number | null): void {
  for (const listener of viewersListeners) {
    listener(ptyId, added)
  }
}

/** Read once at launch from the hidden `promptSharedTabs` setting (on unless turned off). */
export function setPromptSharedTabs(on: boolean): void {
  sharedTabs = on
}

export function isPromptSharedTabs(): boolean {
  return sharedTabs
}

/** Shared-tab delivery and IPC guards want to know when a pty gains (`added`) or loses viewers. */
export function addPromptPtyViewersListener(
  listener: (ptyId: string, added: number | null) => void
): void {
  viewersListeners.add(listener)
}

/** A window opened or attached the pty: it gets its output and, being used last, its size. */
export function addPromptPtyViewer(ptyId: string, webContentsId: number): void {
  const entry = viewersByPtyId.get(ptyId)
  if (!entry) {
    viewersByPtyId.set(ptyId, { ids: new Set([webContentsId]), sizeOwner: webContentsId })
    onViewersChanged(ptyId, webContentsId)
    return
  }
  entry.sizeOwner = webContentsId
  // The same renderer attaching again keeps counting where it was: not a new viewer.
  if (!entry.ids.has(webContentsId)) {
    entry.ids.add(webContentsId)
    onViewersChanged(ptyId, webContentsId)
  }
}

export function promptPtyViewerIds(ptyId: string): number[] {
  return [...(viewersByPtyId.get(ptyId)?.ids ?? [])]
}

export function promptPtySizeOwnerId(ptyId: string): number | null {
  return viewersByPtyId.get(ptyId)?.sizeOwner ?? null
}

/** A viewer typed into the pty or brought it up: it owns the size now. True when that changed. */
export function notePromptPtyDriver(
  ptyId: string,
  sender: { id: number } | null | undefined
): boolean {
  const entry = viewersByPtyId.get(ptyId)
  if (!sender || !entry || !entry.ids.has(sender.id) || entry.sizeOwner === sender.id) {
    return false
  }
  entry.sizeOwner = sender.id
  return true
}

/**
 * A window reloaded or closed: it shows none of its ptys any more. A pty whose size owner it was
 * hands the size to the viewer that came last. Returns the ptys it showed.
 */
export function removePromptPtyViewerWindow(webContentsId: number): string[] {
  const removed: string[] = []
  for (const [ptyId, entry] of viewersByPtyId) {
    if (!entry.ids.delete(webContentsId)) {
      continue
    }
    removed.push(ptyId)
    const remaining = [...entry.ids]
    if (remaining.length === 0) {
      // Nobody shows it: back to no record, so the next window to attach it starts fresh.
      viewersByPtyId.delete(ptyId)
    } else if (entry.sizeOwner === webContentsId) {
      entry.sizeOwner = remaining.at(-1)!
    }
  }
  for (const ptyId of removed) {
    onViewersChanged(ptyId, null)
  }
  return removed
}

export function forgetPromptPtyViewers(ptyId: string): void {
  viewersByPtyId.delete(ptyId)
}

/** Test seam. */
export function resetPromptPtyViewersForTests(): void {
  viewersByPtyId.clear()
  sharedTabs = false
  viewersListeners.clear()
}
