import { app, ipcMain, type BrowserWindow } from 'electron'
import { randomUUID } from 'node:crypto'
import type { Store } from '../persistence'
import { installMainWindowFocusLifecycle } from '../window/main-window-focus-lifecycle'
import { installMainWindowShortcutRouting } from '../window/main-window-shortcut-routing'
import {
  isBackgroundLaunch,
  showWindowWithoutStealingFocus
} from '../window/foreground-activation-policy'
import type { KeybindingOverrides } from '../../shared/keybindings'
import {
  isPromptRestoreWindowsOn,
  PROMPT_MAIN_WINDOW_KEY as MAIN,
  PROMPT_NEW_WINDOW_TARGET,
  PROMPT_WINDOWS_CHANNELS as CH,
  type PromptWindowFocusRequest
} from '../../shared/prompt-windows'
import {
  forgetPromptWindowView,
  isPromptQuitting,
  loadPromptTabOwners,
  markPromptQuitting,
  markPromptTabPending,
  promptTabOwnerKey,
  promptTabOwnerTable,
  promptTabsOwnedBy,
  promptWindowKeyOfSender,
  promptWindowView,
  registerPromptExtraWindow,
  setPromptTabOwner,
  setPromptWindowStateListener,
  setPromptWindowView,
  unregisterPromptExtraWindow
} from './prompt-window-registry'
import { resetPromptExtraWindowDelivery } from './prompt-pty-window-delivery'
import { forgetPromptWindowGraph } from './prompt-window-graph'
import {
  createPromptBrowserWindow,
  loadPromptWindow,
  type PromptWindowBounds
} from './prompt-window-shell'
import {
  promptRepoName,
  promptWindowSummaries,
  promptWorktreeIdOfTab,
  setPromptWindowLabelStore
} from './prompt-window-labels'
import { readPromptSavedWindows, writePromptSavedWindows } from './prompt-windows-saved-state'

/**
 * Prompt windows (see shared/prompt-windows.ts). Window behaviour, chosen to match macOS apps:
 * - Cmd+N / File > New Window and "Open in New Window" on a project open a new full window; any
 *   number of windows, the same project may be open in several.
 * - Each tab is shown by one window; "Move Tab to Window" hands it to another window. The
 *   terminal keeps running: the receiving window attaches the same pty.
 * - Closing a window hands its tabs to the main window (or, when the main window is hidden, to
 *   the window used last); its terminals keep running.
 * - Closing the main window while other windows are open hides it; the Dock icon or the menu bar
 *   item shows it again. Quitting (Cmd+Q) closes every window.
 * - With "Remember Open Windows" on, every window open at quit comes back on next launch with
 *   its tabs, selection, size and place.
 *
 * Moving tabs reloads the two windows involved: a reload is the path Orca already uses to
 * rebuild a window from the saved session and re-attach live terminals.
 */

type Bounds = PromptWindowBounds

const windowsByKey = new Map<string, BrowserWindow>()
const focusRequests = new Map<string, PromptWindowFocusRequest>()
/** Window keys, most recently focused last. */
const focusOrder: string[] = []
let mainWindow: BrowserWindow | null = null
let store: Store | null = null
let getKeybindings: () => KeybindingOverrides | undefined = () => undefined
let installed = false
let restored = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

function writeSavedState(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  writePromptSavedWindows(
    [...windowsByKey.entries()]
      .filter(([, win]) => !win.isDestroyed())
      .map(([key, win]) => ({
        key,
        bounds: win.getNormalBounds(),
        ...(promptWindowView(key) ? { view: promptWindowView(key) } : {})
      })),
    promptTabOwnerTable()
  )
}

function scheduleSave(): void {
  if (isPromptQuitting() || saveTimer) {
    return
  }
  saveTimer = setTimeout(writeSavedState, 500)
  saveTimer.unref?.()
}

function noteFocused(key: string): void {
  const index = focusOrder.indexOf(key)
  if (index !== -1) {
    focusOrder.splice(index, 1)
  }
  focusOrder.push(key)
}

function windowOfKey(key: string): BrowserWindow | null {
  const win = key === MAIN ? mainWindow : windowsByKey.get(key)
  return win && !win.isDestroyed() ? win : null
}

/** Where a closing window's tabs go: the main window if it is shown, else the window used last. */
function handoverTarget(closingKey: string): string {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
    return MAIN
  }
  for (let i = focusOrder.length - 1; i >= 0; i--) {
    const key = focusOrder[i]!
    if (key !== closingKey && key !== MAIN && windowOfKey(key)) {
      return key
    }
  }
  return MAIN
}

function reloadWindow(key: string): void {
  const win = windowOfKey(key)
  if (win && !win.webContents.isDestroyed()) {
    win.webContents.reload()
  }
}

/**
 * Hands tabs to another window: the table changes, the receiving window loads them (pending
 * until it saves them) and selects the first. Same pty ids: terminals keep running. Release C's
 * tab dragging calls this too.
 */
export function movePromptTabs(tabIds: readonly string[], targetKey: string): void {
  const moved = tabIds.filter((tabId) => promptTabOwnerKey(tabId) !== targetKey)
  if (moved.length === 0) {
    return
  }
  for (const tabId of moved) {
    setPromptTabOwner(tabId, targetKey)
    markPromptTabPending(targetKey, tabId)
  }
  const first = moved[0]!
  const worktreeId = promptWorktreeIdOfTab(first)
  if (worktreeId) {
    focusRequests.set(targetKey, { worktreeId, tabId: first })
  }
  scheduleSave()
}

