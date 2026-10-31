/** Share minted-session parsing across main/renderer hydration and memory attribution; divergent copies caused REMOTE mislabels. */

import { parseWorkspaceKey } from './workspace-scope'
import { movedTerminalOwnerOf } from './moved-terminal-owner'

export const PTY_SESSION_ID_SEPARATOR = '@@'
export const WORKTREE_ID_SEPARATOR = '::'

/** Require @@ plus a valid Git/folder workspace identity; arbitrary UUIDs must not invent memory owners. Return null for unminted IDs. */
export function parsePtySessionId(sessionId: string): { worktreeId: string | null } {
  const idx = sessionId.lastIndexOf(PTY_SESSION_ID_SEPARATOR)
  if (idx <= 0) {
    return { worktreeId: null }
  }
  const candidate = sessionId.slice(0, idx)
  if (parseWorkspaceKey(candidate)?.type === 'folder') {
    return { worktreeId: candidate }
  }
  // Empty halves around :: must not invent owners for memory attribution.
  const sepIdx = candidate.indexOf(WORKTREE_ID_SEPARATOR)
  if (sepIdx <= 0 || sepIdx + WORKTREE_ID_SEPARATOR.length >= candidate.length) {
    return { worktreeId: null }
  }
  return { worktreeId: candidate }
}

/**
 * The workspace a terminal belongs to now: the one a moved terminal was dropped on, else the one its
 * id was minted for. Use this, not parsePtySessionId, wherever ownership decides an action.
 */
export function ptyOwnerWorktreeId(sessionId: string): string | null {
  return movedTerminalOwnerOf(sessionId) ?? parsePtySessionId(sessionId).worktreeId
}

/** False only for an id owned by another worktree; an id in no minted form names no owner. */
export function isPtySessionIdOwnedByWorktree(sessionId: string, worktreeId: string): boolean {
  const moved = movedTerminalOwnerOf(sessionId)
  if (moved !== null) {
    return moved === worktreeId
  }
  const separatorIdx = sessionId.lastIndexOf(PTY_SESSION_ID_SEPARATOR)
  return separatorIdx === -1 || sessionId.slice(0, separatorIdx) === worktreeId
}
