import { describe, expect, it } from 'vitest'
import type { Repo } from './repo-types'
import type { ManualRepoOrderEntry } from './ui-chrome-types'
import {
  applyManualRepoOrder,
  getManualRepoOrder,
  normalizeManualRepoOrder
} from './manual-repo-order'

function repo(id: string, hostId: Repo['executionHostId']): Repo {
  return {
    id,
    path: `/${hostId}/${id}`,
    displayName: id,
    badgeColor: '#000',
    addedAt: 1,
    executionHostId: hostId
  }
}

const localAlpha = repo('alpha', 'local')
const localBravo = repo('bravo', 'local')
const remoteCharlie = repo('charlie', 'runtime:node-b')
const remoteDelta = repo('delta', 'runtime:node-b')

describe('manual repo order', () => {
  it('returns the input array when no overlay exists', () => {
    const repos = [localBravo, localAlpha]

    expect(applyManualRepoOrder(repos, [])).toBe(repos)
  })

  it('returns the input array when the saved order moves nothing', () => {
    const repos = [localAlpha, remoteCharlie, localBravo, remoteDelta]

    expect(applyManualRepoOrder(repos, getManualRepoOrder(repos))).toBe(repos)
  })

  it('returns a new array when the saved order actually reorders', () => {
    const repos = [localBravo, localAlpha]
    const reordered = applyManualRepoOrder(repos, getManualRepoOrder([localAlpha, localBravo]))

    expect(reordered).not.toBe(repos)
    expect(reordered).toEqual([localAlpha, localBravo])
  })

  it('restores a host-qualified cross-host interleaving', () => {
    const order = getManualRepoOrder([localAlpha, remoteCharlie, localBravo, remoteDelta])

    expect(
      applyManualRepoOrder([remoteCharlie, remoteDelta, localAlpha, localBravo], order)
    ).toEqual([localAlpha, remoteCharlie, localBravo, remoteDelta])
  })

  it('places a late host into its saved positions', () => {
    const order = getManualRepoOrder([localAlpha, remoteCharlie, localBravo, remoteDelta])
    const localOnly = applyManualRepoOrder([localBravo, localAlpha], order)

    expect(applyManualRepoOrder([...localOnly, remoteDelta, remoteCharlie], order)).toEqual([
      localAlpha,
      remoteCharlie,
      localBravo,
      remoteDelta
    ])
  })

  it('distinguishes duplicate bare repo ids on different hosts', () => {
    const local = repo('same-id', 'local')
    const remote = repo('same-id', 'runtime:node-b')
    const order = getManualRepoOrder([remote, local])

    expect(applyManualRepoOrder([local, remote], order)).toEqual([remote, local])
  })

  it('appends unranked repos in their source order', () => {
    const newOne = repo('new-one', 'local')
    const newTwo = repo('new-two', 'runtime:node-b')
    const order = getManualRepoOrder([remoteCharlie, localAlpha])

    expect(applyManualRepoOrder([newTwo, localAlpha, newOne, remoteCharlie], order)).toEqual([
      remoteCharlie,
      localAlpha,
      newTwo,
      newOne
    ])
  })

  it('gives a re-registered local project the slot of the removed one', () => {
    const moved = repo('moved', 'local')
    const order = [
      { hostId: 'local', repoId: 'removed' },
      { hostId: 'local', repoId: 'alpha' },
      { hostId: 'local', repoId: 'bravo' }
    ] satisfies ManualRepoOrderEntry[]

    expect(applyManualRepoOrder([localAlpha, localBravo, moved], order)).toEqual([
      moved,
      localAlpha,
      localBravo
    ])
  })

  it('fills removed local slots oldest project first and appends the rest', () => {
    const newest = { ...repo('newest', 'local'), addedAt: 3 }
    const older = { ...repo('older', 'local'), addedAt: 2 }
    const order = [
      { hostId: 'local', repoId: 'removed' },
      { hostId: 'local', repoId: 'alpha' }
    ] satisfies ManualRepoOrderEntry[]

    expect(applyManualRepoOrder([localAlpha, newest, older], order)).toEqual([
      older,
      localAlpha,
      newest
    ])
  })

  it('leaves remote slots for a host whose catalog may still be loading', () => {
    const order = [
      { hostId: 'runtime:node-b', repoId: 'removed' },
      { hostId: 'local', repoId: 'alpha' }
    ] satisfies ManualRepoOrderEntry[]

    expect(applyManualRepoOrder([localAlpha, localBravo], order)).toEqual([localAlpha, localBravo])
  })

  it('normalizes malformed, invalid-host, and duplicate entries', () => {
    const value = [
      null,
      { hostId: 'bogus', repoId: 'bad-host' },
      { hostId: 'local', repoId: '' },
      { hostId: 'runtime:node-b', repoId: 'same-id' },
      { hostId: 'runtime:node-b', repoId: 'same-id' },
      { hostId: 'local', repoId: 'same-id' }
    ] as unknown as ManualRepoOrderEntry[]

    expect(normalizeManualRepoOrder(value)).toEqual([
      { hostId: 'runtime:node-b', repoId: 'same-id' },
      { hostId: 'local', repoId: 'same-id' }
    ])
  })
})
