import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'

// Prompt runs Claude only and hides the browser, dictation, tasks, plugins, floating workspace and
// mobile emulator features, so their shortcuts would bind actions nobody can reach.
const PROMPT_HIDDEN_SHORTCUT_IDS: ReadonlySet<string> = new Set([
  'tab.newBrowser',
  'tab.newBrowserSplitRight',
  'tab.newSimulator',
  'voice.dictation',
  'view.tasks',
  'view.plugins',
  'floatingTerminal.toggle',
  'floatingWorkspace.maximize',
  'floatingWorkspace.minimize'
])
const PROMPT_KEPT_AGENT_TAB_IDS: ReadonlySet<string> = new Set([
  'tab.newAgent.claude',
  'tab.newAgent.claude-agent-teams'
])

export function isPromptHiddenShortcut(id: string): boolean {
  if (!PROMPT_SIMPLE_SETTINGS) {
    return false
  }
  if (id.startsWith('tab.newAgent.')) {
    return !PROMPT_KEPT_AGENT_TAB_IDS.has(id)
  }
  return PROMPT_HIDDEN_SHORTCUT_IDS.has(id) || id.startsWith('browser.') || id.startsWith('plugin:')
}
