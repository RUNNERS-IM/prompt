// Claude's `/rename` writes a custom-title record to the transcript at once but repaints the
// terminal title only on its next turn; main reads the record and tells the window right away.

export const PROMPT_CLAUDE_SESSION_TITLE_CHANNEL = 'prompt:claudeSessionTitle'

export type PromptClaudeSessionTitleEvent = {
  paneKey: string
  sessionId: string
  title: string
}

export type PromptClaudeSessionTitleApi = {
  onTitle: (callback: (event: PromptClaudeSessionTitleEvent) => void) => () => void
}
