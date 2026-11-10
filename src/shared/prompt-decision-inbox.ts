// Decision inbox (runners-wiki 「2026-11-10 새 기능은 기존 앱에」): the choice pages sessions leave for the person,
// listed at the bottom of the left sidebar so an answer can go straight back to the session that asked.

export const PROMPT_DECISION_INBOX_LIST_CHANNEL = 'prompt:decisionInboxList'
export const PROMPT_DECISION_INBOX_CHANGED_CHANNEL = 'prompt:decisionInboxChanged'

export type PromptDecisionDraft = {
  filePath: string
  sessionName: string
  topic: string
  modifiedAt: number
}

export type PromptDecisionInboxApi = {
  list: () => Promise<PromptDecisionDraft[]>
  onChanged: (callback: () => void) => () => void
}

/** Page names follow `[Session name] - Topic.html`; the session name may itself contain hyphens. */
const DRAFT_FILE_NAME = /^(\[[^\]]+\].*?) - (.+)\.html$/i

export function parsePromptDecisionFileName(
  fileName: string
): { sessionName: string; topic: string } | null {
  // APFS keeps Korean names as written, which may be decomposed; session names are composed.
  const match = DRAFT_FILE_NAME.exec(fileName.normalize('NFC'))
  return match ? { sessionName: match[1].trim(), topic: match[2].trim() } : null
}
