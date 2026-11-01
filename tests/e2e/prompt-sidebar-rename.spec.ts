import type { Page, TestInfo } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { waitForSessionReady } from './helpers/store'
import { execInTerminal } from './helpers/terminal'
import {
  attachScreenshot,
  createMoveWorkspaces,
  openShellTab,
  paneKeyOf
} from './helpers/prompt-shell-move'
import {
  attachJson,
  installRenameProbe,
  readRenameProbe,
  readTabNames,
  settlesTo,
  sidebarRow
} from './helpers/prompt-sidebar-rename-probe'

// Renaming a session from the sidebar row's right-click menu ("Rename… ⌘R"). The field opens on the
// row itself ([PROMPT] 사이드바 1A); the tab strip's Change Title keeps its own field. Each scene
// types like a person would (into whatever has focus) and records whether the field appeared and
// where focus went, with screenshots along the way.
// @headful: focus and blur only behave like the real app when the window owns OS focus.

const CLAUDE_SESSION_ID = '5d2f3b8e-4a61-4f0b-8c7e-2b9d0e6a1c34'

type Scene = {
  label: string
  worktreeId: string
  tabId: string
  newName: string
  /** What the name should read after typing newName; defaults to newName. */
  savedName?: string
  /** The field should open on the sidebar row rather than in the tab strip. */
  onRow?: boolean
  openRename: (page: Page) => Promise<void>
}

async function openFromSidebarRow(page: Page, tabId: string): Promise<void> {
  const row = sidebarRow(page, tabId)
  await row.scrollIntoViewIfNeeded()
  await expect(row).toBeVisible()
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Rename|이름 바꾸기/ }).click()
}

async function openFromTabStrip(page: Page, tabId: string): Promise<void> {
  await page
    .locator(`[data-testid="sortable-tab"][data-tab-id=${JSON.stringify(tabId)}]`)
    .first()
    .click({ button: 'right' })
  await page.getByRole('menuitem', { name: /^Change Title(?:\s|$)/ }).click()
}

async function renameLikeAPerson(page: Page, testInfo: TestInfo, scene: Scene): Promise<void> {
  const { label, worktreeId, tabId, newName } = scene
  const savedName = scene.savedName ?? newName
  await attachScreenshot(page, testInfo, `${label}-0-before`)
  await installRenameProbe(page)
  await scene.openRename(page)

  // The field mounts a frame or two after the menu item; give it time, but record a miss.
  const inputAppeared = await settlesTo(
    () => readRenameProbe(page).then((probe) => probe.inputEverMounted),
    true,
    3_000
  )
  // ast-grep-ignore: test-no-real-time-wait -- a person pauses before typing; focus thieves (menu close restore, terminal focus) run in this gap
  await page.waitForTimeout(800)
  const beforeTyping = await readRenameProbe(page)
  const fieldOnRow = await sidebarRow(page, tabId)
    .locator('[data-prompt-session-rename]')
    .isVisible()
  await attachScreenshot(page, testInfo, `${label}-1-after-menu`)

  await page.keyboard.type(newName)
  await attachScreenshot(page, testInfo, `${label}-2-typed`)
  await page.keyboard.press('Enter')

  const saved = await settlesTo(
    () => readTabNames(page, worktreeId, tabId).then((names) => names.customTitle),
    savedName,
    3_000
  )
  const afterEnter = await readRenameProbe(page)
  const names = await readTabNames(page, worktreeId, tabId)
  await attachScreenshot(page, testInfo, `${label}-3-after-enter`)
  const summary = {
    scene: label,
    tabId,
    newName,
    inputAppeared,
    fieldOnRow,
    inputMountedBeforeTyping: beforeTyping.inputMountedNow,
    activeElementBeforeTyping: beforeTyping.activeElement,
    documentHasFocus: beforeTyping.documentHasFocus,
    saved,
    names,
    activeElementAfterEnter: afterEnter.activeElement,
    events: afterEnter.events
  }
  await attachJson(testInfo, `${label}-diagnostics`, summary)
  console.log(`[sidebar-rename] ${JSON.stringify(summary)}`)

  expect(inputAppeared, 'the rename field never appeared').toBe(true)
  expect(fieldOnRow, 'the rename field is not on the sidebar row').toBe(scene.onRow ?? false)
  expect(names.customTitle, 'the tab did not get the typed name').toBe(savedName)
  expect(names.stripTitle, 'the tab strip does not show the typed name').toBe(savedName)
  expect(names.sidebarRowText, 'the sidebar row does not show the typed name').toContain(savedName)
}

