import type { CommandSpec } from '../command-spec'
import type { RuntimeClient } from '../runtime-client'
import { REPEATED_FLAG_SEPARATOR } from '../args'
import { RuntimeClientError } from '../runtime/types'
import {
  resolvePromptDurableProjectSelector,
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

/** hostScoped resolvers match host-local rows (repos, worktrees, terminals) and skip under --host. */
type SelectorResolver = { flag: string; resolve: Resolver; hostScoped: boolean }

// Legacy groups whose --project names a durable project (setups, workspace create, automations);
// Linear and Jira --project flags name their own projects and pass through.
const DURABLE_PROJECT_FLAG_GROUPS = new Set(['project', 'worktree', 'automations'])

function selectorResolvers(spec: CommandSpec): SelectorResolver[] {
  const isNew = spec.handlerPath?.[0] === 'prompt'
  if (isNew) {
    // New handlers resolve --project themselves; --workspace feeds shared worktree helpers.
    return [{ flag: 'workspace', resolve: resolvePromptWorkspaceSelector, hostScoped: true }]
  }
  const resolvers: SelectorResolver[] = [
    { flag: 'worktree', resolve: resolvePromptWorkspaceSelector, hostScoped: true },
    { flag: 'repo', resolve: resolvePromptProjectSelector, hostScoped: true }
  ]
  const legacyGroup = spec.handlerPath?.[0] ?? spec.path[0]
  if (DURABLE_PROJECT_FLAG_GROUPS.has(legacyGroup) && spec.allowedFlags.includes('project')) {
    // Durable ids are the same on every host, so --host does not change the answer.
    resolvers.push({
      flag: 'project',
      resolve: resolvePromptDurableProjectSelector,
      hostScoped: false
    })
  }
  // Orchestration --terminal names the calling agent; only terminal commands take a target here.
  if (spec.path[0] === 'terminal') {
    resolvers.push({
      flag: 'terminal',
      resolve: (client, value) => resolvePromptTerminalSelector(client, value),
      hostScoped: true
    })
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
  for (const { flag, resolve, hostScoped } of selectorResolvers(spec)) {
    // A --host scope narrows repo matches on the host; resolving here would ignore it.
    if (options.hostScoped && hostScoped) {
      continue
    }
    const value = flags.get(flag)
    if (typeof value !== 'string' || !value || value.includes(REPEATED_FLAG_SEPARATOR)) {
      continue
    }
    flags.set(flag, await resolve(client(), value))
  }
}
