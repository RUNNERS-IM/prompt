import { translate } from '@/i18n/i18n'
import { agentStateLabel, type AgentDotState } from '@/components/AgentStateDot'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import { getAgentDotState } from '@/components/sidebar/worktree-card-agent-summary'
import { promptTerminalTabName } from '@/components/sidebar/prompt-session-row-name'

/** What the hover card on a tab or a sidebar session row lists, in display order. */
export type PromptSessionSummary = {
  name: string
  model: string
  status: string
  task: string
  folder: string
  runningSubagents: number
}

// States that are still going on read "for 12m"; the rest read "12m ago".
const ONGOING_STATES: ReadonlySet<AgentDotState> = new Set([
  'working',
  'monitoring',
  'waiting',
  'permission',
  'blocked'
])

/** "12m" / "1h 5m" (ko "12분" / "1시간 5분"); null under a minute. */
export function formatPromptDuration(ms: number): string | null {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) {
    return null
  }
  if (minutes < 60) {
    return translate('prompt.sessionCard.minutes', '{{m}}m', { m: minutes })
  }
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0
    ? translate('prompt.sessionCard.hours', '{{h}}h', { h: hours })
    : translate('prompt.sessionCard.hoursMinutes', '{{h}}h {{m}}m', {
        h: hours,
        m: rest
      })
}

/** "Working · 12m" style line: the state label plus how long it has been in that state. */
export function formatPromptStatusLine(state: AgentDotState, since: number, now: number): string {
  const label = agentStateLabel(state)
  if (since <= 0) {
    return label
  }
  const duration = formatPromptDuration(now - since)
  if (duration === null) {
    return translate('prompt.sessionCard.justNow', '{{status}} · just now', {
      status: label
    })
  }
  return ONGOING_STATES.has(state)
    ? translate('prompt.sessionCard.ongoing', '{{status}} · {{duration}}', {
        status: label,
        duration
      })
    : translate('prompt.sessionCard.ago', '{{status}} · {{duration}} ago', {
        status: label,
        duration
      })
}

/** Shortens /Users/<name>/… and /home/<name>/… to ~/… so the folder fits the card. */
export function collapsePromptHomeFolder(path: string | undefined): string {
  const trimmed = path?.trim() ?? ''
  return trimmed.replace(/^(?:\/Users|\/home)\/[^/]+(?=\/|$)/, '~')
}

/** Child rows (subagents, dispatched workers) of this session that are still working. */
export function countRunningChildren(row: DashboardAgentRow, rows: DashboardAgentRow[]): number {
  const children = buildAgentRowLineageTree(rows).childrenByParentPaneKey.get(row.paneKey) ?? []
  return children.filter((child) => child.state === 'working').length
}

export function buildPromptSessionSummary({
  row,
  rows,
  task,
  folderPath,
  now
}: {
  row: DashboardAgentRow
  /** Every row of the session's workspace, used to count its running children. */
  rows: DashboardAgentRow[]
  /** The live task line the sidebar row shows. */
  task: string
  folderPath: string | undefined
  now: number
}): PromptSessionSummary {
  const since = row.entry.stateStartedAt > 0 ? row.entry.stateStartedAt : row.startedAt
  return {
    name: promptTerminalTabName(row.tab),
    model: row.entry.model?.trim() ?? '',
    status: formatPromptStatusLine(getAgentDotState(row), since, now),
    task: task.trim(),
    folder: collapsePromptHomeFolder(folderPath),
    runningSubagents: countRunningChildren(row, rows)
  }
}
