const { existsSync } = require('node:fs')
const { join } = require('node:path')

// Prompt's LICENSE and THIRD_PARTY_NOTICES.md ship as plain files in every app's resources folder,
// so each install carries them and the About window's notices window can read them.
const licenseNoticeResources = [
  { from: 'LICENSE', to: 'LICENSE' },
  { from: 'THIRD_PARTY_NOTICES.md', to: 'THIRD_PARTY_NOTICES.md' }
]

const CHROMIUM_LICENSES_FILE = 'LICENSES.chromium.html'

// electron-builder deletes Electron's LICENSES.chromium.html from macOS builds (it sits beside
// Electron.app in the dist), while Windows and Linux keep it next to the executable. Ship the
// same file in the mac app's Resources so the notices window can open it on every platform.
const macChromiumLicensesResource = {
  from: `node_modules/electron/dist/${CHROMIUM_LICENSES_FILE}`,
  to: CHROMIUM_LICENSES_FILE
}

/** Throws when a packaged app is missing a license file, so a broken mapping fails the build. */
function assertPackagedLicenseNotices(resourcesDir, electronPlatformName) {
  const required = licenseNoticeResources.map((resource) => resource.to)
  if (electronPlatformName === 'darwin') {
    required.push(CHROMIUM_LICENSES_FILE)
  }
  const missing = required.filter((name) => !existsSync(join(resourcesDir, name)))
  if (missing.length > 0) {
    throw new Error(
      `Packaged app is missing license files in ${resourcesDir}: ${missing.join(', ')}`
    )
  }
}

module.exports = {
  CHROMIUM_LICENSES_FILE,
  assertPackagedLicenseNotices,
  licenseNoticeResources,
  macChromiumLicensesResource
}
