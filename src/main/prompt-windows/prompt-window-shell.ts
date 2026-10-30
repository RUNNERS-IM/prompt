import { app, BrowserWindow, nativeTheme } from 'electron'
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
import { installMacAccentColor } from '../window/prompt-mac-accent-color'
import { rectHasVisibleAreaOnAnyDisplay } from '../window/window-bounds-validation'
import { wslHostsWindowArguments } from '../wsl/wsl-host-gate'
import { PROMPT_OPEN_REPO_QUERY, PROMPT_WINDOW_QUERY } from '../../shared/prompt-windows'

/** The BrowserWindow of an extra Prompt window: same look and page as the main window. */

export type PromptWindowBounds = { x: number; y: number; width: number; height: number }

function usableBounds(bounds: PromptWindowBounds | undefined): PromptWindowBounds | undefined {
  return bounds &&
    bounds.width > MIN_WIDTH &&
    bounds.height > MIN_HEIGHT &&
    rectHasVisibleAreaOnAnyDisplay(bounds, MIN_WIDTH / 2, MIN_HEIGHT / 2)
    ? bounds
    : undefined
}

/** Loads the renderer page with the window's key (and the project to show first). */
export function loadPromptWindow(win: BrowserWindow, key: string, openRepoId?: string): void {
  const query: Record<string, string> = { [PROMPT_WINDOW_QUERY]: key }
  if (openRepoId) {
    query[PROMPT_OPEN_REPO_QUERY] = openRepoId
  }
  const devUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined
  const load = devUrl
    ? win.loadURL(`${devUrl}${devUrl.includes('?') ? '&' : '?'}${new URLSearchParams(query)}`)
    : win.loadFile(join(__dirname, '../renderer/index.html'), { query })
  load.catch((error: unknown) => console.error('[prompt-windows] load failed', error))
}

/**
 * A hidden window at the saved place, or 28px below and right of the focused window. Shown by
 * the caller once the page is ready.
 */
export function createPromptBrowserWindow(
  savedBounds: PromptWindowBounds | undefined,
  mainWindow: BrowserWindow | null,
  store: Store | null
): BrowserWindow {
  const bounds = usableBounds(savedBounds)
  const parent = BrowserWindow.getFocusedWindow() ?? mainWindow
  const parentBounds = parent && !parent.isDestroyed() ? parent.getBounds() : null
  const cascade =
    !bounds && parentBounds ? { x: parentBounds.x + 28, y: parentBounds.y + 28 } : undefined
  const win = new BrowserWindow({
    width: bounds?.width ?? Math.max(MIN_WIDTH + 1, parentBounds?.width ?? 1200),
    height: bounds?.height ?? Math.max(MIN_HEIGHT + 1, parentBounds?.height ?? 800),
    ...(bounds ? { x: bounds.x, y: bounds.y } : (cascade ?? {})),
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
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
  installMainWindowWebviewSecurity(win)
  if (process.platform === 'darwin') {
    installMacosVisibilityRepaint(win)
    installMacAccentColor(win)
  }
  return win
}
