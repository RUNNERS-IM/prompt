import type { Page } from '@stablyai/playwright-test'
import { test, expect } from './helpers/orca-app'
import { ensureTerminalVisible, waitForActiveWorktree, waitForSessionReady } from './helpers/store'
import { attachScreenshot, waitForTabPtyIds } from './helpers/prompt-shell-move'
import { getTerminalContentForPtyId } from './terminal-pty-readiness'

// Journey for the new Claude session start box (decision 1A): the tab asks for options first and
// Start opens Claude with the picked flags. The CI host has no `claude`, so the started tab ends in
// "command not found", but the command it typed is still on screen.

// An explicit Claude chord skips agent detection, which finds no Claude CLI on CI.
const CLAUDE_TAB_CHORD = 'Ctrl+Alt+K'

function terminalTabIds(page: Page, worktreeId: string): Promise<string[]> {
  return page.evaluate(
    (id) => (window.__store?.getState().tabsByWorktree[id] ?? []).map((tab) => tab.id),
    worktreeId
  )
}

test.describe('new Claude session start box', () => {
  test('shows the start box first, then starts Claude with the picked flags', async ({
    orcaPage: page
  }, testInfo) => {
    await waitForSessionReady(page)
    const worktreeId = await waitForActiveWorktree(page)
    await ensureTerminalVisible(page)
    await page.evaluate((chord) => {
      const store = window.__store
      if (!store) {
        throw new Error('store unavailable')
      }
      const keybindings = store.getState().keybindings
      store.setState({ keybindings: { ...keybindings, 'tab.newAgent.claude': [chord] } })
      // Outside any terminal, so the chord reaches the app whatever the terminal shortcut policy.
      ;(document.activeElement as HTMLElement | null)?.blur()
    }, CLAUDE_TAB_CHORD)
    const before = await terminalTabIds(page, worktreeId)

    await page.keyboard.press('Control+Alt+KeyK')

    const box = page.locator('[data-prompt-claude-start]')
    await expect(box).toBeVisible({ timeout: 15_000 })
    let boxTabId: string | undefined
    await expect
      .poll(async () => {
        boxTabId = (await terminalTabIds(page, worktreeId)).find((id) => !before.includes(id))
        return boxTabId ?? null
      })
      .not.toBeNull()
    // The box tab starts no shell until Start.
    expect(
      await page.evaluate(
        (id) => window.__store?.getState().ptyIdsByTabId[id]?.length ?? 0,
        boxTabId!
      )
    ).toBe(0)
    // The box tab reads as a Claude session, not a "Terminal N" shell, in the strip and sidebar.
    await expect(
      page.locator(`[data-testid="sortable-tab"][data-tab-id="${boxTabId}"]`)
    ).toHaveAttribute('data-tab-title', 'Claude')
    await expect(
      page.locator('[data-prompt-terminal-row]', { hasText: 'New Claude Session' })
    ).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath('claude-start.png') })
    await attachScreenshot(page, testInfo, '1-claude-start-box')

    const chrome = box.locator('[data-prompt-claude-start-switch="chrome"] [role="switch"]')
    await expect(chrome).toHaveAttribute('aria-checked', 'false')
    await chrome.click()
    await expect(chrome).toHaveAttribute('aria-checked', 'true')
    await box.locator('[data-prompt-claude-start-new]').click()

    // Start opens the Claude tab in the box tab's place and closes the box tab.
    await expect(box).toHaveCount(0, { timeout: 15_000 })
    let claudeTabId: string | undefined
    await expect
      .poll(async () => {
        const ids = await terminalTabIds(page, worktreeId)
        claudeTabId = ids.find((id) => !before.includes(id) && id !== boxTabId)
        return { boxGone: !ids.includes(boxTabId!), claudeTab: claudeTabId ?? null }
      })
      .toEqual({ boxGone: true, claudeTab: expect.any(String) })
    const ptyId = (await waitForTabPtyIds(page, claudeTabId!, 1))[0]!
    // A long command wraps across terminal rows, so compare with the line breaks removed.
    await expect
      .poll(
        async () => (await getTerminalContentForPtyId(page, ptyId, 20_000)).replace(/[\r\n]/g, ''),
        { timeout: 20_000 }
      )
      .toMatch(/claude.*--chrome/)
    await attachScreenshot(page, testInfo, '2-claude-started-with-chrome')
  })
})
