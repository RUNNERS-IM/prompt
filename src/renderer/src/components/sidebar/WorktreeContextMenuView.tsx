import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Copy, Pencil, Pin, PinOff, Trash2, Unlink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorktreeRowOpenInSubMenu } from './WorktreeRowOpenInSubMenu'
import { WorktreeDeveloperMenu } from './WorktreeDeveloperMenu'
import { WorkspaceSleepMenuItems } from './WorkspaceSleepMenuItems'
import { isEventTargetInsideCurrentTarget } from './worktree-card-dom-events'
import { translate } from '@/i18n/i18n'
import { useOptionalShortcutLabel } from '@/hooks/useShortcutLabel'
import type { WorktreeContextMenuModel } from './use-worktree-context-menu-model'
import { WorktreeStatusMenuItems } from './WorktreeStatusMenuItems'
import { WorktreeContextMenuOverlays } from './WorktreeContextMenuOverlays'
import { WorktreeContextMenuOrganizeItems } from './WorktreeContextMenuOrganizeItems'
import {
  WORKTREE_CONTEXT_MENU_SCOPE_ATTR,
  isSessionRowContextMenuTarget,
  shouldIgnoreNestedWorktreeContextMenuScope,
  shouldRevealWorktreeDeveloperMenu,
  shouldUseNativeContextMenu
} from './worktree-context-menu-policy'
import { CLOSE_ALL_CONTEXT_MENUS_EVENT } from '@/lib/close-all-context-menus'
import {
  EMPTY_PROMPT_CONTEXT_MENU_TARGET,
  PromptContextMenuLeadItems,
  PROMPT_PROJECT_MENU_BASICS_ONLY,
  promptContextMenuTargetFromEvent
} from './prompt-context-menu-lead'

