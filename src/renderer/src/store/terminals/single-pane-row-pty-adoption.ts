import type { TerminalLayoutSnapshot } from '../../../../shared/terminal-tab-types'
import type { WorkspaceSessionState } from '../../../../shared/workspace-session-state-types'

/**
 * Older saves can name a tab's terminal only on the row (tab.ptyId), with no leaf binding.
 * Hydration clears tab.ptyId, and a workspace that was not open at shutdown is not in the
 * reconnect plan, so the first save would drop the id and the pane would start a new shell.
 * For a single-pane tab, copy the row id onto its only leaf so opening the tab reattaches.
 */
export function adoptRowPtyIdIntoSinglePaneLayout(
  session: WorkspaceSessionState
): (
  tabId: string,
  layout: TerminalLayoutSnapshot,
  releasedPtyIds: ReadonlySet<string> | undefined
) => TerminalLayoutSnapshot {
  const rowPtyIdByTabId = new Map<string, string>()
  for (const tabs of Object.values(session.tabsByWorktree)) {
    for (const tab of tabs) {
      if (tab.ptyId) {
        rowPtyIdByTabId.set(tab.id, tab.ptyId)
      }
    }
  }
  // A PTY another tab's leaf already names stays with that tab; copying it would double-own it.
  const leafBoundPtyIds = new Set(
    Object.values(session.terminalLayoutsByTabId).flatMap((layout) =>
      Object.values(layout.ptyIdsByLeafId ?? {})
    )
  )
  return (tabId, layout, releasedPtyIds) => {
    const rowPtyId = rowPtyIdByTabId.get(tabId)
    if (
      !rowPtyId ||
      layout.root?.type !== 'leaf' ||
      Object.keys(layout.ptyIdsByLeafId ?? {}).length > 0 ||
      releasedPtyIds?.has(rowPtyId) ||
      leafBoundPtyIds.has(rowPtyId)
    ) {
      return layout
    }
    return { ...layout, ptyIdsByLeafId: { [layout.root.leafId]: rowPtyId } }
  }
}
