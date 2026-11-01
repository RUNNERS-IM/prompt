import type {
  RemoteServerUpdateInstallResult,
  RemoteServerUpdaterSnapshot
} from '../../shared/remote-server-update'
import type { CommandHandler } from '../dispatch'
import type { RuntimeClient } from '../runtime-client'
import { RuntimeClientError } from '../runtime/types'

export type PromptAppUpdateResult =
  | { status: 'up-to-date'; version: string }
  | { status: 'installing'; fromVersion: string; version: string }

export type PromptAppUpdateTiming = {
  /** Budget for checking and downloading together; the install itself is not awaited. */
  timeoutMs: number
  pollIntervalMs: number
  wait: (milliseconds: number) => Promise<void>
  now: () => number
}

export const DEFAULT_PROMPT_APP_UPDATE_TIMING: PromptAppUpdateTiming = {
  timeoutMs: 10 * 60 * 1000,
  pollIntervalMs: 500,
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now: Date.now
}

// Each RPC returns at once; only the polling loop waits on the download.
const RPC_TIMEOUT_MS = 15_000

// Same updater RPC errors the desktop's remote-server update dialog explains.
const UPDATER_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  remote_update_manual_required:
    'This Prompt cannot update itself (development build, updater off, or a package-managed install). Install the new version manually.',
  remote_update_not_available:
    'Prompt no longer reports an available update. Run the command again.',
  remote_update_not_downloaded: 'The update has not finished downloading. Run the command again.',
  method_not_found:
    'This Prompt is too old to update from the CLI. Install the new version manually once.'
}

function explainUpdaterError(error: unknown): never {
  if (error instanceof RuntimeClientError) {
    const message = UPDATER_ERROR_MESSAGES[error.code] ?? UPDATER_ERROR_MESSAGES[error.message]
    if (message) {
      throw new RuntimeClientError(error.code, message, error.data)
    }
  }
  throw error
}

async function call<TResult>(
  client: RuntimeClient,
  method: string,
  params?: unknown
): Promise<TResult> {
  try {
    return (await client.call<TResult>(method, params, { timeoutMs: RPC_TIMEOUT_MS })).result
  } catch (error) {
    explainUpdaterError(error)
  }
}

/**
 * Drive the app's own updater the way the desktop drives a paired server's: check, download,
 * then quitAndInstall through `updater.install`, which answers before the app quits.
 */
export async function runPromptAppUpdate(
  client: RuntimeClient,
  timing: PromptAppUpdateTiming = DEFAULT_PROMPT_APP_UPDATE_TIMING
): Promise<PromptAppUpdateResult> {
  const deadline = timing.now() + timing.timeoutMs

  const poll = async (
    accept: (snapshot: RemoteServerUpdaterSnapshot) => boolean,
    phase: 'checking' | 'downloading'
  ): Promise<RemoteServerUpdaterSnapshot> => {
    for (;;) {
      const snapshot = await call<RemoteServerUpdaterSnapshot>(client, 'updater.getStatus')
      if (snapshot.status.state === 'error') {
        const message = snapshot.status.message || 'unknown error'
        throw new RuntimeClientError(
          phase === 'checking' ? 'update_check_failed' : 'update_download_failed',
          phase === 'checking'
            ? `Could not check for updates: ${message}`
            : `Could not download the update: ${message}`
        )
      }
      if (accept(snapshot)) {
        return snapshot
      }
      if (timing.now() >= deadline) {
        throw new RuntimeClientError(
          'timeout',
          `Timed out after ${Math.round(timing.timeoutMs / 60_000)} minutes while ${phase} (updater state: ${snapshot.status.state}).`
        )
      }
      await timing.wait(timing.pollIntervalMs)
    }
  }

  let snapshot = await call<RemoteServerUpdaterSnapshot>(client, 'updater.getStatus')
  if (!snapshot.support.automatic) {
    explainUpdaterError(
      new RuntimeClientError('remote_update_manual_required', 'remote_update_manual_required')
    )
  }

  // An update already downloading or waiting for the UpdateCard's Install button is reused.
  const inFlight = snapshot.status.state === 'downloading' || snapshot.status.state === 'downloaded'
  if (!inFlight) {
    snapshot = await call<RemoteServerUpdaterSnapshot>(client, 'updater.check', {})
    snapshot = await poll(
      (next) =>
        next.status.state === 'available' ||
        next.status.state === 'not-available' ||
        next.status.state === 'downloading' ||
        next.status.state === 'downloaded',
      'checking'
    )
  }

  if (snapshot.status.state === 'not-available') {
    return { status: 'up-to-date', version: snapshot.appVersion }
  }
  if (snapshot.status.state === 'available') {
    if (snapshot.status.externallyManaged) {
      explainUpdaterError(
        new RuntimeClientError('remote_update_manual_required', 'remote_update_manual_required')
      )
    }
    await call<RemoteServerUpdaterSnapshot>(client, 'updater.download')
  }
  if (snapshot.status.state !== 'downloaded') {
    snapshot = await poll((next) => next.status.state === 'downloaded', 'downloading')
  }

  const install = await call<RemoteServerUpdateInstallResult>(client, 'updater.install')
  return { status: 'installing', fromVersion: install.fromVersion, version: install.targetVersion }
}

export function formatPromptAppUpdate(result: PromptAppUpdateResult): string {
  return result.status === 'up-to-date'
    ? `Prompt is already up to date (${result.version}).`
    : `Installing Prompt ${result.version} and restarting.`
}

export const PROMPT_APP_UPDATE_HANDLERS: Record<string, CommandHandler> = {
  'prompt app update': async ({ client, json }) => {
    const result = await runPromptAppUpdate(client)
    if (json) {
      console.log(JSON.stringify({ ok: true, result }, null, 2))
      return
    }
    console.log(formatPromptAppUpdate(result))
  }
}
