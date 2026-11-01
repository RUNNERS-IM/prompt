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

// Renaming a session from its sidebar row: the right-click menu ("Rename… ⌘R"), ⌘R itself, or a
// double-click. The field takes the row name's place ([PROMPT] 사이드바 이름 바꾸기 1B · 2A); the tab
// strip's Change Title keeps its own field. Each scene types like a person would (into whatever has
// focus), records whether the field appeared and where focus went, and checks in light and dark
// that the field sits on the name's line, hides nothing through itself and keeps the row's height.
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
  /** Run the scene with the app in its dark theme. */
  dark?: boolean
  /** Runs once the name is saved, before the names are read (e.g. to reopen the sidebar). */
  afterSave?: (page: Page) => Promise<void>
  openRename: (page: Page) => Promise<void>
}

async function openFromSidebarRow(page: Page, tabId: string): Promise<void> {
  const row = sidebarRow(page, tabId)
  await row.scrollIntoViewIfNeeded()
  await expect(row).toBeVisible()
  await row.click({ button: 'right' })
  await page.getByRole('menuitem', { name: /Rename|이름 바꾸기/ }).click()
}

async function openByDoubleClick(page: Page, tabId: string): Promise<void> {
  const row = sidebarRow(page, tabId)
  await row.scrollIntoViewIfNeeded()
  await row.dblclick()
}

// tab.rename has no default chord off macOS (Ctrl+R is the shell's search), so bind one for the test.
const RENAME_CHORD = 'Mod+Alt+R'

async function openByShortcut(page: Page, tabId: string): Promise<void> {
  await page.evaluate(
    async ([chord]) => window.__store?.getState().setKeybindingOverride('tab.rename', [chord]),
    [RENAME_CHORD]
  )
  await expect(sidebarRow(page, tabId)).toBeVisible()
  await page.keyboard.press('ControlOrMeta+Alt+r')
}

type RowLayout = {
  rowHeight: number
  input: { top: number; bottom: number } | null
  line: { top: number; bottom: number } | null
  status: { top: number; bottom: number } | null
  inputBackground: string
  timeShown: boolean
}

/** Where the rename field sits on its row, and whether the row kept its shape around it. */
async function readRowLayout(page: Page, tabId: string): Promise<RowLayout> {
  return sidebarRow(page, tabId).evaluate((wrapper) => {
    const box = (el: Element | null | undefined) => {
      if (!el) {
        return null
      }
      const r = el.getBoundingClientRect()
      return { top: r.top, bottom: r.bottom }
    }
    const input = wrapper.querySelector<HTMLElement>('[data-prompt-session-rename]')
    const time = wrapper.querySelector<HTMLElement>('[data-prompt-session-time]')
    return {
      rowHeight: wrapper.getBoundingClientRect().height,
      input: box(input),
      line: box(input?.parentElement),
      status: box(wrapper.querySelector('[data-prompt-session-status]')),
      inputBackground: input ? getComputedStyle(input).backgroundColor : '',
      timeShown: Boolean(time && time.getClientRects().length > 0)
    }
  })
}

