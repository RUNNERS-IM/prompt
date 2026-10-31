import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ShellTabWorkspaceMoveRequest } from '../../shared/shell-tab-workspace-move-types'

const ipcEmitter = new EventEmitter()
const ipcMainMock = {
  on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    ipcEmitter.on(channel, listener)
  }),
  removeListener: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
    ipcEmitter.removeListener(channel, listener)
  })
}
vi.mock('electron', () => ({ app: {}, ipcMain: ipcMainMock }))

const { requestShellTabWorkspaceMove } = await import('./shell-tab-workspace-move-relay')

function createWindow() {
  const webContents = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    send: vi.fn<(channel: string, request: ShellTabWorkspaceMoveRequest) => void>()
  })
  const windowEvents = Object.assign(new EventEmitter(), { isDestroyed: () => false, webContents })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the relay uses only these window/contents members.
  const window = windowEvents as unknown as BrowserWindow
  const sentRequest = (): ShellTabWorkspaceMoveRequest => {
    const [channel, request] = webContents.send.mock.calls[0] ?? []
    expect(channel).toBe('ui:moveShellTabToWorkspace')
    return request!
  }
  return { webContents, window, windowEvents, sentRequest }
}

function reply(sender: unknown, requestId: string, result: unknown): void {
  ipcEmitter.emit('ui:shellTabWorkspaceMoveReply', { sender }, { requestId, result })
}

describe('requestShellTabWorkspaceMove', () => {
  beforeEach(() => ipcEmitter.removeAllListeners())
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('returns the answer of the asked window only', async () => {
    const { webContents, window, sentRequest } = createWindow()
    const pending = requestShellTabWorkspaceMove(window, 'tab-1', 'repo-2::/src/other')
    const request = sentRequest()
    expect(request).toMatchObject({ tabId: 'tab-1', targetWorktreeId: 'repo-2::/src/other' })
    reply({}, request.requestId, { moved: true, tabId: 'x', worktreeId: 'y' })
    reply(webContents, 'other-request', { moved: true, tabId: 'x', worktreeId: 'y' })
    reply(webContents, request.requestId, { moved: false, reason: 'running-program' })
    expect(await pending).toEqual({ moved: false, reason: 'running-program' })
    expect(ipcEmitter.listenerCount('ui:shellTabWorkspaceMoveReply')).toBe(0)
  })

  it('answers renderer-unavailable when the window closes or never answers', async () => {
    const closing = createWindow()
    const closed = requestShellTabWorkspaceMove(closing.window, 'tab-1', 'w')
    closing.windowEvents.emit('closed')
    expect(await closed).toEqual({ moved: false, reason: 'renderer-unavailable' })

    vi.useFakeTimers()
    const silent = createWindow()
    const timedOut = requestShellTabWorkspaceMove(silent.window, 'tab-1', 'w')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await timedOut).toEqual({ moved: false, reason: 'renderer-unavailable' })
  })
})
