import { describe, expect, it, vi } from 'vitest'
import type { RemoteServerUpdaterSnapshot } from '../../shared/remote-server-update'
import type { UpdateStatus } from '../../shared/update-status-types'
import type { RuntimeClient } from '../runtime-client'
import { RuntimeClientError } from '../runtime/types'
import {
  formatPromptAppUpdate,
  runPromptAppUpdate,
  type PromptAppUpdateTiming
} from './prompt-app-update'

const AUTOMATIC = { installMode: 'interactive', automatic: true, reason: 'available' } as const

function snapshot(status: UpdateStatus, support = AUTOMATIC): RemoteServerUpdaterSnapshot {
  return { appVersion: '1.4.0', runtimeId: 'runtime-1', support, status }
}

/** A fake app whose updater walks through `statuses` one getStatus poll at a time. */
function fakeApp(statuses: UpdateStatus[], overrides: Partial<Record<string, () => unknown>> = {}) {
  let index = 0
  const current = () => statuses[Math.min(index, statuses.length - 1)]
  const call = vi.fn(async (method: string) => {
    const override = overrides[method]
    let result: unknown
    if (override) {
      result = override()
    } else if (method === 'updater.getStatus') {
      result = snapshot(current())
      index += 1
    } else if (method === 'updater.check' || method === 'updater.download') {
      result = snapshot(current())
    } else if (method === 'updater.install') {
      result = {
        accepted: true,
        fromVersion: '1.4.0',
        targetVersion: '1.5.0',
        runtimeId: 'runtime-1'
      }
    } else {
      throw new Error(`unexpected RPC ${method}`)
    }
    return { id: 'req', ok: true, result, _meta: { runtimeId: 'runtime-1' } }
  })
  return { client: { call } as unknown as RuntimeClient, call }
}

function timing(overrides: Partial<PromptAppUpdateTiming> = {}): PromptAppUpdateTiming {
  let clock = 0
  return {
    timeoutMs: 10 * 60 * 1000,
    pollIntervalMs: 500,
    now: () => clock,
    wait: async (ms) => {
      clock += ms
    },
    ...overrides
  }
}

function methods(call: ReturnType<typeof vi.fn>): string[] {
  return call.mock.calls.map(([method]) => method as string)
}

describe('runPromptAppUpdate', () => {
  it('reports the running version when there is no new release', async () => {
    const { client, call } = fakeApp([
      { state: 'idle' },
      { state: 'checking', userInitiated: true },
      { state: 'not-available', userInitiated: true }
    ])

    const result = await runPromptAppUpdate(client, timing())

    expect(result).toEqual({ status: 'up-to-date', version: '1.4.0' })
    expect(formatPromptAppUpdate(result)).toBe('Prompt is already up to date (1.4.0).')
    expect(methods(call)).not.toContain('updater.download')
    expect(methods(call)).not.toContain('updater.install')
  })

  it('checks, downloads, waits for the download, then installs', async () => {
    const { client, call } = fakeApp([
      { state: 'idle' },
      { state: 'checking', userInitiated: true },
      { state: 'available', version: '1.5.0', changelog: null },
      { state: 'downloading', percent: 10, version: '1.5.0' },
      { state: 'downloading', percent: 90, version: '1.5.0' },
      { state: 'downloaded', version: '1.5.0' }
    ])

    const result = await runPromptAppUpdate(client, timing())

    expect(result).toEqual({ status: 'installing', fromVersion: '1.4.0', version: '1.5.0' })
    expect(formatPromptAppUpdate(result)).toBe('Installing Prompt 1.5.0 and restarting.')
    const order = methods(call)
    expect(order.indexOf('updater.check')).toBeLessThan(order.indexOf('updater.download'))
    expect(order.indexOf('updater.download')).toBeLessThan(order.indexOf('updater.install'))
    expect(order.filter((method) => method === 'updater.install')).toHaveLength(1)
    expect(call).toHaveBeenCalledWith('updater.check', {}, { timeoutMs: 15_000 })
  })

  it('installs an update the UpdateCard already downloaded without checking again', async () => {
    const { client, call } = fakeApp([{ state: 'downloaded', version: '1.5.0' }])

    await expect(runPromptAppUpdate(client, timing())).resolves.toMatchObject({
      status: 'installing'
    })
    expect(methods(call)).toEqual(['updater.getStatus', 'updater.install'])
  })

  it('fails with update_check_failed when the check errors', async () => {
    const { client, call } = fakeApp([
      { state: 'idle' },
      { state: 'error', message: 'net::ERR_INTERNET_DISCONNECTED', userInitiated: true }
    ])

    await expect(runPromptAppUpdate(client, timing())).rejects.toMatchObject({
      code: 'update_check_failed',
      message: 'Could not check for updates: net::ERR_INTERNET_DISCONNECTED'
    })
    expect(methods(call)).not.toContain('updater.install')
  })

  it('fails with update_download_failed when the download errors', async () => {
    const { client, call } = fakeApp([
      { state: 'idle' },
      { state: 'available', version: '1.5.0', changelog: null },
      { state: 'downloading', percent: 40, version: '1.5.0' },
      { state: 'error', message: 'sha512 checksum mismatch', version: '1.5.0' }
    ])

    await expect(runPromptAppUpdate(client, timing())).rejects.toMatchObject({
      code: 'update_download_failed',
      message: 'Could not download the update: sha512 checksum mismatch'
    })
    expect(methods(call)).not.toContain('updater.install')
  })

  it('gives up after the time limit while the download is still running', async () => {
    const { client, call } = fakeApp([
      { state: 'idle' },
      { state: 'available', version: '1.5.0', changelog: null },
      { state: 'downloading', percent: 1, version: '1.5.0' }
    ])

    await expect(
      runPromptAppUpdate(client, timing({ timeoutMs: 10 * 60 * 1000 }))
    ).rejects.toMatchObject({
      code: 'timeout',
      message: 'Timed out after 10 minutes while downloading (updater state: downloading).'
    })
    expect(methods(call)).not.toContain('updater.install')
  })

  it('refuses before checking when the app cannot update itself', async () => {
    const { client, call } = fakeApp([], {
      'updater.getStatus': () =>
        snapshot({ state: 'idle' }, {
          installMode: 'interactive',
          automatic: false,
          reason: 'unpackaged-build'
        } as never)
    })

    await expect(runPromptAppUpdate(client, timing())).rejects.toMatchObject({
      code: 'remote_update_manual_required'
    })
    expect(methods(call)).toEqual(['updater.getStatus'])
  })

  it('explains an updater RPC refusal in words', async () => {
    const { client } = fakeApp([{ state: 'idle' }], {
      'updater.check': () => {
        throw new RuntimeClientError('method_not_found', 'Unknown method: updater.check')
      }
    })

    await expect(runPromptAppUpdate(client, timing())).rejects.toMatchObject({
      code: 'method_not_found',
      message: expect.stringContaining('Install the new version manually once')
    })
  })
})
