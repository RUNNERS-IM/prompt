import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppIconPath } from '../app-icon'
import { getBrowserClientHostId } from '../browser/browser-client-host-id'
import { formatBrowserClientHostIdArgument } from '../../shared/browser-client-host-id-argument'
import type { Store } from '../persistence'
import {
  installMacosVisibilityRepaint,
  MIN_HEIGHT,
  MIN_WIDTH,
  TITLEBAR_CSS_CENTER,
  TRAFFIC_LIGHT_RADIUS,
  TRAFFIC_LIGHT_X
} from '../window/main-window-visual-lifecycle'
import { installMainWindowWebviewSecurity } from '../window/main-window-webview-security'
import { installMainWindowFocusLifecycle } from '../window/main-window-focus-lifecycle'
import { installMainWindowShortcutRouting } from '../window/main-window-shortcut-routing'
import type { KeybindingOverrides } from '../../shared/keybindings'
import { installMacAccentColor } from '../window/prompt-mac-accent-color'
import { rectHasVisibleAreaOnAnyDisplay } from '../window/window-bounds-validation'
import { wslHostsWindowArguments } from '../wsl/wsl-host-gate'
import {
  isPromptRestoreProjectWindowsOn,
  PROMPT_PROJECT_WINDOW_QUERY,
  PROMPT_PROJECT_WINDOWS_CHANNELS as CH,
  type PromptProjectWindowsState
} from '../../shared/prompt-project-windows'
import {
  isPromptQuitting,
  markPromptQuitting,
  promptOpenProjectRepoIds,
  promptProjectRepoIdOfSender,
  registerPromptProjectWindow,
  releasePromptReposHeldForMainReload,
  setPromptStoredSessionReader,
  unregisterPromptProjectWindow
} from './prompt-project-window-registry'
import { resetPromptProjectWindowDelivery } from './prompt-pty-window-delivery'

/**
 * Prompt project windows: "Open in New Window" on a project header opens a full Prompt window that
 * shows only that project. Window behaviour (chosen to match macOS apps such as Finder and Mail):
 * - Closing a project window returns its sessions to the main window; terminals keep running.
 * - Closing the main window while project windows are open hides it; the Dock icon or the menu bar
 *   item shows it again. Quitting (Cmd+Q) closes every window.
 * - With "Remember Open Windows" on, the project windows open at quit come back on next launch,
 *   at the same size and place.
 */

type Bounds = { x: number; y: number; width: number; height: number }
type SavedWindows = { windows: { repoId: string; bounds?: Bounds }[] }

const windowsByRepoId = new Map<string, BrowserWindow>()
let mainWindow: BrowserWindow | null = null
let store: Store | null = null
let getKeybindings: () => KeybindingOverrides | undefined = () => undefined
let installed = false
let restored = false

function savedWindowsPath(): string {
  return join(app.getPath('userData'), 'prompt-project-windows.json')
}

function readSavedWindows(): SavedWindows {
  try {
    const parsed = JSON.parse(readFileSync(savedWindowsPath(), 'utf8')) as SavedWindows
    return Array.isArray(parsed?.windows) ? parsed : { windows: [] }
  } catch {
    return { windows: [] }
  }
}

function writeSavedWindows(): void {
  const windows = [...windowsByRepoId.entries()]
    .filter(([, win]) => !win.isDestroyed())
    .map(([repoId, win]) => ({ repoId, bounds: win.getNormalBounds() }))
  try {
    writeFileSync(savedWindowsPath(), JSON.stringify({ windows }, null, 2))
  } catch (error) {
    console.warn('[prompt-project-windows] could not save open windows', error)
  }
}

function stateFor(selfRepoId: string | null): PromptProjectWindowsState {
  return { selfRepoId, openRepoIds: promptOpenProjectRepoIds() }
}

function broadcast(): void {
  const targets = [mainWindow, ...windowsByRepoId.values()]
  for (const win of targets) {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send(CH.changed, stateFor(promptProjectRepoIdOfSender(win.webContents)))
    }
  }
}

function repoName(repoId: string): string | null {
  const repo = store?.getRepos().find((candidate) => candidate.id === repoId)
  return repo ? repo.displayName || repo.path : null
}

function usableBounds(bounds: Bounds | undefined): Bounds | undefined {
  return bounds &&
    bounds.width > MIN_WIDTH &&
    bounds.height > MIN_HEIGHT &&
    rectHasVisibleAreaOnAnyDisplay(bounds, MIN_WIDTH / 2, MIN_HEIGHT / 2)
    ? bounds
    : undefined
}

function loadProjectWindow(win: BrowserWindow, repoId: string): void {
  const query = { [PROMPT_PROJECT_WINDOW_QUERY]: repoId }
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  const load = devUrl
    ? win.loadURL(`${devUrl}${devUrl.includes('?') ? '&' : '?'}${new URLSearchParams(query)}`)
    : win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  load.catch((error: unknown) => console.error('[prompt-project-windows] load failed', error))
}

