import { translateMain } from '../i18n/main-i18n'
import { quitAndStopAllSessionsMenuText } from '../menu/app-menu-quit-item'
import type { PromptMenuCommandId, PromptMenuRow } from '../../shared/prompt-menu-panel'
import type { SystemTrayOptions } from './system-tray'
import { trayMenuIcon } from './tray-menu-icons'

type MenuItemOptions = Electron.MenuItemConstructorOptions

export type TrayMenuState = {
  /** Dev instance label shown as a first, disabled row; null in production. */
  devLabel: string | null
  /** Live terminal count for the status line; null hides the line. */
  terminalCount: number | null
}

export type TrayMenuTemplateState = TrayMenuState & {
  /** Wraps click handlers so a throwing action cannot crash main. */
  wrap: (action: () => void) => () => void
}

// 줄 순서와 아이콘: _docs/작업 가이드/공통.md 「메뉴바 메뉴와 아이콘」 + 2026-11-05 결정(켬/끔 두 줄을 정보 묶음 바로 위에).
// 상태 줄 / 열기 / 로그인할 때 열기 · 업데이트 자동 확인 / 정보 · 업데이트 확인 · 설정 · 도움말 / 종료 · 완전히 종료.
// 맥 패널과 기본 메뉴(오른쪽 클릭 · 윈도우)가 이 목록 하나를 함께 쓴다.
export function buildTrayMenuRows(
  opts: SystemTrayOptions,
  { devLabel, terminalCount }: TrayMenuState
): PromptMenuRow[] {
  const isMac = process.platform === 'darwin'
  const rows: PromptMenuRow[] = []
  if (devLabel) {
    // Label dev trays by worktree/branch to distinguish concurrent instances.
    rows.push({ kind: 'info', label: devLabel }, { kind: 'separator' })
  }
  if (terminalCount !== null) {
    rows.push(
      {
        kind: 'info',
        dot: 'green',
        label: translateMain('tray.runningTerminals', '{{count}} terminals running', {
          count: terminalCount,
          defaultValue_one: '{{count}} terminal running'
        })
      },
      { kind: 'separator' }
    )
  }
  rows.push(
    {
      kind: 'command',
      id: 'open',
      icon: 'app-window',
      label: translateMain('tray.openApp', 'Open Prompt')
    },
    { kind: 'separator' }
  )

  const toggles: PromptMenuRow[] = []
  if (opts.getOpenAtLogin && opts.onToggleOpenAtLogin) {
    toggles.push({
      kind: 'toggle',
      id: 'openAtLogin',
      icon: 'power',
      label: translateMain('tray.openAtLogin', 'Open at Login'),
      checked: readFlag(opts.getOpenAtLogin)
    })
  }
  if (opts.getAutoCheckUpdates && opts.onToggleAutoCheckUpdates) {
    toggles.push({
      kind: 'toggle',
      id: 'autoCheckUpdates',
      icon: 'download',
      label: translateMain('tray.autoCheckUpdates', 'Check for Updates Automatically'),
      checked: readFlag(opts.getAutoCheckUpdates)
    })
  }
  if (toggles.length > 0) {
    rows.push(...toggles, { kind: 'separator' })
  }

  rows.push({
    kind: 'command',
    id: 'about',
    icon: 'info',
    label: translateMain('tray.about', 'About Prompt')
  })
  // Windows keeps its old tray: no update/settings entries there.
  if (isMac) {
    rows.push(
      {
        kind: 'command',
        id: 'checkForUpdates',
        icon: 'refresh-cw',
        label: translateMain('tray.checkForUpdates', 'Check for Updates…')
      },
      {
        kind: 'command',
        id: 'settings',
        icon: 'settings',
        // No shortcut hint: app.settings has no default binding (⌘, stays with terminal apps).
        label: translateMain('tray.settings', 'Settings…')
      }
    )
  }
  rows.push(
    {
      kind: 'command',
      id: 'help',
      icon: 'circle-help',
      label: translateMain('tray.helpFeedback', 'Help & Feedback')
    },
    { kind: 'separator' },
    {
      kind: 'command',
      id: 'quit',
      icon: 'square-x',
      label: translateMain('tray.quitApp', 'Quit Prompt'),
      ...(isMac ? { accelerator: 'CmdOrCtrl+Q' as const } : {})
    }
  )
  // Prompt alone keeps "Quit Completely…" under Quit (공통.md); it also stops every terminal session.
  if (opts.onQuitAndStopAllSessions) {
    const text = quitAndStopAllSessionsMenuText()
    rows.push({
      kind: 'command',
      id: 'quitCompletely',
      icon: 'circle-x',
      label: String(text.label ?? ''),
      ...(text.toolTip ? { toolTip: text.toolTip } : {})
    })
  }
  return rows
}

