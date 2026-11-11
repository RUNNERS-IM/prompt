import React, { useSyncExternalStore } from 'react'
import { translate } from '@/i18n/i18n'
import {
  getClaudeResumeFailures,
  retryClaudeResume,
  subscribeClaudeResumeFailures
} from '@/lib/claude-resume-failure'
import { useAppStore } from '@/store'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { SessionRowNoticeLine } from './session-row-notice-line'

/** Stays until the pane changes process or an agent reports in, so a failed reopen can't go unnoticed. */
export function ClaudeResumeFailedLine({
  tabId,
  paneKey
}: {
  tabId: string
  paneKey?: string
}): React.JSX.Element | null {
  const failures = useSyncExternalStore(
    subscribeClaudeResumeFailures,
    getClaudeResumeFailures,
    getClaudeResumeFailures
  )
  const failure = failures.find(
    (candidate) =>
      candidate.tabId === tabId &&
      (!paneKey || makePaneKey(candidate.tabId, candidate.leafId) === paneKey)
  )
  const stillFailed = useAppStore((state) => {
    if (!failure) {
      return false
    }
    const status = state.agentStatusByPaneKey[makePaneKey(tabId, failure.leafId)]
    return (
      state.terminalLayoutsByTabId[tabId]?.ptyIdsByLeafId?.[failure.leafId] === failure.ptyId &&
      (!status || status.updatedAt <= failure.failedAt)
    )
  })
  if (!failure || !stillFailed) {
    return null
  }
  return (
    <SessionRowNoticeLine
      tone="error"
      message={translate('prompt.sessionRow.resumeFailed', "Couldn't reopen this session")}
      actionLabel={translate('prompt.sessionRow.retryResume', 'Try again')}
      onAction={() => retryClaudeResume(failure.ptyId)}
    />
  )
}
