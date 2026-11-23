// Prompt ships only the `prompt` command on macOS. Upstream hints still tell people and agents to
// type `orca …` (`orca terminal read`, `orca linear issue ENG-1`), which no longer exists there.
// Only the bare command word changes: `orca` followed by a backtick, or by a subcommand or flag.
// Paths and identifiers stay as written: orca.yaml, ~/.orca, /usr/local/bin/orca, orca-ide,
// orca:// links, ORCA_* variables and the capitalised brand (handled by prompt-brand).
const ORCA_COMMAND_WORD = /(?<![\w./~$:@-])orca(?=`|\s+-{0,2}[a-z])/g

export function isMacPromptHost(): boolean {
  const nodePlatform = typeof process === 'undefined' ? undefined : process?.platform
  if (typeof nodePlatform === 'string') {
    return nodePlatform === 'darwin'
  }
  const nav = (globalThis as { navigator?: { platform?: string; userAgent?: string } }).navigator
  return /Mac/i.test(nav?.platform || nav?.userAgent || '')
}

export function promptCliCommandText(text: string): string {
  return text.replace(ORCA_COMMAND_WORD, 'prompt')
}

export function promptCliCommandTextOnMac(text: string): string {
  return isMacPromptHost() ? promptCliCommandText(text) : text
}
