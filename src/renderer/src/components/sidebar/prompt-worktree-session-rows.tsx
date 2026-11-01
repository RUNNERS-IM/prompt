import React, { useCallback, useMemo } from 'react'
import { SquareTerminal } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import { AgentIcon } from '@/lib/agent-catalog'
import { cn } from '@/lib/utils'
import { translate } from '@/i18n/i18n'
import { activateAndRevealWorktree } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import type { TerminalTab } from '../../../../shared/terminal-tab-types'
import type { Tab, TabGroup } from '../../../../shared/tab-types'
import WorktreeCardAgents from './WorktreeCardAgents'
import { useWorktreeAgentRows } from './useWorktreeAgentRows'
import {
  promptNewSessionLabel,
  promptSessionTabName,
  promptTerminalTabName
} from './prompt-session-row-name'
import { PromptSessionRowMenu } from './prompt-session-row-menu'
import { PromptSessionRowRename, usePromptSessionRowRename } from './prompt-session-row-rename'
import {
  PROMPT_WORKSPACE_ROW_GROUP_CLASS,
  PromptNewSessionMenuButton
} from './prompt-sidebar-new-menu'
import type { WorktreeCardController } from './use-worktree-card-controller'
import { PromptWorkspaceIdentity } from './prompt-workspace-identity'
import { buildPromptSessionItems, buildPromptSessionTabSlots } from './prompt-session-row-order'
import {
  PromptSessionDragItem,
  PromptSessionDragList,
  type PromptSessionDragPane,
  type PromptSessionDragSection
} from './prompt-session-row-drag'
import { usePromptClaudeStartTab } from '../prompt-claude-start/prompt-claude-start-tabs'

const EMPTY_TABS: readonly TerminalTab[] = []
const EMPTY_GROUPS: readonly TabGroup[] = []
const EMPTY_UNIFIED_TABS: readonly Tab[] = []

const ROW_CLASS =
  'compact-agent-row min-w-0 cursor-pointer rounded-sm px-1 text-[11px] leading-none text-muted-foreground worktree-agent-row-hover flex h-6 items-center gap-1 group-hover/prompt-session-row:pr-5'

function PromptTerminalRow({
  worktreeId,
  tab
}: {
  worktreeId: string
  tab: TerminalTab
}): React.JSX.Element {
  const focused = useAppStore(
    (s) => s.activeWorktreeId === worktreeId && s.activeTabIdByWorktree?.[worktreeId] === tab.id
  )
  // A tab still showing the new-Claude start box is a Claude session that has not started yet.
  const showsClaudeStartBox = usePromptClaudeStartTab(tab.id)
  // A tab launched as an agent is a session: "New Session" until its first conversation names it.
  const name = showsClaudeStartBox
    ? promptSessionTabName(tab, 'claude') ||
      translate('prompt.sidebarSessions.newClaudeSession', 'New Claude Session')
    : tab.launchAgent
      ? promptSessionTabName(tab, tab.launchAgent) || promptNewSessionLabel()
      : promptTerminalTabName(tab) || translate('prompt.sidebar.terminal', 'Terminal')
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
    <PromptSessionRowMenu tab={tab} name={name}>
      <div
        className={cn(ROW_CLASS, focused && 'bg-worktree-sidebar-accent text-foreground')}
        onClick={activate}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        title={name}
        data-prompt-terminal-row=""
        data-prompt-row-current={focused ? 'true' : undefined}
      >
        {showsClaudeStartBox ? (
          <span className="inline-flex size-3 shrink-0 items-center justify-center" aria-hidden>
            <AgentIcon agent="claude" size={12} />
          </span>
        ) : (
          <SquareTerminal className="size-3 shrink-0" strokeWidth={1.5} />
        )}
        <PromptTerminalRowName name={name} />
      </div>
    </PromptSessionRowMenu>
  )
}

/** The row's name, or its rename box while one is open (the menu's context sits above this). */
function PromptTerminalRowName({ name }: { name: string }): React.JSX.Element {
  const rename = usePromptSessionRowRename()
  return rename ? (
    <PromptSessionRowRename {...rename} />
  ) : (
    <span className="min-w-0 flex-1 truncate">{name}</span>
  )
}

/**
 * Prompt two-level sidebar: under a project header only session rows show — agent rows (named like
 * their tab) and plain terminals. A one-workspace project shows its branch, connection dot and
 * "Default" chip on the project header; with several workspaces each gets one line (name, then
 * those same marks) above its sessions.
 */
