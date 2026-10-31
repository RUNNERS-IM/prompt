import React, { useCallback, useMemo } from 'react'
import { SquareTerminal } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
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
  type PromptSessionDragSection
} from './prompt-session-row-drag'

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
  // A tab launched as an agent is a session: "New Session" until its first conversation names it.
  const name = tab.launchAgent
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
        <SquareTerminal className="size-3 shrink-0" strokeWidth={1.5} />
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </div>
    </PromptSessionRowMenu>
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

  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-prompt-session-rows="">
      {hasSiblingWorktrees ? (
        <div
          className={cn(
            'flex h-6 min-w-0 items-center gap-1.5 px-1 text-[12px] text-foreground/85',
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
