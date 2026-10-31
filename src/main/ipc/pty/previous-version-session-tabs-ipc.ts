import { app, ipcMain } from 'electron'
import { join } from 'node:path'
import {
  PREVIOUS_VERSION_SESSION_TABS_CHANNEL,
  type PreviousVersionSessionTabsListResult,
  type PreviousVersionSessionTabsReport,
  type PreviousVersionSessionWindowSkipReason
} from '../../../shared/previous-version-session-tabs'
import { writeFileAtomically } from '../../codex-accounts/fs-utils'
import { DaemonPtyAdapter } from '../../daemon/daemon-pty-adapter'
import { DaemonPtyRouter } from '../../daemon/daemon-pty-router'
import { getDaemonProvider } from '../../daemon/daemon-provider-state'
import {
  PREVIOUS_VERSION_SESSION_TABS_MARKER_FILE,
  isPreviousVersionSessionTabsDone,
  selectPreviousVersionSessionTabCandidates,
  type PreviousVersionSessionSelection
} from '../../daemon/previous-folder-session-tabs'
import { previousFolderSessionTrace } from '../../daemon/previous-folder-session-trace'
import { startSpan } from '../../observability/tracer'
import { getPreMigrationUserData } from '../../startup/prompt-user-data-pin'

const HISTORY_DIR_NAME = 'terminal-history'

const WINDOW_SKIP_REASONS: readonly PreviousVersionSessionWindowSkipReason[] = [
  'has-tab',
  'workspace-gone',
  'remote-workspace',
  'create-failed'
]

export type PreviousVersionSessionTabsDeps = {
  awaitProviderStartup: () => Promise<void>
  getProvider: () => unknown
  getPreMigrationUserData: () => { userDataPath: string } | null
  userDataPath: () => string
  nowMs: () => number
}

/** One window per process takes the list; a reload or second window must not make tabs twice. */
let claimed: { selection: PreviousVersionSessionSelection } | null = null

export function resetPreviousVersionSessionTabsClaimForTest(): void {
  claimed = null
}

function emit(name: string, attributes: Record<string, string | number | boolean>): void {
  try {
    startSpan(name, { attributes: { kind: 'daemon', ...attributes } }).end()
  } catch {
    // Optional diagnostics must never fail startup.
  }
}

function skipAttributes(skipped: Partial<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(skipped).map(([reason, count]) => [`skipped.${reason}`, count ?? 0])
  )
}

async function list(
  deps: PreviousVersionSessionTabsDeps
): Promise<PreviousVersionSessionTabsListResult> {
  const previous = deps.getPreMigrationUserData()
  if (!previous) {
    return { status: 'not-applicable' }
  }
  const markerPath = join(deps.userDataPath(), PREVIOUS_VERSION_SESSION_TABS_MARKER_FILE)
  if (claimed || isPreviousVersionSessionTabsDone(markerPath)) {
    return { status: 'done' }
  }
  // Claim before awaiting so a second caller arriving meanwhile cannot take the list too.
  const claim = { selection: { candidates: [], skipped: {} } as PreviousVersionSessionSelection }
  claimed = claim
  await deps.awaitProviderStartup()
  const provider = deps.getProvider()
  // A plain adapter means no older daemon was found to route to, so nothing is left to adopt.
  if (!(provider instanceof DaemonPtyRouter) && !(provider instanceof DaemonPtyAdapter)) {
    claimed = null
    return { status: 'not-ready' }
  }
  const selection = selectPreviousVersionSessionTabCandidates({
    sessionIds:
      provider instanceof DaemonPtyRouter ? previousFolderSessionTrace.discoveredSessionIds() : [],
    isAttached: (sessionId) => previousFolderSessionTrace.isAttached(sessionId),
    previousHistoryRoot: join(previous.userDataPath, HISTORY_DIR_NAME),
    currentHistoryRoot: join(deps.userDataPath(), HISTORY_DIR_NAME),
    nowMs: deps.nowMs()
  })
  claim.selection = selection
  emit('daemon.previous-folder.tab-candidates', {
    'candidates.count': selection.candidates.length,
    ...skipAttributes(selection.skipped)
  })
  return { status: 'pending', candidates: selection.candidates }
}

function parseReport(request: Record<string, unknown>): PreviousVersionSessionTabsReport | null {
  const created = request.created
  const skipped = request.skipped
  if (typeof created !== 'number' || !Number.isSafeInteger(created) || created < 0) {
    return null
  }
  const counts: PreviousVersionSessionTabsReport['skipped'] = {}
  if (typeof skipped === 'object' && skipped !== null) {
    for (const reason of WINDOW_SKIP_REASONS) {
      const count = (skipped as Record<string, unknown>)[reason]
      if (typeof count === 'number' && Number.isSafeInteger(count) && count > 0) {
        counts[reason] = count
      }
    }
  }
  return { created, skipped: counts }
}

function report(deps: PreviousVersionSessionTabsDeps, request: Record<string, unknown>): void {
  const parsed = parseReport(request)
  if (!claimed || !parsed) {
    return
  }
  const mainSkipped = claimed.selection.skipped
  emit('daemon.previous-folder.tabs-created', {
    'tabs.created': parsed.created,
    ...skipAttributes({ ...mainSkipped, ...parsed.skipped })
  })
  try {
    writeFileAtomically(
      join(deps.userDataPath(), PREVIOUS_VERSION_SESSION_TABS_MARKER_FILE),
      JSON.stringify({
        doneAtMs: deps.nowMs(),
        created: parsed.created,
        skipped: { ...mainSkipped, ...parsed.skipped }
      })
    )
  } catch (error) {
    console.warn('[daemon] could not record previous-version tab creation', error)
  }
}

export async function handlePreviousVersionSessionTabsRequest(
  request: unknown,
  deps: PreviousVersionSessionTabsDeps
): Promise<PreviousVersionSessionTabsListResult | null> {
  if (typeof request !== 'object' || request === null) {
    return null
  }
  const phase = (request as { phase?: unknown }).phase
  if (phase === 'list') {
    return list(deps)
  }
  if (phase === 'report') {
    report(deps, request as Record<string, unknown>)
  }
  return null
}

export function registerPreviousVersionSessionTabsHandler(
  awaitProviderStartup?: () => Promise<void>
): void {
  ipcMain.removeHandler(PREVIOUS_VERSION_SESSION_TABS_CHANNEL)
  ipcMain.handle(PREVIOUS_VERSION_SESSION_TABS_CHANNEL, (_event, request: unknown) =>
    handlePreviousVersionSessionTabsRequest(request, {
      awaitProviderStartup: awaitProviderStartup ?? (() => Promise.resolve()),
      getProvider: getDaemonProvider,
      getPreMigrationUserData,
      userDataPath: () => app.getPath('userData'),
      nowMs: Date.now
    })
  )
}
