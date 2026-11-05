import type { Tray } from 'electron'
import { isAutomaticUpdateCheckOn } from '../../shared/automatic-update-check'
import type { Store } from '../persistence'
import { isOpenAtLoginOn, toggleOpenAtLogin } from '../startup/open-at-login'
import {
  destroyPromptMenuPanel,
  ensurePromptMenuPanel,
  refreshPromptMenuPanel,
  togglePromptMenuPanel
} from './prompt-menu-panel-window'
import type { SystemTrayOptions } from './system-tray'

type PromptTrayMenuExtras = Pick<
  SystemTrayOptions,
  | 'getOpenAtLogin'
  | 'onToggleOpenAtLogin'
  | 'getAutoCheckUpdates'
  | 'onToggleAutoCheckUpdates'
  | 'onTogglePanel'
  | 'onMenuRowsChanged'
>

/** 메뉴 막대 메뉴의 켬/끔 두 줄과, 맥에서 왼쪽 클릭으로 여는 패널(2026-11-05 결정 2A). */
export function promptTrayMenuExtras(
  store: Pick<Store, 'getSettings' | 'updateSettings'>
): PromptTrayMenuExtras {
  return {
    getOpenAtLogin: isOpenAtLoginOn,
    onToggleOpenAtLogin: toggleOpenAtLogin,
    getAutoCheckUpdates: () => isAutomaticUpdateCheckOn(store.getSettings()),
    onToggleAutoCheckUpdates: () => {
      // 설정 저장소를 거쳐야 설정 화면 등 다른 창에도 바뀐 값이 간다.
      store.updateSettings(
        { autoCheckUpdates: !isAutomaticUpdateCheckOn(store.getSettings()) },
        { notifyListeners: true }
      )
    },
    // 맥: 왼쪽 클릭은 앱이 그린 패널, 오른쪽 클릭은 기본 메뉴.
    ...(process.platform === 'darwin'
      ? { onTogglePanel: togglePromptMenuPanel, onMenuRowsChanged: refreshPromptMenuPanel }
      : {})
  }
}

/** 메뉴 막대 아이콘이 있으면 패널을 미리 만들어 두고, 없어지면 패널도 없앤다. */
export function syncPromptMenuPanel(tray: Tray | null): void {
  if (tray) {
    ensurePromptMenuPanel()
  } else {
    destroyPromptMenuPanel()
  }
}
