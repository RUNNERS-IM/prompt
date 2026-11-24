import { homedir } from 'node:os'
import { join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import type { ClaudeRunningSessionEvidence } from '../../shared/claude-running-session-evidence'
import { listClaudeProfileHomesAsync } from './claude-profile-homes'
import { probeClaudeRunningSessions } from './claude-running-session-probe'

// Why: listings come often, so a probe this recent is reused instead of running ps again.
const REFRESH_EVERY_MS = 15_000

let byPaneKey = new Map<string, string>()
let refreshedAt = 0
let inFlight: Promise<void> | null = null

/** Remember which conversation each pane's running Claude is on. */
export function rememberClaudeRunningSessions(
  evidence: readonly ClaudeRunningSessionEvidence[],
  now = Date.now()
): void {
  byPaneKey = new Map(evidence.map((item) => [item.paneKey, item.sessionId]))
  refreshedAt = now
}

/** The conversation id the pane's running Claude reported, when a recent probe saw one. */
export function runningClaudeSessionIdForPane(paneKey: string): string | undefined {
  return byPaneKey.get(paneKey)
}

async function defaultConfigDirs(): Promise<string[]> {
  const profileHomes = await listClaudeProfileHomesAsync(getAppEnvironment().getPath('userData'))
  return [join(homedir(), '.claude'), ...profileHomes]
}

/**
 * Probe the running Claude processes unless a recent probe is still fresh.
 * Why: a pane whose hooks never reached this Prompt has no hook conversation id, so
 * `prompt session list` showed no RESUME ID for it.
 */
export function refreshClaudeRunningSessions(
  configDirs: () => Promise<string[]> = defaultConfigDirs
): Promise<void> {
  if (Date.now() - refreshedAt < REFRESH_EVERY_MS) {
    return Promise.resolve()
  }
  inFlight ??= (async () => {
    try {
      rememberClaudeRunningSessions(await probeClaudeRunningSessions(await configDirs()))
    } catch {
      // Why quiet: the listing still works with hook ids alone.
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

export function resetClaudeRunningSessionCacheForTests(): void {
  byPaneKey = new Map()
  refreshedAt = 0
  inFlight = null
}
