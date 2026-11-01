import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  checkPromptSharedReloadForTests,
  installPromptSharedReload,
  resetPromptSharedReloadForTests
} from './prompt-shared-reload'
import {
  notePromptSharedRead,
  notePromptSharedWrite,
  resetPromptSharedSyncForTests
} from './prompt-shared-sync'
import { notePromptWindowTyped } from './prompt-window-focus-order'

const WT = 'repoA::/a'

function session(ids: string[]) {
  return {
    tabsByWorktree: { [WT]: ids.map((id) => ({ id, worktreeId: WT, customTitle: null })) },
    terminalLayoutsByTabId: Object.fromEntries(
      ids.map((id) => [
        id,
        { root: { type: 'leaf', leafId: 'l1' }, ptyIdsByLeafId: { l1: `p-${id}` } }
      ])
    )
  }
}

function fakeWindow(id: number, focused: boolean) {
  return {
    isDestroyed: () => false,
    isFocused: () => focused,
    webContents: { id, isDestroyed: () => false, reload: vi.fn() }
  }
}

describe('prompt shared tabs reload', () => {
  afterEach(() => {
    vi.useRealTimers()
    resetPromptSharedReloadForTests()
    resetPromptSharedSyncForTests()
  })

  it('reloads a window that is behind, after its user stops typing', () => {
    vi.useFakeTimers()
    const main = fakeWindow(1, false)
    const extra = fakeWindow(2, true)
    const windows: Record<string, typeof main> = { main, w1: extra }
    installPromptSharedReload({
      keys: () => ['main', 'w1'],
      windowOf: (key) => windows[key] ?? null
    })
    notePromptSharedRead('main', null, session(['t1']), session(['t1']))
    notePromptSharedRead('w1', null, session(['t1']), session(['t1']))
    notePromptWindowTyped(2)
    notePromptSharedWrite('main', null, session(['t1', 't2']), session(['t1', 't2']))
    checkPromptSharedReloadForTests(false)
    expect(extra.webContents.reload).not.toHaveBeenCalled()
    vi.advanceTimersByTime(3500)
    expect(extra.webContents.reload).toHaveBeenCalledTimes(1)
    expect(main.webContents.reload).not.toHaveBeenCalled()
    // Its unload save does not make it look behind again before it has read the session.
    notePromptSharedWrite('w1', null, session(['t1']), session(['t1', 't2']))
    checkPromptSharedReloadForTests(true)
    vi.advanceTimersByTime(5000)
    expect(extra.webContents.reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing with one window', () => {
    const main = fakeWindow(1, false)
    installPromptSharedReload({
      keys: () => ['main', 'w1'],
      windowOf: (key) => (key === 'main' ? main : null)
    })
    notePromptSharedRead('main', null, session(['t1']), session(['t1', 't2']))
    checkPromptSharedReloadForTests(true)
    expect(main.webContents.reload).not.toHaveBeenCalled()
  })
})
