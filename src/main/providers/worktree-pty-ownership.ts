import { isPathInsideOrEqual } from '../../shared/cross-platform-path'
import { splitWorktreeId, splitWorktreeIdForFilesystem } from '../../shared/worktree/id'
import { movedTerminalOwnerOf } from '../../shared/moved-terminal-owner'
import type { PtyProcessInfo } from './pty-process-info'

export function worktreePtyOwnership(worktreeId: string): (session: PtyProcessInfo) => boolean {
  const prefix = `${worktreeId}@@`
  const fullWorktreePath = splitWorktreeId(worktreeId)?.worktreePath
  // Folder instances share a checkout; cwd alone cannot identify the owning instance.
  const cwdFallbackPath =
    splitWorktreeIdForFilesystem(worktreeId)?.worktreePath === fullWorktreePath
      ? fullWorktreePath
      : undefined
  return (session) => {
    // A terminal moved to another workspace belongs to that workspace only, whatever its id or cwd says.
    const moved = movedTerminalOwnerOf(session.id)
    if (moved !== null) {
      return moved === worktreeId
    }
    return (
      session.id.startsWith(prefix) ||
      session.worktreeId === worktreeId ||
      (cwdFallbackPath !== undefined &&
        session.worktreeId === undefined &&
        typeof session.cwd === 'string' &&
        session.cwd.length > 0 &&
        isPathInsideOrEqual(cwdFallbackPath, session.cwd))
    )
  }
}
