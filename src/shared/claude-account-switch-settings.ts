// 'limited' restarts only sessions stopped at their usage limit; working ones keep the old account.
export type ClaudeAccountSwitchRunningSessions = 'ask' | 'restart' | 'limited' | 'keep'

export type ClaudeAccountSwitchSettings = {
  /** Absent means 'ask'. */
  claudeAccountSwitchRunningSessions?: ClaudeAccountSwitchRunningSessions
}
