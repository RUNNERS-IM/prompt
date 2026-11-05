import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'
import type { CmdJQuickAction } from './quick-actions'

// Prompt keeps Cmd+J to Claude, terminal and workspace actions: the in-app browser and plugins are
// hidden features, so their "new tab", "Go to <url>" and plugin command rows stay out. Rows for
// browser tabs that are already open still show, so such a tab can always be reached.
export const PROMPT_PALETTE_HIDES_BROWSER_AND_PLUGIN_ACTIONS = PROMPT_BLOCK_UPSTREAM_SERVICES

const PROMPT_HIDDEN_QUICK_ACTION_IDS: ReadonlySet<string> = new Set([
  'new-browser-tab',
  'new-browser-tab-split-right'
])

export function promptPaletteQuickActions(actions: CmdJQuickAction[]): CmdJQuickAction[] {
  if (!PROMPT_PALETTE_HIDES_BROWSER_AND_PLUGIN_ACTIONS) {
    return actions
  }
  return actions.filter((action) => !PROMPT_HIDDEN_QUICK_ACTION_IDS.has(action.id))
}
