import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'

// Prompt keeps the pane header empty: hand-off, chat view and split live in menus and shortcuts,
// and a single pane closes from its tab. Unit tests keep upstream behavior.
export type PromptPaneHeaderAction = 'hand-off' | 'resume-in-chat' | 'split' | 'close'

export function promptShowsPaneHeaderAction(
  action: PromptPaneHeaderAction,
  paneCount: number
): boolean {
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES) {
    return true
  }
  return action === 'close' && paneCount > 1
}
