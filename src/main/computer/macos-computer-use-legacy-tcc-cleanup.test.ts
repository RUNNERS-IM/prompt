import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanupLegacyComputerUseTccOnce,
  LEGACY_COMPUTER_USE_BUNDLE_ID
} from './macos-computer-use-legacy-tcc-cleanup'

const markerName = 'computer-use-legacy-tcc-reset-v1'

describe('cleanupLegacyComputerUseTccOnce', () => {
  let userData: string

  beforeEach(() => {
    userData = mkdtempSync(join(tmpdir(), 'prompt-legacy-tcc-'))
  })

  afterEach(() => {
    rmSync(userData, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('resets only the old helper bundle id, then records the marker', async () => {
    const reset = vi.fn(async (_service: string, _bundleId: string) => ({ ok: true as const }))

    await expect(cleanupLegacyComputerUseTccOnce(userData, reset)).resolves.toBe('cleaned')

    expect(LEGACY_COMPUTER_USE_BUNDLE_ID).toBe('com.stablyai.orca.computer-use')
    expect(reset.mock.calls).toEqual([
      ['Accessibility', 'com.stablyai.orca.computer-use'],
      ['ScreenCapture', 'com.stablyai.orca.computer-use']
    ])
    expect(reset.mock.calls.some(([, bundleId]) => bundleId === 'im.runners.prompt')).toBe(false)
    expect(readFileSync(join(userData, markerName), 'utf8')).not.toBe('')
  })

  it('does nothing once the marker exists', async () => {
    const reset = vi.fn(async (_service: string, _bundleId: string) => ({ ok: true as const }))
    await cleanupLegacyComputerUseTccOnce(userData, reset)
    reset.mockClear()

    await expect(cleanupLegacyComputerUseTccOnce(userData, reset)).resolves.toBe('skipped')
    expect(reset).not.toHaveBeenCalled()
  })

  it('still records the marker when tccutil refuses an unregistered id', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reset = vi.fn(async (_service: string, _bundleId: string) => ({
      ok: false as const,
      detail: 'exit 64'
    }))

    await expect(cleanupLegacyComputerUseTccOnce(userData, reset)).resolves.toBe('failed')
    expect(reset).toHaveBeenCalledTimes(2)
    expect(existsSync(join(userData, markerName))).toBe(true)
  })
})
