import type { CommandSpec } from '../command-spec'
import type { RuntimeClient } from '../runtime-client'
import { REPEATED_FLAG_SEPARATOR } from '../args'
import { RuntimeClientError } from '../runtime/types'
import {
  resolvePromptProjectSelector,
  resolvePromptTerminalSelector,
  resolvePromptWorkspaceSelector
} from './prompt-selectors'

/** Rename shown flags (--workspace) to the names the reused handler reads (--worktree). */
export function applyPromptFlagAliases(
  spec: CommandSpec,
  flags: Map<string, string | boolean>
): Map<string, string | boolean> {
  const aliases = Object.entries(spec.flagAliases ?? {})
  if (aliases.length === 0) {
    return flags
  }
  const renamed = new Map(flags)
  for (const [shown, internal] of aliases) {
    if (!renamed.has(shown)) {
      continue
    }
    if (renamed.has(internal)) {
      throw new RuntimeClientError(
        'invalid_argument',
        `Pass --${shown} or --${internal}, not both; they are the same flag.`
      )
    }
    renamed.set(internal, renamed.get(shown)!)
    renamed.delete(shown)
  }
  return renamed
}

type Resolver = (client: RuntimeClient, value: string) => Promise<string>

function selectorResolvers(spec: CommandSpec): [flag: string, resolve: Resolver][] {
  const isNew = spec.handlerPath?.[0] === 'prompt'
  if (isNew) {
    // New handlers resolve --project themselves; --workspace feeds shared worktree helpers.
    return [['workspace', resolvePromptWorkspaceSelector]]
  }
  const resolvers: [string, Resolver][] = [
    ['worktree', resolvePromptWorkspaceSelector],
    ['repo', resolvePromptProjectSelector]
  ]
  // Orchestration --terminal names the calling agent; only terminal commands take a target here.
  if (spec.path[0] === 'terminal') {
    resolvers.push(['terminal', (client, value) => resolvePromptTerminalSelector(client, value)])
  }
  return resolvers
}

/**
 * Turn name and short-id selectors into canonical ones before the handler runs, so every
 * `prompt` command accepts them the same way and refuses ambiguous ones before acting.
 */
export async function preResolvePromptSelectors(
  spec: CommandSpec,
  flags: Map<string, string | boolean>,
  client: () => RuntimeClient,
  options: { hostScoped: boolean }
): Promise<void> {
  // A --host scope narrows repo matches on the host; resolving here would ignore it.
  if (options.hostScoped) {
    return
  }
  for (const [flag, resolve] of selectorResolvers(spec)) {
    const value = flags.get(flag)
    if (typeof value !== 'string' || !value || value.includes(REPEATED_FLAG_SEPARATOR)) {
      continue
    }
    flags.set(flag, await resolve(client(), value))
  }
}
