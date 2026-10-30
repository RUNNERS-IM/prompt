import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getFocusedWindow: () => null } }))

import {
  recordPromptPtyOwner,
  registerPromptExtraWindow,
  resetPromptWindowRegistryForTests,
  setPromptTabOwner
} from './prompt-window-registry'
import {
  isPromptAppWindowSender,
  promptRoutedRuntimeSend,
  promptWindowForTab
} from './prompt-window-routing'

function fakeWindow(id: number) {
  const send = vi.fn()
  const webContents = { id, isDestroyed: () => false, send }
  return { id, isDestroyed: () => false, webContents, send }
}

describe('prompt window routing', () => {
  afterEach(() => resetPromptWindowRegistryForTests())

  it('sends tab and terminal notices to the window that shows them, shared notices everywhere', () => {
    const extra = fakeWindow(2)
    registerPromptExtraWindow('w1', extra.webContents, extra)
    setPromptTabOwner('tab-b', 'w1')
    recordPromptPtyOwner('pty-b', extra.webContents)
    const mainSend = vi.fn(() => true)
    const send = promptRoutedRuntimeSend(mainSend)

    send('ui:revealTerminalPane', { tabId: 'tab-b' })
    expect(extra.send).toHaveBeenCalledWith('ui:revealTerminalPane', { tabId: 'tab-b' })
    expect(mainSend).not.toHaveBeenCalled()

    send('ui:focusTerminal', { ptyId: 'pty-b' })
    expect(extra.send).toHaveBeenCalledWith('ui:focusTerminal', { ptyId: 'pty-b' })
    expect(mainSend).not.toHaveBeenCalled()

    send('ui:revealTerminalPane', { tabId: 'tab-a' })
    expect(mainSend).toHaveBeenCalledWith('ui:revealTerminalPane', { tabId: 'tab-a' })

    send('ui:createTerminal', { worktreeId: 'repoB::/b' })
    expect(mainSend).toHaveBeenCalledWith('ui:createTerminal', { worktreeId: 'repoB::/b' })

    send('worktrees:changed', { repoId: 'repoB' })
    expect(extra.send).toHaveBeenCalledWith('worktrees:changed', { repoId: 'repoB' })
    expect(mainSend).toHaveBeenCalledWith('worktrees:changed', { repoId: 'repoB' })
  })

  it('finds the window of a tab', () => {
    const main = fakeWindow(1)
    const extra = fakeWindow(2)
    registerPromptExtraWindow('w1', extra.webContents, extra)
    setPromptTabOwner('tab-b', 'w1')
    type W = Parameters<typeof promptWindowForTab>[0]
    const m = main as unknown as W
    expect(promptWindowForTab(m, 'tab-b')).toBe(extra)
    expect(promptWindowForTab(m, 'tab-a')).toBe(main)
    expect(promptWindowForTab(m, undefined)).toBe(main)
  })

  it('accepts replies from the main window or an extra window only', () => {
    const extra = fakeWindow(2)
    registerPromptExtraWindow('w1', extra.webContents, extra)
    expect(isPromptAppWindowSender({ id: 1 }, { id: 1 })).toBe(true)
    expect(isPromptAppWindowSender({ id: 2 }, { id: 1 })).toBe(true)
    expect(isPromptAppWindowSender({ id: 3 }, { id: 1 })).toBe(false)
  })
})
