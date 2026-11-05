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
    },
    setTabCustomTitle: (tabId: string, title: string | null) => {
      if (tabId === tab.id) {
        tab = { ...tab, customTitle: title }
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

  it('keeps a name set on the tab over a later conversation title, also after a restart', () => {
    // `terminal create --title X` or `prompt session rename` stores X as the tab's set name.
    const { state, tab } = makeState('X')
    // A /rename, or the title the watch reads back from the transcript on launch.
    applyPromptClaudeSessionTitle(state, {
      paneKey: 'tab-1:leaf-1',
      sessionId: 'claude-session',
      title: 'Y'
    })
    expect(resolveTerminalTabTitle(tab(), false)).toBe('X')
    expect(promptTerminalTabName(tab())).toBe('X')
    const restored: TerminalTab = JSON.parse(JSON.stringify(tab()))
    expect(restored.customTitle).toBe('X')
    expect(restored.aiVaultTitle?.title).toBe('Y')
    // Clearing the set name (tab menu, empty rename) shows the conversation title.
    state.setTabCustomTitle('tab-1', null)
    expect(resolveTerminalTabTitle(tab(), false)).toBe('Y')
  })

  it('keeps a tab name set after the /rename when Claude repeats the same title', () => {
    const { state, tab } = makeState()
    applyPromptClaudeSessionTitle(state, {
      paneKey: 'tab-1:leaf-1',
      sessionId: 'claude-session',
      title: 'Y'
    })
    // The user renames the tab from the tab menu afterwards.
    state.setTabCustomTitle('tab-1', 'Z')
    // Claude re-appends its custom-title record (for example after a restart and resume).
    applyPromptClaudeSessionTitle(state, {
      paneKey: 'tab-1:leaf-1',
      sessionId: 'claude-session',
      title: 'Y'
    })
    expect(resolveTerminalTabTitle(tab(), false)).toBe('Z')
    expect(promptTerminalTabName(tab())).toBe('Z')
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
