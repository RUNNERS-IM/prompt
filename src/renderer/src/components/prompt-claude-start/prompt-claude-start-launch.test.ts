import { describe, expect, it } from 'vitest'
import {
  agentLaunchPermissionSettings,
  resolveTuiAgentLaunchArgs,
  type AgentLaunchProfileSettings
} from '../../../../shared/tui-agent-launch-defaults'
import { readLaunchPermissionChoice } from '../../../../shared/tui-agent-permission-choice'
import { terminalSessionOptionInputs } from '../../../../shared/tui-agent-launch-command'
import { buildAgentStartupPlan } from '../../../../shared/tui-agent-startup'
import {
  buildPromptClaudeStartLaunch,
  parsePromptClaudeStartChoices,
  promptClaudeSavedYolo,
  PROMPT_CLAUDE_START_SWITCHES,
  type PromptClaudeStartChoices
} from './prompt-claude-start-launch'

const NONE: PromptClaudeStartChoices = { model: null, effort: null, switches: {} }

/** The command launchAgentInNewTab would queue for these inputs (same steps, local posix). */
function launchCommand(
  settings: AgentLaunchProfileSettings,
  launch: { sessionOptions?: Record<string, string>; agentArgs?: string }
): string | undefined {
  const permissionSettings = agentLaunchPermissionSettings(
    'claude',
    settings,
    launch.sessionOptions
  )
  const agentArgs =
    launch.agentArgs !== undefined
      ? launch.agentArgs
      : resolveTuiAgentLaunchArgs(
          'claude',
          permissionSettings,
          readLaunchPermissionChoice(launch.sessionOptions) ? 'own' : undefined
        )
  return buildAgentStartupPlan({
    agent: 'claude',
    prompt: '',
    cmdOverrides: {},
    platform: 'darwin',
    allowEmptyPromptLaunch: true,
    agentArgs,
    ...terminalSessionOptionInputs({
      agent: 'claude',
      sessionOptions: launch.sessionOptions,
      agentArgs,
      shell: 'posix'
    })
  })?.launchCommand
}

function build(
  settings: AgentLaunchProfileSettings,
  choices: PromptClaudeStartChoices,
  resumeSessionId?: string
) {
  const context = { savedYolo: promptClaudeSavedYolo(settings, 'darwin') }
  return buildPromptClaudeStartLaunch({ choices, context, settings, resumeSessionId })
}

const YOLO: AgentLaunchProfileSettings = { agentPermissionDefault: 'full-access' }
const ASK: AgentLaunchProfileSettings = { agentPermissionDefault: 'ask' }

