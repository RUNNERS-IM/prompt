import { afterEach, describe, expect, it } from 'vitest'
import { prefillPromptShareAddress } from './prompt-share-computer-dialog'
import {
  cacheGeneratedRuntimePairingLink,
  clearGeneratedRuntimePairingLink,
  runtimePairingLinkCache
} from '../settings/runtime-pairing-link-state'

afterEach(() => {
  clearGeneratedRuntimePairingLink()
  runtimePairingLinkCache.intent = 'another'
  runtimePairingLinkCache.customAddress = ''
  runtimePairingLinkCache.selectedAddress = ''
})

describe('prefillPromptShareAddress', () => {
  it('opens the share form on a custom address set to this Mac’s name', () => {
    prefillPromptShareAddress('m2-pro-1')
    expect(runtimePairingLinkCache).toMatchObject({
      intent: 'custom',
      customAddress: 'm2-pro-1',
      selectedAddress: 'm2-pro-1'
    })
  })

  it('drops a link made for another address but keeps one made for this name', () => {
    cacheGeneratedRuntimePairingLink({
      address: '192.168.0.4',
      pairingUrl: 'prompt://pair?code=old',
      webClientUrl: null,
      deviceId: 'd1'
    })
    prefillPromptShareAddress('m2-pro-1')
    expect(runtimePairingLinkCache.runtimePairingUrl).toBeNull()

    cacheGeneratedRuntimePairingLink({
      address: 'm2-pro-1',
      pairingUrl: 'prompt://pair?code=new',
      webClientUrl: null,
      deviceId: 'd2'
    })
    prefillPromptShareAddress('m2-pro-1')
    expect(runtimePairingLinkCache.runtimePairingUrl).toBe('prompt://pair?code=new')
  })
})
