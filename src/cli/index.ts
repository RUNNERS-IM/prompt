#!/usr/bin/env node
import {
  findCommandSpec,
  isCommandGroup,
  normalizeCommandPositionals,
  parseArgs,
  resolveHelpPath,
  specPaths,
  validateCommandAndFlags
} from './args'
import { readOrcaCliVersion } from './cli-version'
import { dispatch } from './dispatch'
import {
  resolveEnvironmentSelectorForStore,
  resolveHostFlagEnvironmentId
} from './execution-host-flag'
import { fetchSshTargetSummaries, listSshTargets } from './host-selector-alternatives'
import { reportCliError } from './cli-error'
import { printHelp } from './help'
import type { RuntimeClient } from './runtime-client'
import { COMMAND_SPECS } from './specs'
import { resolveOrchestrationCliExecutable } from './runtime/orchestration-recovery-command'
import { refuseConflictingSessionCallerFlags } from './session-caller-flags'
import { ignoresRemoteSelection } from './remote-selection-scope'
import { setCliProgramName, type CliExecutable } from './command-tree/cli-surface'
import { PROMPT_COMMAND_SPECS } from './command-tree/prompt-command-specs'
import { selectCliSurface } from './command-tree/surface-selection'
import { applyPromptFlagAliases, preResolvePromptSelectors } from './command-tree/prompt-dispatch'
import { setPromptJsonListShape } from './command-tree/prompt-output'

export { COMMAND_SPECS } from './specs'
export { buildCurrentWorktreeSelector, normalizeWorktreeSelector } from './selectors'

const COMMAND_PATHS = COMMAND_SPECS.flatMap((spec) => specPaths(spec))
const PROMPT_COMMAND_PATHS = PROMPT_COMMAND_SPECS.flatMap((spec) => specPaths(spec))

// Defer the runtime graph until after help and validation; await it to keep ctx.client synchronous.
async function loadRuntimeClientClass(): Promise<typeof RuntimeClient> {
  return (await import('./runtime-client.js')).RuntimeClient
}

// The SSH bridge runs here, but ORCA_CLI_CWD carries the remote caller's directory.
function resolveInvocationCwd(): string {
  const override = process.env.ORCA_CLI_CWD
  return typeof override === 'string' && override.length > 0 ? override : process.cwd()
}

/**
 * `executable` is the name the user typed: `prompt` serves the new tree, `orca` the legacy one
 * with a rename notice. Embedded callers pass nothing and get the legacy tree without notices.
 */
