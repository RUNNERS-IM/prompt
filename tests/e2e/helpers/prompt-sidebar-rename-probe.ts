import type { Page, TestInfo } from '@stablyai/playwright-test'
import { expect } from './orca-app'

// Records what happens to focus and to the tab strip's rename field while a rename is opened, so a
// failed run shows whether the field appeared and what took focus from it.

export type RenameProbeEvent = { t: number; kind: string; target?: string; related?: string }

export type RenameProbeReport = {
  events: RenameProbeEvent[]
  inputEverMounted: boolean
  inputMountedNow: boolean
  activeElement: string
  documentHasFocus: boolean
}

export async function installRenameProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Probe = {
      start: number
      events: { t: number; kind: string; target?: string; related?: string }[]
      inputEverMounted: boolean
      dispose: () => void
    }
    const holder = window as unknown as { __sidebarRenameProbe?: Probe }
    holder.__sidebarRenameProbe?.dispose()
    // The tab strip's rename field, or the one laid over a sidebar session row.
    const RENAME_FIELDS = '[data-tab-rename-input="true"], [data-prompt-session-rename]'
    const describe = (node: EventTarget | null): string => {
      if (!(node instanceof Element)) {
        return node === null ? 'null' : String((node as Node).nodeName ?? node)
      }
      const parts = [node.tagName.toLowerCase()]
      for (const name of [
        'data-testid',
        'data-slot',
        'data-tab-rename-input',
        'data-prompt-session-rename',
        'role',
        'aria-label',
        'aria-hidden'
      ]) {
        const value = node.getAttribute(name)
        if (value !== null) {
          parts.push(`${name}=${value.slice(0, 60)}`)
        }
      }
      if (node.getAttribute('role')?.startsWith('menuitem')) {
        parts.push(`text=${(node.textContent ?? '').trim().slice(0, 30)}`)
      }
      const className = node.getAttribute('class')
      if (className) {
        parts.push(`class=${className.slice(0, 60)}`)
      }
      if (node.closest('.xterm')) {
        parts.push('[inside xterm]')
      }
      const tab = node.closest('[data-tab-id]')
      if (tab) {
        parts.push(`[inside tab ${tab.getAttribute('data-tab-id')}]`)
      }
      const row = node.closest('[data-prompt-session-menu]')
      if (row) {
        parts.push(`[inside sidebar row ${row.getAttribute('data-prompt-session-menu')}]`)
      }
      if (node.closest('[role="menu"]')) {
        parts.push('[inside menu]')
      }
      return parts.join(' ')
    }
    const start = performance.now()
    const probe: Probe = { start, events: [], inputEverMounted: false, dispose: () => {} }
    const log = (kind: string, target?: EventTarget | null, related?: EventTarget | null): void => {
      probe.events.push({
        t: Math.round(performance.now() - start),
        kind,
        ...(target !== undefined ? { target: describe(target) } : {}),
        ...(related !== undefined ? { related: describe(related) } : {})
      })
    }
    const onFocusIn = (event: FocusEvent): void => log('focusin', event.target, event.relatedTarget)
    const onFocusOut = (event: FocusEvent): void =>
      log('focusout', event.target, event.relatedTarget)
    const onKeyDown = (event: KeyboardEvent): void =>
      log(`keydown ${event.key}`, document.activeElement)
    // Only pointer crossings inside a menu: a closing menu that reacts to them can grab focus.
    const onPointerCross = (event: PointerEvent): void => {
      const menu = event.target instanceof Element ? event.target.closest('[role="menu"]') : null
      if (menu) {
        log(`${event.type} (menu ${menu.getAttribute('data-state')})`, event.target)
      }
    }
    const onRename = (event: Event): void =>
      log(`rename-request ${JSON.stringify((event as CustomEvent).detail)}`)
    const onFocusPane = (event: Event): void =>
      log(`focus-terminal-pane ${JSON.stringify((event as CustomEvent).detail)}`)
    const isRenameInput = (node: Node): boolean =>
      node instanceof Element &&
      (node.matches(RENAME_FIELDS) || node.querySelector(RENAME_FIELDS) !== null)
    const isMenu = (node: Node): boolean =>
      node instanceof Element &&
      (node.matches('[role="menu"]') || node.querySelector('[role="menu"]') !== null)
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (isRenameInput(node)) {
            probe.inputEverMounted = true
            log('rename-input-mounted', document.activeElement)
          }
          if (isMenu(node)) {
            log('menu-mounted')
          }
        }
        for (const node of record.removedNodes) {
          if (isRenameInput(node)) {
            log('rename-input-unmounted', document.activeElement)
          }
          if (isMenu(node)) {
            log('menu-unmounted', document.activeElement)
          }
        }
      }
    })
    observer.observe(document.body, { childList: true, subtree: true })
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('focusout', onFocusOut, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('pointerover', onPointerCross, true)
    document.addEventListener('pointerout', onPointerCross, true)
    window.addEventListener('orca-rename-terminal-tab', onRename)
    window.addEventListener('orca-focus-terminal-pane', onFocusPane)
    probe.dispose = () => {
      observer.disconnect()
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('focusout', onFocusOut, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('pointerover', onPointerCross, true)
      document.removeEventListener('pointerout', onPointerCross, true)
      window.removeEventListener('orca-rename-terminal-tab', onRename)
      window.removeEventListener('orca-focus-terminal-pane', onFocusPane)
    }
    holder.__sidebarRenameProbe = probe
    log('probe-installed', document.activeElement)
  })
}

