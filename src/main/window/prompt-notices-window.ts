import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { mainI18n, translateMain } from '../i18n/main-i18n'
import type { Store } from '../persistence'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import {
  PROMPT_OPEN_CHROMIUM_LICENSES_CHANNEL,
  PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL,
  PROMPT_READ_THIRD_PARTY_NOTICES_CHANNEL
} from '../../shared/prompt-third-party-notices'
import {
  chromiumLicensesPath,
  thirdPartyNoticesPath,
  type LicenseFileContext
} from './prompt-license-file-paths'

// Prompt's "Open source notices" window (src/renderer/prompt-about.html?view=notices), opened from
// the footer of Settings › About. Same size as Split's notices sheet; on macOS the title bar and its
// buttons are hidden so it reads like that sheet, and the page's Close button, Return and Escape
// close it.

const NOTICES_WINDOW_OPTIONS: Electron.BrowserWindowConstructorOptions = {
  width: 480,
  height: 420,
  resizable: false
}

let noticesWindow: BrowserWindow | null = null
let lastStore: Pick<Store, 'getSettings'> | null = null
let noticesHandlersRegistered = false

function licenseFileContext(): LicenseFileContext {
  return {
    platform: process.platform,
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    execPath: process.execPath,
    appPath: app.getAppPath()
  }
}

/** Call once at startup: Settings › About in any Prompt window opens and reads the notices. */
export function registerPromptThirdPartyNoticesHandlers(store: Pick<Store, 'getSettings'>): void {
  lastStore = store
  if (noticesHandlersRegistered) {
    return
  }
  noticesHandlersRegistered = true
  ipcMain.handle(PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL, () => {
    showNoticesWindow(lastStore)
  })
  ipcMain.handle(PROMPT_READ_THIRD_PARTY_NOTICES_CHANNEL, async () => {
    try {
      return await readFile(thirdPartyNoticesPath(licenseFileContext()), 'utf8')
    } catch {
      return null
    }
  })
  ipcMain.handle(PROMPT_OPEN_CHROMIUM_LICENSES_CHANNEL, async () => {
    try {
      return (await shell.openPath(chromiumLicensesPath(licenseFileContext()))) === ''
    } catch {
      return false
    }
  })
}

function prefersDark(store: Pick<Store, 'getSettings'> | null): boolean {
  const theme = store?.getSettings().theme ?? 'system'
  return theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
}

function showNoticesWindow(store: Pick<Store, 'getSettings'> | null): void {
  const existing = noticesWindow
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) {
      existing.restore()
    }
    existing.show()
    existing.focus()
    return
  }

  const title = (): string => translateMain('prompt.about.notices', 'Open Source Notices')
  const isMac = process.platform === 'darwin'
  const window = new BrowserWindow({
    ...NOTICES_WINDOW_OPTIONS,
    useContentSize: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: title(),
    show: false,
    autoHideMenuBar: true,
    ...(isMac ? { titleBarStyle: 'hidden' as const } : {}),
    backgroundColor: prefersDark(store) ? '#1e1e1e' : '#ececec',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      partition: 'prompt-about-window',
      webviewTag: false
    }
  })
  noticesWindow = window
  // Links leave through the default browser; the window itself never navigates away.
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  if (isMac) {
    window.setWindowButtonVisibility(false)
  }
  window.once('ready-to-show', () => window.show())
  window.on('page-title-updated', (event) => event.preventDefault())
  const updateTitle = (): void => {
    if (!window.isDestroyed()) {
      window.setTitle(title())
    }
  }
  mainI18n.on('languageChanged', updateTitle)
  window.on('closed', () => {
    mainI18n.off('languageChanged', updateTitle)
    if (noticesWindow === window) {
      noticesWindow = null
    }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/prompt-about.html?view=notices`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/prompt-about.html'), {
      query: { view: 'notices' }
    })
  }
}
