import { PASTE_TERMINAL_TEXT_EVENT, type PasteTerminalTextDetail } from '@/constants/terminal'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { useAppStore } from '@/store'
import type { DiscoveredSkill } from '../../../../shared/skills'

export const skillSlashCommand = (skill: DiscoveredSkill): string =>
  skill.name.startsWith('/') ? skill.name : `/${skill.name}`

export type SkillTerminalInsertResult = 'inserted' | 'no-terminal' | 'chat-view'

/** Types the skill command into the visible terminal's prompt without pressing Enter. */
export function insertSkillCommandIntoActiveTerminal(command: string): SkillTerminalInsertResult {
  return insertTextIntoActiveTerminal(`${command} `)
}

export function insertTextIntoActiveTerminal(text: string): SkillTerminalInsertResult {
  const { activeView, activeTabType, activeTabId } = useAppStore.getState()
  if (activeView !== 'terminal' || activeTabType !== 'terminal' || !activeTabId) {
    return 'no-terminal'
  }
  const tabElement = document.querySelector(`[data-terminal-tab-id="${CSS.escape(activeTabId)}"]`)
  if (!tabElement) {
    return 'no-terminal'
  }
  // The chat composer over a TUI keeps its own draft; raw PTY input would bypass it.
  if (tabElement.getAttribute('data-terminal-chat-view') === 'true') {
    return 'chat-view'
  }
  window.dispatchEvent(
    new CustomEvent<PasteTerminalTextDetail>(PASTE_TERMINAL_TEXT_EVENT, {
      detail: { tabId: activeTabId, text }
    })
  )
  focusTerminalTabSurface(activeTabId)
  return 'inserted'
}