export function openPromptProjectWindow(
  repoId: string,
  savedBounds?: Bounds
): BrowserWindow | null {
  const existing = windowsByRepoId.get(repoId)
  if (existing && !existing.isDestroyed()) {
    existing.show()
    existing.focus()
    return existing
  }
  const name = repoName(repoId)
  if (!name) {
    return null
  }
  const bounds = usableBounds(savedBounds)
  const parentBounds = mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null
  const win = new BrowserWindow({
    width:
      bounds?.width ?? Math.max(MIN_WIDTH + 1, Math.round((parentBounds?.width ?? 1200) * 0.8)),
    height:
      bounds?.height ?? Math.max(MIN_HEIGHT + 1, Math.round((parentBounds?.height ?? 800) * 0.8)),
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    title: name,
    show: false,
    acceptFirstMouse: true,
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    titleBarStyle:
      process.platform === 'darwin'
        ? 'hiddenInset'
        : process.platform === 'win32'
          ? 'hidden'
          : undefined,
    ...(process.platform === 'linux' ? { frame: false } : {}),
    ...(process.platform === 'darwin'
      ? {
          trafficLightPosition: {
            x: TRAFFIC_LIGHT_X,
            y: TITLEBAR_CSS_CENTER - TRAFFIC_LIGHT_RADIUS
          }
        }
      : {}),
    icon: getAppIconPath(store?.getSettings()?.appIcon),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      webviewTag: true,
      additionalArguments: [
        formatBrowserClientHostIdArgument(getBrowserClientHostId()),
        ...wslHostsWindowArguments()
      ]
    }
  })
  const contents = win.webContents
  const webContentsId = contents.id
  windowsByRepoId.set(repoId, win)
  registerPromptProjectWindow(repoId, contents, win)
  installMainWindowWebviewSecurity(win)
  if (process.platform === 'darwin') {
    installMacosVisibilityRepaint(win)
    installMacAccentColor(win)
  }
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
    reloadMainWindow: () => loadProjectWindow(win, repoId),
    rendererWebContentsId: webContentsId
  })
  installMainWindowShortcutRouting({ focus, mainWindow: win, opts, store })
  // A reloaded or crashed page cannot acknowledge what was sent to the old one.
  const resetDelivery = (): void => resetPromptProjectWindowDelivery(repoId, webContentsId)
  contents.on('did-start-navigation', (_event, _url, isSameDocument, isMainFrame) => {
    if (isMainFrame && !isSameDocument) {
      resetDelivery()
    }
  })
  contents.on('render-process-gone', resetDelivery)
  // The renderer sets document.title to the app name; keep the project name in the title bar.
  win.on('page-title-updated', (event) => event.preventDefault())
  win.once('ready-to-show', () => {
    win.show()
  })
  win.on('closed', () => {
    focus.dispose()
    resetDelivery()
    windowsByRepoId.delete(repoId)
    unregisterPromptProjectWindow(repoId, webContentsId)
    if (isPromptQuitting()) {
      return
    }
    writeSavedWindows()
    broadcast()
    // The main window still holds this project's tabs as they were when the window opened.
    // Reloading reads them back from disk; live terminals reattach.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.reload()
    } else {
      releasePromptReposHeldForMainReload()
    }
  })
  const saveBounds = (): void => {
    if (!isPromptQuitting()) {
      writeSavedWindows()
    }
  }
  win.on('moved', saveBounds)
  win.on('resized', saveBounds)
  loadProjectWindow(win, repoId)
  writeSavedWindows()
  broadcast()
  return win
}

function installIpc(): void {
  ipcMain.handle(CH.open, (_event, repoId: unknown) => {
    if (typeof repoId === 'string') {
      openPromptProjectWindow(repoId)
    }
  })
  ipcMain.handle(CH.focus, (_event, repoId: unknown) => {
    const win = typeof repoId === 'string' ? windowsByRepoId.get(repoId) : undefined
    if (win && !win.isDestroyed()) {
      win.show()
      win.focus()
    }
  })
  ipcMain.handle(CH.state, (event) => stateFor(promptProjectRepoIdOfSender(event.sender)))
  app.on('before-quit', () => {
    // Remember the windows open at quit before they close one by one.
    writeSavedWindows()
    markPromptQuitting()
  })
}

/**
 * Called each time the main window is (re)created. Installs the IPC once and, on the first main
 * window of the launch, reopens the project windows that were open at quit.
 */
export function attachPromptProjectWindows(
  window: BrowserWindow,
  appStore: Store | null,
  keybindings?: () => KeybindingOverrides | undefined
): void {
  mainWindow = window
  store = appStore
  setPromptStoredSessionReader(() => store?.getWorkspaceSession())
  if (keybindings) {
    getKeybindings = keybindings
  }
  if (!installed) {
    installed = true
    installIpc()
  }
  window.webContents.on('did-finish-load', () => {
    releasePromptReposHeldForMainReload()
    broadcast()
  })
  if (restored) {
    return
  }
  restored = true
  if (!isPromptRestoreProjectWindowsOn(appStore?.getSettings())) {
    return
  }
  for (const saved of readSavedWindows().windows) {
    if (typeof saved?.repoId === 'string') {
      openPromptProjectWindow(saved.repoId, saved.bounds)
    }
  }
}
