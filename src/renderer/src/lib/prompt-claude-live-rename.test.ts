import { describe, expect, it } from 'vitest'
import { resolveTerminalTabTitle } from '../../../shared/tab-title-resolution'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { promptTerminalTabName } from '@/components/sidebar/prompt-session-row-name'
import type { AppState } from '@/store/types'
import { applyPromptClaudeSessionTitle } from './prompt-claude-live-rename'

function makeState(customTitle: string | null = null) {
  let tab: TerminalTab = {
    id: 'tab-1',
    ptyId: null,
    worktreeId: 'wt-1',
    title: '✳ old name',
    aiVaultTitle: { agent: 'claude', sessionId: 'claude-session', title: 'old name' },
    customTitle,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
  const state = {
    activeWorktreeId: 'wt-1',
    agentStatusByPaneKey: {
      'tab-1:leaf-1': {
        state: 'done',
        prompt: '',
        updatedAt: 1,
        stateStartedAt: 1,
        agentType: 'claude',
        paneKey: 'tab-1:leaf-1',
        tabId: 'tab-1',
        worktreeId: 'wt-1',
        providerSession: {
          key: 'session_id',
          id: 'claude-session',
          transcriptPath: '/sessions/claude.jsonl'
        },
        stateHistory: []
      }
    },
    retainedAgentsByPaneKey: {},
    sleepingAgentSessionsByPaneKey: {},
    get tabsByWorktree() {
      return { 'wt-1': [tab] }
    },
    terminalLayoutsByTabId: {
      'tab-1': { root: { type: 'leaf', leafId: 'leaf-1' }, activeLeafId: 'leaf-1' }
    },
    worktreesByRepo: {},
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    getKnownWorktreeById: () => ({ path: '/repo' }),
    setAiVaultTabTitle: (tabId: string, aiVaultTitle: TerminalTab['aiVaultTitle']) => {
      if (tabId === tab.id) {
        tab = { ...tab, aiVaultTitle }
      }
    }
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the test state carries only the slices the title request collector reads.
  } as unknown as AppState
  return { state, tab: () => tab }
}

describe('applyPromptClaudeSessionTitle', () => {
  it('renames the tab strip and sidebar row of the tracked Claude session', () => {
    const { state, tab } = makeState()
    const applied = applyPromptClaudeSessionTitle(state, {
      paneKey: 'tab-1:leaf-1',
      sessionId: 'claude-session',
      title: 'new name'
    })
    expect(applied).toBe(true)
    expect(resolveTerminalTabTitle(tab(), false)).toBe('new name')
    expect(promptTerminalTabName(tab())).toBe('new name')
  })

  it('keeps a name the user set on the tab', () => {
    const { state, tab } = makeState('my tab')
    applyPromptClaudeSessionTitle(state, {
      paneKey: 'tab-1:leaf-1',
      sessionId: 'claude-session',
      title: 'new name'
    })
    expect(resolveTerminalTabTitle(tab(), false)).toBe('my tab')
    expect(promptTerminalTabName(tab())).toBe('my tab')
  })

  it('ignores a title from a session the tab no longer tracks', () => {
    const { state, tab } = makeState()
    const applied = applyPromptClaudeSessionTitle(state, {
      paneKey: 'tab-1:leaf-1',
      sessionId: 'older-session',
      title: 'stale'
    })
    expect(applied).toBe(false)
    expect(tab().aiVaultTitle?.title).toBe('old name')
  })
})
