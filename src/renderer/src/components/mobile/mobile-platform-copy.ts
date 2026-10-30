import type { Platform } from './MobileHero'
import { translate } from '@/i18n/i18n'
import { PROMPT_MOBILE_DOWNLOAD_URL, promptOr } from '../../../../shared/prompt-upstream'

export type InstallCopy = { ctaLabel: string; url: string }

export const ANDROID_INSTALL_GUIDE_URL = promptOr(
  PROMPT_MOBILE_DOWNLOAD_URL,
  'https://www.onorca.dev/docs/android-apk'
)

export function getInstallCopy(platform: Platform): InstallCopy {
  return platform === 'ios'
    ? {
        ctaLabel: translate(
          'auto.components.mobile.mobile.platform.copy.openAppStore',
          'Open App Store'
        ),
        url: PROMPT_MOBILE_DOWNLOAD_URL
      }
    : {
        ctaLabel: translate(
          'auto.components.mobile.mobile.platform.copy.downloadApk',
          'Download APK'
        ),
        url: PROMPT_MOBILE_DOWNLOAD_URL
      }
}
