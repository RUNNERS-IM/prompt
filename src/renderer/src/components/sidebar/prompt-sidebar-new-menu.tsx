import React from 'react'
import { Layers, Plus, SquareTerminal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAppStore } from '@/store'
import { useRepoSshGate } from '@/hooks/use-repo-ssh-gate'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import type { Repo } from '../../../../shared/repo-types'
import type { Worktree } from '../../../../shared/worktree/types'
import { REPO_HEADER_ACTION_BUTTON_CLASS } from './repo-header-action-button-class'
import { getRepoHeaderCreateState } from './repo-header-create-state'
import { RepoHeaderCreateWorkspaceButton } from './worktree-list/rows/repo-header-project-actions'
import {
  handleRepoHeaderActionPointerDown,
  stopRepoHeaderKeyboardToggle,
  stopRepoHeaderMenuEvent
} from './worktree-list/rows/header-event-guards'
import {
  promptHeaderTargetWorktree,
  startPromptClaudeSession,
  startPromptTerminal
} from './prompt-sidebar-session-actions'

const EMPTY_WORKTREES: readonly Worktree[] = []

/** Hover reveal for the "+" on a workspace line, which sits inside the workspace card. */
export const PROMPT_WORKSPACE_ROW_GROUP_CLASS = 'group/prompt-workspace-row'
const WORKSPACE_ROW_BUTTON_CLASS =
  'size-5 shrink-0 rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent/70 hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 group-hover/prompt-workspace-row:opacity-100 [@media(hover:none)]:opacity-100'

/**
 * "+" on a project header or workspace line (decision 1B): a small menu with New Claude Session,
 * New Terminal and, on a project header, New Workspace…. Shortcut labels match the tab strip's.
 */
export const PromptNewSessionMenuButton = React.memo(function PromptNewSessionMenuButton({
  worktreeId,
  label,
  onNewWorkspace,
  buttonClassName = WORKSPACE_ROW_BUTTON_CLASS
}: {
  /** Workspace the new session or terminal opens in; none for a project with no workspace. */
  worktreeId: string | undefined
  label: string
  /** Project header only: the old "create workspace" as the menu's last item. */
  onNewWorkspace?: () => void
  buttonClassName?: string
}): React.JSX.Element {
  useUiLanguageRevision()
  const agentShortcut = useOptionalShortcutLabel('tab.newAgent')
  const terminalShortcut = useOptionalShortcutLabel('tab.newTerminal')
  const workspaceShortcut = useOptionalShortcutLabel('workspace.create')
  const buttonLabel = translate('prompt.sidebarSessions.newIn', 'New in {{name}}', { name: label })
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className={buttonClassName}
              data-repo-header-action=""
              data-prompt-new-menu=""
              aria-label={buttonLabel}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={stopRepoHeaderKeyboardToggle}
              onPointerDown={handleRepoHeaderActionPointerDown}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <Plus className="size-3" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {buttonLabel}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        className="min-w-48"
        // Radix portals still bubble React events into the row; keep them off its click/drag.
        onPointerDown={stopRepoHeaderMenuEvent}
        onMouseDown={stopRepoHeaderMenuEvent}
        onPointerUp={stopRepoHeaderMenuEvent}
        onMouseUp={stopRepoHeaderMenuEvent}
        onClick={stopRepoHeaderMenuEvent}
        onKeyDown={stopRepoHeaderMenuEvent}
      >
        <DropdownMenuItem
          disabled={!worktreeId}
          onSelect={() => worktreeId && startPromptClaudeSession(worktreeId)}
        >
          <Plus className="size-3.5" />
          {translate('prompt.sidebarSessions.newClaudeSession', 'New Claude Session')}
          {agentShortcut ? <DropdownMenuShortcut>{agentShortcut}</DropdownMenuShortcut> : null}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={!worktreeId}
          onSelect={() => worktreeId && startPromptTerminal(worktreeId)}
        >
          <SquareTerminal className="size-3.5" />
          {translate('prompt.sidebarSessions.newTerminal', 'New Terminal')}
          {terminalShortcut ? (
            <DropdownMenuShortcut>{terminalShortcut}</DropdownMenuShortcut>
          ) : null}
        </DropdownMenuItem>
        {onNewWorkspace ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onNewWorkspace}>
              <Layers className="size-3.5" />
              {translate('prompt.sidebarSessions.newWorkspace', 'New Workspace…')}
              {workspaceShortcut ? (
                <DropdownMenuShortcut>{workspaceShortcut}</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
})

/**
 * Project header "+" (decision 1B). It used to create a workspace straight away; now it opens the
 * menu, whose sessions open in the project's main workspace and whose last item is the old
 * "create workspace". While an SSH target is offline the old blocked "+" stays, reason and all.
 */
export const PromptRepoHeaderNewButton = React.memo(function PromptRepoHeaderNewButton({
  repo,
  label,
  pinHost = false,
  onCreateForRepo
}: {
  repo: Repo
  label: string
  pinHost?: boolean
  onCreateForRepo: (repo: Repo, options: { pinHost: boolean }) => void
}): React.JSX.Element {
  const worktrees = useAppStore((s) => s.worktreesByRepo?.[repo.id] ?? EMPTY_WORKTREES)
  const target = promptHeaderTargetWorktree(worktrees)
  const sshGate = useRepoSshGate(repo)
  const createState = getRepoHeaderCreateState({ repo, label, sshGate })
  if (createState?.disabled) {
    // An offline SSH target can start neither a session nor a workspace: keep the old blocked "+".
    return (
      <RepoHeaderCreateWorkspaceButton
        repo={repo}
        label={label}
        pinHost={pinHost}
        onCreateForRepo={onCreateForRepo}
      />
    )
  }
  return (
    <PromptNewSessionMenuButton
      worktreeId={target?.id}
      label={label}
      buttonClassName={REPO_HEADER_ACTION_BUTTON_CLASS}
      onNewWorkspace={() => onCreateForRepo(repo, { pinHost })}
    />
  )
})
