import React, { useState } from 'react'
import { AppWindow } from 'lucide-react'
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger
} from '@/components/ui/dropdown-menu'
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger
} from '@/components/ui/context-menu'
import { translate } from '@/i18n/i18n'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { listPromptWindows, movePromptTabToWindow } from '@/lib/prompt-windows'
import { useAppStore } from '@/store'
import {
  isPromptSharedTabsOn,
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
 * Window". The tab's terminal keeps running; the chosen window attaches it. Hidden with shared
 * tabs, where every window already shows every terminal tab.
 */
export function PromptMoveTabToWindowSubmenu({
  tabId,
  menuKind = 'dropdown'
}: {
  tabId: string
  /** Radix sub-parts must match the menu they sit in; the tab right-click menu is a ContextMenu. */
  menuKind?: 'dropdown' | 'context'
}): React.JSX.Element | null {
  useUiLanguageRevision()
  const [windows, setWindows] = useState<PromptWindowSummary[]>([])
  const shared = useAppStore((s) => isPromptSharedTabsOn(s.settings))

  const refresh = (open: boolean): void => {
    if (open) {
      void listPromptWindows().then((list) => setWindows(list.filter((w) => !w.isSelf)))
    }
  }

  if (shared) {
    return null
  }
  const context = menuKind === 'context'
  const Sub = context ? ContextMenuSub : DropdownMenuSub
  const SubTrigger = context ? ContextMenuSubTrigger : DropdownMenuSubTrigger
  const SubContent = context ? ContextMenuSubContent : DropdownMenuSubContent
  const Item = context ? ContextMenuItem : DropdownMenuItem
  const Separator = context ? ContextMenuSeparator : DropdownMenuSeparator
  return (
    <Sub onOpenChange={refresh}>
      <SubTrigger>
        <AppWindow className="size-3.5 shrink-0" />
        {translate('prompt.windows.moveTabToWindow', 'Move Tab to Window')}
      </SubTrigger>
      <SubContent>
        {windows.map((summary) => (
          <Item key={summary.key} onSelect={() => movePromptTabToWindow(tabId, summary.key)}>
            {windowLabel(summary)}
          </Item>
        ))}
        {windows.length > 0 ? <Separator /> : null}
        <Item onSelect={() => movePromptTabToWindow(tabId, PROMPT_NEW_WINDOW_TARGET)}>
          {translate('prompt.windows.newWindow', 'New Window')}
        </Item>
      </SubContent>
    </Sub>
  )
}
