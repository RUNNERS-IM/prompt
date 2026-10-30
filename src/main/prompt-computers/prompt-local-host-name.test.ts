import { describe, expect, it, vi } from 'vitest'
import { readPromptLocalHostName, shortHostName } from './prompt-local-host-name'

function ok(stdout: string) {
  return vi.fn().mockResolvedValue({ code: 0, timedOut: false, stdout, stderr: '' })
}

describe('readPromptLocalHostName', () => {
  it('uses LocalHostName on macOS', async () => {
    const run = ok('m2-pro-1\n')
    await expect(
      readPromptLocalHostName({
        platform: 'darwin',
        hostname: () => 'x.local',
        run
      })
    ).resolves.toBe('m2-pro-1')
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        program: '/usr/sbin/scutil',
        args: ['--get', 'LocalHostName']
      })
    )
  })

  it('falls back to the short hostname when scutil fails', async () => {
    const run = vi.fn().mockRejectedValue(new Error('spawn failed'))
    await expect(
      readPromptLocalHostName({
        platform: 'darwin',
        hostname: () => 'm1-max-1.local',
        run
      })
    ).resolves.toBe('m1-max-1')
  })

  it('uses the short hostname off macOS', async () => {
    const run = ok('ignored')
    await expect(
      readPromptLocalHostName({
        platform: 'linux',
        hostname: () => 'box.tail1.ts.net',
        run
      })
    ).resolves.toBe('box')
    expect(run).not.toHaveBeenCalled()
  })
})

describe('shortHostName', () => {
  it('keeps only the first label', () => {
    expect(shortHostName('m2-pro-1.local')).toBe('m2-pro-1')
    expect(shortHostName('m2-pro-1')).toBe('m2-pro-1')
  })
})
