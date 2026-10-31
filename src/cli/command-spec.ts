export type CommandSpec = {
  path: string[]
  aliases?: string[][]
  argumentMode?: 'parsed' | 'passthrough'
  // Prevent typo recovery from suggesting destructive actions for unrelated commands.
  destructive?: boolean
  hidden?: boolean
  summary: string
  usage: string
  allowedFlags: string[]
  // Accepted but left out of the Options list, so old scripts keep working without advertising them.
  hiddenFlags?: string[]
  // Flag repeatability varies by command, even for the same flag name.
  repeatableFlags?: string[]
  positionalArgs?: string[]
  variadicPositional?: boolean
  examples?: string[]
  notes?: string[]
  // Takes `--page <browserPageId>`; only the browser spec modules set it.
  browserPageTarget?: boolean
  // Caller flags must match the acting agent session; target flags may name another session.
  identityFlagRoles?: Partial<Record<IdentityFlag, 'caller' | 'target'>>
  // `prompt` commands reuse legacy handlers; the handler key is this path when it differs from `path`.
  handlerPath?: string[]
  // Shown flag name -> flag name the handler reads (`prompt` says --workspace where handlers read --worktree).
  flagAliases?: Readonly<Record<string, string>>
}

export type IdentityFlag = 'from' | 'terminal'

export function specPaths(spec: CommandSpec): string[][] {
  return spec.aliases ? [spec.path, ...spec.aliases] : [spec.path]
}
