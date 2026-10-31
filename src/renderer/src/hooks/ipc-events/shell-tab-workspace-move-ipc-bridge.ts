import { moveShellTabToWorkspace } from '@/lib/shell-tab-workspace-move'
import type { ShellTabMoveResult } from '../../../../shared/shell-tab-workspace-move-types'

/** Answers main's `terminal.moveToWorkspace` with the same move the sidebar drag performs. */
export function registerShellTabWorkspaceMoveIpcBridge(unsubs: (() => void)[]): void {
  const { onMoveShellTabToWorkspace, replyShellTabWorkspaceMove } = window.api.ui
  // The web client and a preload older than this bridge have no such methods.
  if (!onMoveShellTabToWorkspace || !replyShellTabWorkspaceMove) {
    return
  }
  unsubs.push(
    onMoveShellTabToWorkspace(({ requestId, tabId, targetWorktreeId }) => {
      void moveShellTabToWorkspace({ tabId, targetWorktreeId })
        .catch((error): ShellTabMoveResult => {
          console.error('Failed to move shell tab:', error)
          return { moved: false, reason: 'failed' }
        })
        .then((result) => replyShellTabWorkspaceMove({ requestId, result }))
    })
  )
}
