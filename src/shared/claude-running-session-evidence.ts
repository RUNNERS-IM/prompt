/** One running Claude process read from the host: its pane, config folder and session. */
export type ClaudeRunningSessionEvidence = {
  paneKey: string
  pid: number
  configDir: string
  sessionId: string
  cwd: string
  transcriptPath: string
}
