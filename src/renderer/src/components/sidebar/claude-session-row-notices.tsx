import React from 'react'
import { ClaudeLoginUnmovedLine } from './claude-login-unmoved-line'
import { ClaudeResumeFailedLine } from './claude-resume-failed-line'

export function ClaudeSessionRowNotices(props: {
  tabId: string
  paneKey?: string
}): React.JSX.Element {
  return (
    <>
      <ClaudeLoginUnmovedLine {...props} />
      <ClaudeResumeFailedLine {...props} />
    </>
  )
}
