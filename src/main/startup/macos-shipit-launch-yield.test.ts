import { describe, expect, it } from 'vitest'
import {
  installRequestIsUnfinished,
  shouldYieldLaunchToShipIt,
  type ShipItLaunchYieldInputs
} from './macos-shipit-launch-yield'

const NOW = Date.parse('2026-11-04T16:34:46Z')
const SHIPIT =
  '/Users/runners/Library/Caches/im.runners.prompt.ShipIt/update.x/Prompt.app/Contents/Frameworks/Squirrel.framework/Resources/ShipIt im.runners.prompt.ShipIt /Users/runners/Library/Caches/im.runners.prompt.ShipIt/ShipItState.plist'

// Lines as ShipIt wrote them on m3-pro-1 on 2026-11-04.
const WAITING = `2026-11-04 16:34:40.369 ShipIt[18566:1100060] Detected this as an install request
2026-11-04 16:34:44.574 ShipIt[18566:1100245] Beginning installation
`
const CANCELLED = `${WAITING}2026-11-04 16:34:48.852 ShipIt[18566:1102392] Installation cancelled: Error Domain=SQRLInstallerErrorDomain Code=-9 "App Still Running Error"
2026-11-04 16:34:48.855 ShipIt[18566:1102392] ShipIt quitting
`
const RELAUNCHING = `2026-11-04 16:39:49.207 ShipIt[34483:1141491] Detected this as an install request
2026-11-04 16:40:03.847 ShipIt[34483:1141577] Beginning installation
2026-11-04 16:40:08.852 ShipIt[34483:1143595] Installation completed successfully
2026-11-04 16:40:12.732 ShipIt[35489:1144449] Detected this as a launch request
`

function inputs(overrides: Partial<ShipItLaunchYieldInputs> = {}): ShipItLaunchYieldInputs {
  return {
    platform: 'darwin',
    isPackaged: true,
    isServeMode: false,
    execPath: '/Applications/Prompt.app/Contents/MacOS/Prompt',
    now: NOW,
    readBundleId: () => 'im.runners.prompt',
    readInstallLog: () => ({ mtimeMs: NOW - 2_000, tail: WAITING }),
    listProcesses: () => `/sbin/launchd\n${SHIPIT}\n`,
    ...overrides
  }
}

describe('shouldYieldLaunchToShipIt', () => {
  it('yields while ShipIt waits to replace the bundle', () => {
    expect(shouldYieldLaunchToShipIt(inputs())).toBe(true)
  })

  it('does not yield for the launch ShipIt makes after installing', () => {
    expect(
      shouldYieldLaunchToShipIt(
        inputs({ readInstallLog: () => ({ mtimeMs: NOW, tail: RELAUNCHING }) })
      )
    ).toBe(false)
  })

  it('does not yield once ShipIt has quit, or for an old log', () => {
    expect(shouldYieldLaunchToShipIt(inputs({ listProcesses: () => '/sbin/launchd\n' }))).toBe(
      false
    )
    expect(
      shouldYieldLaunchToShipIt(
        inputs({ readInstallLog: () => ({ mtimeMs: NOW - 11 * 60_000, tail: WAITING }) })
      )
    ).toBe(false)
  })

  it('never yields outside a packaged macOS desktop launch', () => {
    expect(shouldYieldLaunchToShipIt(inputs({ isServeMode: true }))).toBe(false)
    expect(shouldYieldLaunchToShipIt(inputs({ isPackaged: false }))).toBe(false)
    expect(shouldYieldLaunchToShipIt(inputs({ platform: 'linux' }))).toBe(false)
  })

  it('launches when the process list cannot be read', () => {
    expect(shouldYieldLaunchToShipIt(inputs({ listProcesses: () => null }))).toBe(false)
  })
})

describe('installRequestIsUnfinished', () => {
  it('reads the last install request in the log', () => {
    expect(installRequestIsUnfinished(WAITING)).toBe(true)
    expect(installRequestIsUnfinished(CANCELLED)).toBe(false)
    expect(installRequestIsUnfinished(`${CANCELLED}${WAITING}`)).toBe(true)
    expect(installRequestIsUnfinished('')).toBe(false)
  })
})
