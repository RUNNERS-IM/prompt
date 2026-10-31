import type React from 'react'
import * as TooltipPrimitive from 'radix-ui/tooltip'
import { useAppStore } from '@/store'
import { useNow } from '@/hooks/use-now'
import { translate } from '@/i18n/i18n'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import { AgentTypeIcon } from '@/lib/agent-type-icon'
import { findWorktreeById } from '@/store/slices/worktree-helpers'
import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import { TabHoverCard } from '@/components/tab-bar/TabHoverCard'
import { TAB_TOOLTIP_DELAY_MS } from '@/components/tab-bar/TabStripTooltipProvider'
import { useWorktreeAgentRows } from '@/components/sidebar/useWorktreeAgentRows'
import { getCompactAgentSecondary } from '@/components/sidebar/worktree-card-compact-agent-row'
import { promptTerminalTabName } from '@/components/sidebar/prompt-session-row-name'
import { isTerminalLeafId, makePaneKey } from '../../../../shared/stable-pane-id'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import {
  buildPromptSessionSummary,
  type PromptSessionSummary
} from './prompt-session-summary-model'

/** Label and value lines under the hover card's program row; empty values are left out. */
export function PromptSessionSummaryRows({
  summary
}: {
  summary: PromptSessionSummary
}): React.JSX.Element {
  const lines: [string, string][] = [
    [translate('prompt.sessionCard.model', 'Model'), summary.model],
    [translate('prompt.sessionCard.status', 'Status'), summary.status],
    [translate('prompt.sessionCard.task', 'Task'), summary.task],
    [translate('prompt.sessionCard.folder', 'Folder'), summary.folder],
    [
      translate('prompt.sessionCard.subagents', 'Subagents'),
      summary.runningSubagents > 0
        ? translate('prompt.sessionCard.subagentsRunning', '{{count}} running', {
            count: summary.runningSubagents
          })
        : ''
    ]
  ]
  return (
    <dl
      className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1"
      data-prompt-session-summary=""
    >
      {lines
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="line-clamp-3 break-words">{value}</dd>
          </div>
        ))}
    </dl>
  )
}

/** Task line exactly as the sidebar row shows it, minus a bare agent label such as "Claude". */
function rowTaskText(row: DashboardAgentRow, now: number): string {
  const text = getCompactAgentSecondary(row, now)
  return text === formatAgentTypeLabel(row.agentType) ? '' : text
}

/** Mounted only while a card is open, so its store reads and clock cost nothing otherwise. */
function PromptSessionDetails({
  worktreeId,
  pick
}: {
  worktreeId: string
  pick: (rows: DashboardAgentRow[]) => DashboardAgentRow | undefined
}): React.JSX.Element | null {
  const rows = useWorktreeAgentRows(worktreeId)
  const folderPath = useAppStore((s) => findWorktreeById(s.worktreesByRepo ?? {}, worktreeId)?.path)
  const now = useNow(30_000)
  const row = pick(rows)
  if (!row) {
    return null
  }
  const summary = buildPromptSessionSummary({
    row,
    rows,
    task: rowTaskText(row, now),
    folderPath,
    now
  })
  return <PromptSessionSummaryRows summary={summary} />
}

/** Tab card: the summary of the agent in the tab's focused pane, or nothing for a plain shell. */
export function PromptTabSessionDetails({ tab }: { tab: TerminalTab }): React.JSX.Element {
  const paneKey = useAppStore((s) => {
    const leafId = s.terminalLayoutsByTabId?.[tab.id]?.activeLeafId
    return leafId && isTerminalLeafId(leafId) ? makePaneKey(tab.id, leafId) : null
  })
  return (
    <PromptSessionDetails
      worktreeId={tab.worktreeId}
      pick={(rows) => pickTabSessionRow(rows, tab.id, paneKey)}
    />
  )
}

export function pickTabSessionRow(
  rows: DashboardAgentRow[],
  tabId: string,
  paneKey: string | null
): DashboardAgentRow | undefined {
  const own = rows.filter((row) => row.tab.id === tabId && isSessionRow(row))
  return own.find((row) => row.paneKey === paneKey) ?? own[0]
}

/** Session rows get the card; subagent and child rows are parts of a session and keep their own tooltips. */
export function isSessionRow(row: DashboardAgentRow): boolean {
  return row.rowSource !== 'subagent' && !row.childRow
}

/** Wraps a sidebar session row so hovering it opens the same card a tab shows. */
export function withPromptSessionHoverCard<P extends { agent: DashboardAgentRow }>(
  Row: React.ComponentType<P>
): React.ComponentType<P> {
  return function PromptSessionHoverCardRow(props: P): React.JSX.Element {
    const { agent } = props
    if (!isSessionRow(agent)) {
      return <Row {...props} />
    }
    const programName = formatAgentTypeLabel(agent.agentType)
    // Own provider so the card works wherever rows render, with the same dwell time as a tab's card.
    return (
      <TooltipPrimitive.Provider delayDuration={TAB_TOOLTIP_DELAY_MS} skipDelayDuration={0}>
        <TabHoverCard
          title={promptTerminalTabName(agent.tab) || programName}
          icon={<AgentTypeIcon agentType={agent.agentType} size={14} />}
          programName={programName}
          side="right"
          closeOnMenuOpen
          details={
            <PromptSessionDetails
              worktreeId={agent.tab.worktreeId}
              pick={(rows) => rows.find((row) => row.paneKey === agent.paneKey) ?? agent}
            />
          }
        >
          <div className="min-w-0" data-prompt-session-card-trigger="">
            <Row {...props} />
          </div>
        </TabHoverCard>
      </TooltipPrimitive.Provider>
    )
  }
}