export async function main(
  argv = process.argv.slice(2),
  cwd = resolveInvocationCwd(),
  executable: CliExecutable | null = null
): Promise<void> {
  // Why: version audits use the bundled launcher; Electron intercepts direct binary version flags.
  if (argv.length === 1 && (argv[0] === '--version' || argv[0] === '-v')) {
    const version = readOrcaCliVersion()
    if (!version) {
      process.stderr.write('Could not determine the Orca version for this build.\n')
      process.exitCode = 1
      return
    }
    process.stdout.write(`${version}\n`)
    return
  }
  if (argv[0] === 'agent-teams-tmux') {
    await runAgentTeamsTmuxShim(argv.slice(1))
    return
  }
  if (argv[0] === 'claude-teams') {
    await runClaudeTeams(argv.slice(1), cwd)
    return
  }
  // Passthrough: everything after `session teams` belongs to Claude Code, as with claude-teams.
  if (executable === 'prompt' && argv[0] === 'session' && argv[1] === 'teams') {
    await runClaudeTeams(argv.slice(2), cwd)
    return
  }
  const selection = selectCliSurface(
    argv,
    executable,
    { specs: COMMAND_SPECS, paths: COMMAND_PATHS },
    { specs: PROMPT_COMMAND_SPECS, paths: PROMPT_COMMAND_PATHS }
  )
  // stderr only: --json output on stdout must stay one parseable document.
  if (selection.notice) {
    process.stderr.write(`${selection.notice}\n`)
  }
  const prompt = selection.surface === 'prompt'
  setCliProgramName(selection.surface)
  const specs = prompt ? PROMPT_COMMAND_SPECS : COMMAND_SPECS
  const paths = prompt ? PROMPT_COMMAND_PATHS : COMMAND_PATHS
  const parsed = normalizeCommandPositionals(specs, parseArgs(argv, paths, specs))
  const helpPath = resolveHelpPath(parsed)
  if (helpPath !== null) {
    printHelp(specs, helpPath)
    if (
      helpPath.length > 0 &&
      !findCommandSpec(specs, helpPath) &&
      !isCommandGroup(specs, helpPath)
    ) {
      process.exitCode = 1
    }
    return
  }
  if (parsed.commandPath.length === 0) {
    printHelp(specs, [])
    return
  }
  if (
    parsed.flags.size === 0 &&
    !findCommandSpec(specs, parsed.commandPath) &&
    isCommandGroup(specs, parsed.commandPath)
  ) {
    printHelp(specs, parsed.commandPath)
    return
  }
  const json = parsed.flags.has('json')
  const commandSpec = findCommandSpec(specs, parsed.commandPath)
  // Prompt specs reuse legacy handlers; errors and routing speak the handler's path.
  const handlerPath = commandSpec?.handlerPath ?? parsed.commandPath

  try {
    if (prompt && commandSpec) {
      parsed.flags = applyPromptFlagAliases(commandSpec, parsed.flags)
    }
    // Report invalid commands before runtime lookup can mask them with connection errors.
    validateCommandAndFlags(specs, parsed)
    refuseConflictingSessionCallerFlags(commandSpec, parsed.flags)
    const hostScoped = parsed.flags.has('host')
    const RuntimeClientClass = await loadRuntimeClientClass()
    const ignoreRemoteSelection = ignoresRemoteSelection(handlerPath)
    const pairingCode = ignoreRemoteSelection ? null : parsed.flags.get('pairing-code')
    const environmentSelector = ignoreRemoteSelection ? null : parsed.flags.get('environment')
    // Eagerly resolve explicit --environment; stale ambient config must not break local-only commands.
    const listSshTargetsForSuggestion = async (): Promise<{ id: string; label: string }[]> =>
      listSshTargets(new RuntimeClientClass(undefined, undefined, null, null))
    const storeEnvironmentSelector =
      typeof environmentSelector === 'string'
        ? await resolveEnvironmentSelectorForStore(environmentSelector, listSshTargetsForSuggestion)
        : null
    // Select the paired connection before constructing the client; reject conflicting environments.
    const hostEnvironmentId = ignoreRemoteSelection
      ? null
      : await resolveHostFlagEnvironmentId(parsed.flags, {
          // SSH targets belong to this machine, even when the missing name was a paired server.
          listSshTargets: listSshTargetsForSuggestion,
          verifySshTargets: async () =>
            (
              await fetchSshTargetSummaries<{ id: string; label: string }>(
                new RuntimeClientClass(undefined, undefined, null, null)
              )
            ).targets,
          pairingCode: typeof pairingCode === 'string' ? pairingCode : null,
          environmentSelector:
            typeof environmentSelector === 'string'
              ? { value: environmentSelector, label: '--environment' }
              : process.env.ORCA_ENVIRONMENT
                ? { value: process.env.ORCA_ENVIRONMENT, label: 'ORCA_ENVIRONMENT' }
                : null
        })
    // Stored host identities use ids, so canonicalize names before any downstream comparison.
    if (hostEnvironmentId !== null) {
      parsed.flags.set('host', `runtime:${hostEnvironmentId}`)
    }
    // null suppresses RuntimeClient's ORCA_PAIRING_CODE / ORCA_ENVIRONMENT default parameters.
    const suppressed = ignoreRemoteSelection ? null : undefined
    // An explicit runtime host overrides an ambient pairing code.
    const remotePairingCode =
      hostEnvironmentId !== null ? null : typeof pairingCode === 'string' ? pairingCode : suppressed
    const remoteEnvironment = hostEnvironmentId ?? storeEnvironmentSelector ?? suppressed
    let client: RuntimeClient | undefined
    // Why: local-only handlers must not resolve runtime metadata just to dispatch.
    const getClient = (): RuntimeClient => {
      client ??= new RuntimeClientClass(
        undefined,
        undefined,
        remotePairingCode,
        remoteEnvironment,
        resolveOrchestrationCliExecutable(),
        argv
      )
      return client
    }
    if (prompt && commandSpec) {
      await preResolvePromptSelectors(commandSpec, parsed.flags, getClient, { hostScoped })
    }
    // Moved list commands print their list as result.items, like the new ones; legacy never does.
    setPromptJsonListShape(
      prompt &&
        commandSpec !== undefined &&
        commandSpec.handlerPath?.[0] !== 'prompt' &&
        commandSpec.path.at(-1) === 'list'
    )
    await dispatch(handlerPath, {
      flags: parsed.flags,
      get client() {
        return getClient()
      },
      cwd,
      json,
      rawArgs: argv
    })
  } catch (error) {
    const worktreeSelector = parsed.flags.get('worktree')
    const repoSelector = parsed.flags.get('repo')
    const hostFlag = parsed.flags.get('host')
    reportCliError(error, json, {
      commandPath: handlerPath,
      ...(typeof worktreeSelector === 'string' ? { worktreeSelector } : {}),
      ...(typeof repoSelector === 'string' ? { repoSelector } : {}),
      remoteServerSelected:
        parsed.flags.has('environment') ||
        parsed.flags.has('pairing-code') ||
        (typeof hostFlag === 'string' && hostFlag.startsWith('runtime:')) ||
        Boolean(process.env.ORCA_ENVIRONMENT?.trim() || process.env.ORCA_PAIRING_CODE?.trim())
    })
    process.exitCode = 1
  }
}

async function runClaudeTeams(argv: string[], cwd: string): Promise<void> {
  try {
    // Forward Claude Code arguments verbatim so new flags work without Orca changes.
    const client = new (await loadRuntimeClientClass())(undefined, undefined, null, null)
    await dispatch(['claude-teams'], {
      flags: new Map(),
      client,
      cwd,
      json: false,
      rawArgs: argv
    })
  } catch (error) {
    reportCliError(error, false, { commandPath: ['claude-teams'] })
    process.exitCode = 1
  }
}

async function runAgentTeamsTmuxShim(argv: string[]): Promise<void> {
  try {
    const client = new (await loadRuntimeClientClass())(undefined, 10_000)
    const response = await client.call<{
      tmux: { stdout: string; stderr: string; exitCode: number }
    }>(
      'agentTeams.tmuxCompat',
      {
        teamId: process.env.ORCA_AGENT_TEAMS_TEAM_ID,
        token: process.env.ORCA_AGENT_TEAMS_TOKEN,
        envPane: process.env.TMUX_PANE,
        cwd: process.cwd(),
        argv
      },
      { timeoutMs: 10_000 }
    )
    process.stdout.write(response.result.tmux.stdout)
    process.stderr.write(response.result.tmux.stderr)
    process.exitCode = response.result.tmux.exitCode
  } catch (error) {
    reportCliError(error, false, { commandPath: ['agent-teams-tmux'] })
    process.exitCode = 1
  }
}

if (require.main === module) {
  void main(undefined, undefined, 'orca')
}
