import { ipcRenderer } from 'electron'
import type {
  ShellTabWorkspaceMoveReply,
  ShellTabWorkspaceMoveRequest
} from '../../shared/shell-tab-workspace-move-types'
import type { PreloadApi } from '../api-types'

/** Main's `terminal.moveToWorkspace` asks this window to move a shell tab; the reply carries the result. */
export const uiShellTabMoveApi = {
  onMoveShellTabToWorkspace: (
    callback: (data: ShellTabWorkspaceMoveRequest) => void
  ): (() => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: ShellTabWorkspaceMoveRequest) =>
      callback(data)
    ipcRenderer.on('ui:moveShellTabToWorkspace', listener)
    return () => ipcRenderer.removeListener('ui:moveShellTabToWorkspace', listener)
  },
  replyShellTabWorkspaceMove: (reply: ShellTabWorkspaceMoveReply): void => {
    ipcRenderer.send('ui:shellTabWorkspaceMoveReply', reply)
  }
} satisfies Partial<PreloadApi['ui']>
