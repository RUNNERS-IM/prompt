import { app, BrowserWindow, ipcMain, screen, type Tray } from 'electron'
import { join } from 'node:path'
import {
  PROMPT_MENU_PANEL_FIT_HEIGHT_CHANNEL,
  PROMPT_MENU_PANEL_ROWS_CHANNEL,
  PROMPT_MENU_PANEL_RUN_CHANNEL,
  PROMPT_MENU_PANEL_SHOWN_CHANNEL,
  isPromptMenuCommandId,
  type PromptMenuRow
} from '../../shared/prompt-menu-panel'
import { installPrivilegedWindowNavigationPolicy } from '../window/privileged-window-navigation'
import { getTrayMenuRows, runTrayMenuCommandFromPanel } from './system-tray'

// 맥 메뉴 막대 아이콘을 왼쪽 클릭하면 열리는 패널: 테두리 없는 창, 메뉴와 같은 흐림(vibrancy "menu"), 포커스를 잃으면 닫힌다.
// Monitor(monitor 저장소 electron/main/windows.ts 의 createPanel · placeUnderTray, index.ts 의 togglePanel)를 그대로 옮겼다.
// 화면은 src/renderer/prompt-menu-panel.html.

/** 폭 300: Monitor · Split 패널과 같다. */
export const PROMPT_MENU_PANEL_WIDTH = 300
/** 첫 높이일 뿐이다. 화면이 그려지면 내용 높이에 맞춘다. */
const FIRST_HEIGHT = 360
/** 메뉴 막대와 패널 사이 틈. */
const GAP = 4
// 아이콘 클릭이 패널을 연 직후 포커스를 잃었다는 신호를 바로 한 번 더 보낼 수 있어, 연 뒤 이만큼은 blur 를 무시한다.
const BLUR_GRACE_MS = 400
// 패널이 열린 채 아이콘을 누르면 먼저 패널이 포커스를 잃어 닫힌다. 그 직후 들어온 클릭은 같은 클릭이라 다시 열지 않는다.
const REOPEN_GUARD_MS = 300

let panel: BrowserWindow | null = null
let shownAt = 0
let hiddenByBlurAt = 0
let handlersRegistered = false

function isPanelSender(sender: Electron.WebContents): boolean {
  return !!panel && !panel.isDestroyed() && panel.webContents === sender
}

function rows(): PromptMenuRow[] {
  return getTrayMenuRows() ?? []
}

function registerHandlers(): void {
  if (handlersRegistered) {
    return
  }
  handlersRegistered = true
  ipcMain.handle(PROMPT_MENU_PANEL_ROWS_CHANNEL, (event) =>
    isPanelSender(event.sender) ? rows() : []
  )
  ipcMain.handle(PROMPT_MENU_PANEL_RUN_CHANNEL, (event, id: unknown) => {
    if (!isPanelSender(event.sender) || !isPromptMenuCommandId(id)) {
      return
    }
    if (!rows().some((item) => item.kind === 'command' && item.id === id)) {
      return
    }
    // 패널을 먼저 닫고 실행한다.
    hidePromptMenuPanel()
    runTrayMenuCommandFromPanel(id)
  })
  ipcMain.on(PROMPT_MENU_PANEL_FIT_HEIGHT_CHANNEL, (event, height: unknown) => {
    if (!isPanelSender(event.sender) || !panel) {
      return
    }
    const value = Number(height)
    if (!Number.isFinite(value) || value <= 0) {
      return
    }
    const [width] = panel.getContentSize()
    panel.setContentSize(width, Math.ceil(value))
  })
}

