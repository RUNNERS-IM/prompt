import { dirname, join } from 'node:path'
import { PROMPT_THIRD_PARTY_NOTICES_FILE } from '../../shared/prompt-third-party-notices'

export const CHROMIUM_LICENSES_FILE = 'LICENSES.chromium.html'

export type LicenseFileContext = {
  platform: NodeJS.Platform
  isPackaged: boolean
  resourcesPath: string
  execPath: string
  appPath: string
}

/** Packaged builds carry the notices in resources/ (extraResources); dev runs read the repo copy. */
export function thirdPartyNoticesPath(context: LicenseFileContext): string {
  return context.isPackaged
    ? join(context.resourcesPath, PROMPT_THIRD_PARTY_NOTICES_FILE)
    : join(context.appPath, PROMPT_THIRD_PARTY_NOTICES_FILE)
}

/** macOS builds ship Electron's Chromium licenses in Resources (electron-builder drops Electron's
 *  copy there); Windows and Linux keep it next to the executable; dev runs use the installed Electron. */
export function chromiumLicensesPath(context: LicenseFileContext): string {
  if (!context.isPackaged) {
    return join(context.appPath, 'node_modules', 'electron', 'dist', CHROMIUM_LICENSES_FILE)
  }
  return context.platform === 'darwin'
    ? join(context.resourcesPath, CHROMIUM_LICENSES_FILE)
    : join(dirname(context.execPath), CHROMIUM_LICENSES_FILE)
}
