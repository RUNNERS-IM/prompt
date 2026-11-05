import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import {
  Bell,
  BellOff,
  CircleX,
  FolderInput,
  FolderPlus,
  FolderTree,
  Unlink,
  Workflow
} from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { WorktreeContextMenuModel } from './use-worktree-context-menu-model'
import {
  getWorktreeParentPickerLabel,
  isWorktreeParentPickerDisabled
} from './worktree-context-menu-policy'

/** 읽음 표시 · 프로젝트 그룹 · 상위 워크트리 항목. Prompt 프로젝트 메뉴에서는 빠진다. */
export function WorktreeContextMenuOrganizeItems({
  model
}: {
  model: WorktreeContextMenuModel
}): React.JSX.Element {
  const {
    eligibleParentCount,
    handleCreateGroupFromRepo,
    handleMoveProjectToGroup,
    handleOpenParent,
    handleOpenParentPicker,
    handleRemoveParentLink,
    handleRemoveProjectFromGroup,
    handleToggleRead,
    hasParentLink,
    isDeleting,
    projectGroups,
    repo,
    validParentWorktreeId,
    worktree
  } = model
  return (
    <>
      <DropdownMenuItem onSelect={handleToggleRead} disabled={isDeleting}>
        {worktree.isUnread ? <BellOff className="size-3.5" /> : <Bell className="size-3.5" />}
        {worktree.isUnread
          ? translate('auto.components.sidebar.WorktreeContextMenu.8dacff1fe0', 'Mark Read')
          : translate('auto.components.sidebar.WorktreeContextMenu.f50603c6b2', 'Mark Unread')}
      </DropdownMenuItem>
      {repo ? (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={handleCreateGroupFromRepo} disabled={isDeleting}>
            <FolderPlus className="size-3.5" />
            {translate(
              'auto.components.sidebar.WorktreeContextMenu.503ec0f8e6',
              'New group from project'
            )}
          </DropdownMenuItem>
          {projectGroups.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={isDeleting}>
                <FolderInput className="size-3.5" />
                {translate(
                  'auto.components.sidebar.WorktreeContextMenu.76865d827f',
                  'Move to group'
                )}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {projectGroups.map((group) => (
                  <DropdownMenuItem
                    key={group.id}
                    disabled={repo.projectGroupId === group.id}
                    onSelect={() => handleMoveProjectToGroup(group.id)}
                  >
                    <span className="max-w-48 truncate">{group.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
          {repo.projectGroupId ? (
            <DropdownMenuItem onSelect={handleRemoveProjectFromGroup} disabled={isDeleting}>
              <CircleX className="size-3.5" />
              {translate(
                'auto.components.sidebar.WorktreeContextMenu.d35dfeae58',
                'Remove from group'
              )}
            </DropdownMenuItem>
          ) : null}
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={handleOpenParentPicker}
        disabled={isWorktreeParentPickerDisabled({ isDeleting, eligibleParentCount })}
      >
        <FolderTree className="size-3.5" />
        {getWorktreeParentPickerLabel(validParentWorktreeId)}
      </DropdownMenuItem>
      {(validParentWorktreeId || hasParentLink) && (
        <>
          {validParentWorktreeId && (
            <DropdownMenuItem onSelect={handleOpenParent} disabled={isDeleting}>
              <Workflow className="size-3.5" />
              {translate(
                'auto.components.sidebar.WorktreeContextMenu.8d9cd19d09',
                'Open Parent Worktree'
              )}
            </DropdownMenuItem>
          )}
          {hasParentLink && (
            <DropdownMenuItem onSelect={handleRemoveParentLink} disabled={isDeleting}>
              <Unlink className="size-3.5" />
              {translate(
                'auto.components.sidebar.WorktreeContextMenu.579b1a8e61',
                'Remove from Parent'
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
        </>
      )}
    </>
  )
}
