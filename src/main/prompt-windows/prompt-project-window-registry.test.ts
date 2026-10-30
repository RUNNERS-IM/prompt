import { afterEach, describe, expect, it } from 'vitest'
import {
  isPromptProjectWindowSender,
  markPromptQuitting,
  promptAllPtyWebContents,
  promptPtyControlAllowed,
  promptPtyDispatcherReady,
  promptPtyWebContents,
  promptReposMainWindowMustNotWrite,
  promptShouldHideMainWindowOnClose,
  recordPromptPtyWorktree,
  registerPromptProjectWindow,
  releasePromptReposHeldForMainReload,
  resetPromptProjectWindowRegistryForTests,
  setPromptProjectWindowDispatcherReady,
  unregisterPromptProjectWindow
} from './prompt-project-window-registry'

function contents(id: number, destroyed = false) {
  return { id, isDestroyed: () => destroyed, send: () => {} }
}

describe('prompt project window registry', () => {
  afterEach(() => resetPromptProjectWindowRegistryForTests())

  it('routes a pty to the window that owns its project, else to the main window', () => {
    const main = contents(1)
    const project = contents(2)
    recordPromptPtyWorktree('pty-a', 'repoA::/a')
    recordPromptPtyWorktree('pty-b', 'repoB::/b')
    expect(promptPtyWebContents(main, 'pty-b')).toBe(main)
    registerPromptProjectWindow('repoB', project)
    expect(promptPtyWebContents(main, 'pty-b')).toBe(project)
    expect(promptPtyWebContents(main, 'pty-a')).toBe(main)
    expect(promptPtyWebContents(main, 'unknown')).toBe(main)
    expect(isPromptProjectWindowSender(project)).toBe(true)
    expect(isPromptProjectWindowSender(main)).toBe(false)
  })

  it('keeps the main window off a closed project until the main window reloads', () => {
    registerPromptProjectWindow('repoB', contents(2))
    expect([...promptReposMainWindowMustNotWrite()]).toEqual(['repoB'])
    unregisterPromptProjectWindow('repoB', 2)
    expect([...promptReposMainWindowMustNotWrite()]).toEqual(['repoB'])
    releasePromptReposHeldForMainReload()
    expect([...promptReposMainWindowMustNotWrite()]).toEqual([])
  })

  it('hides the main window on close only while project windows are open and not quitting', () => {
    expect(promptShouldHideMainWindowOnClose(false)).toBe(false)
    registerPromptProjectWindow('repoB', contents(2))
    expect(promptShouldHideMainWindowOnClose(false)).toBe(true)
    expect(promptShouldHideMainWindowOnClose(true)).toBe(false)
    markPromptQuitting()
    expect(promptShouldHideMainWindowOnClose(false)).toBe(false)
  })

  it('routes a pty from its first byte by the worktree in its minted id', () => {
    const main = contents(1)
    const project = contents(2)
    registerPromptProjectWindow('repoB', project)
    expect(promptPtyWebContents(main, 'repoB::/b@@1a2b3c4d')).toBe(project)
    expect(promptPtyWebContents(main, 'repoA::/a@@1a2b3c4d')).toBe(main)
  })

  it('holds a project window pty until that window is ready, without touching the main window', () => {
    const project = contents(2)
    registerPromptProjectWindow('repoB', project)
    expect(promptPtyDispatcherReady(true, 'repoB::/b@@x')).toBe(false)
    expect(promptPtyDispatcherReady(true, 'repoA::/a@@x')).toBe(true)
    expect(promptPtyDispatcherReady(false, 'repoA::/a@@x')).toBe(false)
    setPromptProjectWindowDispatcherReady(2, true)
    expect(promptPtyDispatcherReady(false, 'repoB::/b@@x')).toBe(true)
    unregisterPromptProjectWindow('repoB', 2)
    expect(promptPtyDispatcherReady(true, 'repoB::/b@@x')).toBe(true)
  })

  it('lets only the showing window resize or hide a pty', () => {
    const main = contents(1)
    const project = contents(2)
    registerPromptProjectWindow('repoB', project)
    expect(promptPtyControlAllowed(main, 'repoB::/b@@x')).toBe(false)
    expect(promptPtyControlAllowed(project, 'repoB::/b@@x')).toBe(true)
    expect(promptPtyControlAllowed(main, 'repoA::/a@@x')).toBe(true)
    expect(promptPtyControlAllowed(project, 'repoA::/a@@x')).toBe(false)
    expect(promptAllPtyWebContents(main)).toEqual([main, project])
  })
})