export default function WorktreeContextMenuView({ model }: { model: WorktreeContextMenuModel }) {
  const {
    batchDeleteWorktrees,
    children,
    contentClassName,
    contextDeletePending,
    contextMenuOpenedAtRef,
    contextWorkspaceStatus,
    deleteLabel,
    deletingContext,
    deletingSubtree,
    developerMenuRevealed,
    effectiveSelectedWorktrees,
    folderWorkspaceId,
    handleAssignWorkspaceStatus,
    handleCloseAutoFocus,
    handleCloseTerminals,
    handleCopyName,
    handleCopyPath,
    handleDelete,
    handleRemoveParentLink,
    handleRename,
    handleSleepSubtree,
    handleTogglePin,
    hasAnyContextLineage,
    isDeleting,
    isMultiContext,
    lineageDescendantCount,
    menuOpen,
    menuPoint,
    onContextMenuSelect,
    removesProject,
    repo,
    scopeRef,
    setContextWorktrees,
    setDeveloperMenuRevealed,
    setMenuOpenState,
    setMenuPoint,
    sleepLabel,
    sleepableWorktrees,
    subtreeSleepableWorktrees,
    suppressOpeningPointerEvent,
    worktree,
    workspaceStatuses
  } = model
  const deleteShortcut = useOptionalShortcutLabel('workspace.delete')
  // Right-click on a live Claude row keeps this menu and adds "Model ▸" first (decision 3A).
  const [promptMenuTarget, setPromptMenuTarget] = useState(EMPTY_PROMPT_CONTEXT_MENU_TARGET)
  // A right-click on a session row never offers removing the whole project (decision 1B).
  const [openedOnSessionRow, setOpenedOnSessionRow] = useState(false)
  const offersProjectRemoval = removesProject && !openedOnSessionRow
  return (
    <div
      ref={scopeRef}
      className="relative"
      {...{ [WORKTREE_CONTEXT_MENU_SCOPE_ATTR]: 'worktree' }}
      onContextMenuCapture={(event) => {
        if (!isEventTargetInsideCurrentTarget(event.currentTarget, event.target)) {
          return
        }
        if (shouldUseNativeContextMenu(event.target)) {
          return
        }
        if (shouldIgnoreNestedWorktreeContextMenuScope(event.currentTarget, event.target)) {
          return
        }
        event.preventDefault()
        contextMenuOpenedAtRef.current = Date.now()
        window.dispatchEvent(new Event(CLOSE_ALL_CONTEXT_MENUS_EVENT))
        setDeveloperMenuRevealed(event.altKey)
        setPromptMenuTarget(promptContextMenuTargetFromEvent(event.target))
        setOpenedOnSessionRow(isSessionRowContextMenuTarget(event.target))
        setContextWorktrees(onContextMenuSelect?.(event) ?? effectiveSelectedWorktrees)
        const bounds = event.currentTarget.getBoundingClientRect()
        setMenuPoint({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top
        })
        setMenuOpenState(true)
      }}
      onClickCapture={(event) => {
        suppressOpeningPointerEvent(event)
      }}
    >
      {children}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpenState} modal={false}>
        <DropdownMenuTrigger asChild>
          <button
            aria-hidden
            tabIndex={-1}
            className="pointer-events-none absolute size-px opacity-0"
            style={{ left: menuPoint.x, top: menuPoint.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          className={cn(lineageDescendantCount > 0 ? 'min-w-60' : 'min-w-52', contentClassName)}
          sideOffset={0}
          align="start"
          onPointerUpCapture={suppressOpeningPointerEvent}
          onPointerDownCapture={(event) => {
            if (event.button === 0) {
              contextMenuOpenedAtRef.current = null
            }
          }}
          onMouseUpCapture={suppressOpeningPointerEvent}
          onClickCapture={suppressOpeningPointerEvent}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <PromptContextMenuLeadItems target={promptMenuTarget} />
          {PROMPT_PROJECT_MENU_BASICS_ONLY ? null : (
            <DropdownMenuLabel>
              {translate(
                'auto.components.sidebar.WorktreeContextMenu.workspaceSection',
                'Workspace'
              )}
            </DropdownMenuLabel>
          )}
          {!isMultiContext && (
            <DropdownMenuItem onSelect={handleRename} disabled={isDeleting}>
              <Pencil className="size-3.5" />
              {translate('auto.components.sidebar.WorktreeContextMenu.439fa94d53', 'Update')}
            </DropdownMenuItem>
          )}
          {PROMPT_PROJECT_MENU_BASICS_ONLY ? null : (
            <WorktreeStatusMenuItems
              contextWorkspaceStatus={contextWorkspaceStatus}
              deletingContext={deletingContext}
              isMultiContext={isMultiContext}
              onAssignWorkspaceStatus={handleAssignWorkspaceStatus}
              workspaceStatuses={workspaceStatuses}
            />
          )}
          <DropdownMenuSeparator />
          {!isMultiContext && (
            <>
              <WorktreeRowOpenInSubMenu
                worktree={worktree}
                connectionId={repo?.connectionId ?? null}
                disabled={isDeleting}
              />
              <DropdownMenuItem onSelect={handleCopyPath} disabled={isDeleting}>
                <Copy className="size-3.5" />
                {translate('auto.components.sidebar.WorktreeContextMenu.3350101edb', 'Copy Path')}
              </DropdownMenuItem>
              {PROMPT_PROJECT_MENU_BASICS_ONLY ? null : (
                <DropdownMenuItem onSelect={handleCopyName} disabled={isDeleting}>
                  <Copy className="size-3.5" />
                  {translate(
                    'auto.components.sidebar.WorktreeContextMenu.copyWorktreeName',
                    'Copy Worktree Name'
                  )}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleTogglePin} disabled={isDeleting}>
                {worktree.isPinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
                {worktree.isPinned
                  ? translate('auto.components.sidebar.WorktreeContextMenu.697d0f6e1b', 'Unpin')
                  : translate('auto.components.sidebar.WorktreeContextMenu.3baa7d6507', 'Pin')}
              </DropdownMenuItem>
              {PROMPT_PROJECT_MENU_BASICS_ONLY ? (
                <DropdownMenuSeparator />
              ) : (
                <WorktreeContextMenuOrganizeItems model={model} />
              )}
            </>
          )}
          {isMultiContext && hasAnyContextLineage ? (
            <>
              <DropdownMenuItem onSelect={handleRemoveParentLink} disabled={deletingContext}>
                <Unlink className="size-3.5" />
                {translate(
                  'auto.components.sidebar.WorktreeContextMenu.579b1a8e61',
                  'Remove from Parent'
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          ) : null}

          {!PROMPT_PROJECT_MENU_BASICS_ONLY &&
          shouldRevealWorktreeDeveloperMenu({
            developerMenuRevealed,
            isMultiContext
          }) ? (
            <>
              <WorktreeDeveloperMenu worktreeId={worktree.id} disabled={isDeleting} />
              <DropdownMenuSeparator />
            </>
          ) : null}
          {PROMPT_PROJECT_MENU_BASICS_ONLY ? null : (
            <WorkspaceSleepMenuItems
              isMultiContext={isMultiContext}
              sleepLabel={sleepLabel}
              sleepDisabled={deletingContext || sleepableWorktrees.length === 0}
              descendantCount={lineageDescendantCount}
              subtreeSleepDisabled={deletingSubtree || subtreeSleepableWorktrees.length === 0}
              onSleep={handleCloseTerminals}
              onSleepSubtree={handleSleepSubtree}
            />
          )}
          {/* Git cannot remove primary checkouts; keep disabled Delete beside the enabled Remove Project action. */}
          {!PROMPT_PROJECT_MENU_BASICS_ONLY && !isMultiContext && offersProjectRemoval ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenuItem variant="destructive" disabled>
                    <Trash2 className="size-3.5" />
                    {translate(
                      'auto.components.sidebar.WorktreeContextMenu.deleteWorktree',
                      'Delete Worktree'
                    )}
                  </DropdownMenuItem>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="max-w-[200px] text-pretty">
                {translate(
                  'auto.components.sidebar.WorktreeContextMenu.primaryDeleteDisabled',
                  "Primary worktree — can't be deleted. Remove the project instead."
                )}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {/* Use Radix’s direct title prop for project-removal copy; wrapper elements break flat roving-keyboard navigation. */}
          {!isMultiContext && removesProject && !offersProjectRemoval ? null : (
            <DropdownMenuItem
              variant="destructive"
              onSelect={handleDelete}
              disabled={
                contextDeletePending ||
                (!isMultiContext && worktree.isMainWorktree && !removesProject) ||
                (isMultiContext && batchDeleteWorktrees.length === 0)
              }
              title={
                !isMultiContext && worktree.isMainWorktree && !removesProject
                  ? translate(
                      'auto.components.sidebar.WorktreeContextMenu.e091caab15',
                      'The project could not be found'
                    )
                  : undefined
              }
            >
              <Trash2 className="size-3.5" />
              {contextDeletePending
                ? translate('auto.components.sidebar.WorktreeContextMenu.b42391d8bf', 'Deleting…')
                : isMultiContext
                  ? deleteLabel
                  : folderWorkspaceId
                    ? translate(
                        'auto.components.sidebar.WorktreeContextMenu.250de158fd',
                        'Remove Workspace'
                      )
                    : removesProject
                      ? translate('prompt.projectRemoval.menuItem', 'Remove project from list…')
                      : lineageDescendantCount > 0
                        ? translate(
                            'auto.components.sidebar.WorktreeContextMenu.deleteWithDescendants',
                            'Delete with Descendants…'
                          )
                        : translate(
                            'auto.components.sidebar.WorktreeContextMenu.f4475537d8',
                            'Delete'
                          )}
              {!isMultiContext && !removesProject && deleteShortcut ? (
                <DropdownMenuShortcut>{deleteShortcut}</DropdownMenuShortcut>
              ) : null}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <WorktreeContextMenuOverlays model={model} />
    </div>
  )
}
