import type { SettingsSearchEntry } from './settings-search'
import { translate } from '@/i18n/i18n'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import { isWebClientLocation } from '@/lib/web-client-location'

// 설정 › 일반 맨 위 「앱」 묶음: 다섯 RUNNERS 앱이 같은 자리 · 같은 차례로 두는 세 스위치
// (runners-wiki 2026-11-07 다섯 앱 창 통일 1A, 2026-11-08 Prompt 창 통일). 메뉴 막대 패널에서 옮겨 왔다.

export function isPromptDesktopMac(): boolean {
  return getRendererAppPlatform() === 'darwin' && !isWebClientLocation()
}

export function getPromptGeneralAppSearchEntries(): SettingsSearchEntry[] {
  const mac = isPromptDesktopMac()
  return [
    ...(mac
      ? [
          {
            title: translate('tray.openAtLogin', 'Open at Login'),
            description: translate(
              'prompt.settings.general.openAtLoginDescription',
              'Keep Prompt in the menu bar when you log in to your Mac.'
            ),
            keywords: ['login', 'startup', 'launch']
          }
        ]
      : []),
    {
      title: translate('tray.autoCheckUpdates', 'Check for Updates Automatically'),
      description: translate(
        'prompt.settings.general.autoCheckUpdatesDescription',
        'Let you know when a new version is out.'
      ),
      keywords: ['update', 'version']
    },
    ...(mac
      ? [
          {
            title: translate('settings.appearance.menuBarIcon.title', 'Show Menu Bar Icon'),
            description: translate(
              'prompt.settings.general.menuBarIconDescription',
              'Show the Prompt icon in the menu bar.'
            ),
            keywords: ['menu bar', 'status item', 'tray']
          }
        ]
      : [])
  ]
}
