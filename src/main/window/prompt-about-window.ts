import { app, BrowserWindow, ipcMain, nativeTheme } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mainI18n, translateMain } from '../i18n/main-i18n'
import type { Store } from '../persistence'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { installMacAccentColor } from './prompt-mac-accent-color'
import {
  PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL,
  PROMPT_READ_THIRD_PARTY_NOTICES_CHANNEL,
  PROMPT_THIRD_PARTY_NOTICES_FILE
} from '../../shared/prompt-third-party-notices'

// Prompt's own About window and its "Open source notices" window, both from
// src/renderer/prompt-about.html (the notices one with ?view=notices). The native About panel
// cannot hold the "More apps from RUNNERS" cards, so both the app menu and the menu bar menu
// open the About window.

type InfoWindowKind = 'about' | 'notices'

type InfoWindowSpec = {
  title: () => string
  options: Electron.BrowserWindowConstructorOptions
}

const INFO_WINDOWS: Record<InfoWindowKind, InfoWindowSpec> = {
  about: {
    title: () => translateMain('tray.about', 'About Prompt'),
    // Sized for the Split-style layout: the longest English card line (Monitor, about 360px at
    // 11px) stays on one line, and the header, both cards and the footer fit without scrolling.
    options: { width: 570, height: 616, resizable: false }
  },
  notices: {
    title: () => translateMain('prompt.about.notices', 'Open source notices'),
    options: { width: 560, height: 520, minWidth: 400, minHeight: 300, resizable: true }
  }
}

const openWindows: Partial<Record<InfoWindowKind, BrowserWindow>> = {}
let lastStore: Pick<Store, 'getSettings'> | null = null
let noticesHandlersRegistered = false

// Packaged builds carry the file in resources/ (extraResources); dev runs read the repo copy.
function thirdPartyNoticesPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, PROMPT_THIRD_PARTY_NOTICES_FILE)
    : join(app.getAppPath(), PROMPT_THIRD_PARTY_NOTICES_FILE)
}

function registerThirdPartyNoticesHandlers(): void {
  if (noticesHandlersRegistered) {
    return
  }
  noticesHandlersRegistered = true
  ipcMain.handle(PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL, () => {
    showInfoWindow('notices', lastStore)
  })
  ipcMain.handle(PROMPT_READ_THIRD_PARTY_NOTICES_CHANNEL, async () => {
    try {
      return await readFile(thirdPartyNoticesPath(), 'utf8')
    } catch {
      return null
    }
  })
}

function prefersDark(store: Pick<Store, 'getSettings'> | null): boolean {
  const theme = store?.getSettings().theme ?? 'system'
  return theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
}

function showInfoWindow(kind: InfoWindowKind, store: Pick<Store, 'getSettings'> | null): void {
  const existing = openWindows[kind]
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) {
      existing.restore()
    }
    existing.show()
    existing.focus()
    return
  }

  const spec = INFO_WINDOWS[kind]
  const isMac = process.platform === 'darwin'
  const window = new BrowserWindow({
    ...spec.options,
    useContentSize: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: spec.title(),
    show: false,
    autoHideMenuBar: true,
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const } : {}),
    backgroundColor: prefersDark(store) ? '#1e1e1e' : '#ececec',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      partition: 'prompt-about-window',
      webviewTag: false
    }
  })
  openWindows[kind] = window
  // Links leave through the default browser; the window itself never navigates away.
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  if (isMac) {
    installMacAccentColor(window)
  }
  window.once('ready-to-show', () => window.show())
  window.on('page-title-updated', (event) => event.preventDefault())
  const updateTitle = (): void => {
    if (!window.isDestroyed()) {
      window.setTitle(spec.title())
    }
  }
  mainI18n.on('languageChanged', updateTitle)
  window.on('closed', () => {
    mainI18n.off('languageChanged', updateTitle)
    if (openWindows[kind] === window) {
      delete openWindows[kind]
    }
  })

  const query = kind === 'about' ? '' : `?view=${kind}`
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/prompt-about.html${query}`)
  } else {
    void window.loadFile(
      join(__dirname, '../renderer/prompt-about.html'),
      kind === 'about' ? {} : { query: { view: kind } }
    )
  }
}

export function showPromptAboutWindow(store: Pick<Store, 'getSettings'> | null): void {
  lastStore = store
  registerThirdPartyNoticesHandlers()
  showInfoWindow('about', store)
}
