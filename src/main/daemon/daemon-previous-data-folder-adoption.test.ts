import './mock-descendant-sweep'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parsePtySessionId } from '../../shared/pty-session-id-format'
import { createMockSubprocess } from './daemon-pty-adapter-test-harness'
import { createPreviousDataFolderDaemonAdapters } from './daemon-legacy-adapters'
import { DaemonPtyAdapter } from './daemon-pty-adapter'
import { DaemonRouterRetirement } from './daemon-router-retirement'
import { DaemonServer } from './daemon-server'
import { getDaemonPidPath, getDaemonSocketPath, getDaemonTokenPath } from './daemon-spawner'
import { daemonRuntimeDirFor } from './daemon-runtime-dir'
import { PROTOCOL_VERSION } from './types'

vi.mock('./daemon-health', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./daemon-health')>()),
  getMacDaemonSystemResolverHealth: vi.fn(async () => 'unknown')
}))
vi.mock('./daemon-tcc-attribution', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./daemon-tcc-attribution')>()),
  getMacDaemonTccAttributionHealth: vi.fn(async () => 'unknown')
}))

const PROMPT_SESSION = 'wt-prompt::/project@@a1'
const UPSTREAM_ORCA_SESSION = 'wt-upstream::/other@@b2'
const STARTED_AT = 1_700_000_000_000

describe('terminal daemons left in the previous data folder', () => {
  let root: string
  let previousUserData: string
  let runtimeDir: string
  let server: DaemonServer
  const adapters: DaemonPtyAdapter[] = []

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'pda-'))
    previousUserData = join(root, 'orca')
    runtimeDir = daemonRuntimeDirFor(previousUserData)
    mkdirSync(runtimeDir, { recursive: true })
    server = new DaemonServer({
      socketPath: getDaemonSocketPath(runtimeDir),
      tokenPath: getDaemonTokenPath(runtimeDir),
      log: { log: () => {}, close() {} },
      spawnSubprocess: () => createMockSubprocess()
    })
    await server.start()
    writeFileSync(
      getDaemonPidPath(runtimeDir),
      JSON.stringify({ pid: process.pid, startedAtMs: STARTED_AT })
    )
    // The old build opened two terminals in this daemon before quitting.
    const oldApp = new DaemonPtyAdapter({
      socketPath: getDaemonSocketPath(runtimeDir),
      tokenPath: getDaemonTokenPath(runtimeDir)
    })
    await oldApp.spawn({ cols: 80, rows: 24, cwd: '/project', sessionId: PROMPT_SESSION })
    await oldApp.spawn({ cols: 80, rows: 24, cwd: '/other', sessionId: UPSTREAM_ORCA_SESSION })
    await oldApp.disconnectOnly()
  })

  afterEach(async () => {
    for (const adapter of adapters.splice(0)) {
      await adapter.disconnectOnly().catch(() => {})
    }
    await server.shutdown()
    rmSync(root, { recursive: true, force: true })
  })

  async function liveSessionIds(): Promise<string[]> {
    const probe = new DaemonPtyAdapter({
      socketPath: getDaemonSocketPath(runtimeDir),
      tokenPath: getDaemonTokenPath(runtimeDir)
    })
    try {
      return (await probe.listSessions())
        .filter((session) => session.isAlive)
        .map((session) => session.sessionId)
        .sort()
    } finally {
      await probe.disconnectOnly()
    }
  }

  it('adopts a daemon started before the move and keeps every session alive', async () => {
    const found = await createPreviousDataFolderDaemonAdapters(
      { userDataPath: previousUserData, migratedAtMs: STARTED_AT + 1 },
      join(root, 'Prompt', 'terminal-history')
    )
    adapters.push(...found)

    expect(found).toHaveLength(1)
    expect(found[0].fromPreviousDataFolder).toBe(true)
    expect(found[0].protocolVersion).toBe(PROTOCOL_VERSION)

    // Prompt knows only its own workspace; the other session is never killed.
    const reconciled = await found[0].reconcileOnStartup(
      new Set([parsePtySessionId(PROMPT_SESSION).worktreeId!])
    )
    expect(reconciled).toEqual({ alive: [PROMPT_SESSION], killed: [] })
    expect(await liveSessionIds()).toEqual([PROMPT_SESSION, UPSTREAM_ORCA_SESSION].sort())

    // Prompt never asks that daemon to exit.
    expect(await found[0].requestIdleRetirement()).toEqual({ state: 'unsupported' })
    expect(await liveSessionIds()).toHaveLength(2)
  })

  it('leaves a daemon started after the move (upstream Orca’s) alone', async () => {
    const found = await createPreviousDataFolderDaemonAdapters(
      { userDataPath: previousUserData, migratedAtMs: STARTED_AT - 1 },
      join(root, 'history')
    )
    expect(found).toEqual([])
    expect(await liveSessionIds()).toHaveLength(2)
  })

  it('does not adopt without a pid record and never cleans up records in the old folder', async () => {
    const pidPath = getDaemonPidPath(runtimeDir)
    const pidRecord = readFileSync(pidPath, 'utf8')
    rmSync(pidPath)
    const staleToken = getDaemonTokenPath(runtimeDir, 40)
    const stalePid = getDaemonPidPath(runtimeDir, 40)
    writeFileSync(staleToken, 'old')
    writeFileSync(stalePid, '{"pid":999999999}')

    expect(
      await createPreviousDataFolderDaemonAdapters(
        { userDataPath: previousUserData, migratedAtMs: STARTED_AT + 1 },
        join(root, 'history')
      )
    ).toEqual([])
    expect(existsSync(staleToken)).toBe(true)
    expect(existsSync(stalePid)).toBe(true)
    expect(await liveSessionIds()).toHaveLength(2)
    writeFileSync(pidPath, pidRecord)
  })

  it('finds nothing when the old folder has no daemon', async () => {
    expect(
      await createPreviousDataFolderDaemonAdapters(
        { userDataPath: join(root, 'missing'), migratedAtMs: STARTED_AT + 1 },
        join(root, 'history'),
        async () => {
          throw new Error('must not probe without a pid record')
        }
      )
    ).toEqual([])
  })
})

describe('idle retirement with a previous-folder daemon attached', () => {
  it('retires only Prompt’s own daemons and ignores the previous-folder daemon', async () => {
    const own = {
      fromPreviousDataFolder: false,
      protocolVersion: PROTOCOL_VERSION,
      listSessions: vi.fn(async () => []),
      requestIdleRetirement: vi.fn(async () => ({ state: 'retiring' as const })),
      releaseIdleRetirementFence: vi.fn()
    }
    const previous = {
      fromPreviousDataFolder: true,
      protocolVersion: PROTOCOL_VERSION,
      listSessions: vi.fn(async () => [{ id: 'busy' }]),
      requestIdleRetirement: vi.fn(async () => ({ state: 'retiring' as const })),
      releaseIdleRetirementFence: vi.fn()
    }
    const retirement = new DaemonRouterRetirement(
      () => [own, previous] as unknown as DaemonPtyAdapter[]
    )

    expect(await retirement.requestIdleRetirement()).toEqual({ state: 'retiring' })
    expect(own.requestIdleRetirement).toHaveBeenCalledTimes(1)
    expect(previous.listSessions).not.toHaveBeenCalled()
    expect(previous.requestIdleRetirement).not.toHaveBeenCalled()
  })
})