export function readRenameProbe(page: Page): Promise<RenameProbeReport> {
  return page.evaluate(() => {
    const probe = (
      window as unknown as {
        __sidebarRenameProbe?: { events: RenameProbeEvent[]; inputEverMounted: boolean }
      }
    ).__sidebarRenameProbe
    const active = document.activeElement
    const describeActive = (): string => {
      if (!active) {
        return 'null'
      }
      const parts = [active.tagName.toLowerCase()]
      for (const name of ['data-testid', 'data-tab-rename-input', 'role', 'aria-label']) {
        const value = active.getAttribute(name)
        if (value !== null) {
          parts.push(`${name}=${value.slice(0, 60)}`)
        }
      }
      if (active.closest('.xterm')) {
        parts.push('[inside xterm]')
      }
      const row = active.closest('[data-prompt-session-menu]')
      if (row) {
        parts.push(`[inside sidebar row ${row.getAttribute('data-prompt-session-menu')}]`)
      }
      return parts.join(' ')
    }
    return {
      events: [...(probe?.events ?? [])],
      inputEverMounted: probe?.inputEverMounted ?? false,
      inputMountedNow: document.querySelector(
        '[data-tab-rename-input="true"], [data-prompt-session-rename]'
      ) !== null,
      activeElement: describeActive(),
      documentHasFocus: document.hasFocus()
    }
  })
}

/** What the app shows for a tab after a rename: its saved set name, the strip's title, the row. */
export async function readTabNames(
  page: Page,
  worktreeId: string,
  tabId: string
): Promise<{ customTitle: string | null; stripTitle: string | null; sidebarRowText: string }> {
  const customTitle = await page.evaluate(
    ({ worktreeId, tabId }) =>
      (window.__store?.getState().tabsByWorktree[worktreeId] ?? []).find((tab) => tab.id === tabId)
        ?.customTitle ?? null,
    { worktreeId, tabId }
  )
  const strip = page.locator(`[data-testid="sortable-tab"][data-tab-id=${JSON.stringify(tabId)}]`)
  const stripTitle =
    (await strip.count()) > 0 ? await strip.first().getAttribute('data-tab-title') : null
  const row = sidebarRow(page, tabId)
  const sidebarRowText = (await row.count()) > 0 ? ((await row.innerText()) ?? '').trim() : ''
  return { customTitle, stripTitle, sidebarRowText }
}

export function sidebarRow(page: Page, tabId: string): ReturnType<Page['locator']> {
  return page.locator(`[data-prompt-session-menu=${JSON.stringify(tabId)}]`).first()
}

export async function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(value, null, 2),
    contentType: 'application/json'
  })
}

/** Wait briefly for a condition without failing; the scene records the outcome either way. */
export async function settlesTo<T>(
  read: () => Promise<T>,
  want: T,
  timeout: number
): Promise<boolean> {
  try {
    await expect.poll(read, { timeout }).toEqual(want)
    return true
  } catch {
    return false
  }
}
