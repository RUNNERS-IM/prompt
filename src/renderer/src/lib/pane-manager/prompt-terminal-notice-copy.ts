import { translate } from '@/i18n/i18n'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'

// Notices the app writes into a terminal ("[Orca skipped …]") are upstream constants compared by
// identity, so Prompt translates them only at write time. Unit tests keep the upstream text.
const PROMPT_TERMINAL_NOTICES: readonly (readonly [key: string, english: string])[] = [
  ['hiddenBacklog', 'Orca skipped hidden terminal output because the backlog grew too large.'],
  [
    'foregroundBurst',
    'Orca skipped a burst of terminal output because the backlog grew too large.'
  ],
  [
    'restoreUnavailable',
    'Orca skipped hidden terminal output because main recovery was unavailable.'
  ],
  ['noHostImage', "Orca could not restore this terminal's history from its host."]
]

/** The notice in the UI language (and with the Prompt name); any other text comes back unchanged. */
export function promptTerminalNoticeText(data: string): string {
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES) {
    return data
  }
  for (const [key, english] of PROMPT_TERMINAL_NOTICES) {
    if (data.includes(english)) {
      return data.replace(english, translate(`prompt.terminalNotice.${key}`, english))
    }
  }
  return data
}
