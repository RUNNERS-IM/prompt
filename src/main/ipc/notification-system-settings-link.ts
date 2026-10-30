import { shell } from 'electron'
import { promptOr } from '../../shared/prompt-upstream'

// Prompt: the packaged app is im.runners.prompt (config/electron-builder.config.cjs appId).
const MACOS_PACKAGED_BUNDLE_ID = promptOr('im.runners.prompt', 'com.stablyai.orca')
const MACOS_NOTIFICATION_SETTINGS_URL =
  'x-apple.systempreferences:com.apple.Notifications-Settings.extension'

function getMacNotificationSettingsUrl(): string {
  const bundleId = process.env.ORCA_DEV_MACOS_BUNDLE_ID ?? MACOS_PACKAGED_BUNDLE_ID
  return `${MACOS_NOTIFICATION_SETTINGS_URL}?id=${encodeURIComponent(bundleId)}`
}

export function openNotificationSystemSettings(): void {
  if (process.platform === 'darwin') {
    void shell.openExternal(getMacNotificationSettingsUrl())
  } else if (process.platform === 'win32') {
    void shell.openExternal('ms-settings:notifications')
  }
}
