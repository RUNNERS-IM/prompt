import type { PtySpawnOptions, PtySpawnResult } from '../providers/pty-provider-contract'
import type { LegacyDaemonExitProof } from './daemon-legacy-exit-proof'
import type { DaemonPtyAdapter } from './daemon-pty-adapter'
import { routeSpawnOrHold } from './daemon-router-newer-daemon-hold'
import { findLegacySessionOwner } from './daemon-router-legacy-owner'
import type { DaemonSessionOwnerResolver } from './daemon-session-owner-resolution'
import { previousFolderSessionTrace } from './previous-folder-session-trace'

export type DaemonRouterSpawnRoutes = {
  current: DaemonPtyAdapter
  legacy: readonly DaemonPtyAdapter[]
  legacyExitProof: LegacyDaemonExitProof
  sessionAdapters: ReadonlyMap<string, DaemonPtyAdapter>
  ownerResolver: DaemonSessionOwnerResolver<DaemonPtyAdapter>
}

/** Attach to the session's owning daemon, or spawn on the current one and record the route. */
export async function spawnRoutedDaemonSession(
  opts: PtySpawnOptions,
  routes: DaemonRouterSpawnRoutes
): Promise<PtySpawnResult> {
  const { current, legacy, legacyExitProof, sessionAdapters, ownerResolver } = routes
  if (opts.attachOnly && opts.sessionId) {
    const sessionId = opts.sessionId
    const attached = await ownerResolver.spawnAttachOnly({ ...opts, sessionId })
    previousFolderSessionTrace.noteAttach(sessionAdapters, sessionId, 'attach-only')
    return attached
  }
  const adapter =
    (opts.sessionId ? sessionAdapters.get(opts.sessionId) : undefined) ??
    (await findLegacySessionOwner(opts, current, legacy, legacyExitProof))
  const target = await routeSpawnOrHold(opts, adapter, current, ownerResolver)
  const result = await target.spawn(opts)
  if (!result.exitedBeforeSpawnReply) {
    ownerResolver.recordRoute(result.id, target, result.incarnationId)
    previousFolderSessionTrace.noteAttach(sessionAdapters, result.id, 'spawn')
  }
  return result
}
