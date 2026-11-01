import { stripLeadingAgentTitleDecoration } from '../../../../shared/agent-title-decoration'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import { translate } from '@/i18n/i18n'
import { terminalTabSetName } from '../../../../shared/tab-title-resolution'

/**
 * The name its terminal tab shows: a set title (create --title, rename), the agent session's title,
 * or the live title without the agent glyph. A set title that is only the starting "Terminal N"
 * counts as none, as on the tab strip.
 */
export function promptTerminalTabName(
  tab: Pick<TerminalTab, 'title' | 'customTitle' | 'aiVaultTitle'> | undefined
): string {
  if (!tab) {
    return ''
  }
  return (
    terminalTabSetName(tab) ||
    tab.aiVaultTitle?.title.trim() ||
    stripLeadingAgentTitleDecoration(tab.title ?? '').trim()
  )
}

/** What a fresh session row is called until its first conversation names it (decision 4A). */
export function promptNewSessionLabel(): string {
  return translate('prompt.sidebarSessions.newSession', 'New Session')
}

const NUMBERED_TERMINAL_TITLE = /^terminal \d+$/i

/**
 * True when a session's tab name is only a stand-in: empty, the numbered "Terminal N" a new tab
 * starts with, or the bare program name ("Claude Code") the agent shows before any conversation.
 * A name the person set is never a stand-in, unless it is only the starting "Terminal N".
 */
export function isPromptPlaceholderSessionName(
  name: string,
  tab: Pick<TerminalTab, 'customTitle' | 'defaultTitle'>,
  agentType: string | undefined
): boolean {
  if (terminalTabSetName(tab)) {
    return false
  }
  const value = name.trim().toLowerCase()
  if (!value || NUMBERED_TERMINAL_TITLE.test(value)) {
    return true
  }
  if (tab.defaultTitle && value === tab.defaultTitle.trim().toLowerCase()) {
    return true
  }
  if (!agentType) {
    return false
  }
  const label = formatAgentTypeLabel(agentType).toLowerCase()
  return [agentType.toLowerCase(), label, `${label} code`].includes(value)
}

/** The tab's name for a session row, or '' while it is still a stand-in. */
export function promptSessionTabName(
  tab: Pick<TerminalTab, 'title' | 'customTitle' | 'aiVaultTitle' | 'defaultTitle'> | undefined,
  agentType: string | undefined
): string {
  if (!tab) {
    return ''
  }
  const name = promptTerminalTabName(tab)
  return isPromptPlaceholderSessionName(name, tab, agentType) ? '' : name
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
  const name = promptSessionTabName(agent.tab, agent.agentType)
  if (!name) {
    return leading
      ? { leadingText: leading, trailingText: trailing }
      : { leadingText: trailing, trailingText: '' }
  }
  const task = [leading, trailing].filter((text) => text && text !== name).join(' - ')
  return { leadingText: name, trailingText: task }
}

/**
 * Name on a Prompt session row: a helper keeps its task text; a session shows its tab's name, or
 * before that exists what was asked, or "New Session" until its first conversation (decision 4A).
 */
export function promptSessionRowName(
  agent: Pick<DashboardAgentRowData, 'rowSource' | 'tab' | 'agentType'>,
  leadingText: string,
  asked: boolean
): string {
  if (agent.rowSource === 'subagent') {
    return leadingText
  }
  return (
    promptSessionTabName(agent.tab, agent.agentType) ||
    (asked ? leadingText : '') ||
    promptNewSessionLabel()
  )
}
