import type React from 'react'
import type { AgentDotState } from '@/components/AgentStateDot'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { AgentTypeIcon } from '@/lib/agent-type-icon'
import { formatAgentTypeLabel } from '@/lib/agent-status'
import { cn } from '@/lib/utils'
import CacheTimer, { type usePromptCacheCountdownForPane } from './CacheTimer'
import { promptSessionRowName } from './prompt-session-row-name'
import { promptSessionStatusLine } from './prompt-session-status-line'
import { PromptHelperPill } from './prompt-helper-pill'
import { PromptSessionStateIcon } from './PromptSessionStateIcon'
import { PromptSessionRowRename, usePromptSessionRowRename } from './prompt-session-row-rename'

type PromptCompactAgentRowBodyProps = {
  agent: DashboardAgentRowData
  now: number
  dotState: AgentDotState
  leadingText: string
  asked: boolean
  secondary: string
  highlighted: boolean
  hideIcon: boolean
  leadClassName: string
  model: string
  trailingLabel?: string
  sendTargetDisabledReason?: string
  hasChildDisclosure: boolean
  childAgentCount?: number
  childAgentsExpanded: boolean
  onToggleChildAgents?: () => void
  cacheTimer: ReturnType<typeof usePromptCacheCountdownForPane>
  timestamp: React.ReactNode
}

/** Prompt sidebar session row: name with time on line one, what it is doing on a smaller line two. */
export function PromptCompactAgentRowBody({
  agent,
  now,
  dotState,
  leadingText,
  asked,
  secondary,
  highlighted,
  hideIcon,
  leadClassName,
  model,
  trailingLabel,
  sendTargetDisabledReason,
  hasChildDisclosure,
  childAgentCount,
  childAgentsExpanded,
  onToggleChildAgents,
  cacheTimer,
  timestamp
}: PromptCompactAgentRowBodyProps): React.JSX.Element {
  // Only a Prompt session row sits under a menu that sets this (withPromptSessionRowMenu).
  const rename = usePromptSessionRowRename()
  const promptName = promptSessionRowName(agent, leadingText, asked)
  const promptStatus = promptSessionStatusLine(agent, dotState, secondary, now)
  const dimText = highlighted ? 'text-foreground/70' : 'text-muted-foreground/65'

  return (
    <>
      <div className="flex h-5 min-w-0 items-center gap-1">
        {/* Show the actionable disabled reason over every hit area. */}
        <PromptSessionStateIcon
          state={dotState}
          title={sendTargetDisabledReason ? null : undefined}
          animationKey={agent.paneKey}
        />
        {/* Prompt: every row is Claude by default, so only other agents get an identity mark. */}
        {!hideIcon && agent.agentType !== 'claude' && (
          <span className="inline-flex shrink-0" title={formatAgentTypeLabel(agent.agentType)}>
            <AgentTypeIcon agentType={agent.agentType} size={13} />
          </span>
        )}
        {rename ? (
          <PromptSessionRowRename {...rename} />
        ) : (
          <span
            className={cn('min-w-0 flex-1 truncate', leadClassName)}
            title={sendTargetDisabledReason ? undefined : promptName}
            data-prompt-session-name=""
          >
            {promptName}
          </span>
        )}
        {/* While renaming, the box takes the rest of the line; the status icon and second line stay. */}
        {model && !rename && (
          <span
            className={cn('min-w-0 max-w-24 truncate font-mono text-[10px]', dimText)}
            title={model}
          >
            {model}
          </span>
        )}
        {trailingLabel && !rename ? (
          <span
            className="min-w-0 max-w-20 shrink-[2] truncate text-[10px] text-muted-foreground/50"
            title={trailingLabel}
          >
            {trailingLabel}
          </span>
        ) : null}
        {hasChildDisclosure && !rename ? (
          <PromptHelperPill
            count={childAgentCount ?? 0}
            expanded={childAgentsExpanded}
            onToggle={onToggleChildAgents ?? (() => {})}
          />
        ) : null}
        {cacheTimer && !rename && (
          <CacheTimer startedAt={cacheTimer.startedAt} ttlMs={cacheTimer.ttlMs} />
        )}
        {rename ? null : timestamp}
      </div>
      {promptStatus ? (
        <div
          className={cn(
            'min-w-0 truncate pl-[17px] text-[10px] leading-4',
            // A session silent past the stale threshold may be stuck; set it apart from routine status.
            agent.state === 'unverifiable' ? 'text-status-warning-text' : dimText
          )}
          title={sendTargetDisabledReason ? undefined : promptStatus}
          data-prompt-session-status=""
        >
          {promptStatus}
        </div>
      ) : null}
    </>
  )
}
