import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getPreMigrationUserData,
  pinPromptUserDataPath,
  selectPromptUserDataPathWithoutCopy,
  setPreMigrationUserDataForTest
} from './prompt-user-data-pin'

function fakeHost(appData: string, options: { isPackaged?: boolean; switches?: string[] } = {}) {
  const paths: Record<string, string> = {}
  return {
    paths,
    isPackaged: options.isPackaged ?? true,
    getPath: () => appData,
    setPath: (name: 'userData', value: string) => {
      paths[name] = value
    },
    commandLine: { hasSwitch: (name: string) => (options.switches ?? []).includes(name) }
  }
}

describe('pinPromptUserDataPath', () => {
  let appData: string

  beforeEach(() => {
    appData = mkdtempSync(join(tmpdir(), 'pin-'))
    setPreMigrationUserDataForTest(null)
  })

  afterEach(() => {
    rmSync(appData, { recursive: true, force: true })
    setPreMigrationUserDataForTest(null)
  })

  it('switches a packaged launch to the Prompt folder and remembers the old one for daemon adoption', () => {
    mkdirSync(join(appData, 'orca'))
    writeFileSync(join(appData, 'orca', 'orca-profile-index.json'), '{}')
    const host = fakeHost(appData)

    const result = pinPromptUserDataPath(host, {})

    expect(result?.outcome).toBe('migrated')
    expect(host.paths.userData).toBe(join(appData, 'Prompt'))
    expect(getPreMigrationUserData()?.userDataPath).toBe(join(appData, 'orca'))
    expect(readFileSync(join(appData, 'Prompt', 'orca-profile-index.json'), 'utf8')).toBe('{}')

    // Next launch: same folder, adoption source still known.
    setPreMigrationUserDataForTest(null)
    const again = fakeHost(appData)
    expect(pinPromptUserDataPath(again, {})?.outcome).toBe('already-migrated')
    expect(again.paths.userData).toBe(join(appData, 'Prompt'))
    expect(getPreMigrationUserData()?.userDataPath).toBe(join(appData, 'orca'))
  })

  it('has no adoption source on a fresh install', () => {
    const host = fakeHost(appData)
    expect(pinPromptUserDataPath(host, {})?.outcome).toBe('fresh')
    expect(getPreMigrationUserData()).toBeNull()
  })

  it('leaves dev, E2E and explicit --user-data-dir launches alone', () => {
    for (const [host, env] of [
      [fakeHost(appData, { isPackaged: false }), {}],
      [fakeHost(appData, { switches: ['user-data-dir'] }), {}],
      [fakeHost(appData), { ORCA_E2E_USER_DATA_DIR: '/tmp/e2e' }]
    ] as const) {
      expect(pinPromptUserDataPath(host, env)).toBeNull()
      expect(host.paths.userData).toBeUndefined()
    }
  })

  it('honors the test-only app-data override', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'pin-alt-'))
    try {
      const host = fakeHost(appData)
      pinPromptUserDataPath(host, { PROMPT_TEST_APP_DATA_DIR: elsewhere })
      expect(host.paths.userData).toBe(join(elsewhere, 'Prompt'))
    } finally {
      rmSync(elsewhere, { recursive: true, force: true })
    }
  })

  it('uninstall helpers use the Prompt folder only when it is complete and never copy', () => {
    mkdirSync(join(appData, 'orca'))
    writeFileSync(join(appData, 'orca', 'x'), 'x')
    const before = fakeHost(appData)
    selectPromptUserDataPathWithoutCopy(before, {})
    expect(before.paths.userData).toBeUndefined()

    pinPromptUserDataPath(fakeHost(appData), {})
    const after = fakeHost(appData)
    selectPromptUserDataPathWithoutCopy(after, {})
    expect(after.paths.userData).toBe(join(appData, 'Prompt'))
  })
})
