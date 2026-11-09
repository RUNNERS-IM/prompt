import React, { useSyncExternalStore } from 'react'
import { translate } from '@/i18n/i18n'
import {
  clearClaudeLoginUnmovedPane,
  getClaudeLoginUnmovedPanes,
  subscribeClaudeLoginUnmovedPanes
} from '@/lib/claude-login-unmoved-panes'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'

/** Marks a session a login could not confirm running Claude in, so only the user restarts it. */
export function ClaudeLoginUnmovedLine({
  tabId,
  paneKey
}: {
  tabId: string
  paneKey?: string
}): React.JSX.Element | null {
  const unmoved = useSyncExternalStore(
    subscribeClaudeLoginUnmovedPanes,
    getClaudeLoginUnmovedPanes,
    getClaudeLoginUnmovedPanes
  )
  const pane = unmoved.find(
    (candidate) =>
      candidate.tabId === tabId &&
      (!paneKey || makePaneKey(candidate.tabId, candidate.leafId) === paneKey)
  )
  // Why compare: a reattach rebinds the pane to a process that was never left behind.
  const alive = useAppStore((state) =>
    pane ? state.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId?.[pane.leafId] === pane.ptyId : false
  )
  if (!pane || !alive) {
    return null
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 pl-[17px] text-[10px] leading-4 text-status-warning-text">
      <span className="min-w-0 flex-1 truncate">
        {translate('prompt.sessionRow.loginUnmoved', "Didn't move to the new login")}
      </span>
      <button
        type="button"
        className="shrink-0 rounded-sm bg-foreground/[0.08] px-1.5 text-[10px] leading-4 text-foreground hover:bg-foreground/[0.14]"
        onClick={(event) => {
          event.stopPropagation()
          clearClaudeLoginUnmovedPane(pane.ptyId)
          useAppStore.getState().queuePaneAccountRestarts([pane.ptyId], 'claude')
        }}
      >
        {translate('prompt.sessionRow.restartSession', 'Restart')}
      </button>
    </div>
  )
}
