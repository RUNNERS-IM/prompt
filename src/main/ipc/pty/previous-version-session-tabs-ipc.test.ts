import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/unused') },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() }
}))

import { DaemonPtyRouter } from '../../daemon/daemon-pty-router'
import { getHistorySessionDirName } from '../../daemon/history-paths'
import { PREVIOUS_VERSION_SESSION_TABS_MARKER_FILE } from '../../daemon/previous-folder-session-tabs'
import { previousFolderSessionTrace } from '../../daemon/previous-folder-session-trace'
import { _resetTracerForTests, setActiveSink } from '../../observability/tracer'
import {
  handlePreviousVersionSessionTabsRequest,
  resetPreviousVersionSessionTabsClaimForTest,
  type PreviousVersionSessionTabsDeps
} from './previous-version-session-tabs-ipc'

const NOW = 1_800_000_000_000
const SESSION = 'repo1::/wt-a@@s1'

let root: string
let spans: { name: string; attributes: Record<string, unknown> }[]

function deps(
  overrides: Partial<PreviousVersionSessionTabsDeps> = {}
): PreviousVersionSessionTabsDeps {
  return {
    awaitProviderStartup: async () => {},
    // Only the class matters: a router means previous-folder adapters were found.
    getProvider: () => Object.create(DaemonPtyRouter.prototype),
    getPreMigrationUserData: () => ({ userDataPath: join(root, 'orca') }),
    userDataPath: () => join(root, 'Prompt'),
    nowMs: () => NOW,
    ...overrides
  }
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'pvsti-'))
  mkdirSync(join(root, 'Prompt'), { recursive: true })
  const dir = join(root, 'orca', 'terminal-history', getHistorySessionDirName(SESSION))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'output.log'), 'x')
  utimesSync(join(dir, 'output.log'), (NOW - 60_000) / 1000, (NOW - 60_000) / 1000)
  previousFolderSessionTrace.recordDiscovered(
    new Map([[SESSION, { fromPreviousDataFolder: true, protocolVersion: 7 }]])
  )
  spans = []
  setActiveSink({
    push: (record) => spans.push(record as (typeof spans)[number]),
    flush() {},
    close() {}
  })
  resetPreviousVersionSessionTabsClaimForTest()
})

afterEach(() => {
  _resetTracerForTests()
  rmSync(root, { recursive: true, force: true })
})

describe('previous-version session tabs over IPC', () => {
  it('hands out the list once, records the outcome, and never again on the next launch', async () => {
    const listed = await handlePreviousVersionSessionTabsRequest({ phase: 'list' }, deps())
    expect(listed).toEqual({
      status: 'pending',
      candidates: [
        { sessionId: SESSION, worktreeId: 'repo1::/wt-a', lastActivityAtMs: NOW - 60_000 }
      ]
    })
    // A second window in the same launch gets nothing to create.
    expect(await handlePreviousVersionSessionTabsRequest({ phase: 'list' }, deps())).toEqual({
      status: 'done'
    })

    await handlePreviousVersionSessionTabsRequest(
      { phase: 'report', created: 1, skipped: { 'has-tab': 2, bogus: 9 } },
      deps()
    )
    const markerPath = join(root, 'Prompt', PREVIOUS_VERSION_SESSION_TABS_MARKER_FILE)
    expect(JSON.parse(readFileSync(markerPath, 'utf8'))).toEqual({
      doneAtMs: NOW,
      created: 1,
      skipped: { 'has-tab': 2 }
    })
    const created = spans.find((span) => span.name === 'daemon.previous-folder.tabs-created')
    expect(created?.attributes).toMatchObject({ 'tabs.created': 1, 'skipped.has-tab': 2 })

    // Next launch: a fresh process, same profile.
    resetPreviousVersionSessionTabsClaimForTest()
    expect(await handlePreviousVersionSessionTabsRequest({ phase: 'list' }, deps())).toEqual({
      status: 'done'
    })
  })

  it('does nothing for a profile that never moved', async () => {
    const result = await handlePreviousVersionSessionTabsRequest(
      { phase: 'list' },
      deps({ getPreMigrationUserData: () => null })
    )
    expect(result).toEqual({ status: 'not-applicable' })
  })

  it('retries next launch when the daemon was not usable, without recording completion', async () => {
    const result = await handlePreviousVersionSessionTabsRequest(
      { phase: 'list' },
      deps({ getProvider: () => null })
    )
    expect(result).toEqual({ status: 'not-ready' })
    await handlePreviousVersionSessionTabsRequest(
      { phase: 'report', created: 0, skipped: {} },
      deps()
    )
    expect(existsSync(join(root, 'Prompt', PREVIOUS_VERSION_SESSION_TABS_MARKER_FILE))).toBe(false)
    // The same launch may still ask again once the daemon is ready.
    expect((await handlePreviousVersionSessionTabsRequest({ phase: 'list' }, deps()))?.status).toBe(
      'pending'
    )
  })
})
