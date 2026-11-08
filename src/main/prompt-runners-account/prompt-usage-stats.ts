import { join } from 'node:path'
import { app } from 'electron'
import type { PromptUsageConsent } from '../../shared/prompt-runners-account'
import { getMainE2EConfig } from '../e2e-config'
import { createUsageStats, type UsageStats } from '../runners-usage-stats/usage-stats'
import { runnersAccountAccessToken } from './prompt-runners-account-server'

const FLUSH_EVERY_MS = 24 * 60 * 60 * 1000

let stats: UsageStats | null = null

function usageStats(): UsageStats {
  stats ??= createUsageStats({
    version: app.getVersion(),
    filePath: join(app.getPath('userData'), 'usage-stats.json'),
    token: runnersAccountAccessToken,
    // Why: development and test runs must not add to the customers' usage numbers.
    endpoint: app.isPackaged ? undefined : null
  })
  return stats
}

/** Why: the sheet covers the window, so test runs only see it when a test asks for it. */
function hidesConsentSheet(): boolean {
  return getMainE2EConfig().userDataDir !== null && process.env.ORCA_E2E_SHOW_USAGE_CONSENT !== '1'
}

export function promptUsageConsent(): PromptUsageConsent {
  return hidesConsentSheet() ? 'denied' : usageStats().consent()
}

export function setPromptUsageConsent(granted: boolean): void {
  usageStats().setConsent(granted)
}

export function startPromptUsageStats(): void {
  const usage = usageStats()
  usage.count('app.open')
  void usage.flush()
  setInterval(() => void usage.flush(), FLUSH_EVERY_MS).unref()
  app.on('before-quit', () => usage.save())
}