/** A colour with any transparency lets the row underneath show through the field. */
function isSeeThrough(color: string): boolean {
  return (
    color === '' ||
    color === 'transparent' ||
    /\/\s*(0?\.\d+|\d+(\.\d+)?%)\s*\)/.test(color.replace(/\/\s*1\s*\)/, ')')) ||
    /rgba\([^)]*,\s*0?\.\d+\s*\)/.test(color)
  )
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
  if (scene.dark) {
    await page.evaluate(async () =>
      window.__store?.getState().updateSettingsOrThrow({ theme: 'dark' })
    )
    await expect(page.locator('html.dark')).toHaveCount(1)
  }
  const rowHeightBefore = scene.onRow ? (await readRowLayout(page, tabId)).rowHeight : 0
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
  const layout = scene.onRow ? await readRowLayout(page, tabId) : null
  await attachScreenshot(page, testInfo, `${label}-1-after-menu`)

  await page.keyboard.type(newName)
  await attachScreenshot(page, testInfo, `${label}-2-typed`)
  await page.keyboard.press('Enter')

  const saved = await settlesTo(
    () => readTabNames(page, worktreeId, tabId).then((names) => names.customTitle),
    savedName,
    3_000
  )
  await scene.afterSave?.(page)
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
    events: afterEnter.events,
    rowHeightBefore,
    layout
  }
  await attachJson(testInfo, `${label}-diagnostics`, summary)
  console.log(`[sidebar-rename] ${JSON.stringify(summary)}`)

  expect(inputAppeared, 'the rename field never appeared').toBe(true)
  expect(fieldOnRow, 'the rename field is not on the sidebar row').toBe(scene.onRow ?? false)
  if (layout) {
    const { input, line, status } = layout
    expect(input && line, 'the rename field has no line of its own').toBeTruthy()
    expect(input!.top, 'the field rises above the name line').toBeGreaterThanOrEqual(
      line!.top - 0.5
    )
    expect(input!.bottom, 'the field drops below the name line').toBeLessThanOrEqual(
      line!.bottom + 0.5
    )
    if (status) {
      expect(status.top, 'the field covers the status line').toBeGreaterThanOrEqual(
        input!.bottom - 0.5
      )
    }
    expect(layout.rowHeight, 'the row changed height while renaming').toBeCloseTo(
      rowHeightBefore,
      0
    )
    expect(
      isSeeThrough(layout.inputBackground),
      `see-through field: ${layout.inputBackground}`
    ).toBe(false)
    expect(layout.timeShown, 'the time still shows beside the field').toBe(false)
  }
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

  for (const dark of [false, true]) {
    test(`@headful a Claude row renames its tab (${dark ? 'dark' : 'light'})`, async ({
      orcaPage: page
    }, testInfo) => {
      await waitForSessionReady(page)
      const ws = await createMoveWorkspaces(page, dark ? 'rename-claude-dark' : 'rename-claude')
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
        label: dark ? '3-claude-row-dark' : '3-claude-row',
        worktreeId: ws.a.id,
        tabId,
        newName: 'Claude Renamed',
        onRow: true,
        dark,
        openRename: (page) => openFromSidebarRow(page, tabId)
      })
      await execInTerminal(page, ptyId, '\x03')
    })
  }

  test('@headful a double-click on a shell row opens the field there', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'rename-dblclick')
    const { tabId } = await openShellTab(page, ws.a.id)
    await renameLikeAPerson(page, testInfo, {
      label: '5-double-click',
      worktreeId: ws.a.id,
      tabId,
      newName: 'Double Renamed',
      onRow: true,
      openRename: (page) => openByDoubleClick(page, tabId)
    })
  })

  test('@headful the rename shortcut opens the field on the shown row', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'rename-shortcut')
    const { tabId } = await openShellTab(page, ws.a.id)
    await renameLikeAPerson(page, testInfo, {
      label: '6-shortcut',
      worktreeId: ws.a.id,
      tabId,
      newName: 'Shortcut Renamed',
      onRow: true,
      openRename: (page) => openByShortcut(page, tabId)
    })
  })

  test('@headful the rename shortcut falls back to the tab strip with the sidebar closed', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const ws = await createMoveWorkspaces(page, 'rename-shortcut-closed')
    const { tabId } = await openShellTab(page, ws.a.id)
    await page.evaluate(() => window.__store?.getState().setSidebarOpen(false))
    await expect(sidebarRow(page, tabId)).toBeHidden()
    await renameLikeAPerson(page, testInfo, {
      label: '7-shortcut-sidebar-closed',
      worktreeId: ws.a.id,
      tabId,
      newName: 'Strip Shortcut',
      afterSave: async (page) => {
        await page.evaluate(() => window.__store?.getState().setSidebarOpen(true))
        await expect(sidebarRow(page, tabId)).toBeVisible()
      },
      openRename: async (page) => {
        await page.evaluate(
          async ([chord]) =>
            window.__store?.getState().setKeybindingOverride('tab.rename', [chord]),
          [RENAME_CHORD]
        )
        await page.keyboard.press('ControlOrMeta+Alt+r')
      }
    })
  })
})
