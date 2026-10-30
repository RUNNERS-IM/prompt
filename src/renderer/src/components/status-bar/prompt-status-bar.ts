import { useMemo } from 'react'
import type { StatusBarItem } from '../../../../shared/ui-chrome-types'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'

// Status bar segments Prompt never shows. They belong to features Prompt hides
// (plugins, Orca remote servers, skill sharing, the pet), so they would only appear as
// unexplained items. Kept in a Prompt-only file so the daily upstream merge stays clean.
export type PromptStatusSegment = 'plugins' | 'remote-server-update' | 'skill-update' | 'pet'

const PROMPT_HIDDEN_STATUS_SEGMENTS: ReadonlySet<PromptStatusSegment> = new Set([
  'plugins',
  'remote-server-update',
  'skill-update',
  'pet'
])

export function promptShowsStatusSegment(segment: PromptStatusSegment): boolean {
  return !PROMPT_HIDDEN_STATUS_SEGMENTS.has(segment)
}

// Prompt sessions run Claude only, so the other AI usage meters, their status bar menu rows and
// the "connect an AI provider account" nudge stay hidden. Unit tests keep upstream behavior.
const PROMPT_HIDDEN_STATUS_BAR_ITEMS: ReadonlySet<StatusBarItem> = new Set([
  'codex',
  'gemini',
  'antigravity',
  'opencode-go',
  'kimi',
  'minimax',
  'grok',
  'cursor',
  'zcode'
])

export function promptShowsStatusBarItem(item: StatusBarItem): boolean {
  return !PROMPT_BLOCK_UPSTREAM_SERVICES || !PROMPT_HIDDEN_STATUS_BAR_ITEMS.has(item)
}

/** The stored status bar items minus the ones Prompt hides; same array identity while unchanged. */
export function usePromptStatusBarItems(items: StatusBarItem[]): StatusBarItem[] {
  return useMemo(() => items.filter(promptShowsStatusBarItem), [items])
}

export const PROMPT_SHOWS_USAGE_EMPTY_CTA = !PROMPT_BLOCK_UPSTREAM_SERVICES
