import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { loadPromptNativeMock } = vi.hoisted(() => ({ loadPromptNativeMock: vi.fn() }))

vi.mock('../prompt-native', () => ({ loadPromptNative: () => loadPromptNativeMock() }))

const originalPlatform = process.platform

async function readStatus() {
  vi.resetModules()
  const { readNotificationAuthorizationStatus } =
    await import('./notification-authorization-status')
  return readNotificationAuthorizationStatus()
}

describe('readNotificationAuthorizationStatus', () => {
  beforeEach(() => {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    loadPromptNativeMock.mockReset()
  })

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  it.each([
    ['authorized', 'authorized'],
    ['provisional', 'authorized'],
    ['ephemeral', 'authorized'],
    ['denied', 'denied'],
    ['not-determined', 'not-determined'],
    ['something-new', 'unknown']
  ])('maps %s to %s', async (authorization, expected) => {
    loadPromptNativeMock.mockReturnValue({
      notificationStatus: () => Promise.resolve({ authorization, alert: 'enabled' })
    })

    await expect(readStatus()).resolves.toBe(expected)
  })

  it('returns null when the native module cannot load', async () => {
    loadPromptNativeMock.mockReturnValue(null)

    await expect(readStatus()).resolves.toBeNull()
  })

  it('returns null when macOS gives no answer or the read fails', async () => {
    loadPromptNativeMock.mockReturnValue({ notificationStatus: () => Promise.resolve(null) })
    await expect(readStatus()).resolves.toBeNull()

    loadPromptNativeMock.mockReturnValue({
      notificationStatus: () => Promise.reject(new Error('boom'))
    })
    await expect(readStatus()).resolves.toBeNull()
  })

  it('shares one read across simultaneous callers', async () => {
    const notificationStatus = vi.fn(() =>
      Promise.resolve({ authorization: 'denied', alert: 'disabled' })
    )
    loadPromptNativeMock.mockReturnValue({ notificationStatus })
    vi.resetModules()
    const { readNotificationAuthorizationStatus } =
      await import('./notification-authorization-status')

    const results = await Promise.all([
      readNotificationAuthorizationStatus(),
      readNotificationAuthorizationStatus()
    ])

    expect(results).toEqual(['denied', 'denied'])
    expect(notificationStatus).toHaveBeenCalledTimes(1)
  })

  it('does not ask on other platforms', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' })

    await expect(readStatus()).resolves.toBeNull()
    expect(loadPromptNativeMock).not.toHaveBeenCalled()
  })
})
