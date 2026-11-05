import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { appMock, nativeUpdaterMock } = await vi.hoisted(async () => {
  const { EventEmitter } = await import('node:events')
  return {
    appMock: Object.assign(new EventEmitter(), { quit: vi.fn() }),
    nativeUpdaterMock: new EventEmitter()
  }
})

vi.mock('electron', () => ({ app: appMock, autoUpdater: nativeUpdaterMock }))
vi.mock('./updater-lifecycle-diagnostics', () => ({ recordUpdaterLifecycle: vi.fn() }))

import {
  armMacSquirrelStagingWatchdog,
  beginMacUpdateDownload,
  handleMacInstallerReady,
  resetMacInstallState
} from './updater-mac-install'

describe.runIf(process.platform === 'darwin')('macOS Squirrel staging watchdog', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    beginMacUpdateDownload()
  })

  afterEach(() => {
    resetMacInstallState()
    vi.useRealTimers()
  })

  it('downloads once more when Squirrel never stages, then reports instead of looping', () => {
    const retryDownload = vi.fn()
    const sendStatus = vi.fn()
    armMacSquirrelStagingWatchdog({ version: '2.0.0', retryDownload, sendStatus, timeoutMs: 1000 })
    vi.advanceTimersByTime(999)
    expect(retryDownload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(retryDownload).toHaveBeenCalledOnce()
    expect(sendStatus).toHaveBeenLastCalledWith(
      expect.objectContaining({ state: 'error', version: '2.0.0' })
    )

    beginMacUpdateDownload()
    armMacSquirrelStagingWatchdog({ version: '2.0.0', retryDownload, sendStatus, timeoutMs: 1000 })
    vi.advanceTimersByTime(1000)
    expect(retryDownload).toHaveBeenCalledOnce()
    expect(sendStatus.mock.calls.at(-1)?.[0].message).toMatch(/Retry the download/)
  })

  it('does nothing once Squirrel reports the update staged', () => {
    const retryDownload = vi.fn()
    const sendStatus = vi.fn()
    armMacSquirrelStagingWatchdog({ version: '2.0.0', retryDownload, sendStatus, timeoutMs: 1000 })
    handleMacInstallerReady(true, vi.fn(), vi.fn())
    vi.advanceTimersByTime(5000)
    expect(retryDownload).not.toHaveBeenCalled()
    expect(sendStatus).not.toHaveBeenCalled()
  })
})
