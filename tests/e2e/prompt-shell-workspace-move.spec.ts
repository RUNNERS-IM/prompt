import type { ElectronApplication, Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { RuntimeClient } from '../../src/cli/runtime-client'
import { attachRepoAndOpenTerminal, createRestartSession } from './helpers/orca-restart'
import { launchWithUnreachableSshWorkspaces } from './helpers/seeded-ssh-workspaces'
import { waitForSessionReady } from './helpers/store'
import { execInTerminal, splitActiveTerminalPane } from './helpers/terminal'
import { getTerminalContentForPtyId, waitForPtyPaneMounted } from './terminal-pty-readiness'
import {
  activeWorkspaceAndTab,
  attachScreenshot,
  createMoveWorkspaces,
  dragSessionRow,
  markShell,
  openShellTab,
  paneConversationFacts,
  paneKeyOf,
  processAlive,
  readShellIdentity,
  realFolder,
  startFakeClaude,
  waitForSavedMove,
  waitForTabPtyIds,
  workspaceOfTab
} from './helpers/prompt-shell-move'

// Journeys for moving a terminal tab, its running shell included, to another workspace.

const CLAUDE_SESSION_ID = '0f6b8a52-2f2c-4c1e-9d43-7f1f4d2b9a10'

function removeWorkspace(page: Page, id: string): Promise<void> {
  return page.evaluate(async (id) => {
    await window.__store?.getState().removeWorktree({ id, executionHostId: null }, true)
  }, id)
}

async function runtimeClient(app: ElectronApplication): Promise<RuntimeClient> {
  const userDataDir = await app.evaluate(({ app }) => app.getPath('userData'))
  return new RuntimeClient(userDataDir, 30_000, null, null)
}

type MoveReply =
  | { move: { tabId: string; moved: true; worktreeId: string } }
  | { move: { tabId: string; moved: false; reason: string } }

async function moveByRuntime(
  client: RuntimeClient,
  paneKey: string,
  worktreeId: string
): Promise<MoveReply['move']> {
  const resolved = await client.call<{ terminal: { handle: string } }>('terminal.resolvePane', {
    paneKey
  })
  const reply = await client.call<MoveReply>('terminal.moveToWorkspace', {
    terminal: resolved.result.terminal.handle,
    worktree: `id:${worktreeId}`
  })
  return reply.result.move
}

test.describe('moving a shell tab to another workspace', () => {
  test('dropping an idle shell row moves the same shell into the target folder', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'drop')
    const { tabId, ptyId } = await openShellTab(page, ws.a.id)
    const mark = await markShell(page, ptyId)
    const before = await readShellIdentity(page, testInfo, ptyId)
    expect(before.cwd).toBe(realFolder(ws.a.path))

    const { targetLit } = await dragSessionRow(page, tabId, ws.b.id)
    expect(targetLit).toBe(true)

    await expect.poll(() => workspaceOfTab(page, tabId), { timeout: 15_000 }).toBe(ws.b.id)
    await expect.poll(() => activeWorkspaceAndTab(page)).toEqual({ worktreeId: ws.b.id, tabId })
    expect(await waitForTabPtyIds(page, tabId, 1)).toEqual([ptyId])
    const after = await readShellIdentity(page, testInfo, ptyId)
    expect(after).toEqual({ pid: before.pid, cwd: realFolder(ws.b.path), mark })
    await attachScreenshot(page, testInfo, '1-shell-moved-by-drop')
  })

  test('a split tab moves with both of its shells', async ({ orcaPage: page }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'split')
    const { tabId, ptyId: firstPty } = await openShellTab(page, ws.a.id)
    await splitActiveTerminalPane(page, 'vertical')
    const ptyIds = await waitForTabPtyIds(page, tabId, 2)
    const secondPty = ptyIds.find((id) => id !== firstPty)!
    await waitForPtyPaneMounted(page, secondPty, 15_000)
    const firstBefore = await readShellIdentity(page, testInfo, firstPty)
    const secondBefore = await readShellIdentity(page, testInfo, secondPty)

    expect((await dragSessionRow(page, tabId, ws.b.id)).targetLit).toBe(true)

    await expect.poll(() => workspaceOfTab(page, tabId), { timeout: 15_000 }).toBe(ws.b.id)
    expect([...(await waitForTabPtyIds(page, tabId, 2))].sort()).toEqual([...ptyIds].sort())
    const folder = realFolder(ws.b.path)
    expect(await readShellIdentity(page, testInfo, firstPty)).toMatchObject({
      pid: firstBefore.pid,
      cwd: folder
    })
    expect(await readShellIdentity(page, testInfo, secondPty)).toMatchObject({
      pid: secondBefore.pid,
      cwd: folder
    })
    await attachScreenshot(page, testInfo, '2-split-tab-moved')
  })

  test('a shell running a program stays where it is', async ({ orcaPage: page }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'busy')
    const { tabId, ptyId } = await openShellTab(page, ws.a.id)
    await execInTerminal(page, ptyId, 'sleep 300')
    // ast-grep-ignore: test-no-real-time-wait -- the shell exposes no event for handing the terminal to sleep
    await page.waitForTimeout(1_500)

    await dragSessionRow(page, tabId, ws.b.id)
    // ast-grep-ignore: test-no-real-time-wait -- proving nothing happened needs time past the 2s running-work probe
    await page.waitForTimeout(5_000)
    expect(await workspaceOfTab(page, tabId)).toBe(ws.a.id)
    await attachScreenshot(page, testInfo, '3-busy-shell-not-moved')
    await execInTerminal(page, ptyId, '\x03')
  })

  test('the moved shell belongs to the target workspace when either one is removed', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'remove')
    const { tabId, ptyId } = await openShellTab(page, ws.a.id)
    const { pid } = await readShellIdentity(page, testInfo, ptyId)
    expect((await dragSessionRow(page, tabId, ws.b.id)).targetLit).toBe(true)
    await expect.poll(() => workspaceOfTab(page, tabId), { timeout: 15_000 }).toBe(ws.b.id)
    await waitForSavedMove(page, tabId, ptyId, ws.b.id)

    await removeWorkspace(page, ws.a.id)
    // ast-grep-ignore: test-no-real-time-wait -- the shell must still be alive after teardown had time to kill it
    await page.waitForTimeout(3_000)
    expect(processAlive(pid)).toBe(true)
    expect(await workspaceOfTab(page, tabId)).toBe(ws.b.id)
    await attachScreenshot(page, testInfo, '4a-original-removed-shell-alive')

    await removeWorkspace(page, ws.b.id)
    await expect.poll(() => processAlive(pid), { timeout: 20_000 }).toBe(false)
    await attachScreenshot(page, testInfo, '4b-target-removed-shell-gone')
  })

  test('a moved shell is still in the target workspace after a restart', async ({
    testRepoPath
  }, testInfo) => {
    // Two full app launches plus a daemon reattach do not fit the default budget.
    test.setTimeout(240_000)
    const session = createRestartSession(testInfo)
    let app: ElectronApplication | null = null
    try {
      const first = await session.launch()
      app = first.app
      await waitForSessionReady(first.page)
      await attachRepoAndOpenTerminal(first.page, testRepoPath)
      const ws = await createMoveWorkspaces(first.page, 'restart')
      const { tabId, ptyId } = await openShellTab(first.page, ws.a.id)
      const mark = await markShell(first.page, ptyId)
      const { pid } = await readShellIdentity(first.page, testInfo, ptyId)
      expect((await dragSessionRow(first.page, tabId, ws.b.id)).targetLit).toBe(true)
      await expect.poll(() => workspaceOfTab(first.page, tabId), { timeout: 15_000 }).toBe(ws.b.id)
      await waitForSavedMove(first.page, tabId, ptyId, ws.b.id)
      // Removing the original workspace must not take the moved shell with it on the next start.
      await removeWorkspace(first.page, ws.a.id)

      await session.close(app)
      app = null
      const second = await session.launch()
      app = second.app
      await waitForSessionReady(second.page)
      await expect.poll(() => workspaceOfTab(second.page, tabId), { timeout: 30_000 }).toBe(ws.b.id)
      await second.page.evaluate(
        ({ worktreeId, tabId }) => {
          const state = window.__store?.getState()
          state?.setActiveWorktree(worktreeId)
          state?.setActiveTab(tabId)
        },
        { worktreeId: ws.b.id, tabId }
      )
      expect(await waitForTabPtyIds(second.page, tabId, 1)).toEqual([ptyId])
      await waitForPtyPaneMounted(second.page, ptyId, 30_000)
      expect(processAlive(pid)).toBe(true)
      expect(await readShellIdentity(second.page, testInfo, ptyId)).toEqual({
        pid,
        cwd: realFolder(ws.b.path),
        mark
      })
      await attachScreenshot(second.page, testInfo, '5-moved-shell-after-restart')
    } finally {
      if (app) {
        await session.close(app)
      }
      await session.dispose()
    }
  })

  test('a local shell cannot be moved to an SSH workspace', async ({ testRepoPath }, testInfo) => {
    // The SSH fixture launches the app twice to seed a stopped profile.
    test.setTimeout(240_000)
    const launched = await launchWithUnreachableSshWorkspaces(testInfo, testRepoPath, {
      label: 'move-shell-ssh',
      workspaces: [{ name: 'remote-move', displayName: 'Remote move target' }]
    })
    try {
      const { page, app, ssh, localWorktreeId } = launched
      const sshWorktreeId = ssh.worktreeIds['remote-move']!
      const { tabId, ptyId } = await openShellTab(page, localWorktreeId)
      // The sidebar lists one host's projects at a time, so an SSH row is never beside a local
      // one to drop on; the runtime call is the only way to aim a local shell at it.
      await expect(
        page.locator(`[data-prompt-session-drop-worktree=${JSON.stringify(sshWorktreeId)}]`)
      ).toHaveCount(0)
      const outcome = await moveByRuntime(
        await runtimeClient(app),
        await paneKeyOf(page, tabId, ptyId),
        sshWorktreeId
      ).catch((error: unknown) => ({ moved: false as const, reason: String(error) }))
      testInfo.annotations.push({ type: 'ssh-move-outcome', description: JSON.stringify(outcome) })
      expect(outcome.moved).toBe(false)
      expect(await workspaceOfTab(page, tabId)).toBe(localWorktreeId)
      await attachScreenshot(page, testInfo, '6-ssh-target-refused')
    } finally {
      await launched.dispose()
    }
  })

  test('the runtime call moves a shell without leaving the workspace being viewed', async ({
    orcaPage: page,
    electronApp
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'runtime')
    const stay = await openShellTab(page, ws.a.id)
    const moving = await openShellTab(page, ws.a.id)
    const { pid } = await readShellIdentity(page, testInfo, moving.ptyId)
    const client = await runtimeClient(electronApp)

    const moved = await moveByRuntime(
      client,
      await paneKeyOf(page, moving.tabId, moving.ptyId),
      ws.b.id
    )
    expect(moved).toMatchObject({ tabId: moving.tabId, moved: true, worktreeId: ws.b.id })
    expect(await workspaceOfTab(page, moving.tabId)).toBe(ws.b.id)
    // The user was looking at A: they stay there and A shows its remaining tab.
    await expect
      .poll(() => activeWorkspaceAndTab(page))
      .toEqual({ worktreeId: ws.a.id, tabId: stay.tabId })
    expect(await readShellIdentity(page, testInfo, moving.ptyId)).toMatchObject({
      pid,
      cwd: realFolder(ws.b.path)
    })
    await attachScreenshot(page, testInfo, '7a-runtime-move-kept-view')

    await execInTerminal(page, stay.ptyId, 'sleep 300')
    // ast-grep-ignore: test-no-real-time-wait -- the shell exposes no event for handing the terminal to sleep
    await page.waitForTimeout(1_500)
    const refused = await moveByRuntime(
      client,
      await paneKeyOf(page, stay.tabId, stay.ptyId),
      ws.b.id
    )
    expect(refused).toMatchObject({ tabId: stay.tabId, moved: false })
    expect(['running-program', 'idle-unknown']).toContain(
      'reason' in refused ? refused.reason : 'moved'
    )
    expect(await workspaceOfTab(page, stay.tabId)).toBe(ws.a.id)
    await attachScreenshot(page, testInfo, '7b-runtime-move-refused-while-busy')
    await execInTerminal(page, stay.ptyId, '\x03')
  })

  test('dropping a Claude session row opens a forked copy in the target workspace', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'claude')
    const { tabId, ptyId } = await openShellTab(page, ws.a.id)
    const paneKey = await paneKeyOf(page, tabId, ptyId)
    // A process named claude in the foreground, as in a real session; a plain sleep left the pane
    // marked as an idle shell, which hides its conversation id. The status below stands in for
    // the session id a real Claude hook reports.
    await startFakeClaude(page, testInfo, ptyId, paneKey)
    await page.evaluate(
      ({ paneKey, worktreeId, sessionId }) => {
        window.__store
          ?.getState()
          .setAgentStatus(
            paneKey,
            { state: 'working', prompt: 'move test', agentType: 'claude' },
            'Claude',
            undefined,
            { worktreeId },
            { providerSession: { key: 'session_id', id: sessionId } }
          )
      },
      { paneKey, worktreeId: ws.a.id, sessionId: CLAUDE_SESSION_ID }
    )
    const tabsInB = await page.evaluate(
      (id) => (window.__store?.getState().tabsByWorktree[id] ?? []).map((tab) => tab.id),
      ws.b.id
    )

    // The drop planner copies only a pane whose conversation id it can read.
    expect(await paneConversationFacts(page, paneKey)).toEqual({
      sessionId: CLAUDE_SESSION_ID,
      restoredUnconfirmed: false,
      shellForeground: false
    })
    const drag = await dragSessionRow(page, tabId, ws.b.id)
    expect(drag).toEqual({ dragStarted: true, targetLit: true })

    let copyTabId: string | undefined
    await expect
      .poll(
        async () => {
          const ids = await page.evaluate(
            (id) => (window.__store?.getState().tabsByWorktree[id] ?? []).map((tab) => tab.id),
            ws.b.id
          )
          copyTabId = ids.find((id) => !tabsInB.includes(id))
          return copyTabId ?? null
        },
        { timeout: 15_000 }
      )
      .not.toBeNull()
    // The original keeps running where it was.
    expect(await workspaceOfTab(page, tabId)).toBe(ws.a.id)
    const copyPty = (await waitForTabPtyIds(page, copyTabId!, 1))[0]!
    await expect
      .poll(() => getTerminalContentForPtyId(page, copyPty, 20_000), { timeout: 20_000 })
      .toContain(`claude --resume ${CLAUDE_SESSION_ID} --fork-session`)
    await attachScreenshot(page, testInfo, '8-claude-row-forked')
    await execInTerminal(page, ptyId, '\x03')
  })
})
