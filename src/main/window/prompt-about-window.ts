import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { join } from 'node:path'
import { mainI18n, translateMain } from '../i18n/main-i18n'
import type { Store } from '../persistence'
import { installPrivilegedWindowNavigationPolicy } from './privileged-window-navigation'
import { installMacAccentColor } from './prompt-mac-accent-color'
import {
  PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL,
  PROMPT_THIRD_PARTY_NOTICES_FILE
} from '../../shared/prompt-third-party-notices'

// Prompt's own About window (src/renderer/prompt-about.html). The native About panel cannot hold
// the "More apps from RUNNERS" cards, so both the app menu and the menu bar menu open this one.

let aboutWindow: BrowserWindow | null = null
let noticesHandlerRegistered = false

// Packaged builds carry the file in resources/ (extraResources); dev runs read the repo copy.
function thirdPartyNoticesPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, PROMPT_THIRD_PARTY_NOTICES_FILE)
    : join(app.getAppPath(), PROMPT_THIRD_PARTY_NOTICES_FILE)
}

function registerThirdPartyNoticesHandler(): void {
  if (noticesHandlerRegistered) {
    return
  }
  noticesHandlerRegistered = true
  ipcMain.handle(PROMPT_OPEN_THIRD_PARTY_NOTICES_CHANNEL, async () => {
    try {
      return (await shell.openPath(thirdPartyNoticesPath())) === ''
    } catch {
      return false
    }
  })
}

function aboutTitle(): string {
  return translateMain('tray.about', 'About Prompt')
}

function prefersDark(store: Pick<Store, 'getSettings'> | null): boolean {
  const theme = store?.getSettings().theme ?? 'system'
  return theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors)
}

export function showPromptAboutWindow(store: Pick<Store, 'getSettings'> | null): void {
  if (aboutWindow && !aboutWindow.isDestroyed()) {
    if (aboutWindow.isMinimized()) {
      aboutWindow.restore()
    }
    aboutWindow.show()
    aboutWindow.focus()
    return
  }

  registerThirdPartyNoticesHandler()
  const isMac = process.platform === 'darwin'
  // Sized for the Split-style layout: the longest English card line (Monitor, about 360px at 11px)
  // stays on one line, and the header, both cards and the two footer lines fit without scrolling.
  const window = new BrowserWindow({
    width: 570,
    height: 631,
    useContentSize: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    title: aboutTitle(),
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
  aboutWindow = window
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
      window.setTitle(aboutTitle())
    }
  }
  mainI18n.on('languageChanged', updateTitle)
  window.on('closed', () => {
    mainI18n.off('languageChanged', updateTitle)
    if (aboutWindow === window) {
      aboutWindow = null
    }
  })

  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/prompt-about.html`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/prompt-about.html'))
  }
}
