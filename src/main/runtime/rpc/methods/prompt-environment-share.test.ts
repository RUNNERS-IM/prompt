import '../unused-default-rpc-methods.test-fixture'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import type { RpcDispatchStreamingOptions } from '../dispatcher-stream-options'
import { PROMPT_ENVIRONMENT_SHARE_METHODS } from './prompt-environment-share'
import { setPromptRuntimeShareServer } from '../../../prompt-computers/prompt-runtime-share'
import { PROMPT_ENVIRONMENT_SHARE_METHOD } from '../../../../shared/prompt-computers'

function fakeShareServer() {
  return {
    ensureNetworkExposure: vi.fn().mockResolvedValue(undefined),
    createPairingOffer: vi.fn().mockReturnValue({
      available: true,
      pairingUrl: 'prompt://pair?code=abc',
      endpoint: 'ws://m2-pro-1:6768',
      deviceId: 'device-1',
      webClientUrl: null
    })
  }
}

async function dispatchShare(
  options: RpcDispatchStreamingOptions | undefined,
  params: unknown = { address: 'm2-pro-1' }
): Promise<Record<string, unknown>> {
  const runtime = { getRuntimeId: () => 'test-runtime' }
  const dispatcher = new RpcDispatcher({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the share handler never touches the runtime; the envelope reads only getRuntimeId.
    runtime: runtime as OrcaRuntimeService,
    methods: PROMPT_ENVIRONMENT_SHARE_METHODS
  })
  const response = await dispatcher.dispatch(
    {
      id: 'request-1',
      authToken: '',
      method: PROMPT_ENVIRONMENT_SHARE_METHOD,
      params
    },
    options
  )
  return response as unknown as Record<string, unknown>
}

afterEach(() => setPromptRuntimeShareServer(null))

describe('prompt.environment.share', () => {
  it('mints a runtime link for the owner over the local socket', async () => {
    const server = fakeShareServer()
    setPromptRuntimeShareServer(server)

    // The Unix socket dispatches with the owner scope and no client kind or paired device.
    await expect(dispatchShare({ callerScope: { kind: 'owner' } })).resolves.toMatchObject({
      ok: true,
      result: {
        pairingUrl: 'prompt://pair?code=abc',
        endpoint: 'ws://m2-pro-1:6768'
      }
    })
    expect(server.ensureNetworkExposure).toHaveBeenCalledOnce()
    expect(server.createPairingOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'm2-pro-1',
        scope: 'runtime',
        reach: 'network'
      })
    )
  })

  it('refuses a paired desktop on the WebSocket', async () => {
    const server = fakeShareServer()
    setPromptRuntimeShareServer(server)

    const response = await dispatchShare({
      callerScope: { kind: 'runtime-paired', grants: ['desktop-control'] },
      clientKind: 'runtime',
      pairedDeviceId: 'device-9'
    })
    expect(response).toMatchObject({ ok: false })
    expect(server.createPairingOffer).not.toHaveBeenCalled()
  })

  it('refuses a phone', async () => {
    const server = fakeShareServer()
    setPromptRuntimeShareServer(server)

    const response = await dispatchShare({
      callerScope: { kind: 'mobile' },
      clientKind: 'mobile',
      pairedDeviceId: 'phone-1'
    })
    expect(response).toMatchObject({ ok: false })
    expect(server.createPairingOffer).not.toHaveBeenCalled()
  })

  it('refuses an owner-scoped call that names a paired device', async () => {
    const server = fakeShareServer()
    setPromptRuntimeShareServer(server)

    const response = await dispatchShare({
      callerScope: { kind: 'owner' },
      clientKind: 'runtime',
      pairedDeviceId: 'device-9'
    })
    expect(response).toMatchObject({ ok: false })
    expect(server.createPairingOffer).not.toHaveBeenCalled()
  })

  it('reports a runtime without a share server instead of minting nothing', async () => {
    await expect(dispatchShare(undefined)).resolves.toMatchObject({
      ok: false
    })
  })

  it('rejects a missing address before reaching the server', async () => {
    const server = fakeShareServer()
    setPromptRuntimeShareServer(server)
    await expect(dispatchShare(undefined, {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid_argument' }
    })
    expect(server.ensureNetworkExposure).not.toHaveBeenCalled()
  })
})
