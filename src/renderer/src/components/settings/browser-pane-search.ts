import type { SettingsSearchEntry } from './settings-search'
import { getBrowserPaneSearchEntries } from './browser-search'
import { getBrowserUsePaneSearchEntries } from './browser-use-search'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'
import { getBrowserClientHostedRemoteTitle } from './browser-client-hosted-remote-copy'
import { getBrowserUserAgentSearchEntry } from './browser-user-agent-search'

// Prompt hides the browser identity row and client-hosted remote pages (Prompt has no remote
// server workspaces), so search must not land on them.
function getPromptHiddenBrowserSearchTitles(): Set<string> {
  return new Set([getBrowserUserAgentSearchEntry().title, getBrowserClientHostedRemoteTitle()])
}

export const getBrowserPaneCombinedSearchEntries = createLocalizedCatalog(
  (): SettingsSearchEntry[] => {
    const entries = [...getBrowserUsePaneSearchEntries(), ...getBrowserPaneSearchEntries()]
    if (!PROMPT_SIMPLE_SETTINGS) {
      return entries
    }
    const hiddenTitles = getPromptHiddenBrowserSearchTitles()
    return entries.filter((entry) => !hiddenTitles.has(entry.title))
  }
)
