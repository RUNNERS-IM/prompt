import type React from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '../../store'

/** Prompt's Settings gear. It sits in the sidebar's bottom row next to the computer picker; with
 *  the sidebar collapsed it moves back to the tab strip's right end (runners-wiki 2026-11-19 7A). */
export function PromptSettingsButton({
  tooltipSide = 'bottom'
}: {
  tooltipSide?: 'top' | 'bottom'
}): React.JSX.Element {
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
      <TooltipContent side={tooltipSide} sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
