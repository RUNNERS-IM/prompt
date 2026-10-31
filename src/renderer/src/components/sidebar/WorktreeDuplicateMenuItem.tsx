import type React from 'react'
import { Copy } from 'lucide-react'
import { useAppStore } from '@/store'
import { DropdownMenuItem } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { openPromptSessionCopyWindow } from '@/lib/prompt-windows'
import type { Worktree } from '../../../../shared/worktree/types'
import { getWorktreeDuplicateSessionCommand } from './worktree-context-menu-policy'
import { WorktreeRowOpenInSubMenu } from './WorktreeRowOpenInSubMenu'

/**
 * "Duplicate" in the workspace menu ([PROMPT] decision 1B): opens the same copy as the session
 * row's "Copy to New Window" for the workspace's active tab. Disabled when that tab has no known
 * Claude session id. Mounted only while the menu is open, so idle rows do no store work.
 */
export function WorktreeDuplicateMenuItem({
  worktreeId,
  disabled
}: {
  worktreeId: string
  disabled?: boolean
}): React.JSX.Element {
  const command = useAppStore((s) => getWorktreeDuplicateSessionCommand(s, worktreeId))
  return (
    <DropdownMenuItem
      onSelect={() => {
        if (command) {
          openPromptSessionCopyWindow(worktreeId, command)
        }
      }}
      disabled={disabled || !command}
    >
      <Copy className="size-3.5" strokeWidth={1.5} />
      {translate('prompt.sidebarSessions.duplicate', 'Duplicate')}
    </DropdownMenuItem>
  )
}

/** "Duplicate" followed by "Open In ▸", the pair that opens the workspace's single-row section. */
export function WorktreeRowDuplicateAndOpenInItems({
  worktree,
  connectionId,
  disabled
}: {
  worktree: Pick<Worktree, 'id' | 'path' | 'hostId' | 'runtimeOwnerEnvironmentId'>
  connectionId: string | null
  disabled?: boolean
}): React.JSX.Element {
  return (
    <>
      <WorktreeDuplicateMenuItem worktreeId={worktree.id} disabled={disabled} />
      <WorktreeRowOpenInSubMenu
        worktree={worktree}
        connectionId={connectionId}
        disabled={disabled}
      />
    </>
  )
}
