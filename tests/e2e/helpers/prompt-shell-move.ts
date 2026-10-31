import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { Page, TestInfo } from '@stablyai/playwright-test'
import { expect } from './orca-app'
import { execInTerminal } from './terminal'
import { waitForPtyShellEcho } from '../terminal-pty-readiness'

/** Two fresh workspaces of the seeded project: the shell starts in `a` and moves to `b`. */
export type MoveWorkspaces = {
  a: { id: string; path: string }
  b: { id: string; path: string }
}

/** What the shell itself reports: its process id, its real folder, and a variable set before the move. */
export type ShellIdentity = { pid: number; cwd: string; mark: string }

export async function createMoveWorkspaces(page: Page, label: string): Promise<MoveWorkspaces> {
  const suffix = `${label}-${Date.now().toString(36)}`
  return page.evaluate(async (suffix) => {
    const store = window.__store
    if (!store) {
      throw new Error('store unavailable')
    }
    const state = store.getState()
    // New workspaces without a terminal count as sleeping; they must stay listed as drop targets.
    state.setShowSleepingWorkspaces(true)
    const repoId = state.allWorktrees().find((worktree) => worktree.isMainWorktree)?.repoId
    if (!repoId) {
      throw new Error('seed repo was not loaded')
    }
    const a = (await state.createWorktree(repoId, `move-a-${suffix}`, undefined, 'skip')).worktree
    const b = (await state.createWorktree(repoId, `move-b-${suffix}`, undefined, 'skip')).worktree
    return { a: { id: a.id, path: a.path }, b: { id: b.id, path: b.path } }
  }, suffix)
}

/** Open a terminal tab in `worktreeId`, show it, and wait until its shell runs commands. */
export async function openShellTab(
  page: Page,
  worktreeId: string
): Promise<{ tabId: string; ptyId: string }> {
  const tabId = await page.evaluate((worktreeId) => {
    const state = window.__store?.getState()
    if (!state) {
      throw new Error('store unavailable')
    }
    state.setActiveWorktree(worktreeId)
    const tab = state.createTab(worktreeId, undefined, undefined, { activate: true })
    state.setActiveTabType('terminal', worktreeId)
    state.setActiveTab(tab.id)
    return tab.id
  }, worktreeId)
  const ptyId = await waitForTabPtyIds(page, tabId, 1).then((ids) => ids[0]!)
  await waitForPtyShellEcho(page, ptyId, 30_000)
  return { tabId, ptyId }
}

export async function waitForTabPtyIds(
  page: Page,
  tabId: string,
  count: number
): Promise<string[]> {
  let ptyIds: string[] = []
  await expect
    .poll(
      async () => {
        ptyIds = await page.evaluate(
          (tabId) => [...(window.__store?.getState().ptyIdsByTabId[tabId] ?? [])],
          tabId
        )
        return ptyIds.length
      },
      { timeout: 30_000, message: `tab ${tabId} never got ${count} terminal(s)` }
    )
    .toBe(count)
  return ptyIds
}

/** The workspace whose tab list holds `tabId`, or null. */
export function workspaceOfTab(page: Page, tabId: string): Promise<string | null> {
  return page.evaluate((tabId) => {
    const tabsByWorktree = window.__store?.getState().tabsByWorktree ?? {}
    for (const [worktreeId, tabs] of Object.entries(tabsByWorktree)) {
      if (tabs.some((tab) => tab.id === tabId)) {
        return worktreeId
      }
    }
    return null
  }, tabId)
}

export function activeWorkspaceAndTab(
  page: Page
): Promise<{ worktreeId: string | null; tabId: string | null }> {
  return page.evaluate(() => {
    const state = window.__store?.getState()
    return { worktreeId: state?.activeWorktreeId ?? null, tabId: state?.activeTabId ?? null }
  })
}

/** Pane key (`tabId:leafId`) of the leaf bound to `ptyId`, for agent status and runtime lookups. */
export async function paneKeyOf(page: Page, tabId: string, ptyId: string): Promise<string> {
  const leafId = await page.evaluate(
    ({ tabId, ptyId }) => {
      const bindings = window.__store?.getState().terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId
      return Object.entries(bindings ?? {}).find(([, id]) => id === ptyId)?.[0] ?? null
    },
    { tabId, ptyId }
  )
  if (!leafId) {
    throw new Error(`no layout leaf is bound to ${ptyId}`)
  }
  return `${tabId}:${leafId}`
}