test.describe('renaming a session from its sidebar row @headful', () => {
  test('@headful control: the tab strip menu Change Title renames the tab', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'rename-control')
    const { tabId } = await openShellTab(page, ws.a.id)
    await renameLikeAPerson(page, testInfo, {
      label: '0-tab-strip',
      worktreeId: ws.a.id,
      tabId,
      newName: 'Strip Renamed',
      openRename: (page) => openFromTabStrip(page, tabId)
    })
  })

  test('@headful a shell row renames its tab', async ({ orcaPage: page }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'rename-shell')
    const { tabId } = await openShellTab(page, ws.a.id)
    await renameLikeAPerson(page, testInfo, {
      label: '1-shell-row',
      worktreeId: ws.a.id,
      tabId,
      newName: 'Shell Renamed',
      onRow: true,
      openRename: (page) => openFromSidebarRow(page, tabId)
    })
  })

  test('@headful a shell row of a tab not on screen renames it', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'rename-hidden')
    const { tabId } = await openShellTab(page, ws.a.id)
    // A second tab takes the screen, so the rename has to bring the first one forward.
    await openShellTab(page, ws.a.id)
    await renameLikeAPerson(page, testInfo, {
      label: '2-shell-row-inactive',
      worktreeId: ws.a.id,
      tabId,
      newName: 'Hidden Shell Renamed',
      onRow: true,
      openRename: (page) => openFromSidebarRow(page, tabId)
    })
  })

  test('@headful a named row keeps its "[PROJECT] " prefix and replaces only the topic', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'rename-topic')
    const { tabId } = await openShellTab(page, ws.a.id)
    await page.evaluate((tabId) => {
      window.__store?.getState().setTabCustomTitle(tabId, '[E2E] 처음')
    }, tabId)
    await renameLikeAPerson(page, testInfo, {
      label: '4-topic-only',
      worktreeId: ws.a.id,
      tabId,
      newName: 'Topic',
      savedName: '[E2E] Topic',
      onRow: true,
      openRename: (page) => openFromSidebarRow(page, tabId)
    })
  })

  test('@headful a Claude row renames its tab', async ({ orcaPage: page }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'rename-claude')
    const { tabId, ptyId } = await openShellTab(page, ws.a.id)
    // As in the shell move journeys: a running command keeps the pane from reading as an idle
    // shell, and the status stands in for a real Claude hook report.
    await execInTerminal(page, ptyId, 'sleep 300')
    // ast-grep-ignore: test-no-real-time-wait -- the shell exposes no event for handing the terminal to sleep
    await page.waitForTimeout(1_500)
    const paneKey = await paneKeyOf(page, tabId, ptyId)
    await page.evaluate(
      ({ paneKey, worktreeId, sessionId }) => {
        window.__store
          ?.getState()
          .setAgentStatus(
            paneKey,
            { state: 'working', prompt: 'rename test', agentType: 'claude' },
            'Claude',
            undefined,
            { worktreeId },
            { providerSession: { key: 'session_id', id: sessionId } }
          )
      },
      { paneKey, worktreeId: ws.a.id, sessionId: CLAUDE_SESSION_ID }
    )
    // The row is now drawn as an agent row (its name span), not a plain terminal row.
    await expect(sidebarRow(page, tabId).locator('[data-prompt-session-name]')).toBeVisible({
      timeout: 15_000
    })
    await renameLikeAPerson(page, testInfo, {
      label: '3-claude-row',
      worktreeId: ws.a.id,
      tabId,
      newName: 'Claude Renamed',
      onRow: true,
      openRename: (page) => openFromSidebarRow(page, tabId)
    })
    await execInTerminal(page, ptyId, '\x03')
  })
})
