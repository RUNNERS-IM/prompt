import {
  getAgentForkArgv,
  getAgentResumeArgv,
  type AgentProviderSessionMetadata,
  type ResumableTuiAgent
} from './agent-session-resume'
import type { SessionOptionValue } from './native-chat/input/native-chat-session-options'
import { buildSleepingAgentLaunchConfig } from './sleeping-agent-launch-config'
import { resolveAgentLaunchCommand, withAgentTerminalInputArgs } from './tui-agent-launch-command'
import type { AgentStartupPlan } from './tui-agent-startup'
import {
  commandSeparator,
  quoteStartupArg,
  resolveStartupShell,
  type AgentStartupShell
} from './tui-agent-startup-shell'
import { TUI_AGENT_CONFIG } from './tui-agent-config'
import type { TuiAgent } from './tui-agent'
import { buildAgentResumeLaunchCommand } from './agent-resume-launch-command'
import { buildAiVaultResumeShellCommand } from './ai-vault-resume-command'
import { normalizeRuntimePathForComparison } from './cross-platform-path'
import { parseWslUncPath } from './wsl-paths'
import { dropRecordedAgentPermissionArgs } from './tui-agent-permission-lift'

export function buildAgentResumeStartupPlan(args: {
  agent: ResumableTuiAgent
  providerSession: AgentProviderSessionMetadata
  cmdOverrides: Partial<Record<TuiAgent, string>>
  platform: NodeJS.Platform
  shell?: AgentStartupShell
  agentArgs?: string | null
  agentEnv?: Record<string, string> | null
  agentCommand?: string | null
  ompResumeFilePath?: string | null
  sessionOptions?: Record<string, SessionOptionValue>
  sessionOptionsOverrideAgentArgs?: boolean
  isRemote?: boolean
  /** The caller chose the terminal folder on purpose, so Codex must not ask for the recorded one. */
  resumeInLaunchCwd?: boolean
  /** Folder the resume shell starts in; an agent that ran elsewhere resumes here with a one-line notice
   *  (Gemini still cds to its own folder, #16960, unless that folder was deleted). */
  launchCwd?: string | null
  /** The notice line in the app's language; English when the caller cannot translate. */
  recordedCwdNotice?: (recordedCwd: string) => string
  /** Open a copy of the conversation instead of re-entering it; null for agents that cannot. */
  fork?: boolean
  /** OS that runs the agent when `platform` only picks quoting; null when unreported. */
  agentHostPlatform?: NodeJS.Platform | null
}): AgentStartupPlan | null {
  const resumeArgv = args.fork
    ? getAgentForkArgv(args.agent, args.providerSession)
    : getAgentResumeArgv(args.agent, args.providerSession, args.ompResumeFilePath)
  if (!resumeArgv) {
    return null
  }
  const agentCwd = args.providerSession.cwd
  // The folder the agent last ran in, when it is not the one this resume starts in.
  const recordedCwd =
    agentCwd && args.launchCwd && !args.resumeInLaunchCwd && !isSameFolder(agentCwd, args.launchCwd)
      ? agentCwd
      : null
  // Why: `cd <recorded folder> && <agent>` left the tab empty once that worktree was deleted, so
  // agents resume in the tab folder (decision 2026-11-06 1C 2B). Gemini 0.37 only looks for the
  // conversation under the folder it starts in, so it alone still moves there when it can.
  const staysInTabFolder = args.agent !== 'gemini'
  // Codex otherwise asks for its old folder, even if deleted (#17745). Keep before resume so argv removal preserves the folder choice.
  const argv =
    args.agent === 'codex' && (args.resumeInLaunchCwd || recordedCwd)
      ? [resumeArgv[0], '-c', 'tui.resume_cwd=current', ...resumeArgv.slice(1)]
      : resumeArgv
  const shell = resolveStartupShell(args.platform, args.shell)
  // Why: Codex restores a resumed thread's saved permissions unless the launch passes one, so
  // replaying Orca's launch-time flag would undo a change made inside the session (#10886).
  const recorded =
    args.agent === 'codex' && !args.fork
      ? dropRecordedAgentPermissionArgs(args.agent, args, shell)
      : args
  const resolvedAgentCommand = recorded.agentCommand?.trim()
  const baseCommand = resolvedAgentCommand
    ? ({
        ok: true,
        command: withAgentTerminalInputArgs(
          resolvedAgentCommand,
          args.agent,
          args.agentHostPlatform === undefined ? args.platform : args.agentHostPlatform,
          shell
        ),
        resumeLaunch: { agentCommand: resolvedAgentCommand },
        appliedSessionOptions: {}
      } as const)
    : resolveAgentLaunchCommand({
        agent: args.agent,
        cmdOverrides: args.cmdOverrides,
        platform: args.platform,
        shell,
        agentArgs: recorded.agentArgs,
        sessionOptions: args.sessionOptions,
        sessionOptionsOverrideAgentArgs: args.sessionOptionsOverrideAgentArgs,
        isRemote: args.isRemote,
        agentHostPlatform: args.agentHostPlatform
      })
  if (!baseCommand.ok) {
    return null
  }
  const launchConfig = buildSleepingAgentLaunchConfig({
    ...args,
    agentArgs: recorded.agentArgs,
    ...baseCommand.resumeLaunch
  })
  const resumeCommand = buildAgentResumeLaunchCommand(args.agent, baseCommand.command, argv, shell)
  const launchCommand = !recordedCwd
    ? resumeCommand
    : staysInTabFolder
      ? `${recordedCwdNoticeCommand(
          (args.recordedCwdNotice ?? englishRecordedCwdNotice)(recordedCwd),
          shell
        )}${commandSeparator(shell)}${resumeCommand}`
      : buildAiVaultResumeShellCommand({
          resumeCommand,
          cwd: recordedCwd,
          platform: args.platform,
          shell,
          continueIfCwdMissing: true
        })
  const applied = baseCommand.appliedSessionOptions
  return {
    agent: args.agent,
    launchCommand,
    expectedProcess: TUI_AGENT_CONFIG[args.agent].expectedProcess,
    followupPrompt: null,
    launchConfig,
    ...(args.agent === 'codex' ? { startupCommandDelivery: 'shell-ready' as const } : {}),
    ...(Object.keys(applied).length > 0 ? { sessionOptions: { ...applied } } : {}),
    ...(args.agentEnv ? { env: { ...args.agentEnv } } : {})
  }
}

function englishRecordedCwdNotice(recordedCwd: string): string {
  return `[Prompt] Continuing in this folder, not ${recordedCwd} where it last ran`
}

/** Printed before the agent starts; a full-screen agent then covers it until it exits. */
function recordedCwdNoticeCommand(notice: string, shell: AgentStartupShell): string {
  const quoted = quoteStartupArg(notice, shell)
  if (shell === 'powershell') {
    return `Write-Output ${quoted}`
  }
  return shell === 'cmd' ? `echo ${quoted}` : `printf '%s\\n' ${quoted}`
}

/** WSL panes start at a UNC path while the agent reports its Linux path. */
function isSameFolder(agentCwd: string, launchCwd: string): boolean {
  const launchPath = parseWslUncPath(launchCwd)?.linuxPath ?? launchCwd
  return (
    normalizeRuntimePathForComparison(agentCwd) === normalizeRuntimePathForComparison(launchPath)
  )
}
