/**
 * Local trace of terminals still running in the daemon left in the folder Prompt used before it
 * moved its data folder: which sessions were found there, which ones a tab attached to, and which
 * ones nothing attached to. Lines go to the local trace file (main.trace.ndjson).
 *
 * Session ids hold workspace paths, so traces carry only a short one-way key per session; the
 * same session always gets the same key, so the found / attached / left-over lines can be matched.
 */
import { createHash } from 'node:crypto'
import { startSpan } from '../observability/tracer'

/** Long enough that a tab opened shortly after launch has had time to attach. */
const PREVIOUS_FOLDER_UNATTACHED_REPORT_DELAY_MS = 3 * 60_000

export type PreviousFolderSessionOwner = {
  readonly fromPreviousDataFolder: boolean
  readonly protocolVersion: number
}

type PreviousFolderAttachVia = 'spawn' | 'attach-only' | 'attach'

type PreviousFolderUnattachedReason = 'startup-delay' | 'quit'

type DiscoveredSession = { protocolVersion: number }

export function previousFolderSessionTraceKey(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 12)
}

function traceKeys(sessionIds: Iterable<string>): string {
  return [...sessionIds].map(previousFolderSessionTraceKey).sort().join(',')
}

function emit(name: string, attributes: Record<string, string | number | boolean>): void {
  try {
    startSpan(name, { attributes: { kind: 'daemon', ...attributes } }).end()
  } catch {
    // Optional diagnostics must never fail terminal routing or quit.
  }
}

export class PreviousFolderSessionTrace {
  private discovered = new Map<string, DiscoveredSession>()
  private attached = new Set<string>()
  private reportTimer: ReturnType<typeof setTimeout> | null = null
  private startupReportArmed = false

  constructor(private readonly delayMs = PREVIOUS_FOLDER_UNATTACHED_REPORT_DELAY_MS) {}

  /** Called at the end of router discovery with every route it now knows. */
  recordDiscovered(routes: ReadonlyMap<string, PreviousFolderSessionOwner>): void {
    this.discovered = new Map()
    const byProtocol = new Map<number, string[]>()
    for (const [sessionId, owner] of routes) {
      if (!owner.fromPreviousDataFolder) {
        continue
      }
      this.discovered.set(sessionId, { protocolVersion: owner.protocolVersion })
      byProtocol.set(owner.protocolVersion, [
        ...(byProtocol.get(owner.protocolVersion) ?? []),
        sessionId
      ])
    }
    for (const [protocolVersion, sessionIds] of byProtocol) {
      emit('daemon.previous-folder.sessions', {
        'daemon.protocol_version': protocolVersion,
        'sessions.count': sessionIds.length,
        'sessions.keys': traceKeys(sessionIds)
      })
    }
    if (this.discovered.size > 0 && !this.startupReportArmed) {
      this.startupReportArmed = true
      this.reportTimer = setTimeout(() => {
        this.reportTimer = null
        this.reportUnattached('startup-delay')
      }, this.delayMs)
      this.reportTimer.unref?.()
    }
  }

  /** Called after a session id was routed to its owning daemon for a tab. */
  noteAttach(
    routes: ReadonlyMap<string, PreviousFolderSessionOwner>,
    sessionId: string,
    via: PreviousFolderAttachVia
  ): void {
    const owner = routes.get(sessionId)
    if (!owner?.fromPreviousDataFolder || this.attached.has(sessionId)) {
      return
    }
    this.attached.add(sessionId)
    emit('daemon.previous-folder.attach', {
      'daemon.protocol_version': owner.protocolVersion,
      'attach.via': via,
      'session.key': previousFolderSessionTraceKey(sessionId)
    })
  }

  isAttached(sessionId: string): boolean {
    return this.attached.has(sessionId)
  }

  discoveredSessionIds(): string[] {
    return [...this.discovered.keys()]
  }

  unattachedSessionIds(): string[] {
    return this.discoveredSessionIds().filter((sessionId) => !this.attached.has(sessionId))
  }

  /** Found minus attached; quit reports even when the delayed report already ran. */
  reportUnattached(reason: PreviousFolderUnattachedReason): void {
    if (reason === 'quit' && this.reportTimer) {
      clearTimeout(this.reportTimer)
      this.reportTimer = null
    }
    if (this.discovered.size === 0) {
      return
    }
    const unattached = this.unattachedSessionIds()
    emit('daemon.previous-folder.unattached', {
      'report.reason': reason,
      'sessions.discovered': this.discovered.size,
      'sessions.attached': this.discovered.size - unattached.length,
      'sessions.unattached': unattached.length,
      'sessions.keys': traceKeys(unattached)
    })
  }
}

/** One per main process: the router fills it, quit and Settings read it. */
export const previousFolderSessionTrace = new PreviousFolderSessionTrace()
