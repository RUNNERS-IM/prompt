export const DEFAULT_MAC_COMMAND_PATH = '/usr/local/bin/prompt'
// Prompt's only shell command on macOS.
export const MAC_PROMPT_COMMAND_NAME = 'prompt'
// Older Prompt builds also registered `orca` on macOS; registering or removing `prompt` cleans it up.
export const LEGACY_MAC_COMMAND_NAME = 'orca'
export const DEV_COMMAND_NAME = 'orca-dev'
export const LEGACY_LINUX_COMMAND_NAME = 'orca'
export const DEV_LAUNCHER_DIR = ['cli', 'bin'] as const
export const WINDOWS_PATH_WRITE_TIMEOUT_MS = 5_000
