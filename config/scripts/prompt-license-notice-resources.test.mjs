import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const config = require('../electron-builder.config.cjs')
const {
  CHROMIUM_LICENSES_FILE,
  assertPackagedLicenseNotices
} = require('./prompt-license-notice-resources.cjs')

const repoRoot = resolve(import.meta.dirname, '../..')
const tempDirs = []

function resourcesDirWith(names) {
  const dir = mkdtempSync(join(tmpdir(), 'prompt-license-notices-'))
  tempDirs.push(dir)
  for (const name of names) {
    writeFileSync(join(dir, name), name)
  }
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop(), { recursive: true, force: true })
  }
})

describe('packaged license notices', () => {
  it('ships LICENSE and THIRD_PARTY_NOTICES.md on every platform', () => {
    for (const platform of ['mac', 'win', 'linux']) {
      const targets = config[platform].extraResources.map((entry) => entry.to)
      expect(targets).toEqual(expect.arrayContaining(['LICENSE', 'THIRD_PARTY_NOTICES.md']))
    }
    expect(existsSync(join(repoRoot, 'LICENSE'))).toBe(true)
    expect(existsSync(join(repoRoot, 'THIRD_PARTY_NOTICES.md'))).toBe(true)
  })

  it("puts Electron's Chromium licenses file into the mac app's Resources", () => {
    expect(config.mac.extraResources).toContainEqual({
      from: `node_modules/electron/dist/${CHROMIUM_LICENSES_FILE}`,
      to: CHROMIUM_LICENSES_FILE
    })
    // Windows and Linux keep Electron's own copy next to the executable.
    for (const platform of ['win', 'linux']) {
      expect(config[platform].extraResources.map((entry) => entry.to)).not.toContain(
        CHROMIUM_LICENSES_FILE
      )
    }
  })

  it('finds the Chromium licenses file in the installed Electron', () => {
    const electronDist = join(repoRoot, 'node_modules/electron/dist')
    if (!existsSync(electronDist)) {
      return
    }
    expect(existsSync(join(electronDist, CHROMIUM_LICENSES_FILE))).toBe(true)
  })

  it('fails the afterPack check when a license file is missing', () => {
    const complete = ['LICENSE', 'THIRD_PARTY_NOTICES.md']
    expect(() => assertPackagedLicenseNotices(resourcesDirWith(complete), 'linux')).not.toThrow()
    expect(() => assertPackagedLicenseNotices(resourcesDirWith(complete), 'darwin')).toThrow(
      CHROMIUM_LICENSES_FILE
    )
    expect(() =>
      assertPackagedLicenseNotices(
        resourcesDirWith([...complete, CHROMIUM_LICENSES_FILE]),
        'darwin'
      )
    ).not.toThrow()
    expect(() => assertPackagedLicenseNotices(resourcesDirWith(['LICENSE']), 'win32')).toThrow(
      'THIRD_PARTY_NOTICES.md'
    )
  })
})
