import { describe, expect, it, vi } from 'vitest'
import type { DaemonSessionInfo } from '../../daemon/daemon-session-info'

const { handleMock, getDaemonProviderMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  getDaemonProviderMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock, removeHandler: vi.fn() }
}))
vi.mock('../../daemon/daemon-provider-state', () => ({
  getDaemonProvider: getDaemonProviderMock,
  getCurrentDaemonMacTccAttributionHealth: vi.fn(async () => 'unknown')
}))

function adapter(fromPreviousDataFolder: boolean, sessionIds: string[]) {
  return {
    protocolVersion: 7,
    fromPreviousDataFolder,
    listSessions: vi.fn(async () =>
      sessionIds.map((sessionId) => ({
        sessionId,
        state: 'running',
        shellState: 'ready',
        isAlive: true,
        pid: 1,
        cwd: null,
        cols: 80,
        rows: 24,
        createdAt: 0
      }))
    ),
    shutdown: vi.fn(async () => {}),
    getDaemonIdentity: vi.fn(() => null),
    // The real router subscribes to every adapter's events when built.
    onData: () => () => {},
    onBackgroundStreamEvent: () => () => {},
    onWriteUnavailable: () => () => {},
    onReplay: () => () => {},
    onExit: () => () => {}
  }
}

describe('Manage Sessions marks previous-version sessions no tab attached to', () => {
  it('flags only previous-folder sessions that have not been attached', async () => {
    vi.resetModules()
    const { registerDaemonManagementHandlers } = await import('./pty-management')
    const { DaemonPtyRouter } = await import('../../daemon/daemon-pty-router')
    const { previousFolderSessionTrace } =
      await import('../../daemon/previous-folder-session-trace')
    const current = adapter(false, ['wt::/new@@1'])
    const previous = adapter(true, ['wt::/old@@1', 'wt::/old@@2'])
    getDaemonProviderMock.mockReturnValue(
      new DaemonPtyRouter({ current: current as never, legacy: [previous] as never })
    )
    previousFolderSessionTrace.noteAttach(
      new Map([['wt::/old@@1', previous]]),
      'wt::/old@@1',
      'spawn'
    )
    registerDaemonManagementHandlers()
    const listSessions = handleMock.mock.calls.find(
      ([channel]) => channel === 'pty:management:listSessions'
    )?.[1] as () => Promise<{ sessions: DaemonSessionInfo[] }>

    const { sessions } = await listSessions()
    const flagged = Object.fromEntries(
      sessions.map((session) => [session.sessionId, session.previousVersionUnattached === true])
    )
    expect(flagged).toEqual({
      'wt::/new@@1': false,
      'wt::/old@@1': false,
      'wt::/old@@2': true
    })
  })
})
