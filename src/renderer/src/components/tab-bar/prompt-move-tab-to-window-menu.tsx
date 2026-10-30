import React, { useState } from 'react'
import { AppWindow } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { listPromptWindows, movePromptTabToWindow } from '@/lib/prompt-windows'
import {
  PROMPT_MAIN_WINDOW_KEY,
  PROMPT_NEW_WINDOW_TARGET,
  type PromptWindowSummary
} from '../../../../shared/prompt-windows'

function windowLabel(summary: PromptWindowSummary): string {
  const base = summary.label
    ? translate('prompt.windows.windowLabelNamed', 'Window {{index}} — {{name}}', {
        index: summary.index,
        name: summary.label
      })
    : translate('prompt.windows.windowLabel', 'Window {{index}}', { index: summary.index })
  return summary.key === PROMPT_MAIN_WINDOW_KEY
    ? `${base} ${translate('prompt.windows.mainWindowSuffix', '(Main)')}`
    : base
}

/**
 * "Move Tab to Window ▸" in a tab's context menu: lists the other Prompt windows and "New
 * Window". The tab's terminal keeps running; the chosen window attaches it.
 */
export function PromptMoveTabToWindowSubmenu({ tabId }: { tabId: string }): React.JSX.Element {
  useUiLanguageRevision()
  const [windows, setWindows] = useState<PromptWindowSummary[]>([])

  const refresh = (open: boolean): void => {
    if (open) {
      void listPromptWindows().then((list) => setWindows(list.filter((w) => !w.isSelf)))
    }
  }

  return (
    <DropdownMenuSub onOpenChange={refresh}>
      <DropdownMenuSubTrigger>
        <AppWindow className="size-3.5 shrink-0" />
        {translate('prompt.windows.moveTabToWindow', 'Move Tab to Window')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {windows.map((summary) => (
          <DropdownMenuItem
            key={summary.key}
            onSelect={() => movePromptTabToWindow(tabId, summary.key)}
          >
            {windowLabel(summary)}
          </DropdownMenuItem>
        ))}
        {windows.length > 0 ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={() => movePromptTabToWindow(tabId, PROMPT_NEW_WINDOW_TARGET)}>
          {translate('prompt.windows.newWindow', 'New Window')}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