/** Set a marker variable in the shell; it only survives if the same shell process keeps running. */
export async function markShell(page: Page, ptyId: string): Promise<string> {
  const mark = `MOVE_MARK_${randomUUID().replaceAll('-', '')}`
  await execInTerminal(page, ptyId, `export MOVE_MARK=${mark}`)
  return mark
}

/** Ask the shell for its pid, real folder and marker, through a file the test reads back. */
export async function readShellIdentity(
  page: Page,
  testInfo: TestInfo,
  ptyId: string
): Promise<ShellIdentity> {
  mkdirSync(testInfo.outputDir, { recursive: true })
  const file = path.join(testInfo.outputDir, `shell-${randomUUID()}.txt`)
  const quoted = `'${file.replaceAll("'", "'\\''")}'`
  await execInTerminal(
    page,
    ptyId,
    `printf '%s %s %s\\n' "$$" "$(pwd -P)" "$MOVE_MARK" > ${quoted}.tmp && mv ${quoted}.tmp ${quoted}`
  )
  await expect
    .poll(() => existsSync(file), { timeout: 15_000, message: `shell ${ptyId} did not answer` })
    .toBe(true)
  const [pid, cwd, mark] = readFileSync(file, 'utf8').trim().split(' ')
  rmSync(file, { force: true })
  return { pid: Number(pid), cwd: cwd ?? '', mark: mark ?? '' }
}

export function realFolder(folder: string): string {
  return realpathSync(folder)
}

export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const dropTarget = (worktreeId: string): string =>
  `[data-prompt-session-drop-worktree=${JSON.stringify(worktreeId)}]`

/**
 * Drag a session row onto another workspace with the real pointer. Before releasing it reports
 * whether the target lit up, which is what tells the user the drop would do something.
 */
export async function dragSessionRow(
  page: Page,
  tabId: string,
  targetWorktreeId: string
): Promise<{ targetLit: boolean; dragStarted: boolean }> {
  const source = page.locator(`[data-prompt-session-drag-item=${JSON.stringify(tabId)}]`).first()
  const target = page.locator(dropTarget(targetWorktreeId)).first()
  await source.scrollIntoViewIfNeeded()
  await expect(source).toBeVisible()
  await expect(target).toBeVisible()
  const sourceBox = await source.boundingBox()
  if (!sourceBox) {
    throw new Error('session row has no geometry')
  }
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2)
  await page.mouse.down()
  // Cross the 5px activation distance first so dnd-kit starts the drag before the long move.
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2 + 8, {
    steps: 4
  })
  const targetBox = await target.boundingBox()
  if (!targetBox) {
    await page.mouse.up()
    throw new Error('target workspace has no geometry')
  }
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 12
  })
  const targetLit = (await target.getAttribute('data-prompt-session-drop-target')) === 'true'
  // dnd-kit marks the dragged row; without it the pointer never armed a drag at all.
  const dragStarted = (await page.locator('[data-dragging="true"]').count()) > 0
  await page.mouse.up()
  return { targetLit, dragStarted }
}

export async function attachScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  await testInfo.attach(name, { body: await page.screenshot(), contentType: 'image/png' })
}

/**
 * Wait until main's saved session records the move. Main decides whose terminal it is from that
 * saved copy, which the window writes shortly after the move, not at the same moment.
 */
export async function waitForSavedMove(
  page: Page,
  tabId: string,
  ptyId: string,
  worktreeId: string
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(
          async ({ tabId, ptyId, worktreeId }) => {
            const saved = await window.api.session.get()
            const tab = saved.tabsByWorktree?.[worktreeId]?.find((entry) => entry.id === tabId)
            return tab?.adoptedPtyIds?.includes(ptyId) ?? false
          },
          { tabId, ptyId, worktreeId }
        ),
      { timeout: 10_000, message: 'main never saved the moved tab under its new workspace' }
    )
    .toBe(true)
}

/** What the drop planner reads to find a pane's Claude conversation. */
export function paneConversationFacts(
  page: Page,
  paneKey: string
): Promise<{ sessionId: string | null; restoredUnconfirmed: boolean; shellForeground: boolean }> {
  return page.evaluate((paneKey) => {
    const state = window.__store?.getState()
    const live = state?.agentStatusByPaneKey[paneKey]
    return {
      sessionId: live?.providerSession?.id ?? null,
      restoredUnconfirmed: live?.restoredUnconfirmed === true,
      shellForeground: state?.paneForegroundAgentByPaneKey[paneKey]?.shellForeground === true
    }
  }, paneKey)
}
