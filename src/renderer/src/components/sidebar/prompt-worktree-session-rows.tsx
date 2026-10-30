import React, { useCallback, useMemo } from 'react'
import { SquareTerminal } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import WorktreeCardAgents from './WorktreeCardAgents'
import { useWorktreeAgentRows } from './useWorktreeAgentRows'
import { promptTerminalTabName } from './prompt-session-row-name'
import type { WorktreeCardController } from './use-worktree-card-controller'

const EMPTY_TABS: readonly TerminalTab[] = []

const ROW_CLASS =
  'compact-agent-row min-w-0 cursor-pointer rounded-sm px-1 text-[11px] leading-none text-muted-foreground worktree-agent-row-hover flex h-6 items-center gap-1'

function BranchLabel({ label }: { label: string | undefined }): React.JSX.Element | null {
  return label ? (
    <span
      className="min-w-0 max-w-20 shrink-[2] truncate text-[10px] text-muted-foreground/50"
      title={label}
    >
      {label}
    </span>
  ) : null
}

function PromptTerminalRow({
  worktreeId,
  tab,
  branchLabel
}: {
  worktreeId: string
  tab: TerminalTab
  branchLabel: string | undefined
}): React.JSX.Element {
  const focused = useAppStore(
    (s) => s.activeWorktreeId === worktreeId && s.activeTabIdByWorktree?.[worktreeId] === tab.id
  )
  const name = promptTerminalTabName(tab) || translate('prompt.sidebar.terminal', 'Terminal')
  const activate = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation()
      activateAndRevealWorktree(worktreeId)
      const leafId = useAppStore.getState().terminalLayoutsByTabId?.[tab.id]?.activeLeafId ?? null
      activateTabAndFocusPane(tab.id, leafId)
    },
    [tab.id, worktreeId]
  )
  return (
    <div
      className={cn(ROW_CLASS, focused && 'bg-worktree-sidebar-accent text-foreground')}
      onClick={activate}
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      title={name}
      data-prompt-terminal-row=""
      data-prompt-row-current={focused ? 'true' : undefined}
    >
      <SquareTerminal className="size-3 shrink-0" strokeWidth={1.5} />
      <span className="min-w-0 flex-1 truncate">{name}</span>
      <BranchLabel label={branchLabel} />
    </div>
  )
}

/**
 * Prompt two-level sidebar: under a project header only session rows show — agent rows (named like
 * their tab) and plain terminals. The workspace title row, branch/path line and "N agents" row are gone.
 */
export function PromptWorktreeSessionRows({
  card
}: {
  card: WorktreeCardController
}): React.JSX.Element {
  const { worktree, repo, branchIdentityDisplay } = card
  const hasSiblingWorktrees = useAppStore((s) =>
    repo ? (s.worktreesByRepo?.[repo.id]?.length ?? 0) > 1 : false
  )
  const branchLabel = hasSiblingWorktrees
    ? branchIdentityDisplay || worktree.displayName
    : undefined
  const agents = useWorktreeAgentRows(worktree.id, true)
  const tabs = useAppStore(useShallow((s) => s.tabsByWorktree?.[worktree.id] ?? EMPTY_TABS))
  const plainTabs = useMemo(() => {
    const agentTabIds = new Set(agents.map((agent) => agent.tab.id))
    return tabs.filter((tab) => !agentTabIds.has(tab.id))
  }, [agents, tabs])

  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-prompt-session-rows="">
      <WorktreeCardAgents
        worktreeId={worktree.id}
        agents={agents}
        expandAll
        trailingLabel={branchLabel}
        className="mt-0"
      />
      {plainTabs.map((tab) => (
        <PromptTerminalRow
          key={tab.id}
          worktreeId={worktree.id}
          tab={tab}
          branchLabel={branchLabel}
        />
      ))}
      {agents.length === 0 && plainTabs.length === 0 ? (
        // An empty workspace still needs a way in: the click reaches the card, which opens the workspace.
        <div className={cn(ROW_CLASS, 'text-muted-foreground/60')} data-prompt-terminal-row="empty">
          <SquareTerminal className="size-3 shrink-0" strokeWidth={1.5} />
          <span className="min-w-0 flex-1 truncate">
            {translate('prompt.sidebar.openWorkspace', 'Open a terminal')}
          </span>
          <BranchLabel label={branchLabel} />
        </div>
      ) : null}
    </div>
  )
}
