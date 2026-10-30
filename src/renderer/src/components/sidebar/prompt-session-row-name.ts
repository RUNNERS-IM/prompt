import { stripLeadingAgentTitleDecoration } from '../../../../shared/agent-title-decoration'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'

/** The name its terminal tab shows: a set title (create --title, rename) or the live title without the agent glyph. */
export function promptTerminalTabName(
  tab: Pick<TerminalTab, 'title' | 'customTitle'> | undefined
): string {
  if (!tab) {
    return ''
  }
  return (tab.customTitle?.trim() || stripLeadingAgentTitleDecoration(tab.title ?? '').trim()) ?? ''
}

/**
 * Sidebar session row text. The lead is the tab's name so the sidebar and the tab strip say the
 * same thing; the agent's live task text trails it, and the bare agent label ("Claude") is dropped.
 */
export function promptSessionRowText(
  agent: DashboardAgentRowData,
  line: { leadingText: string; trailingText: string }
): { leadingText: string; trailingText: string } {
  // Subagent and child rows have no tab of their own, and their role label is their name; keep their text.
  if (agent.rowSource === 'subagent' || agent.childRow) {
    return line
  }
  const agentLabel = formatAgentTypeLabel(agent.agentType)
  const drop = (text: string): string => (text.trim() === agentLabel ? '' : text)
  const leading = drop(line.leadingText)
  const trailing = drop(line.trailingText)
  const name = promptTerminalTabName(agent.tab)
  if (!name) {
    return leading
      ? { leadingText: leading, trailingText: trailing }
      : { leadingText: trailing, trailingText: '' }
  }
  const task = [leading, trailing].filter((text) => text && text !== name).join(' - ')
  return { leadingText: name, trailingText: task }
}
