import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { promptTerminalTabName } from '@/components/sidebar/prompt-session-row-name'

/**
 * Prompt: the session name the close dialog shows. It is the same name the tab strip and the
 * sidebar show (promptTerminalTabName), read live so a rename is never shown under its old name.
 * Tabs that are not terminal tabs (structured chats) keep the label the caller passed.
 */
export function resolveCloseDialogSessionName(
  state: Pick<AppState, 'tabsByWorktree'>,
  terminalTabId: string | undefined,
  fallbackLabel: string | undefined
): string {
  if (terminalTabId) {
    for (const tabs of Object.values(state.tabsByWorktree ?? {})) {
      const tab = tabs?.find((candidate) => candidate.id === terminalTabId)
      if (tab) {
        return promptTerminalTabName(tab) || fallbackLabel?.trim() || ''
      }
    }
  }
  return fallbackLabel?.trim() ?? ''
}

export function useCloseDialogSessionName(
  terminalTabId: string | undefined,
  fallbackLabel?: string
): string {
  return useAppStore((state) => resolveCloseDialogSessionName(state, terminalTabId, fallbackLabel))
}
