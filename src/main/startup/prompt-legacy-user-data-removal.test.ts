import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { removeLegacyUserDataWhenIdle } from './prompt-legacy-user-data-removal'
import { writePromptUserDataMarker } from '../../shared/prompt-user-data-location'

const LIVE_PID = 4242

describe('removeLegacyUserDataWhenIdle', () => {
  let root: string
  let legacyDir: string
  let targetDir: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'prompt-legacy-removal-'))
    legacyDir = join(root, 'orca')
    targetDir = join(root, 'Prompt')
    mkdirSync(join(legacyDir, 'daemon'), { recursive: true })
    writeFileSync(join(legacyDir, 'orca-environments.json'), '{}')
    mkdirSync(targetDir)
    writePromptUserDataMarker(targetDir, { version: 1, createdAtMs: 1, migratedFrom: legacyDir })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  const run = (overrides: Partial<Parameters<typeof removeLegacyUserDataWhenIdle>[0]> = {}) =>
    removeLegacyUserDataWhenIdle({
      userDataPath: targetDir,
      platform: 'darwin',
      isPidAlive: (pid) => pid === LIVE_PID,
      isUpstreamOrcaInstalled: () => false,
      isFolderInUse: () => false,
      ...overrides
    })

  it('deletes the copied-from folder when nothing runs from it', async () => {
    await expect(run()).resolves.toEqual({ outcome: 'removed', legacyDir })
    expect(existsSync(legacyDir)).toBe(false)
    expect(existsSync(targetDir)).toBe(true)
  })

  it('keeps the folder while a daemon started from it is alive', async () => {
    writeFileSync(join(legacyDir, 'daemon', 'daemon-v54.pid'), JSON.stringify({ pid: LIVE_PID }))
    await expect(run()).resolves.toEqual({ outcome: 'skipped', reason: 'daemon-alive' })
    expect(existsSync(legacyDir)).toBe(true)
  })

  it('removes the folder once the recorded daemon has exited', async () => {
    writeFileSync(join(legacyDir, 'daemon', 'daemon-v54.pid'), JSON.stringify({ pid: 1 }))
    await expect(run({ isPidAlive: () => false })).resolves.toMatchObject({ outcome: 'removed' })
    expect(existsSync(legacyDir)).toBe(false)
  })

  it('keeps the folder while another app has it open', async () => {
    await expect(run({ isFolderInUse: () => true })).resolves.toEqual({
      outcome: 'skipped',
      reason: 'in-use'
    })
    expect(existsSync(legacyDir)).toBe(true)
  })

  it('keeps the folder when upstream Orca is installed', async () => {
    await expect(run({ isUpstreamOrcaInstalled: () => true })).resolves.toEqual({
      outcome: 'skipped',
      reason: 'upstream-orca-installed'
    })
    expect(existsSync(legacyDir)).toBe(true)
  })

  it('does nothing for a fresh profile that was never copied', async () => {
    writePromptUserDataMarker(targetDir, { version: 1, createdAtMs: 1, migratedFrom: null })
    await expect(run()).resolves.toEqual({ outcome: 'skipped', reason: 'not-migrated' })
    expect(existsSync(legacyDir)).toBe(true)
  })

  it('does nothing while the app still runs on the old folder', async () => {
    await expect(run({ userDataPath: legacyDir })).resolves.toEqual({
      outcome: 'skipped',
      reason: 'not-migrated'
    })
    expect(existsSync(legacyDir)).toBe(true)
  })

  it('leaves other platforms alone', async () => {
    await expect(run({ platform: 'linux' })).resolves.toEqual({
      outcome: 'skipped',
      reason: 'not-migrated'
    })
    expect(existsSync(legacyDir)).toBe(true)
  })
})
