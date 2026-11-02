import { initStatsPath } from '../stats/collector'
import { initClaudeUsagePath } from '../claude-usage/store'
import { initCodexUsagePath } from '../codex-usage/store'
import { initOpenCodeUsagePath } from '../opencode-usage/store'
import { initMuseUsagePath } from '../muse-usage/store'

export function initUsageStorePaths(): void {
  initStatsPath()
  initClaudeUsagePath()
  initCodexUsagePath()
  initOpenCodeUsagePath()
  initMuseUsagePath()
}