/** 맥 패널 줄 목록: 맨 위 회색 줄(개발판 이름표 · 터미널 수)을 Monitor 처럼 머리 줄 하나로 합친다. */
export function buildTrayPanelRows(opts: SystemTrayOptions, state: TrayMenuState): PromptMenuRow[] {
  const rows = buildTrayMenuRows(opts, state)
  const firstCommand = rows.findIndex((row) => row.kind !== 'info' && row.kind !== 'separator')
  const running = rows.slice(0, firstCommand).find((row) => row.kind === 'info' && row.dot)
  return [
    {
      kind: 'head',
      name: state.devLabel ? 'Prompt DEV' : 'Prompt',
      ...(running?.kind === 'info' ? { sub: running.label } : {})
    },
    { kind: 'separator' },
    ...rows.slice(firstCommand)
  ]
}

function readFlag(read: () => boolean): boolean {
  try {
    return read()
  } catch (error) {
    console.warn('[system-tray] menu state unavailable', error)
    return false
  }
}

/** 줄 하나를 눌렀을 때 할 일. 없는 명령(예: 서버 모드의 완전히 종료)은 아무것도 하지 않는다. */
export function runTrayMenuCommand(opts: SystemTrayOptions, id: PromptMenuCommandId): void {
  switch (id) {
    case 'open':
      opts.onOpen()
      return
    case 'openAtLogin':
      opts.onToggleOpenAtLogin?.()
      return
    case 'autoCheckUpdates':
      opts.onToggleAutoCheckUpdates?.()
      return
    case 'about':
      opts.onShowAbout()
      return
    case 'checkForUpdates':
      opts.onCheckForUpdates()
      return
    case 'settings':
      opts.onOpenSettings()
      return
    case 'help':
      opts.onOpenHelp()
      return
    case 'quit':
      opts.onQuit()
      return
    case 'quitCompletely':
      opts.onQuitAndStopAllSessions?.()
  }
}

// 기본 메뉴(오른쪽 클릭 · 윈도우)는 같은 줄 목록을 Electron 메뉴로 옮긴다. 켬/끔 줄은 체크(✓) 항목에 아이콘도 단다.
// 맥은 체크를 아이콘 왼쪽 칸에 따로 그려 모든 줄의 글자가 같은 자리에서 시작한다(Remote 45ce711 과 같음).
export function buildTrayMenuTemplate(
  opts: SystemTrayOptions,
  { devLabel, terminalCount, wrap }: TrayMenuTemplateState,
  onRun: (id: PromptMenuCommandId) => void = (id) => runTrayMenuCommand(opts, id)
): MenuItemOptions[] {
  return buildTrayMenuRows(opts, { devLabel, terminalCount }).map((row): MenuItemOptions => {
    switch (row.kind) {
      case 'separator':
        return { type: 'separator' }
      case 'head':
        return { label: row.sub ? `${row.name}  ${row.sub}` : row.name, enabled: false }
      case 'info':
        return {
          label: row.label,
          ...(row.dot ? { icon: trayMenuIcon('status-dot-green') } : {}),
          enabled: false
        }
      case 'toggle':
        return {
          label: row.label,
          icon: trayMenuIcon(row.icon),
          type: 'checkbox',
          checked: row.checked,
          click: wrap(() => onRun(row.id))
        }
      case 'command':
        return {
          label: row.label,
          icon: trayMenuIcon(row.icon),
          ...(row.accelerator ? { accelerator: row.accelerator, registerAccelerator: false } : {}),
          ...(row.toolTip ? { toolTip: row.toolTip } : {}),
          click: wrap(() => onRun(row.id))
        }
    }
  })
}
