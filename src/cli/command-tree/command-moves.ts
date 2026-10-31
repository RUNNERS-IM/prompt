import type { CommandSpec } from '../command-spec'
import { BROWSER_ADVANCED_COMMAND_SPECS } from '../specs/browser-advanced'
import { BROWSER_BASIC_COMMAND_SPECS } from '../specs/browser-basic'

/** One legacy command and the `prompt` path that now runs the same handler. */
export type CommandMove = {
  legacyPath: string[]
  promptPath: string[]
}

// Legacy paths whose `prompt` replacement has its own handler (new output shape or merged flags).
// The value is the replacement named in the rename notice.
export const SUPERSEDED_LEGACY_COMMANDS: Readonly<Record<string, string>> = {
  'repo list': 'project list',
  'repo add': 'project add',
  'repo show': 'project show',
  'repo set': 'project set',
  'repo set-base-ref': 'project set --base-ref',
  'worktree list': 'workspace list',
  'terminal list': 'terminal list'
}

// Exact moves win over group moves; keys are legacy paths.
const EXACT_MOVES: Readonly<Record<string, string>> = {
  open: 'app open',
  status: 'app status',
  'agent-context': 'app agent-context',
  'claude-teams': 'session teams',
  'agent launch': 'session start',
  ports: 'util ports',
  search: 'util search',
  'open-url': 'browser open',
  'terminal switch': 'terminal focus',
  'repo search-refs': 'project refs',
  'project list': 'project setup projects',
  'project setups': 'project setup list',
  'project setup-existing-folder': 'project setup add-folder',
  'project setup-clone': 'project setup clone',
  'project setup-create': 'project setup create',
  'project setup-update': 'project setup set',
  'project setup-delete': 'project setup remove'
}

// Longest legacy prefix wins; the rest of the path is kept, except `rm` becomes `remove`.
const GROUP_MOVES: readonly (readonly [legacyPrefix: string, promptPrefix: string])[] = [
  ['serve', 'app serve'],
  ['diagnostics', 'app diagnostics'],
  ['terminal-daemon', 'app terminal-daemon'],
  ['profile state', 'app profile-state'],
  ['agent hooks', 'app agent-hooks'],
  ['repo', 'project'],
  ['worktree', 'workspace'],
  ['terminal', 'terminal'],
  ['browser', 'browser'],
  ['computer', 'computer'],
  ['emulator', 'emulator'],
  ['linear', 'connect linear'],
  ['jira', 'connect jira'],
  ['connector', 'connect connector'],
  ['automations', 'automation'],
  ['orchestration', 'orchestration'],
  ['skills', 'skill'],
  ['account', 'account'],
  ['environment', 'env environment'],
  ['host', 'env host'],
  ['vm', 'env vm'],
  ['reference', 'util reference'],
  ['file', 'util file'],
  ['artifacts', 'util artifacts'],
  ['speech', 'util speech']
]

const BROWSER_LEGACY_PATHS = new Set(
  [...BROWSER_BASIC_COMMAND_SPECS, ...BROWSER_ADVANCED_COMMAND_SPECS].map((spec) =>
    spec.path.join(' ')
  )
)

function renameVerb(segments: string[]): string[] {
  return segments.map((segment, index) =>
    index === segments.length - 1 && segment === 'rm' ? 'remove' : segment
  )
}

/** The `prompt` path for a legacy path, or null when the legacy path has no direct move. */
export function promptPathForLegacyPath(legacyPath: readonly string[]): string[] | null {
  const key = legacyPath.join(' ')
  const exact = EXACT_MOVES[key]
  if (exact) {
    return exact.split(' ')
  }
  // Scattered top-level browser verbs (click, goto, tab list, ...) all move under `browser`.
  if (BROWSER_LEGACY_PATHS.has(key) && legacyPath[0] !== 'browser') {
    return ['browser', ...renameVerb([...legacyPath])]
  }
  let best: readonly [string, string] | undefined
  for (const move of GROUP_MOVES) {
    const prefix = move[0].split(' ')
    if (
      prefix.length <= legacyPath.length &&
      prefix.every((part, index) => part === legacyPath[index]) &&
      (!best || prefix.length > best[0].split(' ').length)
    ) {
      best = move
    }
  }
  if (!best) {
    return null
  }
  const rest = legacyPath.slice(best[0].split(' ').length)
  return [...best[1].split(' '), ...renameVerb(rest)]
}

/** Every legacy spec that keeps running its own handler under a `prompt` path. */
export function buildCommandMoves(specs: readonly CommandSpec[]): CommandMove[] {
  const moves: CommandMove[] = []
  for (const spec of specs) {
    const key = spec.path.join(' ')
    if (SUPERSEDED_LEGACY_COMMANDS[key] !== undefined) {
      continue
    }
    const promptPath = promptPathForLegacyPath(spec.path)
    if (!promptPath) {
      throw new Error(`Legacy CLI command "${key}" has no prompt command path`)
    }
    moves.push({ legacyPath: spec.path, promptPath })
  }
  return moves
}

/** The replacement a rename notice names for a legacy path (flags included for merged commands). */
export function replacementForLegacyPath(legacyPath: readonly string[]): string | null {
  const key = legacyPath.join(' ')
  return SUPERSEDED_LEGACY_COMMANDS[key] ?? promptPathForLegacyPath(legacyPath)?.join(' ') ?? null
}
