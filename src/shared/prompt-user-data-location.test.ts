import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PROMPT_USER_DATA_MARKER_FILE,
  redirectLegacyUserDataPath,
  resolveDefaultPromptUserDataPath
} from './prompt-user-data-location'

describe('Prompt userData location outside the app', () => {
  let home: string

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'loc-'))
  })

  afterEach(() => {
    rmSync(home, { recursive: true, force: true })
  })

  const appSupport = (): string => join(home, 'Library', 'Application Support')
  const markReady = (): void => {
    mkdirSync(join(appSupport(), 'Prompt'), { recursive: true })
    writeFileSync(
      join(appSupport(), 'Prompt', PROMPT_USER_DATA_MARKER_FILE),
      '{"version":1,"createdAtMs":1,"migratedFrom":null}'
    )
  }

  it('uses the inherited folder until the app has moved, then the Prompt folder', () => {
    expect(resolveDefaultPromptUserDataPath('darwin', home, {})).toBe(join(appSupport(), 'orca'))
    markReady()
    expect(resolveDefaultPromptUserDataPath('darwin', home, {})).toBe(join(appSupport(), 'Prompt'))
  })

  it('maps each platform to its app-data root', () => {
    expect(resolveDefaultPromptUserDataPath('linux', home, {})).toBe(join(home, '.config', 'orca'))
    expect(resolveDefaultPromptUserDataPath('linux', home, { XDG_CONFIG_HOME: '/x' })).toBe(
      join('/x', 'orca')
    )
    expect(resolveDefaultPromptUserDataPath('win32', home, {})).toBeNull()
  })

  it('redirects a stale inherited path from an old terminal once the Prompt folder is ready', () => {
    const legacy = join(appSupport(), 'orca')
    expect(redirectLegacyUserDataPath(legacy, 'darwin', home, {})).toBe(legacy)
    markReady()
    expect(redirectLegacyUserDataPath(legacy, 'darwin', home, {})).toBe(
      join(appSupport(), 'Prompt')
    )
    expect(redirectLegacyUserDataPath(join(appSupport(), 'Orca'), 'darwin', home, {})).toBe(
      join(appSupport(), 'Prompt')
    )
    // Other profiles (dev, custom --user-data-dir) are left as they are.
    expect(redirectLegacyUserDataPath(join(appSupport(), 'orca-dev'), 'darwin', home, {})).toBe(
      join(appSupport(), 'orca-dev')
    )
  })
})
