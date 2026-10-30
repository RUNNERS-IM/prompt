import { loadPromptNative } from '../prompt-native'

export type NotificationAuthorizationStatus = 'authorized' | 'denied' | 'not-determined' | 'unknown'

/** Read native authorization absent from Electron APIs; return null when it cannot be read so callers can use weaker delivery evidence. */
let readInFlight: Promise<NotificationAuthorizationStatus | null> | null = null

export function readNotificationAuthorizationStatus(): Promise<NotificationAuthorizationStatus | null> {
  if (process.platform !== 'darwin') {
    return Promise.resolve(null)
  }
  // Prompt's native module asks from the main process, whose bundle ID is the one macOS files the app's notifications under.
  const native = loadPromptNative()
  if (!native) {
    return Promise.resolve(null)
  }
  // Share one read across simultaneous completion notifications.
  if (readInFlight) {
    return readInFlight
  }
  readInFlight = readStatus(() => native.notificationStatus()).finally(() => {
    readInFlight = null
  })
  return readInFlight
}

async function readStatus(
  notificationStatus: () => Promise<{ authorization: string } | null>
): Promise<NotificationAuthorizationStatus | null> {
  let status: { authorization: string } | null
  try {
    status = await notificationStatus()
  } catch {
    return null
  }
  if (!status) {
    return null
  }
  switch (status.authorization) {
    case 'authorized':
    case 'provisional':
    case 'ephemeral':
      return 'authorized'
    case 'denied':
      return 'denied'
    case 'not-determined':
      return 'not-determined'
    default:
      return 'unknown'
  }
}
