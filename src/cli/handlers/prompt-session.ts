import type { CommandHandler, HandlerContext } from '../dispatch'
import { dispatch } from '../dispatch'
import { getOptionalStringFlag, getRequiredStringFlag } from '../flags'
import { printResult } from '../format'
import { getOptionalWorktreeSelector, getTerminalHandle } from '../selectors'
import { RuntimeClientError } from '../runtime/types'
import { columnHeaders, emptyListText, formatTable, shortId } from '../command-tree/prompt-output'
import {
  listRepos,
  listTerminals,
  resolvePromptProjectSelector,
  resolvePromptTerminalSelector
} from '../command-tree/prompt-selectors'
import { terminalItem, terminalRow, type TerminalItem } from './prompt-lists'

export type SessionItem = TerminalItem & {
  agent: string
  resumeId: string | null
}

function formatSessionItems(result: { items: SessionItem[] }): string {
  if (result.items.length === 0) {
    return emptyListText()
  }
  const now = Date.now()
  return formatTable(
    columnHeaders(['id', 'name', 'project', 'state', 'last', 'resume']),
    result.items.map((item) => [...terminalRow(item, now), item.resumeId ?? '-'])
  )
}

async function sessionHandle(ctx: HandlerContext): Promise<string> {
  const selector = getOptionalStringFlag(ctx.flags, 'session')
  if (selector) {
    return await resolvePromptTerminalSelector(ctx.client, selector, {
      agentsOnly: true
    })
  }
  // No selector: the session in the calling terminal, like the terminal commands.
  return await getTerminalHandle(new Map(), ctx.cwd, ctx.client)
}

/** Run a terminal command against the session's terminal, keeping every other flag. */
function onSessionTerminal(
  terminalCommand: string,
  adapt: (flags: Map<string, string | boolean>) => void = () => {}
): CommandHandler {
  return async (ctx) => {
    const flags = new Map(ctx.flags)
    const selector = getOptionalStringFlag(ctx.flags, 'session')
    flags.delete('session')
    // Without a selector the terminal command targets the calling terminal itself.
    if (selector) {
      flags.set(
        'terminal',
        await resolvePromptTerminalSelector(ctx.client, selector, {
          agentsOnly: true
        })
      )
    }
    adapt(flags)
    await dispatch(['terminal', terminalCommand], { ...ctx, flags })
  }
}

type SessionMove = {
  handle: string
  tabId?: string
  moved: boolean
  worktreeId?: string
  reason?: string
}

function moveNextSteps(reason: string | undefined, handle: string): string[] {
  if (reason === 'running-program' || reason === 'idle-unknown') {
    // A running agent cannot change folders; reopening the conversation is the way across.
    return [
      `Wait until it is idle and retry, or close it with \`prompt session close ${shortId(handle)}\` and reopen it with \`prompt session resume <resume-id> --workspace <target>\`.`
    ]
  }
  return []
}

// Resume ids are typed into a shell; anything outside this set could run as shell syntax.
const RESUME_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/

function resumeCommand(agent: string, resumeId: string): string {
  if (agent === 'claude') {
    return `claude --resume ${resumeId}`
  }
  if (agent === 'codex') {
    return `codex resume ${resumeId}`
  }
  throw new RuntimeClientError('invalid_argument', '--agent must be claude or codex.')
}

export const PROMPT_SESSION_HANDLERS: Record<string, CommandHandler> = {
  'prompt session list': async ({ flags, client, cwd, json }) => {
    const projectFlag = getOptionalStringFlag(flags, 'project')
    const project = projectFlag ? await resolvePromptProjectSelector(client, projectFlag) : null
    const worktree = await getOptionalWorktreeSelector(flags, 'workspace', cwd, client)
    const [response, repos] = await Promise.all([
      listTerminals(client, worktree),
      listRepos(client)
    ])
    const projectId = project?.startsWith('id:') ? project.slice(3) : null
    const items = response.result.terminals
      .filter((terminal) => terminal.agentIdentity !== undefined)
      .map((terminal): SessionItem => ({
        ...terminalItem(terminal, repos),
        agent: terminal.agentIdentity!,
        resumeId: terminal.agentSessionId ?? null
      }))
      .filter((item) => !projectFlag || item.project?.id === projectId)
    printResult(
      {
        ...response,
        result: {
          items,
          totalCount: items.length,
          truncated: response.result.truncated
        }
      },
      json,
      formatSessionItems
    )
  },
  'prompt session resume': async (ctx) => {
    const resumeId = getRequiredStringFlag(ctx.flags, 'resume-id').trim()
    if (!RESUME_ID.test(resumeId)) {
      throw new RuntimeClientError(
        'invalid_argument',
        'The resume id may contain only letters, digits, ".", "_", ":", and "-".'
      )
    }
    const agent = getOptionalStringFlag(ctx.flags, 'agent') ?? 'claude'
    const command = resumeCommand(agent, resumeId)
    const live = (await listTerminals(ctx.client)).result.terminals.find(
      (terminal) => terminal.agentSessionId === resumeId
    )
    if (live) {
      // Two terminals writing one conversation would interleave its transcript.
      throw new RuntimeClientError(
        'already_open',
        `Session ${shortId(live.handle)} is already running this conversation.`,
        {
          id: live.handle,
          nextSteps: [`Use \`prompt session read ${shortId(live.handle)}\`.`]
        }
      )
    }
    const flags = new Map<string, string | boolean>([['command', command]])
    for (const [from, to] of [
      ['workspace', 'worktree'],
      ['name', 'title'],
      ['focus', 'focus']
    ] as const) {
      const value = ctx.flags.get(from)
      if (value !== undefined) {
        flags.set(to, value)
      }
    }
    for (const global of ['json', 'environment', 'pairing-code', 'host']) {
      const value = ctx.flags.get(global)
      if (value !== undefined) {
        flags.set(global, value)
      }
    }
    await dispatch(['terminal', 'create'], { ...ctx, flags })
  },
  'prompt session move': async (ctx) => {
    if (!ctx.flags.has('workspace')) {
      throw new RuntimeClientError(
        'invalid_argument',
        'Pass --workspace as the target. Find one with `prompt workspace list --project <project>`.'
      )
    }
    // Resolve the target first so a typo reports selector_not_found before anything moves.
    const worktree = await getOptionalWorktreeSelector(ctx.flags, 'workspace', ctx.cwd, ctx.client)
    const handle = await sessionHandle(ctx)
    const result = await ctx.client.call<{ move: SessionMove }>('terminal.moveToWorkspace', {
      terminal: handle,
      worktree
    })
    const { move } = result.result
    if (!move.moved) {
      throw new RuntimeClientError(
        'not_moved',
        `Session ${shortId(handle)} was not moved: ${move.reason ?? 'failed'}. Nothing was changed.`,
        {
          id: handle,
          reason: move.reason ?? 'failed',
          nextSteps: moveNextSteps(move.reason, handle)
        }
      )
    }
    printResult(
      result,
      ctx.json,
      ({ move: moved }) => `moved  ${shortId(moved.handle)} → workspace ${moved.worktreeId ?? '-'}`
    )
  },
  // --tab closes the whole tab and waits until the close is persisted.
  'prompt session close': onSessionTerminal('close', (flags) => flags.set('tab', true)),
  'prompt session rename': onSessionTerminal('rename', (flags) => {
    const name = flags.get('name')
    flags.delete('name')
    if (name !== undefined) {
      flags.set('title', name === true ? '' : name)
    }
  }),
  'prompt session read': onSessionTerminal('read'),
  'prompt session send': onSessionTerminal('send'),
  'prompt session wait': onSessionTerminal('wait')
}
