import type { AgentLaunchResult } from '../shared/agent-launch-intent'
import { TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY } from '../shared/protocol-version'
import type { RuntimeTerminalWait } from '../shared/runtime-types'
import type { TuiAgent } from '../shared/tui-agent'
import { getOptionalStringFlag } from './flags'
import { RuntimeClientError, type RuntimeClient, type RuntimeRpcSuccess } from './runtime-client'

const CLAUDE_READY_TIMEOUT_MS = 60_000
const CONTROL_CHARACTER = /\p{Cc}/u

type Flags = Map<string, string | boolean>

export function readAgentLaunchName(flags: Flags): string | undefined {
  if (!flags.has('name')) {
    return undefined
  }
  const name = getOptionalStringFlag(flags, 'name')?.trim()
  // The name is typed into the agent's prompt, so a newline would submit it early.
  if (!name || CONTROL_CHARACTER.test(name)) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--name must be a non-empty single line of text.'
    )
  }
  if (flags.get('surface') === 'chat') {
    throw new RuntimeClientError(
      'invalid_argument',
      '--name needs a terminal session; omit --surface chat.'
    )
  }
  return name
}

async function renameInsideClaude(
  client: RuntimeClient,
  handle: string,
  name: string
): Promise<boolean> {
  const ready = await client.call<{ wait: RuntimeTerminalWait }>(
    'terminal.wait',
    { terminal: handle, for: 'tui-idle', timeoutMs: CLAUDE_READY_TIMEOUT_MS },
    { timeoutMs: CLAUDE_READY_TIMEOUT_MS + 5000 }
  )
  if (!ready.result.wait.satisfied) {
    return false
  }
  const { runtime } = (await client.getCliStatus()).result
  await client.call(
    'terminal.send',
    {
      terminal: handle,
      text: `/rename ${name}`,
      enter: true,
      interrupt: false,
      agentPrompt: true,
      client: { id: 'orca-cli', type: 'desktop' }
    },
    runtime.capabilities?.includes(TERMINAL_PROMPT_DELIVERY_RUNTIME_CAPABILITY)
      ? { terminalPromptPreflight: { runtimeId: runtime.runtimeId } }
      : { legacyTerminalPrompt: true }
  )
  return true
}

/** The agent is already running, so a naming failure warns instead of inviting a second launch. */
export async function nameLaunchedSession<T extends AgentLaunchResult>(
  client: RuntimeClient,
  launched: RuntimeRpcSuccess<T>,
  agent: TuiAgent,
  name: string
): Promise<RuntimeRpcSuccess<T>> {
  const { handle } = launched.result.outcome
  const warnings = launched.result.warning ? [launched.result.warning] : []
  try {
    await client.call('terminal.rename', { terminal: handle, title: name })
    if (agent === 'claude' && !(await renameInsideClaude(client, handle, name))) {
      warnings.push('Claude was not ready, so /rename was not sent.')
    }
  } catch (error) {
    warnings.push(
      `The session started but could not be fully named: ${error instanceof Error ? error.message : String(error)}`
    )
  }
  return warnings.length > 0
    ? { ...launched, result: { ...launched.result, warning: warnings.join(' ') } }
    : launched
}
