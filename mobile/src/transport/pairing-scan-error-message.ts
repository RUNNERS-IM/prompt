import type { Translate } from '../i18n/mobile-i18n'
import { PROMPT_REPO_SLUG } from '../../../src/shared/prompt-upstream'

function isOrcaInstallUrl(data: string): boolean {
  try {
    const url = new URL(data.trim())
    const path = url.pathname.replace(/\/$/, '')
    switch (url.origin) {
      case 'https://apps.apple.com':
        return /^\/(?:[a-z]{2}\/)?app\/(?:[^/]+\/)?id6766130217$/.test(path)
      case 'https://www.onorca.dev':
      case 'https://onorca.dev':
        return path === '/download/android'
      // Older desktops offered TestFlight and versioned APK downloads.
      case 'https://testflight.apple.com':
        return path === '/join/YjeGMQBA'
      case 'https://github.com':
        // Prompt: the desktop download QR opens Prompt's releases page.
        if (path.startsWith(`/${PROMPT_REPO_SLUG}/releases`)) {
          return true
        }
        return /^\/stablyai\/orca\/releases\/download\/mobile-android-v[^/]+\/app-release\.apk$/.test(
          path
        )
      default:
        return false
    }
  } catch {
    return false
  }
}

export function getPairingScanErrorMessage(data: string, t: Translate): string {
  return isOrcaInstallUrl(data)
    ? t(
        'app.pairScan.downloadQrCode',
        "That's the download code. Scan the pairing code in step 2 on your desktop."
      )
    : t('app.pairScan.invalidQrCode', 'Not a valid Orca QR code')
}
