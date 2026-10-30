import { describe, expect, it, vi } from 'vitest'
import {
  PromptRuntimeShareError,
  createPromptRuntimeShareOffer,
  validatePromptShareAddress
} from './prompt-runtime-share'

function server(overrides: Partial<Record<'exposure' | 'offer', unknown>> = {}) {
  return {
    ensureNetworkExposure:
      overrides.exposure === 'fail'
        ? vi.fn().mockRejectedValue(new Error('EADDRINUSE'))
        : vi.fn().mockResolvedValue(undefined),
    createPairingOffer: vi.fn().mockReturnValue(
      overrides.offer ?? {
        available: true,
        pairingUrl: 'prompt://pair?code=xyz',
        endpoint: 'ws://m2-pro-1:6768',
        deviceId: 'device-1',
        webClientUrl: null
      }
    )
  }
}

describe('validatePromptShareAddress', () => {
  it('accepts host names, IPs and host:port', () => {
    expect(validatePromptShareAddress(' m2-pro-1 ')).toBe('m2-pro-1')
    expect(validatePromptShareAddress('100.64.0.7')).toBe('100.64.0.7')
    expect(validatePromptShareAddress('m2-pro-1:6790')).toBe('m2-pro-1:6790')
  })

  it('refuses URLs, blanks and loopback', () => {
    for (const bad of ['', '   ', 'ws://m2-pro-1:6768', 'm2 pro', '127.0.0.1', 'localhost']) {
      expect(() => validatePromptShareAddress(bad)).toThrow(PromptRuntimeShareError)
    }
  })
})

describe('createPromptRuntimeShareOffer', () => {
  it('opens the runtime to the network before minting a runtime-scope link', async () => {
    const fake = server()
    const result = await createPromptRuntimeShareOffer(fake, 'm2-pro-1')
    expect(result).toEqual({
      pairingUrl: 'prompt://pair?code=xyz',
      endpoint: 'ws://m2-pro-1:6768',
      deviceId: 'device-1'
    })
    expect(fake.ensureNetworkExposure.mock.invocationCallOrder[0]).toBeLessThan(
      fake.createPairingOffer.mock.invocationCallOrder[0]!
    )
    expect(fake.createPairingOffer).toHaveBeenCalledWith(
      expect.objectContaining({
        address: 'm2-pro-1',
        scope: 'runtime',
        reach: 'network'
      })
    )
    // Reuse an unused link rather than invalidating one handed out a moment ago.
    expect(fake.createPairingOffer.mock.calls[0]![0]).not.toHaveProperty('rotate', true)
  })

  it('does not mint a link when the network listener cannot be opened', async () => {
    const fake = server({ exposure: 'fail' })
    await expect(createPromptRuntimeShareOffer(fake, 'm2-pro-1')).rejects.toMatchObject({
      code: 'share_unavailable'
    })
    expect(fake.createPairingOffer).not.toHaveBeenCalled()
  })

  it('passes the runtime guidance through when no link can be made', async () => {
    const fake = server({
      offer: {
        available: false,
        reason: 'websocket_unavailable',
        guidance: 'No WebSocket.'
      }
    })
    await expect(createPromptRuntimeShareOffer(fake, 'm2-pro-1')).rejects.toThrow('No WebSocket.')
  })
})