function moveTabFromWindow(senderKey: string, tabId: string, target: string): void {
  if (promptTabOwnerKey(tabId) !== senderKey || target === senderKey) {
    return
  }
  if (target === PROMPT_NEW_WINDOW_TARGET) {
    const key = newWindowKey()
    movePromptTabs([tabId], key)
    reloadWindow(senderKey)
    openPromptWindow({ key })
    return
  }
  if (!windowOfKey(target)) {
    return
  }
  movePromptTabs([tabId], target)
  reloadWindow(senderKey)
  reloadWindow(target)
  const win = windowOfKey(target)
  if (win && !isBackgroundLaunch()) {
    win.show()
    win.focus()
  }
}

function newWindowKey(): string {
  return `w-${randomUUID().slice(0, 8)}`
}

export function openPromptWindow(
  options: { key?: string; bounds?: Bounds; openRepoId?: string } = {}
): BrowserWindow {
  const key = options.key ?? newWindowKey()
  const win = createPromptBrowserWindow(options.bounds, mainWindow, store)
  const contents = win.webContents
  const webContentsId = contents.id
  windowsByKey.set(key, win)
  registerPromptExtraWindow(key, contents, win)
  // Same keyboard shortcuts, focus tracking, context menus and crash reload as the main window.
  let closing = false
  win.on('close', () => {
    closing = true
  })
  const opts = { getKeybindings: () => getKeybindings(), getIsQuitting: isPromptQuitting }
  const focus = installMainWindowFocusLifecycle({
    isWindowClosing: () => closing,
    mainWindow: win,
    opts,
    reloadMainWindow: () => loadPromptWindow(win, key),
    rendererWebContentsId: webContentsId
  })
  installMainWindowShortcutRouting({ focus, mainWindow: win, opts, store })
  // A reloaded or crashed page cannot acknowledge what was sent to the old one.
  const resetDelivery = (): void => resetPromptExtraWindowDelivery(webContentsId)
  contents.on('did-start-navigation', (_event, _url, isSameDocument, isMainFrame) => {
    if (isMainFrame && !isSameDocument) {
      resetDelivery()
    }
  })
  contents.on('render-process-gone', resetDelivery)
  win.on('focus', () => noteFocused(key))
  win.once('ready-to-show', () => {
    showWindowWithoutStealingFocus(win)
    if (!isBackgroundLaunch()) {
      win.focus()
    }
  })
  win.on('closed', () => {
    focus.dispose()
    resetDelivery()
    windowsByKey.delete(key)
    unregisterPromptExtraWindow(key, webContentsId)
    forgetPromptWindowGraph(key)
    focusRequests.delete(key)
    const index = focusOrder.indexOf(key)
    if (index !== -1) {
      focusOrder.splice(index, 1)
    }
    if (isPromptQuitting()) {
      return
    }
    // The window's tabs move on; their terminals keep running and re-attach there.
    const tabs = promptTabsOwnedBy(key)
    forgetPromptWindowView(key)
    if (tabs.length > 0) {
      const target = handoverTarget(key)
      movePromptTabs(tabs, target)
      reloadWindow(target)
    }
    writeSavedState()
  })
  const saveBounds = (): void => scheduleSave()
  win.on('moved', saveBounds)
  win.on('resized', saveBounds)
  loadPromptWindow(win, key, options.openRepoId)
  scheduleSave()
  return win
}

function installIpc(): void {
  ipcMain.handle(CH.newWindow, () => {
    openPromptWindow()
  })
  ipcMain.handle(CH.openProject, (_event, repoId: unknown) => {
    if (typeof repoId === 'string' && promptRepoName(repoId)) {
      openPromptWindow({ openRepoId: repoId })
    }
  })
  ipcMain.handle(CH.list, (event) =>
    promptWindowSummaries(
      promptWindowKeyOfSender(event.sender),
      windowsByKey.keys(),
      (key) => !!windowOfKey(key)
    )
  )
  ipcMain.handle(CH.moveTab, (event, tabId: unknown, target: unknown) => {
    if (typeof tabId === 'string' && typeof target === 'string') {
      moveTabFromWindow(promptWindowKeyOfSender(event.sender), tabId, target)
    }
  })
  ipcMain.handle(CH.takeFocusRequest, (event) => {
    const key = promptWindowKeyOfSender(event.sender)
    const request = focusRequests.get(key) ?? null
    focusRequests.delete(key)
    return request
  })
  app.on('before-quit', () => {
    // Remember the windows open at quit before they close one by one.
    writeSavedState()
    markPromptQuitting()
  })
}

/** File > New Window (Cmd+N). */
export function openPromptNewWindowFromMenu(): void {
  openPromptWindow()
}

/**
 * Called each time the main window is (re)created. Installs the IPC once and, on the first main
 * window of the launch, reopens the windows that were open at quit with their tabs.
 */
export function attachPromptWindows(
  window: BrowserWindow,
  appStore: Store | null,
  keybindings?: () => KeybindingOverrides | undefined
): void {
  mainWindow = window
  store = appStore
  setPromptWindowLabelStore(appStore)
  window.on('focus', () => noteFocused(MAIN))
  if (keybindings) {
    getKeybindings = keybindings
  }
  if (!installed) {
    installed = true
    installIpc()
    setPromptWindowStateListener(scheduleSave)
  }
  if (restored) {
    return
  }
  restored = true
  const saved = isPromptRestoreWindowsOn(appStore?.getSettings())
    ? readPromptSavedWindows()
    : { windows: [] }
  const windows = saved.windows.filter((entry) => typeof entry?.key === 'string')
  // Tabs of windows that do not come back belong to the main window again.
  loadPromptTabOwners(saved.tabOwners, new Set(windows.map((entry) => entry.key)))
  for (const entry of windows) {
    if (entry.view && typeof entry.view === 'object') {
      setPromptWindowView(entry.key, entry.view)
    }
    openPromptWindow({ key: entry.key, bounds: entry.bounds })
  }
  writeSavedState()
}
