import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { chromiumLicensesPath, thirdPartyNoticesPath } from './prompt-license-file-paths'

const base = {
  resourcesPath: join('/app', 'resources'),
  execPath: join('/app', 'Prompt'),
  appPath: join('/repo')
}

describe('license file paths', () => {
  it('reads the bundled notices when packaged and the repo copy in dev', () => {
    expect(thirdPartyNoticesPath({ ...base, platform: 'linux', isPackaged: true })).toBe(
      join('/app', 'resources', 'THIRD_PARTY_NOTICES.md')
    )
    expect(thirdPartyNoticesPath({ ...base, platform: 'darwin', isPackaged: false })).toBe(
      join('/repo', 'THIRD_PARTY_NOTICES.md')
    )
  })

  it("finds Chromium's licenses in mac Resources and next to the executable elsewhere", () => {
    expect(chromiumLicensesPath({ ...base, platform: 'darwin', isPackaged: true })).toBe(
      join('/app', 'resources', 'LICENSES.chromium.html')
    )
    for (const platform of ['win32', 'linux'] as const) {
      expect(chromiumLicensesPath({ ...base, platform, isPackaged: true })).toBe(
        join('/app', 'LICENSES.chromium.html')
      )
    }
    expect(chromiumLicensesPath({ ...base, platform: 'darwin', isPackaged: false })).toBe(
      join('/repo', 'node_modules', 'electron', 'dist', 'LICENSES.chromium.html')
    )
  })
})
