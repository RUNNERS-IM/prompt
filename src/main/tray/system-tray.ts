import { Menu, Tray, nativeTheme, type NativeImage } from 'electron'
import type { PromptMenuCommandId, PromptMenuRow } from '../../shared/prompt-menu-panel'
import menuBarOffIconPath from '../../../resources/tray/prompt-menu-bar-offTemplate.png?asset&asarUnpack'
import menuBarOffIconRetinaPath from '../../../resources/tray/prompt-menu-bar-offTemplate@2x.png?asset&asarUnpack'
import { deferAppKitSceneMutation } from '../appkit-scene-mutation'
import { createAppIconImage } from '../app-icon'
import { translateMain } from '../i18n/main-i18n'
import { composeTrayAttentionIcon, tintTrayTemplateForAttention } from './tray-attention-icon'
import { createMacMenuBarImage, stampMacDevBadge } from './tray-mac-images'
import { buildTrayMenuTemplate, buildTrayPanelRows, runTrayMenuCommand } from './tray-menu-template'
import {
  isMenuBarCursorVisible,
  startMenuBarCursorBlink,
  stopMenuBarCursorBlink
} from './prompt-menu-bar-cursor'

export type SystemTrayOptions = {
  /** App icon id from settings; the tray reuses the app icon image. */
  appIcon: unknown
  /** True for dev/unpackaged instances; shows a DEV marker on the tray. */
  isDevInstance: boolean
  /** Worktree/branch label identifying the dev instance, when known. */
  devInstanceLabel: string | null
  /** Restore + show + focus the main window (recreating it if needed). */
  onOpen: () => void
  /** Restore the main window and open its Settings surface. */
  onOpenSettings: () => void
  /** Run the existing user-initiated update check. */
  onCheckForUpdates: () => void
  /** Show the About window (name, version, RUNNERS, original MIT credit). */
  onShowAbout: () => void
  /** Open the Help & Feedback page (GitHub issues). */
  onOpenHelp: () => void
  /** Live terminal count for the status line; omitted hides the line. */
  getRunningTerminalCount?: () => number
  /** Agents seen working right now; the menu bar cursor blinks only while this is above zero. */
  getWorkingAgentCount?: () => number
  /** Caller must mark quit intent; serve-mode user Quit may close only desktop windows. */
  onQuit: () => void
  /** Confirm, then quit with every terminal session stopped; omitted where the item must not show (serve mode). */
  onQuitAndStopAllSessions?: () => void
  /** 「로그인할 때 열기」 켬/끔 줄. 둘 다 있어야 줄이 보인다. */
  getOpenAtLogin?: () => boolean
  onToggleOpenAtLogin?: () => void
  /** 「업데이트 자동 확인」 켬/끔 줄. 둘 다 있어야 줄이 보인다. */
  getAutoCheckUpdates?: () => boolean
  onToggleAutoCheckUpdates?: () => void
  /** 맥: 있으면 왼쪽 클릭은 앱이 그린 패널을 열고 닫고, 오른쪽 클릭은 기본 메뉴를 띄운다. 없으면 예전처럼 기본 메뉴만. */
  onTogglePanel?: (tray: Tray) => void
  /** 맥 패널 모드에서 줄 글이 바뀌었을 때(언어 바꿈 등) 열린 패널을 새로 그리게 한다. */
  onMenuRowsChanged?: () => void
}

// Keep a live reference or Electron GC removes the tray icon.
let tray: Tray | null = null
let trayOptions: SystemTrayOptions | null = null

// 맥 패널 모드: 메뉴를 아이콘에 붙여 두지 않고, 오른쪽 클릭 때마다 새로 만들어 띄운다.
function usesMacPanel(opts: SystemTrayOptions | null): boolean {
  return process.platform === 'darwin' && typeof opts?.onTogglePanel === 'function'
}

// Cache the plain icon so attention changes do not reload the app PNG.
let baseTrayImage: NativeImage | null = null

let cursorOffTrayImage: NativeImage | null = null

function currentMacTrayFrame(): NativeImage | null {
  return isMenuBarCursorVisible() || !cursorOffTrayImage ? baseTrayImage : cursorOffTrayImage
}

// Remember attention before deferred tray creation so its first image is current.
let attentionActive = false

// Keep dev identity across attention-triggered tooltip rebuilds.
let devIndicator: { label: string | null } | null = null

let nativeThemeUpdatedListener: (() => void) | null = null

// The status line is baked into the native menu, so poll the count and rebuild only when it changes.
const TERMINAL_COUNT_POLL_MS = 2000
let terminalCountTimer: ReturnType<typeof setInterval> | null = null
let shownTerminalCount: number | null = null

function readTerminalCount(opts: SystemTrayOptions): number | null {
  try {
    return opts.getRunningTerminalCount?.() ?? null
  } catch (error) {
    console.warn('[system-tray] terminal count unavailable', error)
    return null
  }
}

