import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeHooksJson, writeManagedScript } from './installer-utils'
import { writeHooksJsonAsync } from './hooks-json-write-async'
import { isBlockedByTestAppData } from './test-app-data-write-guard'

let root: string
let testAppData: string
let personHome: string

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'test-app-data-guard-'))
  testAppData = join(root, 'app-data')
  personHome = join(root, 'home')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

describe('isBlockedByTestAppData', () => {
  it('allows every path when no test app data is set', () => {
    expect(isBlockedByTestAppData('/anywhere/settings.json', {})).toBe(false)
  })

  it('blocks only paths outside the test app data root', () => {
    const env = { PROMPT_TEST_APP_DATA_DIR: testAppData }
    expect(isBlockedByTestAppData(join(personHome, '.claude', 'settings.json'), env)).toBe(true)
    expect(isBlockedByTestAppData(join(testAppData, 'Prompt', 'hooks.json'), env)).toBe(false)
    expect(isBlockedByTestAppData(`${testAppData}-sibling/settings.json`, env)).toBe(true)
  })
})

describe('writers under test app data', () => {
  it('leave a shared settings file unchanged', async () => {
    vi.stubEnv('PROMPT_TEST_APP_DATA_DIR', testAppData)
    const settingsPath = join(root, 'settings.json')
    writeFileSync(settingsPath, '{"hooks":{"SessionEnd":[]}}\n')

    writeHooksJson(settingsPath, { hooks: {} })
    await writeHooksJsonAsync(settingsPath, { hooks: {} })
    writeManagedScript(join(root, 'hook.sh'), '#!/bin/sh\n')

    expect(readFileSync(settingsPath, 'utf-8')).toBe('{"hooks":{"SessionEnd":[]}}\n')
    expect(existsSync(`${settingsPath}.bak`)).toBe(false)
    expect(existsSync(join(root, 'hook.sh'))).toBe(false)
  })

  it('still write inside the test app data root', () => {
    vi.stubEnv('PROMPT_TEST_APP_DATA_DIR', testAppData)
    const inside = join(testAppData, 'Prompt', 'settings.json')

    writeHooksJson(inside, { hooks: {} })

    expect(JSON.parse(readFileSync(inside, 'utf-8'))).toEqual({ hooks: {} })
  })
})
