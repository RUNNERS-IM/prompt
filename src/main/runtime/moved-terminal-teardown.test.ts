import { mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import {
  setMovedTerminalOwnerSession,
  type MovedTerminalOwnerSession
} from '../../shared/moved-terminal-owner'
import type { IPtyProvider } from '../providers/pty-provider-contract'
import type { PtyProcessInfo } from '../providers/pty-process-info'
import type { WorkspaceSessionState } from '../../shared/workspace-session-state-types'
import { registerPty, unregisterPty } from '../memory/pty-registry'
import type * as HistoryPaths from '../terminal-history-paths'

const historyRoot = mkdtempSync(join(tmpdir(), 'moved-terminal-history-'))
vi.mock('../terminal-history-paths', async (importOriginal) => {
  const actual = await importOriginal<typeof HistoryPaths>()
  return { ...actual, getHistoryRoot: () => historyRoot, listWslHistoryRoots: () => [] }
})

const { sweepProviderByPrefix, sweepRegistryForWorktree } =
  await import('./worktree-pty-surface-sweeps')
const { worktreePtyOwnership } = await import('../providers/worktree-pty-ownership')
const { panesBoundToAnotherWorkspace } = await import('./terminal/recovery/foreign-pane-bindings')
const { deleteWorktreeHistoryDir } = await import('../terminal-history-deletion')
const { hashWorktreeId } = await import('../terminal-history-id')
const { DaemonPtyProcessInspection } = await import('../daemon/daemon-pty-process-inspection')
const { inferWorktreeIdFromPtyId } = await import('./runtime-worktree-path-identity')

const SOURCE = 'repo-1::/src/app'
const TARGET = 'repo-2::/src/other'
const MOVED = `${SOURCE}@@a1b2c3d4`
const STAYED = `${SOURCE}@@00000001`
const TARGET_OWN = `${TARGET}@@00000002`

/** The saved session after the shell tab moved from SOURCE to TARGET. */
function sessionAfterMove(): WorkspaceSessionState {
  return {
    activeRepoId: null,
    activeWorktreeId: TARGET,
    activeTabId: 't-moved',
    tabsByWorktree: {
      [SOURCE]: [tab('t-stayed', SOURCE, STAYED)],
      [TARGET]: [tab('t-moved', TARGET, MOVED, [MOVED]), tab('t-target', TARGET, TARGET_OWN)]
    },
    terminalLayoutsByTabId: {
      't-stayed': layout(STAYED),
      't-moved': layout(MOVED),
      't-target': layout(TARGET_OWN)
    }
  }
}

function tab(id: string, worktreeId: string, ptyId: string, adoptedPtyIds?: string[]) {
  return {
    id,
    ptyId,
    worktreeId,
    title: id,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 0,
    ...(adoptedPtyIds ? { adoptedPtyIds } : {})
  }
}

function layout(ptyId: string) {
  return {
    root: { type: 'leaf' as const, leafId: 'leaf-1' },
    activeLeafId: 'leaf-1',
    expandedLeafId: null,
    ptyIdsByLeafId: { 'leaf-1': ptyId }
  }
}

function fakeProvider(ids: string[]) {
  const stopped: string[] = []
  const provider = {
    listProcesses: async () =>
      ids.map((id) => ({ id, cwd: '', title: 'zsh' }) as unknown as PtyProcessInfo),
    shutdown: async (id: string) => {
      stopped.push(id)
    }
  } as unknown as IPtyProvider
  return { provider, stopped }
}

const stopPty = async (_ptyId: string, stop: () => Promise<boolean>) => ({
  stopped: await stop(),
  owner: true
})
const FAR = () => Date.now() + 60_000

function installMove(): void {
  const session = sessionAfterMove()
  setMovedTerminalOwnerSession(() => session as MovedTerminalOwnerSession)
}

afterEach(() => {
  setMovedTerminalOwnerSession(null)
  for (const id of [MOVED, STAYED, TARGET_OWN]) {
    unregisterPty(id)
  }
})
afterAll(() => rmSync(historyRoot, { recursive: true, force: true }))

describe('removing a workspace after one of its shells moved away', () => {
  it('leaves the moved shell running when the original workspace is removed', async () => {
    installMove()
    const { provider, stopped } = fakeProvider([MOVED, STAYED, TARGET_OWN])
    await sweepProviderByPrefix(SOURCE, provider, FAR(), stopPty)
    expect(stopped).toEqual([STAYED])
  })

  it('stops the moved shell when the workspace it moved to is removed', async () => {
    installMove()
    const { provider, stopped } = fakeProvider([MOVED, STAYED, TARGET_OWN])
    await sweepProviderByPrefix(TARGET, provider, FAR(), stopPty)
    expect(stopped.toSorted()).toEqual([MOVED, TARGET_OWN].toSorted())
  })

  it('does the same for terminals found through the local registry', async () => {
    installMove()
    for (const [ptyId, worktreeId] of [
      [MOVED, SOURCE],
      [STAYED, SOURCE],
      [TARGET_OWN, TARGET]
    ] as const) {
      registerPty({ ptyId, worktreeId, sessionId: ptyId, paneKey: null, pid: null })
    }
    const fromSource = fakeProvider([])
    await sweepRegistryForWorktree(SOURCE, fromSource.provider, FAR(), stopPty)
    expect(fromSource.stopped).toEqual([STAYED])
    const fromTarget = fakeProvider([])
    await sweepRegistryForWorktree(TARGET, fromTarget.provider, FAR(), stopPty)
    expect(fromTarget.stopped.toSorted()).toEqual([MOVED, TARGET_OWN].toSorted())
  })

  it('ignores the provider worktree and cwd once the terminal moved', () => {
    installMove()
    const info = { id: MOVED, worktreeId: SOURCE, cwd: '/src/app' } as unknown as PtyProcessInfo
    expect(worktreePtyOwnership(SOURCE)(info)).toBe(false)
    expect(worktreePtyOwnership(TARGET)(info)).toBe(true)
  })

  it('without the move record, the original workspace still owns its shell', async () => {
    const { provider, stopped } = fakeProvider([MOVED, STAYED])
    await sweepProviderByPrefix(SOURCE, provider, FAR(), stopPty)
    expect(stopped.toSorted()).toEqual([MOVED, STAYED].toSorted())
  })
})

describe('restoring a moved shell after a restart', () => {
  it('keeps the moved pane on its terminal instead of sending it home', () => {
    const session = sessionAfterMove()
    expect(panesBoundToAnotherWorkspace(session)).toEqual([])
    // The same binding without the record is a stale cross-workspace mapping and is released.
    const stale = structuredClone(session)
    delete (stale.tabsByWorktree[TARGET]![0] as { adoptedPtyIds?: string[] }).adoptedPtyIds
    expect(panesBoundToAnotherWorkspace(stale)).toEqual([
      { worktreeId: TARGET, tabId: 't-moved', leafId: 'leaf-1', ptyId: MOVED }
    ])
  })
})

describe('restart with the original workspace already removed', () => {
  async function reconcile(valid: string[]) {
    const killed: string[] = []
    const adopted: string[] = []
    const daemon = {
      fromPreviousDataFolder: false,
      ensureConnected: async () => {},
      adoptLiveSession: async (session: { sessionId: string }) => {
        adopted.push(session.sessionId)
      },
      client: {
        request: async (method: string, params?: { sessionId: string }) => {
          if (method === 'listSessions') {
            return {
              sessions: [MOVED, TARGET_OWN].map((sessionId) => ({ sessionId, isAlive: true }))
            }
          }
          if (method === 'kill' && params) {
            killed.push(params.sessionId)
          }
          return {}
        }
      }
    }
    const result = await DaemonPtyProcessInspection.prototype.reconcileOnStartup.call(
      daemon as never,
      new Set(valid)
    )
    return { ...result, killedRequests: killed, adopted }
  }

  it('keeps the moved shell alive and files it under the workspace that took it', async () => {
    installMove()
    const result = await reconcile([TARGET])
    expect(result.killed).toEqual([])
    expect(result.alive.toSorted()).toEqual([MOVED, TARGET_OWN].toSorted())
    expect(inferWorktreeIdFromPtyId(MOVED)).toBe(TARGET)
  })

  it('stops it once the workspace it moved to is gone too', async () => {
    installMove()
    const result = await reconcile([])
    expect(result.killedRequests.toSorted()).toEqual([MOVED, TARGET_OWN].toSorted())
  })
})

describe('command history of the original workspace', () => {
  it('is kept while a moved shell still writes it, and removed otherwise', () => {
    const dir = join(historyRoot, hashWorktreeId(SOURCE))
    mkdirSync(dir, { recursive: true })
    installMove()
    deleteWorktreeHistoryDir(SOURCE)
    expect(existsSync(dir)).toBe(true)

    setMovedTerminalOwnerSession(null)
    deleteWorktreeHistoryDir(SOURCE)
    expect(existsSync(dir)).toBe(false)
  })
})
