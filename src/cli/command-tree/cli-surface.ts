/** The executable a user typed: `prompt` runs the new command tree, `orca` the legacy one. */
export type CliExecutable = 'prompt' | 'orca'

/** Release that drops the `orca` executable and every legacy command path. */
export const LEGACY_COMMAND_REMOVAL_VERSION = '2.7'

export type CliLocale = 'en' | 'ko'

let programName: CliExecutable = 'orca'

/** Help and error text name the surface being served, so the tree and its examples agree. */
export function setCliProgramName(name: CliExecutable): void {
  programName = name
}

export function getCliProgramName(): CliExecutable {
  return programName
}

export function isPromptSurface(): boolean {
  return programName === 'prompt'
}

// POSIX precedence: LC_ALL overrides LC_MESSAGES, which overrides LANG.
export function resolveCliLocale(env: NodeJS.ProcessEnv = process.env): CliLocale {
  const locale = env.LC_ALL || env.LC_MESSAGES || env.LANG || ''
  return locale.toLowerCase().startsWith('ko') ? 'ko' : 'en'
}

export function formatLegacyCommandNotice(
  replacement: string,
  locale: CliLocale = resolveCliLocale()
): string {
  const command = `prompt ${replacement}`.trim()
  return locale === 'ko'
    ? `[알림] 이 명령은 이름이 바뀌었습니다: ${command} (옛 이름은 ${LEGACY_COMMAND_REMOVAL_VERSION} 출시 때 없어집니다)`
    : `[notice] This command was renamed: ${command} (the old name is removed in ${LEGACY_COMMAND_REMOVAL_VERSION})`
}
