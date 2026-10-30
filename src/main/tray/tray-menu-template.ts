import { translateMain } from '../i18n/main-i18n'
import { quitAndStopAllSessionsMenuText } from '../menu/app-menu-quit-item'
import type { SystemTrayOptions } from './system-tray'
import { trayMenuIcon } from './tray-menu-icons'

type MenuItemOptions = Electron.MenuItemConstructorOptions

export type TrayMenuState = {
  /** Dev instance label shown as a first, disabled row; null in production. */
  devLabel: string | null
  /** Live terminal count for the status line; null hides the line. */
  terminalCount: number | null
  /** Wraps click handlers so a throwing action cannot crash main. */
  wrap: (action: () => void) => () => void
}

// Order and icons follow _docs/작업 가이드/공통.md 「메뉴바 메뉴와 아이콘」:
// status line / open / about, updates, settings, help / quit, quit completely.
export function buildTrayMenuTemplate(
  opts: SystemTrayOptions,
  { devLabel, terminalCount, wrap }: TrayMenuState
): MenuItemOptions[] {
  const isMac = process.platform === 'darwin'
  return [
    ...(devLabel
      ? ([
          // Label dev trays by worktree/branch to distinguish concurrent instances.
          { label: devLabel, enabled: false },
          { type: 'separator' }
        ] satisfies MenuItemOptions[])
      : []),
    ...(terminalCount === null
      ? []
      : ([
          {
            label: translateMain('tray.runningTerminals', '{{count}} terminals running', {
              count: terminalCount,
              defaultValue_one: '{{count}} terminal running'
            }),
            icon: trayMenuIcon('status-dot-green'),
            enabled: false
          },
          { type: 'separator' }
        ] satisfies MenuItemOptions[])),
    {
      label: translateMain('tray.openApp', 'Open Prompt'),
      icon: trayMenuIcon('app-window'),
      click: wrap(() => opts.onOpen())
    },
    { type: 'separator' },
    {
      label: translateMain('tray.about', 'About Prompt'),
      icon: trayMenuIcon('info'),
      click: wrap(() => opts.onShowAbout())
    },
    // Windows keeps its old tray: no update/settings entries there.
    ...(isMac
      ? ([
          {
            label: translateMain('tray.checkForUpdates', 'Check for Updates…'),
            icon: trayMenuIcon('refresh-cw'),
            click: wrap(() => opts.onCheckForUpdates())
          },
          {
            label: translateMain('tray.settings', 'Settings…'),
            icon: trayMenuIcon('settings'),
            // Shown as a hint only; the app menu owns the real ⌘, shortcut.
            accelerator: 'CmdOrCtrl+,',
            registerAccelerator: false,
            click: wrap(() => opts.onOpenSettings())
          }
        ] satisfies MenuItemOptions[])
      : []),
    {
      label: translateMain('tray.helpFeedback', 'Help & Feedback'),
      icon: trayMenuIcon('circle-help'),
      click: wrap(() => opts.onOpenHelp())
    },
    { type: 'separator' },
    {
      label: translateMain('tray.quitApp', 'Quit Prompt'),
      icon: trayMenuIcon('square-x'),
      ...(isMac ? { accelerator: 'CmdOrCtrl+Q', registerAccelerator: false } : {}),
      click: wrap(() => opts.onQuit())
    },
    // Prompt alone keeps "Quit Completely…" under Quit (공통.md); it also stops every terminal session.
    ...(opts.onQuitAndStopAllSessions
      ? ([
          {
            ...quitAndStopAllSessionsMenuText(),
            icon: trayMenuIcon('circle-x'),
            click: wrap(opts.onQuitAndStopAllSessions)
          }
        ] satisfies MenuItemOptions[])
      : [])
  ]
}
