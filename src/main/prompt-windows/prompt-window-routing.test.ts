import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ BrowserWindow: { getFocusedWindow: () => null } }))

import {
  registerPromptProjectWindow,
  resetPromptProjectWindowRegistryForTests,
  setPromptStoredSessionReader
} from './prompt-project-window-registry'
import {
  isPromptAppWindowSender,
  promptRepoIdOfTab,
  promptRoutedRuntimeSend,
  promptWindowForTab,
  promptWindowForWorktree,
  promptWindowForWorktrees
} from './prompt-window-routing'

function fakeWindow(id: number) {
  const send = vi.fn()
  const webContents = { id, isDestroyed: () => false, send }
  return { id, isDestroyed: () => false, webContents, send }
}

describe('prompt window routing', () => {
  afterEach(() => resetPromptProjectWindowRegistryForTests())

  it('sends project notices to the project window and shared notices everywhere', () => {
    const project = fakeWindow(2)
    registerPromptProjectWindow('repoB', project.webContents, project)
    const mainSend = vi.fn(() => true)
    const send = promptRoutedRuntimeSend(mainSend)

    send('ui:createTerminal', { worktreeId: 'repoB::/b', command: 'ls' })
    expect(project.send).toHaveBeenCalledWith('ui:createTerminal', {
      worktreeId: 'repoB::/b',
      command: 'ls'
    })
    expect(mainSend).not.toHaveBeenCalled()

    send('ui:createTerminal', { worktreeId: 'repoA::/a' })
    expect(mainSend).toHaveBeenCalledWith('ui:createTerminal', { worktreeId: 'repoA::/a' })

    send('worktrees:changed', { repoId: 'repoB' })
    expect(project.send).toHaveBeenCalledWith('worktrees:changed', { repoId: 'repoB' })
    expect(mainSend).toHaveBeenCalledWith('worktrees:changed', { repoId: 'repoB' })
  })

  it('finds the window of a worktree, a saved tab or a set of worktrees', () => {
    const main = fakeWindow(1)
    const project = fakeWindow(2)
    registerPromptProjectWindow('repoB', project.webContents, project)
    setPromptStoredSessionReader(() => ({
      tabsByWorktree: { 'repoB::/b': [{ id: 'tab-b' }], 'repoA::/a': [{ id: 'tab-a' }] }
    }))
    type W = Parameters<typeof promptWindowForWorktree>[0]
    const m = main as unknown as W
    expect(promptWindowForWorktree(m, 'repoB::/b')).toBe(project)
    expect(promptWindowForWorktree(m, 'repoA::/a')).toBe(main)
    expect(promptRepoIdOfTab('tab-b')).toBe('repoB')
    expect(promptWindowForTab(m, 'tab-b')).toBe(project)
    expect(promptWindowForTab(m, 'tab-a')).toBe(main)
    expect(promptWindowForWorktrees(m, ['repoB::/b', 'repoB::/c'])).toBe(project)
    expect(promptWindowForWorktrees(m, ['repoB::/b', 'repoA::/a'])).toBe(main)
  })

  it('accepts replies from the main window or a project window only', () => {
    const project = fakeWindow(2)
    registerPromptProjectWindow('repoB', project.webContents, project)
    expect(isPromptAppWindowSender({ id: 1 }, { id: 1 })).toBe(true)
    expect(isPromptAppWindowSender({ id: 2 }, { id: 1 })).toBe(true)
    expect(isPromptAppWindowSender({ id: 3 }, { id: 1 })).toBe(false)
  })
})
