import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { agentStateLabel, type AgentDotState } from '@/components/AgentStateDot'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import { agentRowToolInput, formatAgentToolPreview } from '@/lib/agent-row-tool-preview'
import { translate } from '@/i18n/i18n'

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
 * Prompt sidebar second line: what the session is doing now, in the UI language.
 * `secondary` is the row's existing status text (attention, verdict, stopping, tool, message…);
 * tool lines, the monitoring label and a finished turn are rewritten, anything else is kept.
 */
export function promptSessionStatusLine(
  agent: DashboardAgentRowData,
  dotState: AgentDotState,
  secondary: string
): string {
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
