import { isCommandGroup, parseArgs } from '../args'
import { specPaths, type CommandSpec } from '../command-spec'
import { formatLegacyCommandNotice, type CliExecutable } from './cli-surface'
import { promptPathForLegacyPath, replacementForLegacyPath } from './command-moves'

export type CliSurfaceSelection = {
  surface: CliExecutable
  /** One stderr line naming the `prompt` replacement, or null when nothing was renamed. */
  notice: string | null
}

type CommandTree = {
  specs: readonly CommandSpec[]
  paths: readonly string[][]
}

function commandWords(argv: string[], tree: CommandTree): string[] {
  const path = parseArgs(argv, tree.paths, tree.specs).commandPath
  return path[0] === 'help' ? path.slice(1) : path
}

// Positionals follow the command words, so a prefix match is enough.
function longestSpecPrefix(tree: CommandTree, words: readonly string[]): CommandSpec | undefined {
  let best: { spec: CommandSpec; length: number } | undefined
  for (const spec of tree.specs) {
    for (const path of specPaths(spec)) {
      if (
        path.length <= words.length &&
        path.every((part, index) => part === words[index]) &&
        (!best || path.length > best.length)
      ) {
        best = { spec, length: path.length }
      }
    }
  }
  return best?.spec
}

function belongsTo(tree: CommandTree, words: string[]): boolean {
  return (
    words.length > 0 &&
    (longestSpecPrefix(tree, words) !== undefined ||
      isCommandGroup(tree.specs as CommandSpec[], words))
  )
}

// Hook scripts and hidden plumbing call these; a notice there would only reach a log.
function isQuietLegacyCommand(spec: CommandSpec): boolean {
  return spec.hidden === true || (spec.path[0] === 'agent' && spec.path[1] === 'hooks')
}

function legacyNotice(legacy: CommandTree, words: string[]): string | null {
  const spec = longestSpecPrefix(legacy, words)
  if (spec) {
    if (isQuietLegacyCommand(spec)) {
      return null
    }
    const replacement = replacementForLegacyPath(spec.path)
    return replacement ? formatLegacyCommandNotice(replacement) : null
  }
  const group = promptPathForLegacyPath(words)
  return group ? formatLegacyCommandNotice(group.join(' ')) : null
}

/**
 * `prompt` serves the new tree and falls back to legacy paths with a notice; `orca` keeps the
 * legacy tree (old output shapes) and notices every use. `null` is an embedded call: legacy, quiet.
 */
export function selectCliSurface(
  argv: string[],
  executable: CliExecutable | null,
  legacy: CommandTree,
  prompt: CommandTree
): CliSurfaceSelection {
  if (executable === null) {
    return { surface: 'orca', notice: null }
  }
  const promptWords = commandWords(argv, prompt)
  const legacyWords = commandWords(argv, legacy)
  if (executable === 'prompt') {
    if (promptWords.length === 0 || belongsTo(prompt, promptWords)) {
      return { surface: 'prompt', notice: null }
    }
    if (belongsTo(legacy, legacyWords)) {
      return { surface: 'orca', notice: legacyNotice(legacy, legacyWords) }
    }
    return { surface: 'prompt', notice: null }
  }
  if (legacyWords.length === 0) {
    return { surface: 'orca', notice: formatLegacyCommandNotice('--help') }
  }
  if (belongsTo(legacy, legacyWords)) {
    return { surface: 'orca', notice: legacyNotice(legacy, legacyWords) }
  }
  // The old executable with a new path: run it, and say which executable to type.
  if (belongsTo(prompt, promptWords)) {
    const spec = longestSpecPrefix(prompt, promptWords)
    return {
      surface: 'prompt',
      notice: formatLegacyCommandNotice((spec?.path ?? promptWords).join(' '))
    }
  }
  return { surface: 'orca', notice: null }
}
