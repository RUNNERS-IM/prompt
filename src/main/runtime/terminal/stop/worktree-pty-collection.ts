import { worktreeIdsEqual } from '../../../../shared/worktree/id'
import { movedTerminalOwnerOf } from '../../../../shared/moved-terminal-owner'
import type { RuntimePtyWorktreeRecord } from '../../runtime-terminal-state-records'
import { worktreePtyBelongsToHost, type WorktreePtyHostFence } from '../../worktree-pty-host-fence'

/** The terminals a worktree stop targets: every pane's terminal plus every connected PTY record. */
export function collectWorktreePtyIds(
  leaves: Iterable<{ worktreeId: string; ptyId: string | null }>,
  ptysById: ReadonlyMap<string, RuntimePtyWorktreeRecord>,
  worktreeId: string,
  hostFence: WorktreePtyHostFence,
  includeDisconnected = false
): Set<string> {
  const ptyIds = new Set<string>()
  // Leaves and PTY records keep the workspace a terminal started in; a moved one answers to its new one.
  const ownerOf = (ptyId: string, recorded: string): string =>
    movedTerminalOwnerOf(ptyId) ?? recorded
  for (const leaf of leaves) {
    if (
      leaf.ptyId &&
      worktreeIdsEqual(ownerOf(leaf.ptyId, leaf.worktreeId), worktreeId) &&
      worktreePtyBelongsToHost(leaf.ptyId, ptysById.get(leaf.ptyId)?.connectionId, hostFence)
    ) {
      ptyIds.add(leaf.ptyId)
    }
  }
  for (const pty of ptysById.values()) {
    if (
      worktreeIdsEqual(ownerOf(pty.ptyId, pty.worktreeId), worktreeId) &&
      (includeDisconnected || pty.connected) &&
      worktreePtyBelongsToHost(pty.ptyId, pty.connectionId, hostFence)
    ) {
      ptyIds.add(pty.ptyId)
    }
  }
  return ptyIds
}
