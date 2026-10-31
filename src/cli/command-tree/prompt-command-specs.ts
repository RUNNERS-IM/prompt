import type { CommandSpec } from '../command-spec'
import { COMMAND_SPECS } from '../specs'
import { PROMPT_NEW_COMMAND_SPECS } from '../specs/prompt-commands'
import { buildCommandMoves, replacementForLegacyPath } from './command-moves'

const LEGACY_PATHS: readonly string[][] = COMMAND_SPECS.flatMap((spec) => [
  spec.path,
  ...(spec.aliases ?? [])
])

function longestLegacyPrefix(words: readonly string[]): string[] | null {
  let best: string[] | null = null
  for (const path of LEGACY_PATHS) {
    if (
      path.length <= words.length &&
      path.every((part, index) => part === words[index]) &&
      (!best || path.length > best.length)
    ) {
      best = path
    }
  }
  return best
}

function replacementForLegacyWords(path: readonly string[]): string | null {
  const spec = COMMAND_SPECS.find((candidate) =>
    [candidate.path, ...(candidate.aliases ?? [])].some(
      (entry) => entry.length === path.length && entry.every((part, i) => part === path[i])
    )
  )
  return spec ? replacementForLegacyPath(spec.path) : null
}

// `orca` must stand alone: `orca-dev`, `.orca/` and ORCA_* are other names.
const LEGACY_COMMAND_TEXT = /(^|[^\w./-])orca((?: [a-z][a-z0-9-]*)*)(?![\w-])/g

/** Rewrite `orca <legacy path>` mentions in help text to the `prompt` command that replaced them. */
export function rewriteLegacyCommandText(text: string): string {
  return text.replace(LEGACY_COMMAND_TEXT, (_match, lead: string, tail: string) => {
    const words = tail.trim() ? tail.trim().split(' ') : []
    const legacy = longestLegacyPrefix(words)
    const replacement = legacy ? replacementForLegacyWords(legacy) : null
    const rest = legacy ? words.slice(legacy.length) : words
    return [`${lead}prompt`, ...(replacement ? [replacement] : []), ...rest].join(' ')
  })
}

function promptFlagAliases(spec: CommandSpec): Record<string, string> | undefined {
  const aliases: Record<string, string> = {}
  if (spec.allowedFlags.includes('worktree') && !spec.allowedFlags.includes('workspace')) {
    aliases.workspace = 'worktree'
  }
  if (spec.allowedFlags.includes('repo') && !spec.allowedFlags.includes('project')) {
    aliases.project = 'repo'
  }
  return Object.keys(aliases).length > 0 ? aliases : undefined
}

function rewriteFlagNames(text: string, aliases: Readonly<Record<string, string>> | undefined) {
  let rewritten = text
  for (const [shown, internal] of Object.entries(aliases ?? {})) {
    rewritten = rewritten.replace(new RegExp(`--${internal}(?![\\w-])`, 'g'), `--${shown}`)
  }
  return rewritten
}

function deriveMovedSpec(spec: CommandSpec, promptPath: string[]): CommandSpec {
  const flagAliases = promptFlagAliases(spec)
  const rewrite = (text: string): string =>
    rewriteFlagNames(rewriteLegacyCommandText(text), flagAliases)
  const parent = promptPath.slice(0, -1)
  const verb = promptPath.at(-1)
  // Keep the legacy verb (e.g. `rm`, `switch`) and its aliases reachable under the new parent.
  const aliasVerbs = [spec.path, ...(spec.aliases ?? [])]
    .map((path) => path.at(-1))
    .filter((alias): alias is string => alias !== undefined && alias !== verb)
  const aliases = [...new Set(aliasVerbs)].map((alias) => [...parent, alias])
  return {
    ...spec,
    path: promptPath,
    aliases: aliases.length > 0 ? aliases : undefined,
    handlerPath: spec.path,
    usage: rewrite(spec.usage),
    ...(spec.notes ? { notes: spec.notes.map(rewrite) } : {}),
    ...(spec.examples ? { examples: spec.examples.map(rewrite) } : {}),
    ...(flagAliases ? { flagAliases } : {})
  }
}

function buildPromptCommandSpecs(): CommandSpec[] {
  const legacyByPath = new Map(COMMAND_SPECS.map((spec) => [spec.path.join(' '), spec]))
  const moved = buildCommandMoves(COMMAND_SPECS).map((move) =>
    deriveMovedSpec(legacyByPath.get(move.legacyPath.join(' '))!, move.promptPath)
  )
  const specs = [...PROMPT_NEW_COMMAND_SPECS, ...moved]
  // A kept legacy verb never shadows a real command (old `project list` vs `project setup list`).
  const primary = new Set(specs.map((spec) => spec.path.join(' ')))
  return specs.map((spec) => {
    const aliases = spec.aliases?.filter((alias) => !primary.has(alias.join(' ')))
    return { ...spec, aliases: aliases && aliases.length > 0 ? aliases : undefined }
  })
}

/** The `prompt` command tree: moved legacy commands plus commands that exist only here. */
export const PROMPT_COMMAND_SPECS: CommandSpec[] = buildPromptCommandSpecs()