function createPanel(): BrowserWindow {
  const window = new BrowserWindow({
    width: PROMPT_MENU_PANEL_WIDTH,
    height: FIRST_HEIGHT,
    useContentSize: true,
    show: false,
    frame: false,
    // NSPanel: 클릭과 키를 받으면서도 Prompt 를 맨 앞 앱으로 만들지 않는다. 그래서 패널을 열어도
    // Prompt 본 창이 다른 앱 앞으로 올라오지 않는다(Split 패널에서 2026-11-05 Electron 43 으로 확인).
    type: 'panel',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: true,
    title: 'Prompt',
    // Split 메뉴와 같은 흐림. 화면은 투명하게 두고 OS 가 그린다.
    vibrancy: 'menu',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      partition: 'prompt-menu-panel',
      webviewTag: false,
      backgroundThrottling: false
    }
  })
  // 메뉴는 전체 화면 앱 위에도, 모든 Space 에도 보이므로 패널도 그렇게 한다.
  // skipTransformProcessType: 이 값이 없으면 잠깐 Dock 아이콘이 사라진다.
  window.setAlwaysOnTop(true, 'pop-up-menu')
  window.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
    skipTransformProcessType: true
  })
  installPrivilegedWindowNavigationPolicy(window.webContents)
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false)
  )
  window.webContents.session.setPermissionCheckHandler(() => false)
  window.on('page-title-updated', (event) => event.preventDefault())
  window.on('blur', () => {
    if (Date.now() - shownAt < BLUR_GRACE_MS) {
      return
    }
    hiddenByBlurAt = Date.now()
    hidePromptMenuPanel()
  })
  window.on('closed', () => {
    if (panel === window) {
      panel = null
    }
  })
  if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/prompt-menu-panel.html`)
  } else {
    void window.loadFile(join(__dirname, '../renderer/prompt-menu-panel.html'))
  }
  return window
}

/** 패널을 미리 만들어 둔다(첫 클릭이 느리지 않게). 맥에서만. */
export function ensurePromptMenuPanel(): void {
  if (process.platform !== 'darwin') {
    return
  }
  registerHandlers()
  if (!panel || panel.isDestroyed()) {
    panel = createPanel()
  }
}

/** 아이콘 바로 아래, 아이콘이 있는 화면 안쪽에 패널을 둔다. */
export function placeUnderTray(window: BrowserWindow, tray: Tray | null): void {
  const [width, height] = window.getSize()
  const icon = tray && !tray.isDestroyed() ? tray.getBounds() : null
  const anchor = icon && icon.width > 0 ? icon : null
  const display = anchor
    ? screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y })
    : screen.getPrimaryDisplay()
  const area = display.workArea
  let x: number
  let y: number
  if (anchor) {
    x = Math.round(anchor.x + anchor.width / 2 - width / 2)
    y = anchor.y + anchor.height + GAP
  } else {
    x = area.x + area.width - width - GAP
    y = area.y + GAP
  }
  x = Math.min(Math.max(x, area.x + GAP), area.x + area.width - width - GAP)
  y = Math.min(Math.max(y, area.y), area.y + area.height - height)
  window.setPosition(x, y, false)
}

export function hidePromptMenuPanel(): void {
  if (!panel || panel.isDestroyed()) {
    return
  }
  panel.hide()
}

/** 아이콘 왼쪽 클릭: 열려 있으면 닫고, 닫혀 있으면 아이콘 아래에 연다. */
export function togglePromptMenuPanel(tray: Tray): void {
  ensurePromptMenuPanel()
  const window = panel
  if (!window) {
    return
  }
  if (window.isVisible()) {
    hidePromptMenuPanel()
    return
  }
  if (Date.now() - hiddenByBlurAt < REOPEN_GUARD_MS) {
    return
  }
  placeUnderTray(window, tray)
  shownAt = Date.now()
  // 열 때마다 상태를 새로 읽는다: 다른 창이나 시스템 설정에서 바꾼 켬/끔도 맞게 보인다.
  window.webContents.send(PROMPT_MENU_PANEL_SHOWN_CHANNEL, rows())
  window.show()
  window.focus()
}

/** 열린 패널의 줄을 지금 상태로 다시 그린다(언어 바꿈 등). */
export function refreshPromptMenuPanel(): void {
  if (!panel || panel.isDestroyed()) {
    return
  }
  panel.webContents.send(PROMPT_MENU_PANEL_SHOWN_CHANNEL, rows())
}

export function destroyPromptMenuPanel(): void {
  if (panel && !panel.isDestroyed()) {
    panel.destroy()
  }
  panel = null
}
