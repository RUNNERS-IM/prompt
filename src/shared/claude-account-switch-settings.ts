// 'limited' restarts only sessions stopped at their usage limit; working ones keep the old account.
export type ClaudeAccountSwitchRunningSessions = 'ask' | 'restart' | 'limited' | 'keep'

export type ClaudeAccountSwitchSettings = {
  /** Absent means 'ask'. */
  claudeAccountSwitchRunningSessions?: ClaudeAccountSwitchRunningSessions
  /** Switch this Mac's Claude account by itself to the one whose weekly limit resets soonest. Absent means off. */
  claudeAccountAutoPick?: boolean
}
