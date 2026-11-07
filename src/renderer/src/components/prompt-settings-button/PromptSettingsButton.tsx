import type React from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'

/** Prompt's one Settings gear at the window's top right, where the sidebar's bottom row used to keep it
 *  (runners-wiki 2026-11-07 「Prompt 설정은 탭 줄 오른쪽」). */
export function PromptSettingsButton(): React.JSX.Element {
  const openSettingsPage = useAppStore((s) => s.openSettingsPage)
  const label = translate('auto.components.sidebar.SidebarSettingsHelpMenu.a428c25998', 'Settings')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          type="button"
          aria-label={label}
          className="my-auto ml-0.5 shrink-0 text-muted-foreground [-webkit-app-region:no-drag]"
          onClick={() => openSettingsPage()}
        >
          <Settings className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
