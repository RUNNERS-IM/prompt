import { describe, expect, it } from 'vitest'
import { hasClosedTerminalTabRecord } from '../../../../shared/closed-terminal-tab-tombstones'
import { recordTerminalProcessExitClose } from './terminal-process-exit-tombstone'

describe('recordTerminalProcessExitClose', () => {
  it('records the close and drops only that tab’s resume records', () => {
    const sleeping = {
      'tab-1:leaf-1': { tabId: 'tab-1' },
      'tab-2:leaf-1': { tabId: 'tab-2' }
    } as never
    const next = recordTerminalProcessExitClose(
      { closedTerminalTabTombstonesByTabId: {}, sleepingAgentSessionsByPaneKey: sleeping },
      'tab-1',
      'wt-1',
      1_000
    )
    expect(
      hasClosedTerminalTabRecord(next.closedTerminalTabTombstonesByTabId, 'tab-1', 'wt-1', 1_000)
    ).toBe(true)
    expect(next.closedTerminalTabTombstonesByTabId['tab-1']?.reason).toBe('pty-exit')
    expect(Object.keys(next.sleepingAgentSessionsByPaneKey)).toEqual(['tab-2:leaf-1'])
  })
})
