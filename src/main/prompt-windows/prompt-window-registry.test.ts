import { afterEach, describe, expect, it } from 'vitest'
import {
  clearPromptTabPending,
  isPromptExtraWindowSender,
  isPromptTabPending,
  loadPromptTabOwners,
  markPromptQuitting,
  markPromptTabPending,
  notePromptMintedPtyId,
  promptAllPtyWebContents,
  promptPtyControlAllowed,
  promptPtyDispatcherReady,
  promptPtyWebContents,
  promptShouldHideMainWindowOnClose,
  promptTabOwnerKey,
  promptTabsOwnedBy,
  promptWindowKeyOfSender,
  recordPromptPtyOwner,
  registerPromptExtraWindow,
  resetPromptWindowRegistryForTests,
  runPromptSpawnFor,
  setPromptExtraWindowDispatcherReady,
  setPromptTabOwner,
  setPromptWindowStateListener,
  unregisterPromptExtraWindow
} from './prompt-window-registry'

function contents(id: number, destroyed = false) {
  return { id, isDestroyed: () => destroyed, send: () => {} }
}

describe('prompt window registry', () => {
  afterEach(() => resetPromptWindowRegistryForTests())

  it('knows extra windows by sender and treats everything else as the main window', () => {
    const main = contents(1)
    const extra = contents(2)
    registerPromptExtraWindow('w1', extra)
    expect(promptWindowKeyOfSender(extra)).toBe('w1')
    expect(promptWindowKeyOfSender(main)).toBe('main')
    expect(promptWindowKeyOfSender(null)).toBe('main')
    expect(isPromptExtraWindowSender(extra)).toBe(true)
    expect(isPromptExtraWindowSender(main)).toBe(false)
    unregisterPromptExtraWindow('w1', 2)
    expect(isPromptExtraWindowSender(extra)).toBe(false)
  })

  it('keeps a tab owner table where a missing tab belongs to the main window', () => {
    let changes = 0
    setPromptWindowStateListener(() => changes++)
    expect(promptTabOwnerKey('t1')).toBe('main')
    setPromptTabOwner('t1', 'w1')
    setPromptTabOwner('t2', 'w1')
    expect(promptTabOwnerKey('t1')).toBe('w1')
    expect(promptTabsOwnedBy('w1')).toEqual(['t1', 't2'])
    setPromptTabOwner('t1', 'main')
    expect(promptTabOwnerKey('t1')).toBe('main')
    expect(changes).toBe(3)
  })

  it('loads saved owners only for windows that are restored', () => {
    loadPromptTabOwners({ t1: 'w1', t2: 'w2', t3: 'main', t4: 7 }, new Set(['w1']))
    expect(promptTabOwnerKey('t1')).toBe('w1')
    expect(promptTabOwnerKey('t2')).toBe('main')
    expect(promptTabOwnerKey('t3')).toBe('main')
    expect(promptTabOwnerKey('t4')).toBe('main')
  })

  it('tracks tabs moved into a window until that window saves them', () => {
    markPromptTabPending('w1', 't1')
    expect(isPromptTabPending('w1', 't1')).toBe(true)
    expect(isPromptTabPending('main', 't1')).toBe(false)
    clearPromptTabPending('w1', 't1')
    expect(isPromptTabPending('w1', 't1')).toBe(false)
  })

  it('sends a terminal to the window that opened or attached it', () => {
    const main = contents(1)
    const extra = contents(2)
    registerPromptExtraWindow('w1', extra)
    expect(promptPtyWebContents(main, 'p1')).toBe(main)
    recordPromptPtyOwner('p1', extra)
    expect(promptPtyWebContents(main, 'p1')).toBe(extra)
    recordPromptPtyOwner('p1', main)
    expect(promptPtyWebContents(main, 'p1')).toBe(main)
    runPromptSpawnFor(extra, () => notePromptMintedPtyId('p2'))
    expect(promptPtyWebContents(main, 'p2')).toBe(extra)
    runPromptSpawnFor(main, () => notePromptMintedPtyId('p3'))
    expect(promptPtyWebContents(main, 'p3')).toBe(main)
    expect(promptAllPtyWebContents(main)).toEqual([main, extra])
  })

  it('falls back to the main window once the owning window is gone', () => {
    const main = contents(1)
    registerPromptExtraWindow('w1', contents(2))
    recordPromptPtyOwner('p1', { id: 2 })
    unregisterPromptExtraWindow('w1', 2)
    registerPromptExtraWindow('w2', contents(3))
    expect(promptPtyWebContents(main, 'p1')).toBe(main)
  })

  it('holds an extra window terminal until that window is listening', () => {
    registerPromptExtraWindow('w1', contents(2))
    recordPromptPtyOwner('p1', { id: 2 })
    expect(promptPtyDispatcherReady(true, 'p1')).toBe(false)
    expect(promptPtyDispatcherReady(true, 'p0')).toBe(true)
    expect(promptPtyDispatcherReady(false, 'p0')).toBe(false)
    setPromptExtraWindowDispatcherReady(2, true)
    expect(promptPtyDispatcherReady(false, 'p1')).toBe(true)
  })

  it('lets only the showing window resize or hide a terminal', () => {
    const main = contents(1)
    const extra = contents(2)
    registerPromptExtraWindow('w1', extra)
    recordPromptPtyOwner('p1', extra)
    expect(promptPtyControlAllowed(main, 'p1')).toBe(false)
    expect(promptPtyControlAllowed(extra, 'p1')).toBe(true)
    expect(promptPtyControlAllowed(main, 'p0')).toBe(true)
    expect(promptPtyControlAllowed(extra, 'p0')).toBe(false)
  })

  it('hides the main window on close only while extra windows are open and not quitting', () => {
    expect(promptShouldHideMainWindowOnClose(false)).toBe(false)
    registerPromptExtraWindow('w1', contents(2))
    expect(promptShouldHideMainWindowOnClose(false)).toBe(true)
    expect(promptShouldHideMainWindowOnClose(true)).toBe(false)
    markPromptQuitting()
    expect(promptShouldHideMainWindowOnClose(false)).toBe(false)
  })
})