describe('buildPromptClaudeStartLaunch', () => {
  it('leaves an untouched box on the usual launch path', () => {
    expect(build(YOLO, NONE)).toEqual({})
    expect(launchCommand(YOLO, build(YOLO, NONE))).toBe("claude '--dangerously-skip-permissions'")
  })

  it('adds --model and --effort only when picked', () => {
    const launch = build(YOLO, { model: 'opus', effort: 'xhigh', switches: {} })
    expect(launch).toEqual({ sessionOptions: { model: 'opus', effort: 'xhigh' } })
    expect(launchCommand(YOLO, launch)).toBe(
      "claude '--dangerously-skip-permissions' '--model' 'opus' '--effort' 'xhigh'"
    )
  })

  it('ignores a model or effort this build does not know', () => {
    expect(build(YOLO, { model: 'gpt', effort: 'huge' as never, switches: {} })).toEqual({})
  })

  it('adds --chrome next to the permission flag and the user Arguments', () => {
    const settings = { ...YOLO, agentDefaultArgs: { claude: '--verbose' } }
    const launch = build(settings, { ...NONE, switches: { chrome: true } })
    expect(launch.agentArgs).toBe('--dangerously-skip-permissions --verbose --chrome')
    expect(launchCommand(settings, launch)).toBe(
      "claude '--dangerously-skip-permissions' '--verbose' '--chrome'"
    )
  })

  it('does not repeat --chrome the user Arguments already carry', () => {
    const settings = { ...YOLO, agentDefaultArgs: { claude: '--chrome' } }
    expect(build(settings, { ...NONE, switches: { chrome: true } }).agentArgs).toBe(
      '--dangerously-skip-permissions --chrome'
    )
  })

  it('turns confirmations off for one launch when the saved mode asks', () => {
    const launch = build(ASK, { ...NONE, switches: { skipPermissions: true } })
    expect(launch).toEqual({ sessionOptions: { permissionMode: 'full-access' } })
    expect(launchCommand(ASK, launch)).toBe("claude '--dangerously-skip-permissions'")
  })

  it('drops the bypass flag when switched off under a saved Yolo mode', () => {
    const launch = build(YOLO, { ...NONE, switches: { skipPermissions: false } })
    expect(launch).toEqual({ sessionOptions: { permissionMode: 'own' } })
    expect(launchCommand(YOLO, launch)).toBe('claude')
  })

  it('keeps a saved Auto mode when the switch is left on', () => {
    const settings: AgentLaunchProfileSettings = { agentPermissionDefault: 'auto' }
    expect(build(settings, { ...NONE, switches: { skipPermissions: true } })).toEqual({})
  })

  it('resumes with the same picks', () => {
    const launch = build(
      ASK,
      {
        model: 'sonnet',
        effort: null,
        switches: { chrome: true, skipPermissions: true }
      },
      'abc-123'
    )
    expect(launch).toEqual({
      sessionOptions: { model: 'sonnet', permissionMode: 'full-access' },
      agentArgs: '--chrome --resume abc-123'
    })
    expect(launchCommand(ASK, launch)).toBe(
      "claude '--chrome' '--resume' 'abc-123' '--model' 'sonnet' '--dangerously-skip-permissions'"
    )
  })

  it('refuses a resume id that is not a plain token', () => {
    expect(build(YOLO, NONE, 'x; rm -rf /')).toEqual({})
  })
})

describe('promptClaudeSavedYolo', () => {
  it('reads typed and legacy permission settings', () => {
    expect(promptClaudeSavedYolo(YOLO, 'darwin')).toBe(true)
    expect(promptClaudeSavedYolo({ agentPermissionDefault: 'auto' }, 'darwin')).toBe(true)
    expect(promptClaudeSavedYolo(ASK, 'darwin')).toBe(false)
    expect(
      promptClaudeSavedYolo(
        { ...YOLO, agentPermissionOverrides: { claude: 'accept-edits' } },
        'darwin'
      )
    ).toBe(false)
    // Untyped profiles fall back to the legacy bypass default.
    expect(promptClaudeSavedYolo({}, 'darwin')).toBe(true)
  })
})

describe('switch list', () => {
  it('shows Chrome off and the permission switch at the saved value by default', () => {
    expect(PROMPT_CLAUDE_START_SWITCHES.map((entry) => entry.id)).toEqual([
      'chrome',
      'skipPermissions'
    ])
    const [chrome, skip] = PROMPT_CLAUDE_START_SWITCHES
    expect(chrome!.defaultValue({ savedYolo: true })).toBe(false)
    expect(skip!.defaultValue({ savedYolo: true })).toBe(true)
    expect(skip!.defaultValue({ savedYolo: false })).toBe(false)
  })
})

describe('parsePromptClaudeStartChoices', () => {
  it('keeps known picks and drops the rest', () => {
    expect(
      parsePromptClaudeStartChoices({
        model: 'opus',
        effort: 'max',
        switches: { chrome: true, skipPermissions: 'yes', gone: true }
      })
    ).toEqual({ model: 'opus', effort: 'max', switches: { chrome: true } })
    expect(parsePromptClaudeStartChoices({ model: 'gpt', effort: 'loud' })).toEqual(NONE)
    expect(parsePromptClaudeStartChoices(null)).toEqual(NONE)
  })
})
