import {
  agentLaunchPermissionSettings,
  resolvedTuiAgentArgsBypassPermissions,
  resolveTuiAgentLaunchArgs,
  type AgentLaunchProfileSettings
} from '../../../../shared/tui-agent-launch-defaults'
import {
  hasTypedAgentPermission,
  readLaunchPermissionChoice,
  resolveAgentPermission
} from '../../../../shared/tui-agent-permission-choice'
import { translate } from '@/i18n/i18n'
import { CLAUDE_SESSION_OPTION_CATALOG } from '../../../../shared/agent-session-option-catalog-claude-codex'

// Prompt "new Claude session" start box (decision 1A): what the box offers and how its picks
// become the launch's flags. The launch itself still goes through launchAgentInNewTab, so the
// user's Arguments, the permission flags and the spawn-time --plugin-dir all stay as they were.

/** `--effort` levels in the order the box lists them; null (the first row) adds no flag. */
export const PROMPT_CLAUDE_START_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type PromptClaudeStartEffort = (typeof PROMPT_CLAUDE_START_EFFORTS)[number]

export type PromptClaudeStartChoices = {
  /** A Claude catalog model id; null launches without `--model`. */
  model: string | null
  effort: PromptClaudeStartEffort | null
  /** Switch id → on. A switch missing here starts at its own default. */
  switches: Readonly<Record<string, boolean>>
}

/** Facts a switch reads for its default and its flags. */
export type PromptClaudeStartContext = {
  /** The saved permission already skips confirmations (Yolo), as the onboarding switch reads it. */
  savedYolo: boolean
}

/** What one switch adds to the launch: raw CLI tokens and/or a saved session choice. */
export type PromptClaudeStartContribution = {
  args?: readonly string[]
  sessionOptions?: Readonly<Record<string, string>>
}

export type PromptClaudeStartSwitch = {
  id: string
  label: () => string
  description: () => string
  defaultValue: (context: PromptClaudeStartContext) => boolean
  apply: (on: boolean, context: PromptClaudeStartContext) => PromptClaudeStartContribution
}

/**
 * The box's switches, top to bottom. New ones (plan first, new worktree, phone link…) are one
 * more entry here; the box, its memory and the launch all read this list.
 */
export const PROMPT_CLAUDE_START_SWITCHES: readonly PromptClaudeStartSwitch[] = [
  {
    id: 'chrome',
    label: () => translate('prompt.claudeStart.switch.chrome.label', 'Use Chrome'),
    description: () =>
      translate('prompt.claudeStart.switch.chrome.description', 'Lets Claude drive the browser'),
    defaultValue: () => false,
    apply: (on) => (on ? { args: ['--chrome'] } : {})
  },
  {
    id: 'skipPermissions',
    label: () => translate('prompt.claudeStart.switch.skipPermissions.label', 'Skip permissions'),
    description: () =>
      translate(
        'prompt.claudeStart.switch.skipPermissions.description',
        "Don't ask before each command"
      ),
    defaultValue: (context) => context.savedYolo,
    // Same values as onboarding's Yolo switch (full-access / own). A switch left as saved adds
    // nothing, so a saved Auto mode is not swapped for full access.
    apply: (on, context) =>
      on === context.savedYolo
        ? {}
        : { sessionOptions: { permissionMode: on ? 'full-access' : 'own' } }
  }
]

export const PROMPT_CLAUDE_START_MODELS = CLAUDE_SESSION_OPTION_CATALOG.models

/** Whether the saved settings already launch Claude without confirmations. */
export function promptClaudeSavedYolo(
  settings: AgentLaunchProfileSettings | null | undefined,
  platform: NodeJS.Platform | undefined
): boolean {
  if (hasTypedAgentPermission(settings)) {
    const { choice } = resolveAgentPermission('claude', settings)
    return choice === 'full-access' || choice === 'auto'
  }
  // Profiles from before typed permissions keep the bypass flag in their Arguments.
  return resolvedTuiAgentArgsBypassPermissions('claude', settings, platform ?? 'linux')
}

