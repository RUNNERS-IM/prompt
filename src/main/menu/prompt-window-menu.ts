import { translateMain } from '../i18n/main-i18n'
import { createAppWindowMenu } from './app-menu-window'

let onNewWindow: (() => void) | null = null

/** Prompt: what Window > New Window does (prompt-windows.ts sets it at startup). */
export function setPromptNewWindowHandler(handler: () => void): void {
  onNewWindow = handler
}

export function hasPromptNewWindowHandler(): boolean {
  return onNewWindow !== null
}

/** Runs Window > New Window if Prompt set one; false leaves the key to the page. */
export function runPromptNewWindow(): boolean {
  onNewWindow?.()
  return onNewWindow !== null
}

// Prompt: Window > New Window (Cmd+N) opens another full Prompt window (prompt-windows.ts).
// Without a handler the menu stays as Orca builds it.
export function createPromptWindowMenu(isMac: boolean): Electron.MenuItemConstructorOptions {
  const windowMenu = createAppWindowMenu(translateMain('menu.window', 'Window'), isMac)
  if (!onNewWindow) {
    return windowMenu
  }
  const items = Array.isArray(windowMenu.submenu) ? windowMenu.submenu : []
  return {
    ...windowMenu,
    submenu: [
      {
        label: translateMain('prompt.windows.newWindow', 'New Window'),
        accelerator: 'CmdOrCtrl+N',
        click: () => onNewWindow?.()
      },
      { type: 'separator' },
      ...items
    ]
  }
}
