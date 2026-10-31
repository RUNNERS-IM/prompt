import { randomUUID } from 'node:crypto'

import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'
import type {
  ShellTabMoveResult,
  ShellTabWorkspaceMoveReply
} from '../../shared/shell-tab-workspace-move-types'
import { addFanoutListener } from '../event-listener-fanout'
import { abortWhenRendererGone } from '../ipc/renderer-lifetime-abort'

// The window waits up to 2s for the idle check, then moves synchronously.
const SHELL_TAB_MOVE_TIMEOUT_MS = 10_000
const UNAVAILABLE: ShellTabMoveResult = { moved: false, reason: 'renderer-unavailable' }

/**
 * Asks the window that holds `tabId` to move that shell tab into `targetWorktreeId` and answers with
 * its result. A window that is gone, or never answers, counts as `renderer-unavailable`; in the
 * timeout case the window may still finish the move later.
 */
export function requestShellTabWorkspaceMove(
  window: BrowserWindow,
  tabId: string,
  targetWorktreeId: string
): Promise<ShellTabMoveResult> {
  if (window.isDestroyed() || window.webContents.isDestroyed()) {
    return Promise.resolve(UNAVAILABLE)
  }
  const webContents = window.webContents
  const requestId = randomUUID()
  return new Promise<ShellTabMoveResult>((resolve) => {
    let settled = false
    const releaseListeners: (() => void)[] = []
    const finish = (result: ShellTabMoveResult): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      for (const release of releaseListeners) {
        release()
      }
      resolve(result)
    }
    const onUnavailable = (): void => finish(UNAVAILABLE)
    const timeout = setTimeout(onUnavailable, SHELL_TAB_MOVE_TIMEOUT_MS)
    const onReply = (event: Electron.IpcMainEvent, reply: ShellTabWorkspaceMoveReply): void => {
      // Only the asked window may answer; a visible request id confers nothing.
      if (event.sender !== webContents || reply?.requestId !== requestId || !reply.result) {
        return
      }
      finish(reply.result)
    }
    const lifetime = abortWhenRendererGone(webContents)
    lifetime.signal.addEventListener('abort', onUnavailable, { once: true })
    releaseListeners.push(
      lifetime.dispose,
      () => lifetime.signal.removeEventListener('abort', onUnavailable),
      addFanoutListener(window, 'closed', onUnavailable),
      addFanoutListener(ipcMain, 'ui:shellTabWorkspaceMoveReply', onReply)
    )
    try {
      webContents.send('ui:moveShellTabToWorkspace', { requestId, tabId, targetWorktreeId })
    } catch {
      finish(UNAVAILABLE)
    }
  })
}
