import type { App } from 'electron'
import { execFileSync } from 'node:child_process'
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  isShipItRunningForBundle,
  isShipItRunningForBundleId
} from '../../shared/shipit-process-listing'
import { writeStartupDiagnosticLine } from './startup-diagnostics'

/** ShipIt logs an install within seconds; an older log cannot describe an install in progress. */
const RECENT_INSTALL_LOG_MS = 10 * 60 * 1000
const LOG_TAIL_BYTES = 16 * 1024

const INSTALL_REQUEST = 'Detected this as an install request'
const INSTALL_FINISHED = ['Installation completed', 'Installation cancelled']

export type ShipItLaunchYieldInputs = {
  platform: NodeJS.Platform
  isPackaged: boolean
  isServeMode: boolean
  execPath: string
  now: number
  readBundleId: (bundlePath: string) => string | null
  /** The ShipIt stderr log's modified time and its last few kilobytes, or null when it is absent. */
  readInstallLog: (bundleId: string) => { mtimeMs: number; tail: string } | null
  listProcesses: () => string | null
}

/**
 * True when ShipIt has been asked to install over this bundle and has not finished: it aborts
 * with "App Still Running" if any copy of the app is open when it starts, so a copy launched now
 * (by `prompt open`, a helper, a link or the Dock) must leave before it opens a window. ShipIt
 * launches the new version itself once the swap is done; that launch follows "Installation
 * completed" in the log, so it does not yield.
 */
export function shouldYieldLaunchToShipIt(inputs: ShipItLaunchYieldInputs): boolean {
  if (inputs.platform !== 'darwin' || !inputs.isPackaged || inputs.isServeMode) {
    return false
  }
  const bundlePath = dirname(dirname(dirname(inputs.execPath)))
  if (!bundlePath.endsWith('.app')) {
    return false
  }
  const bundleId = inputs.readBundleId(bundlePath)
  if (!bundleId) {
    return false
  }
  const log = inputs.readInstallLog(bundleId)
  if (!log || inputs.now - log.mtimeMs > RECENT_INSTALL_LOG_MS) {
    return false
  }
  if (!installRequestIsUnfinished(log.tail)) {
    return false
  }
  const listing = inputs.listProcesses()
  // Unknown process state: launching is the safer default than leaving the user with no app.
  if (listing === null) {
    return false
  }
  return (
    isShipItRunningForBundleId(listing, bundleId) || isShipItRunningForBundle(listing, bundlePath)
  )
}

export function installRequestIsUnfinished(logTail: string): boolean {
  const request = logTail.lastIndexOf(INSTALL_REQUEST)
  if (request === -1) {
    return false
  }
  const after = logTail.slice(request)
  return !INSTALL_FINISHED.some((marker) => after.includes(marker))
}

function readBundleId(bundlePath: string): string | null {
  try {
    const plist = readFileSync(join(bundlePath, 'Contents', 'Info.plist'), 'utf8')
    return /<key>CFBundleIdentifier<\/key>\s*<string>([^<]+)<\/string>/.exec(plist)?.[1] ?? null
  } catch {
    return null
  }
}

function readInstallLog(bundleId: string): { mtimeMs: number; tail: string } | null {
  const path = join(homedir(), 'Library', 'Caches', `${bundleId}.ShipIt`, 'ShipIt_stderr.log')
  let fd: number | null = null
  try {
    const { mtimeMs, size } = statSync(path)
    const length = Math.min(size, LOG_TAIL_BYTES)
    const buffer = Buffer.alloc(length)
    fd = openSync(path, 'r')
    readSync(fd, buffer, 0, length, size - length)
    return { mtimeMs, tail: buffer.toString('utf8') }
  } catch {
    return null
  } finally {
    if (fd !== null) {
      closeSync(fd)
    }
  }
}

function listProcesses(): string | null {
  try {
    return execFileSync('/bin/ps', ['-axww', '-o', 'command='], {
      encoding: 'utf8',
      timeout: 3_000,
      maxBuffer: 8 * 1024 * 1024
    })
  } catch {
    return null
  }
}

/** Startup check; reads one small log file and forks `ps` only while an install was just requested. */
export function shouldThisLaunchYieldToShipIt(options: {
  isPackaged: boolean
  isServeMode: boolean
}): boolean {
  return shouldYieldLaunchToShipIt({
    platform: process.platform,
    isPackaged: options.isPackaged,
    isServeMode: options.isServeMode,
    execPath: process.execPath,
    now: Date.now(),
    readBundleId,
    readInstallLog,
    listProcesses
  })
}

/**
 * A copy opened while ShipIt replaces this bundle makes it cancel the install ("App Still
 * Running"); leave before the lock and any window. Returns true when this launch exited.
 */
export function exitIfLaunchYieldsToShipIt(app: App, isServeMode: boolean): boolean {
  if (!shouldThisLaunchYieldToShipIt({ isPackaged: app.isPackaged, isServeMode })) {
    return false
  }
  writeStartupDiagnosticLine(
    '[updater] macOS is installing a Prompt update; exiting this launch so the install can finish. The updated app opens when it is done.'
  )
  app.exit(0)
  return true
}
