import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  notePromptMintedPtyId,
  promptPtyControlAllowed,
  promptPtyDispatcherReady,
  promptPtyTargets,
  promptPtyWebContents,
  recordPromptPtyOwner,
  registerPromptExtraWindow,
  resetPromptWindowRegistryForTests,
  runPromptSpawnFor,
  sendToPromptPtyViewers,
  setPromptExtraWindowDispatcherReady
} from './prompt-window-registry'
import {
  addPromptPtyViewersListener,
  notePromptPtyDriver,
  promptPtySizeOwnerId,
  promptPtyViewerIds,
  removePromptPtyViewerWindow,
  setPromptSharedTabs
} from './prompt-pty-viewers'

function contents(id: number) {
  return { id, isDestroyed: () => false, send: vi.fn() }
}

describe('prompt window registry with shared tabs', () => {
  const main = contents(1)
  const w1 = contents(2)
  const w2 = contents(3)

  beforeEach(() => {
    setPromptSharedTabs(true)
    registerPromptExtraWindow('w1', w1)
    registerPromptExtraWindow('w2', w2)
    vi.clearAllMocks()
  })
  afterEach(() => resetPromptWindowRegistryForTests())

  it('gives a pty to every window that attaches it instead of moving it', () => {
    recordPromptPtyOwner('p1', main)
    recordPromptPtyOwner('p1', w1)
    expect(promptPtyViewerIds('p1')).toEqual([1, 2])
    expect(promptPtyTargets(main, 'p1')).toEqual([main, w1])
  })

  it('sends a pty event to every viewer, and data only to listening ones', () => {
    recordPromptPtyOwner('p1', main)
    recordPromptPtyOwner('p1', w1)
    sendToPromptPtyViewers(main, 'p1', 'pty:exit', { id: 'p1' })
    expect(main.send).toHaveBeenCalledWith('pty:exit', { id: 'p1' })
    expect(w1.send).toHaveBeenCalledWith('pty:exit', { id: 'p1' })

    vi.clearAllMocks()
    sendToPromptPtyViewers(main, 'p1', 'pty:data', { id: 'p1' }, true)
    expect(main.send).toHaveBeenCalledTimes(1)
    expect(w1.send).not.toHaveBeenCalled()
    setPromptExtraWindowDispatcherReady(2, true)
    sendToPromptPtyViewers(main, 'p1', 'pty:data', { id: 'p1' }, false)
    expect(w1.send).toHaveBeenCalledTimes(1)
    expect(main.send).toHaveBeenCalledTimes(1)
  })

  it('may send data when any viewer listens', () => {
    recordPromptPtyOwner('p1', w1)
    recordPromptPtyOwner('p1', w2)
    expect(promptPtyDispatcherReady(true, 'p1')).toBe(false)
    setPromptExtraWindowDispatcherReady(3, true)
    expect(promptPtyDispatcherReady(false, 'p1')).toBe(true)
    // Nobody recorded: the main window shows it.
    expect(promptPtyDispatcherReady(true, 'other')).toBe(true)
    expect(promptPtyTargets(main, 'other')).toEqual([main])
  })

  it('lets only the size owner resize, and the window used last owns the size', () => {
    recordPromptPtyOwner('p1', main)
    recordPromptPtyOwner('p1', w1)
    expect(promptPtySizeOwnerId('p1')).toBe(2)
    expect(promptPtyControlAllowed(w1, 'p1')).toBe(true)
    expect(promptPtyControlAllowed(main, 'p1')).toBe(false)
    expect(promptPtyWebContents(main, 'p1')).toBe(w1)

    expect(notePromptPtyDriver('p1', main)).toBe(true)
    expect(notePromptPtyDriver('p1', main)).toBe(false)
    expect(promptPtyControlAllowed(main, 'p1')).toBe(true)
    expect(promptPtyWebContents(main, 'p1')).toBe(main)
    // A window that does not show the pty cannot take its size.
    expect(notePromptPtyDriver('p1', w2)).toBe(false)
  })

  it('drops a window that reloads or closes and hands its size to the viewer that came last', () => {
    const changes: [string, number | null][] = []
    addPromptPtyViewersListener((ptyId, added) => changes.push([ptyId, added]))
    recordPromptPtyOwner('p1', main)
    recordPromptPtyOwner('p1', w1)
    recordPromptPtyOwner('p1', w2)
    notePromptPtyDriver('p1', w1)
    recordPromptPtyOwner('p2', w1)

    expect(removePromptPtyViewerWindow(2)).toEqual(['p1', 'p2'])
    expect(promptPtyViewerIds('p1')).toEqual([1, 3])
    expect(promptPtySizeOwnerId('p1')).toBe(3)
    expect(promptPtyViewerIds('p2')).toEqual([])
    expect(changes).toEqual([
      ['p1', 1],
      ['p1', 2],
      ['p1', 3],
      ['p2', 2],
      ['p1', null],
      ['p2', null]
    ])
  })

  it('records the spawning window, main window included, as a viewer of a new pty', () => {
    runPromptSpawnFor(main, () => notePromptMintedPtyId('p1'))
    runPromptSpawnFor(w1, () => notePromptMintedPtyId('p2'))
    expect(promptPtyViewerIds('p1')).toEqual([1])
    expect(promptPtyViewerIds('p2')).toEqual([2])
  })
})