export function promptClaudeSwitchValue(
  choices: PromptClaudeStartChoices,
  entry: PromptClaudeStartSwitch,
  context: PromptClaudeStartContext
): boolean {
  return choices.switches[entry.id] ?? entry.defaultValue(context)
}

const RESUME_SESSION_ID = /^[A-Za-z0-9_-]+$/

/**
 * The launchAgentInNewTab inputs for these picks. `agentArgs` stays undefined unless a switch or
 * a resume needs raw tokens, so a plain start takes exactly the app's usual path; when present
 * it is the user's own Arguments (as that launch would compute them) plus the extra tokens.
 */
export function buildPromptClaudeStartLaunch(args: {
  choices: PromptClaudeStartChoices
  context: PromptClaudeStartContext
  settings: AgentLaunchProfileSettings | null | undefined
  resumeSessionId?: string | null
}): { sessionOptions?: Record<string, string>; agentArgs?: string } {
  const { choices, context } = args
  const sessionOptions: Record<string, string> = {}
  const switchArgs: string[] = []
  if (choices.model && PROMPT_CLAUDE_START_MODELS.some((model) => model.id === choices.model)) {
    sessionOptions.model = choices.model
  }
  if (choices.effort && PROMPT_CLAUDE_START_EFFORTS.includes(choices.effort)) {
    sessionOptions.effort = choices.effort
  }
  for (const entry of PROMPT_CLAUDE_START_SWITCHES) {
    const contribution = entry.apply(promptClaudeSwitchValue(choices, entry, context), context)
    Object.assign(sessionOptions, contribution.sessionOptions)
    switchArgs.push(...(contribution.args ?? []))
  }
  const resumeArgs =
    args.resumeSessionId && RESUME_SESSION_ID.test(args.resumeSessionId)
      ? ['--resume', args.resumeSessionId]
      : []
  const hasOptions = Object.keys(sessionOptions).length > 0
  if (switchArgs.length === 0 && resumeArgs.length === 0) {
    return hasOptions ? { sessionOptions } : {}
  }
  // Mirrors launchAgentInNewTab's own default: a launch choice leaves the permission to sessionOptions.
  const permissionSettings = agentLaunchPermissionSettings(
    'claude',
    args.settings ?? {},
    hasOptions ? sessionOptions : undefined
  )
  const baseArgs = resolveTuiAgentLaunchArgs(
    'claude',
    permissionSettings,
    readLaunchPermissionChoice(sessionOptions) ? 'own' : undefined
  )
  // A flag the user's Arguments already carry is not repeated.
  const baseTokens = new Set(baseArgs.split(/\s+/))
  const agentArgs = [
    baseArgs,
    ...switchArgs.filter((token) => !baseTokens.has(token)),
    ...resumeArgs
  ]
    .filter(Boolean)
    .join(' ')
  return hasOptions ? { sessionOptions, agentArgs } : { agentArgs }
}

/** Reads one project's remembered picks, dropping anything this build does not know. */
export function parsePromptClaudeStartChoices(value: unknown): PromptClaudeStartChoices {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const model =
    typeof record.model === 'string' &&
    PROMPT_CLAUDE_START_MODELS.some((entry) => entry.id === record.model)
      ? record.model
      : null
  const effort = PROMPT_CLAUDE_START_EFFORTS.find((level) => level === record.effort) ?? null
  const rawSwitches =
    record.switches && typeof record.switches === 'object'
      ? (record.switches as Record<string, unknown>)
      : {}
  const switches: Record<string, boolean> = {}
  for (const entry of PROMPT_CLAUDE_START_SWITCHES) {
    if (typeof rawSwitches[entry.id] === 'boolean') {
      switches[entry.id] = rawSwitches[entry.id] as boolean
    }
  }
  return { model, effort, switches }
}
