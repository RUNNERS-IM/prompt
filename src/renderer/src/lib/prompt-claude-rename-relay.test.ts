import { describe, expect, it, vi } from 'vitest'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import type { AppState } from '@/store/types'
import {
  isClaudeInputBoxEmpty,
  startPromptClaudeRenameRelay,
  type PromptClaudeRenameDelivery
} from './prompt-claude-rename-relay'

function makeRelay(firstDelivery: PromptClaudeRenameDelivery = 'sent') {
  let tab: TerminalTab = {
    id: 'tab-1',
    ptyId: null,
    worktreeId: 'wt-1',
    title: 'Claude',
    customTitle: 'before',
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
  let agentState = 'working'
  let listener: () => void = () => {}
  const deliver = vi.fn(async (): Promise<PromptClaudeRenameDelivery> => firstDelivery)
  const makeState = () =>
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the relay reads only these fields.
    ({
      activeWorktreeId: 'wt-1',
      agentStatusByPaneKey: {
        'tab-1:leaf-1': {
          state: agentState,
          prompt: '',
          updatedAt: 1,
          stateStartedAt: 1,
          agentType: 'claude',
          paneKey: 'tab-1:leaf-1',
          tabId: 'tab-1',
          worktreeId: 'wt-1',
          providerSession: { key: 'session_id', id: 'claude-session' },
          stateHistory: []
        }
      },
      retainedAgentsByPaneKey: {},
      sleepingAgentSessionsByPaneKey: {},
      tabsByWorktree: { 'wt-1': [tab] },
      terminalLayoutsByTabId: {
        'tab-1': { root: { type: 'leaf', leafId: 'leaf-1' }, activeLeafId: 'leaf-1' }
      },
      worktreesByRepo: {},
      detectedWorktreesByRepo: {},
      folderWorkspaces: [],
      getKnownWorktreeById: () => ({ path: '/repo' })
    }) as unknown as AppState
  let state = makeState()
  const stop = startPromptClaudeRenameRelay({
    getState: () => state,
    subscribe: (next) => {
      listener = next
      return () => {}
    },
    deliver,
    retryMs: 1
  })
  const update = async (): Promise<void> => {
    state = makeState()
    listener()
    await vi.waitFor(() => Promise.resolve())
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
  return {
    deliver,
    stop,
    rename: (title: string | null) => {
      tab = { ...tab, customTitle: title }
      return update()
    },
    finishTurn: () => {
      agentState = 'done'
      return update()
    }
  }
}

describe('startPromptClaudeRenameRelay', () => {
  it('waits for a working Claude to finish, then types the name once', async () => {
    const relay = makeRelay()
    await relay.rename('after')
    expect(relay.deliver).not.toHaveBeenCalled()
    await relay.finishTurn()
    await relay.finishTurn()
    expect(relay.deliver).toHaveBeenCalledTimes(1)
    expect(relay.deliver).toHaveBeenCalledWith(expect.anything(), 'after')
    relay.stop()
  })

  it('drops the queued name when the set name is cleared', async () => {
    const relay = makeRelay()
    await relay.rename('after')
    await relay.rename(null)
    await relay.finishTurn()
    expect(relay.deliver).not.toHaveBeenCalled()
    relay.stop()
  })

  it('keeps trying while the input box is not ready', async () => {
    const relay = makeRelay('retry')
    await relay.finishTurn()
    await relay.rename('after')
    await vi.waitFor(() => expect(relay.deliver.mock.calls.length).toBeGreaterThan(1))
    relay.stop()
  })
})

describe('isClaudeInputBoxEmpty', () => {
  const rule = '────────────────── [REMOTE] 개발 ─'
  const status = '  ⏵⏵ bypass permissions on (shift+tab to cycle)'

  it('accepts the empty box Claude draws between its two rules', () => {
    expect(isClaudeInputBoxEmpty(['done', rule, '❯', '──────', status])).toBe(true)
  })

  it('accepts the dimmed suggestion a fresh Claude shows in its box', () => {
    expect(isClaudeInputBoxEmpty([rule, '❯ Try "fix typecheck errors"', '──────', status])).toBe(
      true
    )
  })

  it('refuses a box holding a draft on one or several lines', () => {
    expect(isClaudeInputBoxEmpty([rule, '❯ half a thought', '──────', status])).toBe(false)
    expect(isClaudeInputBoxEmpty([rule, '❯', '  second line', '──────', status])).toBe(false)
  })

  it('refuses a screen without the box', () => {
    expect(isClaudeInputBoxEmpty(['$ ls', 'file.txt'])).toBe(false)
    expect(isClaudeInputBoxEmpty(['  ❯ 1. Yes', '    2. No'])).toBe(false)
  })
})
