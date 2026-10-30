import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ContextualTourId } from '../../../../shared/contextual-tours'
import { arePromptContextualToursEnabled } from '../../components/contextual-tours/prompt-contextual-tours'
import { createUIStore, makePersistedUI } from './ui-slice-test-harness'

vi.mock('@/lib/telemetry', () => ({ track: vi.fn() }))

const visibleTarget = {
  getBoundingClientRect: () => ({ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 })
}

afterEach(() => vi.unstubAllGlobals())

function eligibleStore(): ReturnType<typeof createUIStore> {
  // Every tour target is on screen, so only the Prompt switch can stop a tour.
  vi.stubGlobal('document', {
    querySelector: () => visibleTarget,
    querySelectorAll: () => [visibleTarget]
  })
  const store = createUIStore()
  store.getState().hydratePersistedUI(makePersistedUI({ contextualToursAutoEligible: true }))
  return store
}

describe('Prompt contextual tours', () => {
  it('are switched off', () => {
    expect(arePromptContextualToursEnabled()).toBe(false)
  })

  it('never start, automatic or forced, even for an eligible first-run profile', () => {
    const store = eligibleStore()
    const id: ContextualTourId = 'client-hosted-browser'

    store.getState().requestContextualTour(id, 'test')
    store.getState().requestContextualTour(id, 'test', undefined, { force: true })

    expect(store.getState().activeContextualTourId).toBeNull()
    expect(store.getState().contextualTourShownThisSession).toBe(false)
  })
})
