import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { agentStateLabel, type AgentDotState } from '@/components/AgentStateDot'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import { agentRowToolInput, formatAgentToolPreview } from '@/lib/agent-row-tool-preview'
import { translate } from '@/i18n/i18n'
import { agentStatusEvidenceObservedAt } from '../../../../shared/agent-status-freshness'

/** What the tool is doing, in plain words ("Running a command"), keyed by Claude Code tool name. */
function toolActivityLabel(toolName: string): string {
  switch (toolName) {
    case 'Bash':
    case 'BashOutput':
    case 'KillShell':
      return translate('prompt.sessionRow.tool.command', 'Running a command')
    case 'Read':
    case 'NotebookRead':
      return translate('prompt.sessionRow.tool.read', 'Reading a file')
    case 'Edit':
    case 'MultiEdit':
    case 'Write':
    case 'NotebookEdit':
      return translate('prompt.sessionRow.tool.edit', 'Editing a file')
    case 'Grep':
    case 'Glob':
    case 'LS':
      return translate('prompt.sessionRow.tool.search', 'Searching files')
    case 'WebFetch':
    case 'WebSearch':
      return translate('prompt.sessionRow.tool.web', 'Looking on the web')
    case 'Task':
    case 'Agent':
      return translate('prompt.sessionRow.tool.helper', 'Handing work to a helper')
    case 'TodoWrite':
      return translate('prompt.sessionRow.tool.plan', 'Updating its plan')
    default:
      return translate('prompt.sessionRow.tool.other', 'Using {{tool}}', { tool: toolName })
  }
}

/**
 * A session that said it was working and then went quiet past the stale threshold (row state
 * "unverifiable"): name how long it has been silent and that it may be stuck, since silence alone
 * cannot tell a hung session from one running a long command.
 */
export function promptNoUpdateLine(
  entry: Parameters<typeof agentStatusEvidenceObservedAt>[0],
  now: number
): string {
  const minutes = Math.max(0, Math.floor((now - agentStatusEvidenceObservedAt(entry)) / 60_000))
  if (minutes < 60) {
    return translate(
      'prompt.sessionRow.noUpdateMinutes',
      'No update for {{count}} min · may be stuck',
      {
        count: minutes
      }
    )
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return translate(
      'prompt.sessionRow.noUpdateHours',
      'No update for {{count}} h · may be stuck',
      {
        count: hours
      }
    )
  }
  return translate('prompt.sessionRow.noUpdateDays', 'No update for {{count}} d · may be stuck', {
    count: Math.floor(hours / 24)
  })
}

/**
 * Prompt sidebar second line: what the session is doing now, in the UI language.
 * `secondary` is the row's existing status text (attention, verdict, stopping, tool, message…);
 * tool lines, the monitoring label and a finished turn are rewritten, anything else is kept.
 */
export function promptSessionStatusLine(
  agent: DashboardAgentRowData,
  dotState: AgentDotState,
  secondary: string,
  now: number = Date.now()
): string {
  if (agent.state === 'unverifiable') {
    return promptNoUpdateLine(agent.entry, now)
  }
  const toolPreview = formatAgentToolPreview(agent.entry, agent.state)
  const toolName = agent.entry.toolName?.trim() ?? ''
  if (toolPreview && secondary === toolPreview && toolName) {
    const input = agentRowToolInput(agent.entry, agent.state)
    const activity = toolActivityLabel(toolName)
    return input ? `${activity} · ${input}` : activity
  }
  if (dotState === 'monitoring' && secondary === agentStateLabel('monitoring')) {
    return translate('prompt.sessionRow.monitoring', 'Watching background tasks')
  }
  const lastMessage = agent.entry.lastAssistantMessage?.trim() ?? ''
  const agentLabel = formatAgentTypeLabel(agent.agentType)
  const isPlainFallback = !secondary || secondary === lastMessage || secondary === agentLabel
  if (dotState === 'done' && isPlainFallback) {
    return translate('prompt.sessionRow.done', 'Done · waiting for you')
  }
  if (dotState === 'working' && (!secondary || secondary === agentLabel)) {
    return agentStateLabel('working')
  }
  return secondary === agentLabel ? '' : secondary
}
