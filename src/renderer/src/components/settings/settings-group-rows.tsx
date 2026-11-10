import type React from 'react'
import { PROMPT_SIMPLE_SETTINGS } from '@/lib/prompt-hidden-settings'

/**
 * A group's list of rows. In Prompt the rows sit straight after the group title so each one is
 * a piece of the box (prompt-mac.css); elsewhere they keep the upstream wrapper and its dividers.
 */
export function SettingsGroupRows({
  className,
  children
}: {
  className?: string
  children: React.ReactNode
}): React.JSX.Element {
  return PROMPT_SIMPLE_SETTINGS ? <>{children}</> : <div className={className}>{children}</div>
}