export function PromptWorktreeSessionRows({
  card
}: {
  card: WorktreeCardController
}): React.JSX.Element {
  const { worktree, repo } = card
  const hasSiblingWorktrees = useAppStore((s) =>
    repo ? (s.worktreesByRepo?.[repo.id]?.length ?? 0) > 1 : false
  )
  const agents = useWorktreeAgentRows(worktree.id, true)
  const tabs = useAppStore(useShallow((s) => s.tabsByWorktree?.[worktree.id] ?? EMPTY_TABS))
  const groups = useAppStore((s) => s.groupsByWorktree?.[worktree.id] ?? EMPTY_GROUPS)
  const unifiedTabs = useAppStore(
    (s) => s.unifiedTabsByWorktree?.[worktree.id] ?? EMPTY_UNIFIED_TABS
  )
  // One item per tab, in the tab bar's order (not the agents' start time), so the sidebar and the
  // tab strip read the same way and a drag here reorders both.
  const { items, orderedTabIds, sections } = useMemo(() => {
    const ordered = buildPromptSessionItems({
      agents,
      terminals: tabs,
      slots: buildPromptSessionTabSlots(groups, unifiedTabs)
    })
    const grouped: PromptSessionDragSection[] = []
    for (const item of ordered) {
      const last = grouped.at(-1)
      if (last && last.groupKey === item.groupKey) {
        last.tabIds.push(item.tabId)
      } else {
        grouped.push({ groupKey: item.groupKey, tabIds: [item.tabId] })
      }
    }
    return {
      items: new Map(ordered.map((item) => [item.tabId, item])),
      orderedTabIds: ordered.map((item) => item.tabId),
      sections: grouped
    }
  }, [agents, tabs, groups, unifiedTabs])
  // The tab's own conversation panes (not helpers drawn under it); a drop on another workspace copies one.
  const panesOfTab = useCallback(
    (tabId: string): PromptSessionDragPane[] | null => {
      const rows = items.get(tabId)?.agents
      if (!rows) {
        return null
      }
      return rows
        .filter((row) => row.tab.id === tabId && !row.childRow && row.rowSource !== 'subagent')
        .map((row) => ({ paneKey: row.paneKey, agentType: row.agentType }))
    },
    [items]
  )

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-0.5 rounded-sm',
        // Lit while a session row dragged from another workspace would be copied here.
        'data-[prompt-session-drop-target=true]:bg-worktree-sidebar-accent/60 data-[prompt-session-drop-target=true]:ring-1 data-[prompt-session-drop-target=true]:ring-inset data-[prompt-session-drop-target=true]:ring-worktree-sidebar-ring/60'
      )}
      data-prompt-session-rows=""
      // Read by the drop lookup (PROMPT_SESSION_DROP_WORKTREE_ATTR).
      data-prompt-session-drop-worktree={worktree.id}
    >
      {hasSiblingWorktrees ? (
        <div
          className={cn(
            // The workspace line is the card's drag handle (sessions below it stop that drag).
            'flex h-6 min-w-0 cursor-grab items-center gap-1.5 px-1 text-[12px] text-foreground/85 active:cursor-grabbing',
            PROMPT_WORKSPACE_ROW_GROUP_CLASS
          )}
          data-prompt-workspace-row=""
        >
          <span className="min-w-0 truncate font-medium" title={worktree.displayName}>
            {worktree.displayName}
          </span>
          <PromptWorkspaceIdentity worktree={worktree} repo={repo ?? undefined} />
          {/* Same "+" menu as the project header, aimed at this workspace (decision 1B). */}
          <span className="ml-auto inline-flex">
            <PromptNewSessionMenuButton worktreeId={worktree.id} label={worktree.displayName} />
          </span>
        </div>
      ) : null}
      <PromptSessionDragList
        worktreeId={worktree.id}
        orderedTabIds={orderedTabIds}
        sections={sections}
        panesOfTab={panesOfTab}
      >
        {(section) =>
          section.tabIds.map((tabId) => {
            const item = items.get(tabId)
            if (!item) {
              return null
            }
            return (
              <PromptSessionDragItem key={tabId} tabId={tabId} groupKey={item.groupKey}>
                {item.agents ? (
                  <WorktreeCardAgents
                    worktreeId={worktree.id}
                    agents={item.agents}
                    expandAll
                    className="mt-0"
                  />
                ) : item.terminal ? (
                  <PromptTerminalRow worktreeId={worktree.id} tab={item.terminal} />
                ) : null}
              </PromptSessionDragItem>
            )
          })
        }
      </PromptSessionDragList>
      {orderedTabIds.length === 0 ? (
        // An empty workspace still needs a way in: the click reaches the card, which opens the workspace.
        <div className={cn(ROW_CLASS, 'text-muted-foreground/60')} data-prompt-terminal-row="empty">
          <SquareTerminal className="size-3 shrink-0" strokeWidth={1.5} />
          <span className="min-w-0 flex-1 truncate">
            {translate('prompt.sidebar.openWorkspace', 'Open a terminal')}
          </span>
        </div>
      ) : null}
    </div>
  )
}
