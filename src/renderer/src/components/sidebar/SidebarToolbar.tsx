import React from 'react'
import { Kanban } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { ScrollToCurrentWorkspaceToolbarButton } from './ScrollToCurrentWorkspaceToolbarButton'
import { SidebarSettingsHelpMenu } from './SidebarSettingsHelpMenu'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import { hasFeatureInteraction } from '../../../../shared/feature-interactions'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'

const WORKSPACE_BOARD_MOVED_HINT_STORAGE_KEY = 'orca.workspaceBoardMovedHintSeen.v1'
const WORKSPACE_BOARD_MOVED_HINT_DURATION_MS = 12000
// Prompt 는 워크스페이스 보드를 쓰지 않아 단추와 「옮겨졌습니다」 말풍선을 함께 숨긴다.
const SHOWS_WORKSPACE_BOARD_BUTTON = !PROMPT_BLOCK_UPSTREAM_SERVICES

type SidebarToolbarProps = {
  workspaceBoardOpen: boolean
  workspaceBoardDragPreviewOpen?: boolean
  onWorkspaceBoardToggle: () => void
}

const SidebarToolbar = React.memo(function SidebarToolbar({
  workspaceBoardOpen,
  workspaceBoardDragPreviewOpen = false,
  onWorkspaceBoardToggle
}: SidebarToolbarProps) {
  // Subscribe across this memo boundary so asynchronously applied locale changes relabel the toolbar and its children.
  useTranslation()
  const [workspaceBoardMovedHintOpen, setWorkspaceBoardMovedHintOpen] = React.useState(false)
  const movedHintEligibleRef = React.useRef<boolean | null>(null)
  const persistedUIReady = useAppStore((state) => state.persistedUIReady)
  const hasUsedWorkspaceBoard = useAppStore((state) =>
    hasFeatureInteraction(state.featureInteractions, 'workspace-board')
  )

  React.useEffect(() => {
    if (!persistedUIReady || !SHOWS_WORKSPACE_BOARD_BUTTON) {
      return
    }
    // Limit relocation hints to users who opened the board at its old location.
    if (movedHintEligibleRef.current === null) {
      movedHintEligibleRef.current = hasUsedWorkspaceBoard
    }
    if (!movedHintEligibleRef.current) {
      return
    }
    try {
      if (window.localStorage.getItem(WORKSPACE_BOARD_MOVED_HINT_STORAGE_KEY) === 'true') {
        return
      }
      window.localStorage.setItem(WORKSPACE_BOARD_MOVED_HINT_STORAGE_KEY, 'true')
    } catch {
      return
    }

    setWorkspaceBoardMovedHintOpen(true)
    const timeoutId = window.setTimeout(() => {
      setWorkspaceBoardMovedHintOpen(false)
    }, WORKSPACE_BOARD_MOVED_HINT_DURATION_MS)
    return () => window.clearTimeout(timeoutId)
  }, [hasUsedWorkspaceBoard, persistedUIReady])

  const handleWorkspaceBoardClick = (): void => {
    setWorkspaceBoardMovedHintOpen(false)
    onWorkspaceBoardToggle()
  }

  return (
    <div className="mt-auto shrink-0">
      <div className="flex items-center justify-between border-t border-worktree-sidebar-border px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1">
          <SidebarSettingsHelpMenu />
        </div>
        <div className="flex items-center gap-1">
          <ScrollToCurrentWorkspaceToolbarButton />
          {SHOWS_WORKSPACE_BOARD_BUTTON ? (
            <Tooltip open={workspaceBoardMovedHintOpen ? true : undefined}>
              <TooltipTrigger asChild>
                <Button
                  variant={
                    workspaceBoardOpen || workspaceBoardDragPreviewOpen ? 'secondary' : 'ghost'
                  }
                  size="icon-xs"
                  type="button"
                  aria-label={translate(
                    'auto.components.sidebar.SidebarToolbar.49f62c5665',
                    'Workspace board'
                  )}
                  aria-pressed={workspaceBoardOpen}
                  data-workspace-board-trigger=""
                  data-workspace-board-preview={workspaceBoardDragPreviewOpen ? 'true' : undefined}
                  onClick={handleWorkspaceBoardClick}
                  className="text-muted-foreground"
                >
                  <Kanban className="size-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={4}>
                {workspaceBoardMovedHintOpen
                  ? translate(
                      'auto.components.sidebar.SidebarToolbar.87d0064026',
                      'Workspace board moved to the bottom bar'
                    )
                  : workspaceBoardOpen
                    ? translate(
                        'auto.components.sidebar.SidebarToolbar.a30e34eb5c',
                        'Close workspace board'
                      )
                    : translate(
                        'auto.components.sidebar.SidebarToolbar.49f62c5665',
                        'Workspace board'
                      )}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </div>
  )
})

export default SidebarToolbar
