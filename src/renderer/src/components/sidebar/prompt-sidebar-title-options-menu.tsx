import React, { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { WorkspaceOptionsMenuItems } from './workspace-options-menu-items'

/** Prompt: 왼쪽 목록 제목을 오른쪽 클릭하면 거르기 · 정렬 메뉴가 열린다. 왼쪽 클릭으로는 안 열린다. */
export function PromptSidebarTitleOptionsMenu({
  sectionKind,
  onMenuOpenChange,
  children
}: {
  sectionKind: 'projects' | 'workspaces'
  onMenuOpenChange: (open: boolean) => void
  children: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    onMenuOpenChange(next)
  }

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <span
          className="min-w-0 truncate select-none pl-2 pr-0.5 text-xs font-semibold text-muted-foreground/80"
          data-sidebar-section-title={sectionKind}
          onPointerDown={(event) => event.preventDefault()}
          onContextMenu={(event) => {
            event.preventDefault()
            handleOpenChange(true)
          }}
        >
          {children}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="w-72 pb-2"
        data-workspace-board-preserve-open=""
      >
        <WorkspaceOptionsMenuItems preserveWorkspaceBoardOpen />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
