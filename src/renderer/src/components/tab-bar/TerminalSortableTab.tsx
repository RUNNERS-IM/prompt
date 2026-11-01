import { useMemo } from 'react'
import { useTabAgent } from '@/lib/use-tab-agent'
import { translate } from '@/i18n/i18n'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import SortableTab, { type SortableTabProps } from './SortableTab'
import { PromptClaudeModelTabBadge } from '../prompt-claude-model-menu'
import { PromptTabSessionDetails } from '../prompt-session-card/PromptSessionCard'
import { usePromptClaudeStartTab } from '../prompt-claude-start/prompt-claude-start-tabs'

type TerminalSortableTabProps = Omit<SortableTabProps, 'tab' | 'agent'> & { tab: TerminalTab }

/** A terminal pane can change agents, so its identity is inferred from live pane signals. */
export default function TerminalSortableTab(props: TerminalSortableTabProps): React.JSX.Element {
  const agent = useTabAgent(props.tab)
  // Prompt: a tab still showing the new-Claude start box reads "Claude", not its "Terminal N"
  // stand-in. Only the live title is swapped, so a set name still wins and nothing is saved.
  const showsClaudeStartBox = usePromptClaudeStartTab(props.tab.id)
  const tab = useMemo(
    () =>
      showsClaudeStartBox
        ? { ...props.tab, title: translate('prompt.claudeStart.tabTitle', 'Claude') }
        : props.tab,
    [props.tab, showsClaudeStartBox]
  )
  return (
    <SortableTab
      {...props}
      tab={tab}
      agent={showsClaudeStartBox ? (agent ?? 'claude') : agent}
      titleAccessory={<PromptClaudeModelTabBadge tabId={props.tab.id} />}
      hoverDetails={<PromptTabSessionDetails tab={props.tab} />}
    />
  )
}
