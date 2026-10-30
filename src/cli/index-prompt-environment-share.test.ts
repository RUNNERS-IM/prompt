import { afterEach, describe, expect, it, vi } from 'vitest'

const {
  callMock,
  runtimeClientConstructorMock,
  serveOrcaAppMock,
  getDefaultUserDataPathMock,
  addEnvironmentFromPairingCodeMock,
  listEnvironmentsMock,
  spawnMock
} = vi.hoisted(() => ({
  callMock: vi.fn(),
  runtimeClientConstructorMock: vi.fn(),
  serveOrcaAppMock: vi.fn(),
  getDefaultUserDataPathMock: vi.fn(() => '/tmp/orca-user-data'),
  addEnvironmentFromPairingCodeMock: vi.fn(),
  listEnvironmentsMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('./runtime-client', async () => {
  const { createRuntimeClientModuleMock } = await import('./index-test-harness.js')
  return createRuntimeClientModuleMock({
    callMock,
    runtimeClientConstructorMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock
  })
})

vi.mock('child_process', async () => {
  const { createChildProcessModuleMock } = await import('./index-test-harness.js')
  return createChildProcessModuleMock(spawnMock)
})

import { main } from './index'
import { useWorktreeAwarenessEnvironment } from './index-test-harness'

const SHARE_RESULT = {
  pairingUrl: 'prompt://pair?code=abc',
  endpoint: 'ws://m2-pro-1:6768',
  deviceId: 'device-1'
}

describe('orca environment share', () => {
  useWorktreeAwarenessEnvironment({
    callMock,
    serveOrcaAppMock,
    getDefaultUserDataPathMock,
    addEnvironmentFromPairingCodeMock,
    listEnvironmentsMock,
    spawnMock
  })
  afterEach(() => {
    process.exitCode = undefined
    vi.restoreAllMocks()
  })

  it('asks the local runtime for a link and prints only the link', async () => {
    callMock.mockResolvedValue({
      id: '1',
      ok: true,
      result: SHARE_RESULT,
      _meta: { runtimeId: 'r' }
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['environment', 'share', '--address', 'm2-pro-1'], '/tmp/repo')

    expect(callMock).toHaveBeenCalledWith('prompt.environment.share', {
      address: 'm2-pro-1'
    })
    expect(logSpy).toHaveBeenCalledWith('prompt://pair?code=abc')
    expect(process.exitCode ?? 0).toBe(0)
  })

  it('prints the whole result with --json', async () => {
    callMock.mockResolvedValue({
      id: '1',
      ok: true,
      result: SHARE_RESULT,
      _meta: { runtimeId: 'r' }
    })
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['environment', 'share', '--address', 'm2-pro-1', '--json'], '/tmp/repo')

    expect(JSON.parse(String(logSpy.mock.calls[0]?.[0]))).toMatchObject({
      ok: true,
      result: SHARE_RESULT
    })
  })

  it('stays on this computer even when ORCA_ENVIRONMENT points elsewhere', async () => {
    process.env.ORCA_ENVIRONMENT = 'other-mac'
    callMock.mockResolvedValue({
      id: '1',
      ok: true,
      result: SHARE_RESULT,
      _meta: { runtimeId: 'r' }
    })
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['environment', 'share', '--address', 'm2-pro-1'], '/tmp/repo')

    expect(runtimeClientConstructorMock).toHaveBeenCalledWith(null, null)
  })

  it('refuses --environment instead of sharing a different computer', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(
      ['environment', 'share', '--address', 'm2-pro-1', '--environment', 'other-mac'],
      '/tmp/repo'
    )

    expect(callMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })

  it('requires --address', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})

    await main(['environment', 'share'], '/tmp/repo')

    expect(callMock).not.toHaveBeenCalled()
    expect(process.exitCode).toBe(1)
  })
})
