import type { Tray } from 'electron'
import {
  destroyPromptMenuPanel,
  ensurePromptMenuPanel,
  refreshPromptMenuPanel,
  togglePromptMenuPanel
} from './prompt-menu-panel-window'
import type { SystemTrayOptions } from './system-tray'

type PromptTrayMenuExtras = Pick<SystemTrayOptions, 'onTogglePanel' | 'onMenuRowsChanged'>

/** 맥: 메뉴 막대 아이콘을 누르면(왼쪽 · 오른쪽) 앱이 그린 패널을 연다(2026-11-05 결정 2A, 2026-11-07 다섯 앱 2A). */
export function promptTrayMenuExtras(): PromptTrayMenuExtras {
  return process.platform === 'darwin'
    ? { onTogglePanel: togglePromptMenuPanel, onMenuRowsChanged: refreshPromptMenuPanel }
    : {}
}

/** 메뉴 막대 아이콘이 있으면 패널을 미리 만들어 두고, 없어지면 패널도 없앤다. */
export function syncPromptMenuPanel(tray: Tray | null): void {
  if (tray) {
    ensurePromptMenuPanel()
  } else {
    destroyPromptMenuPanel()
  }
}
