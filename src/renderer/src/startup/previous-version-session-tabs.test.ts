import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PreviousVersionSessionTabCandidate } from '../../../shared/previous-version-session-tabs'

const { storeState } = vi.hoisted(() => ({
  storeState: { current: {} as Record<string, unknown> }
}))

vi.mock('../store', () => ({
  useAppStore: { getState: () => storeState.current }
}))

import {
  createPreviousVersionSessionTabs,
  planPreviousVersionSessionTabs
} from './previous-version-session-tabs'

const WT = 'repo1::/wt-a'
const GONE_WT = 'repo1::/wt-deleted'
const SSH_WT = 'ssh-repo::/srv/wt'

function candidate(sessionId: string, worktreeId = WT): PreviousVersionSessionTabCandidate {
  return { sessionId, worktreeId, lastActivityAtMs: 1 }
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    tabsByWorktree: {},
    terminalLayoutsByTabId: {},
    ptyIdsByTabId: {},
    pendingReconnectPtyIdByTabId: {},
    repos: [
      { id: 'repo1', connectionId: null },
      { id: 'ssh-repo', connectionId: 'target-1' }
    ],
    // repo1's listing loaded and lacks wt-deleted, which proves it was removed.
    worktreesByRepo: { repo1: [{ id: WT }], 'ssh-repo': [{ id: SSH_WT }] },
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    ...overrides
  }
}

describe('planning tabs for previous-version terminals', () => {
  it('skips sessions a tab already names, gone workspaces and remote ones', () => {
    const plan = planPreviousVersionSessionTabs(
      baseState({
        tabsByWorktree: { [WT]: [{ id: 'tab-1', ptyId: null }] },
        terminalLayoutsByTabId: {
          'tab-1': {
            root: null,
            activeLeafId: null,
            expandedLeafId: null,
            ptyIdsByLeafId: { l: `${WT}@@bound` }
          }
        }
      }) as never,
      [
        candidate(`${WT}@@bound`),
        candidate(`${GONE_WT}@@x`, GONE_WT),
        candidate(`${SSH_WT}@@y`, SSH_WT),
        candidate(`${WT}@@free`),
        candidate(`${WT}@@free`)
      ]
    )

    expect(plan.create.map((entry) => entry.sessionId)).toEqual([`${WT}@@free`])
    expect(plan.skipped).toEqual({ 'has-tab': 2, 'workspace-gone': 1, 'remote-workspace': 1 })
  })
})

describe('creating tabs for previous-version terminals', () => {
  const list = vi.fn()
  const report = vi.fn(async () => {})
  const createTab = vi.fn()

  beforeEach(() => {
    list.mockReset()
    report.mockClear()
    createTab.mockReset()
    storeState.current = { ...baseState(), createTab }
    // Minimal preload API for this module.
    globalThis.window = {
      api: { pty: { management: { previousVersionSessionTabs: { list, report } } } }
    } as never
  })

  it('creates an unfocused tab bound to each session and reports the counts', async () => {
    list.mockResolvedValue({
      status: 'pending',
      candidates: [candidate(`${WT}@@a`), candidate(`${GONE_WT}@@b`, GONE_WT)]
    })

    await createPreviousVersionSessionTabs()

    expect(createTab).toHaveBeenCalledTimes(1)
    expect(createTab).toHaveBeenCalledWith(WT, undefined, undefined, {
      activate: false,
      recordInteraction: false,
      initialPtyId: `${WT}@@a`
    })
    expect(report).toHaveBeenCalledWith({ created: 1, skipped: { 'workspace-gone': 1 } })
  })

  it('does nothing when main says it was already done', async () => {
    list.mockResolvedValue({ status: 'done' })
    await createPreviousVersionSessionTabs()
    expect(createTab).not.toHaveBeenCalled()
    expect(report).not.toHaveBeenCalled()
  })

  it('counts a tab that could not be created', async () => {
    list.mockResolvedValue({ status: 'pending', candidates: [candidate(`${WT}@@a`)] })
    createTab.mockImplementation(() => {
      throw new Error('boom')
    })
    await createPreviousVersionSessionTabs()
    expect(report).toHaveBeenCalledWith({ created: 0, skipped: { 'create-failed': 1 } })
  })
})