function startTerminalCountWatch(): void {
  // 패널 모드에는 붙여 둔 메뉴가 없어 다시 만들 것이 없다(패널과 오른쪽 클릭 메뉴는 열 때마다 새로 읽는다).
  if (terminalCountTimer || !trayOptions?.getRunningTerminalCount || usesMacPanel(trayOptions)) {
    return
  }
  terminalCountTimer = setInterval(() => {
    if (trayOptions && readTerminalCount(trayOptions) !== shownTerminalCount) {
      rebuildSystemTrayMenu()
    }
  }, TERMINAL_COUNT_POLL_MS)
}

function stopTerminalCountWatch(): void {
  if (terminalCountTimer) {
    clearInterval(terminalCountTimer)
    terminalCountTimer = null
  }
  shownTerminalCount = null
}

// Per-worktree tooltips distinguish concurrent dev instances.
function baseTooltip(): string {
  if (!devIndicator) {
    return 'Prompt'
  }
  return devIndicator.label ? `Prompt DEV (${devIndicator.label})` : 'Prompt DEV'
}

// Downscale the app image for Windows' 16px notification-area slot.
const TRAY_ICON_SIZE = 16

function applyTrayImage(): void {
  if (!tray || tray.isDestroyed() || !baseTrayImage) {
    return
  }

  if (process.platform === 'darwin') {
    const frame = currentMacTrayFrame() ?? baseTrayImage
    if (attentionActive) {
      try {
        // Disabling template tint enables amber attention but requires theme-appropriate literal glyph pixels.
        const useLightGlyph = nativeTheme.shouldUseDarkColors
        const attentionImage = composeTrayAttentionIcon(
          tintTrayTemplateForAttention(frame, useLightGlyph)
        )
        if (frame.getScaleFactors().includes(2)) {
          // toBitmap reads 1x only; explicitly rebuild the 2x representation for Retina.
          const retinaAttentionImage = composeTrayAttentionIcon(
            tintTrayTemplateForAttention(frame, useLightGlyph, 2)
          )
          attentionImage.addRepresentation({
            scaleFactor: 2,
            dataURL: retinaAttentionImage.toDataURL()
          })
        }
        attentionImage.setTemplateImage(false)
        tray.setImage(attentionImage)
        tray.setToolTip(
          devIndicator
            ? `${baseTooltip()} - ${translateMain('tray.activityWaitingSuffix', 'activity waiting')}`
            : translateMain('tray.activityWaiting', 'Orca - activity waiting')
        )
        return
      } catch (error) {
        // Native theme/bell callbacks are not guarded; image failures must fall back rather than escape into main.
        console.warn('[system-tray] macOS attention icon failed; showing plain icon', error)
      }
    }

    frame.setTemplateImage(true)
    tray.setImage(frame)
    tray.setToolTip(baseTooltip())
    return
  }

  tray.setImage(attentionActive ? composeTrayAttentionIcon(baseTrayImage) : baseTrayImage)
}

// Coalesce repaint bursts and read current state in the deferred turn so dropped schedules cannot apply stale icons.
let trayImageRepaintPending = false

// NSStatusItem scene writes inside AppKit callouts deadlock main; defer them to a fresh turn.
function scheduleTrayImage(): void {
  if (trayImageRepaintPending) {
    return
  }
  trayImageRepaintPending = true
  deferAppKitSceneMutation(() => {
    trayImageRepaintPending = false
    applyTrayImage()
  })
}

function watchMacAppearance(): void {
  if (nativeThemeUpdatedListener) {
    return
  }
  nativeThemeUpdatedListener = () => {
    if (attentionActive) {
      // Appearance callbacks originate inside AppKit; defer native writes.
      scheduleTrayImage()
    }
  }
  nativeTheme.on('updated', nativeThemeUpdatedListener)
}

function stopWatchingMacAppearance(): void {
  if (!nativeThemeUpdatedListener) {
    return
  }
  nativeTheme.removeListener('updated', nativeThemeUpdatedListener)
  nativeThemeUpdatedListener = null
}

// Tray/menu listeners lack IPC promise guards; contain action failures rather than throw fatally into main.
function safeMenuAction(action: () => void): () => void {
  return () => {
    try {
      action()
    } catch (error) {
      console.error('[system-tray] menu action failed', error)
    }
  }
}

