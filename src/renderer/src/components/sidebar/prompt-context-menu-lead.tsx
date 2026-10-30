import type React from 'react'
import { AppWindow } from 'lucide-react'
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import { translate } from '@/i18n/i18n'
import { openPromptProjectWindow } from '@/lib/prompt-windows'
import {
  PromptClaudeModelSubmenu,
  claudeModelPaneKeyFromTarget
} from '@/components/prompt-claude-model-menu'

/** Set on a project header so its right-click menu offers "Open in New Window". */
export const PROMPT_PROJECT_WINDOW_REPO_ATTR = 'data-prompt-project-window-repo'

export type PromptContextMenuTarget = { claudePaneKey: string | null; repoId: string | null }

export const EMPTY_PROMPT_CONTEXT_MENU_TARGET: PromptContextMenuTarget = {
  claudePaneKey: null,
  repoId: null
}

export function promptContextMenuTargetFromEvent(
  target: EventTarget | null
): PromptContextMenuTarget {
  const element = target instanceof Element ? target : null
  return {
    claudePaneKey: claudeModelPaneKeyFromTarget(target),
    repoId:
      element
        ?.closest(`[${PROMPT_PROJECT_WINDOW_REPO_ATTR}]`)
        ?.getAttribute(PROMPT_PROJECT_WINDOW_REPO_ATTR) ?? null
  }
}

/** Opens a new window showing the project; every click opens another one. */
function PromptProjectWindowItem({ repoId }: { repoId: string }): React.JSX.Element {
  return (
    <>
      <DropdownMenuItem onSelect={() => openPromptProjectWindow(repoId)}>
        <AppWindow className="size-3.5" />
        {translate('prompt.windows.openInNewWindow', 'Open in New Window')}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
    </>
  )
}

/** Prompt rows at the top of the workspace right-click menu: Claude model, project window. */
export function PromptContextMenuLeadItems({
  target
}: {
  target: PromptContextMenuTarget
}): React.JSX.Element {
  return (
    <>
      {target.repoId ? <PromptProjectWindowItem repoId={target.repoId} /> : null}
      <PromptClaudeModelSubmenu paneKey={target.claudePaneKey} />
    </>
  )
}
