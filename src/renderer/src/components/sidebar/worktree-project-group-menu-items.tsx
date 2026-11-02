import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { CircleX, FolderInput, FolderPlus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { WorktreeContextMenuModel } from './use-worktree-context-menu-model'

type WorktreeProjectGroupMenuItemsProps = Pick<
  WorktreeContextMenuModel,
  | 'repo'
  | 'projectGroups'
  | 'isDeleting'
  | 'handleCreateGroupFromRepo'
  | 'handleMoveProjectToGroup'
  | 'handleRemoveProjectFromGroup'
>

/** Worktree menu items that put the row's project into, or take it out of, a project group. */
export function WorktreeProjectGroupMenuItems({
  repo,
  projectGroups,
  isDeleting,
  handleCreateGroupFromRepo,
  handleMoveProjectToGroup,
  handleRemoveProjectFromGroup
}: WorktreeProjectGroupMenuItemsProps) {
  if (!repo) {
    return null
  }
  return (
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
            {translate('auto.components.sidebar.WorktreeContextMenu.76865d827f', 'Move to group')}
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
          {translate('auto.components.sidebar.WorktreeContextMenu.d35dfeae58', 'Remove from group')}
        </DropdownMenuItem>
      ) : null}
    </>
  )
}