/** Create at most one Windows/macOS tray; Linux has none. */
export function createSystemTray(opts: SystemTrayOptions): Tray | null {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return null
  }
  if (tray && !tray.isDestroyed()) {
    return tray
  }

  devIndicator = opts.isDevInstance ? { label: opts.devInstanceLabel } : null

  if (process.platform === 'darwin') {
    baseTrayImage = createMacMenuBarImage()
    if (!baseTrayImage) {
      return null
    }
    if (devIndicator) {
      baseTrayImage = stampMacDevBadge(baseTrayImage)
    } else {
      cursorOffTrayImage = createMacMenuBarImage(menuBarOffIconPath, menuBarOffIconRetinaPath)
    }
  } else {
    baseTrayImage = createAppIconImage(opts.appIcon).resize({
      width: TRAY_ICON_SIZE,
      height: TRAY_ICON_SIZE
    })
  }

  tray = new Tray(baseTrayImage)
  applyTrayImage()

  trayOptions = opts
  if (usesMacPanel(opts)) {
    const created = tray
    created.on(
      'click',
      safeMenuAction(() => opts.onTogglePanel?.(created))
    )
    created.on(
      'right-click',
      safeMenuAction(() => {
        if (!created.isDestroyed()) {
          created.popUpContextMenu(buildTrayMenu(opts))
        }
      })
    )
  } else {
    tray.setContextMenu(buildTrayMenu(opts))
  }
  if (process.platform === 'win32') {
    tray.setToolTip(baseTooltip())
    // Windows left-click restores the app; macOS uses its attached menu.
    tray.on(
      'click',
      safeMenuAction(() => opts.onOpen())
    )
  } else {
    watchMacAppearance()
    if (cursorOffTrayImage) {
      startMenuBarCursorBlink(() => trayOptions?.getWorkingAgentCount, scheduleTrayImage)
    }
  }
  startTerminalCountWatch()
  return tray
}

function buildTrayMenu(opts: SystemTrayOptions): Menu {
  const terminalCount = readTerminalCount(opts)
  shownTerminalCount = terminalCount
  const devLabel = devIndicator ? baseTooltip() : null
  return Menu.buildFromTemplate(
    buildTrayMenuTemplate(opts, { devLabel, terminalCount, wrap: safeMenuAction }, (id) =>
      runCommand(opts, id)
    )
  )
}

function runCommand(opts: SystemTrayOptions, id: PromptMenuCommandId): void {
  runTrayMenuCommand(opts, id)
  if ((id === 'openAtLogin' || id === 'autoCheckUpdates') && !usesMacPanel(opts)) {
    // 붙여 둔 메뉴는 체크 표시를 스스로 바꾸지 않으므로 새로 만든다.
    rebuildSystemTrayMenu()
  }
}

/** 지금 상태로 새로 만든 줄 목록(맥 패널이 쓴다). 아이콘이 없으면 null. */
export function getTrayMenuRows(): PromptMenuRow[] | null {
  if (!tray || tray.isDestroyed() || !trayOptions) {
    return null
  }
  return buildTrayPanelRows(trayOptions, {
    devLabel: devIndicator ? baseTooltip() : null,
    terminalCount: readTerminalCount(trayOptions)
  })
}

/** 패널에서 누른 줄을 실행한다. 실패해도 main 이 죽지 않게 감싼다. */
export function runTrayMenuCommandFromPanel(id: PromptMenuCommandId): void {
  const opts = trayOptions
  if (!opts) {
    return
  }
  safeMenuAction(() => runCommand(opts, id))()
}

/** Refreshes translated labels without recreating the tray or its actions. */
export function rebuildSystemTrayMenu(): void {
  // Native tray writes must run outside AppKit callbacks.
  deferAppKitSceneMutation(() => {
    if (!tray || tray.isDestroyed() || !trayOptions) {
      return
    }
    if (usesMacPanel(trayOptions)) {
      trayOptions.onMenuRowsChanged?.()
    } else {
      tray.setContextMenu(buildTrayMenu(trayOptions))
    }
    applyTrayImage()
  })
}

/** Applies the persisted macOS visibility preference without affecting Windows. */
export function setMacMenuBarIconVisible(visible: boolean, opts: SystemTrayOptions): Tray | null {
  if (process.platform !== 'darwin') {
    return null
  }
  if (!visible) {
    destroySystemTray()
    return null
  }
  return createSystemTray(opts)
}

/** Bell/completion attention survives pre-creation calls; notification/visibility flow clears it on reveal. Safe without a tray. */
export function setTrayAttention(active: boolean): void {
  if (attentionActive === active) {
    return
  }
  // Set dedup state synchronously; defer only native scene writes or rapid show/hide races mis-dedupe.
  attentionActive = active
  scheduleTrayImage()
}

export function destroySystemTray(): void {
  stopWatchingMacAppearance()
  stopTerminalCountWatch()
  stopMenuBarCursorBlink()
  cursorOffTrayImage = null
  if (tray && !tray.isDestroyed()) {
    tray.destroy()
  }
  tray = null
  trayOptions = null
  baseTrayImage = null
  // Notification/visibility flow owns attention; preserve its dot across menu-bar icon hide/show.
}
