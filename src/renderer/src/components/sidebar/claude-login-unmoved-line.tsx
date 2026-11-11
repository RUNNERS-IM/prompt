import React, { useSyncExternalStore } from 'react'
import { translate } from '@/i18n/i18n'
import {
  clearClaudeLoginUnmovedPane,
  getClaudeLoginUnmovedPanes,
  subscribeClaudeLoginUnmovedPanes
} from '@/lib/claude-login-unmoved-panes'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { SessionRowNoticeLine } from './session-row-notice-line'

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
    <SessionRowNoticeLine
      tone="warning"
      message={translate('prompt.sessionRow.loginUnmoved', "Didn't move to the new login")}
      actionLabel={translate('prompt.sessionRow.restartSession', 'Restart')}
      onAction={() => {
        clearClaudeLoginUnmovedPane(pane.ptyId)
        useAppStore.getState().queuePaneAccountRestarts([pane.ptyId], 'claude')
      }}
    />
  )
}
