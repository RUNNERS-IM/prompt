import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UI_ZOOM_MAX } from '../../../shared/ui-zoom-level'

function makeTarget(args: {
  hasXtermClass?: boolean
  editorClosest?: boolean
  chatClosest?: boolean
  browserPageId?: string
  /** The page's <webview> sits in a viewport shell outside its pane. */
  viewportPageId?: string
}): {
  classList: { contains: (token: string) => boolean }
  closest: (selector: string) => object | null
} {
  const {
    hasXtermClass = false,
    editorClosest = false,
    chatClosest = false,
    browserPageId,
    viewportPageId
  } = args
  return {
    classList: {
      contains: (token: string) => hasXtermClass && token === 'xterm-helper-textarea'
    },
    closest: (selector) => {
      if (selector === '[data-browser-page-pane-id]') {
        return browserPageId ? { getAttribute: () => browserPageId } : null
      }
      if (selector === '[data-browser-page-viewport-id]') {
        return viewportPageId ? { getAttribute: () => viewportPageId } : null
      }
      return (selector === '[data-native-chat-root]' ? chatClosest : editorClosest) ? {} : null
    }
  }
}

describe('registerZoomIpcBridge', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.unstubAllGlobals()
  })

  async function mountZoomBridge(
    args: { activeElement?: ReturnType<typeof makeTarget>; uiZoomLevel?: number } = {}
  ) {
    const { activeElement = makeTarget({}), uiZoomLevel = 0 } = args
    const applyUIZoom = vi.fn()
    const dispatchZoomLevelChanged = vi.fn()
    const dispatchBrowserPageZoom = vi.fn()
    const setUI = vi.fn()
    vi.doMock('@/components/browser-pane/host-guest/browser-page-zoom', () => ({
      dispatchBrowserPageZoom
    }))
    vi.doMock('@/lib/ui-zoom', () => ({ applyUIZoom }))
    vi.doMock('@/lib/zoom-events', () => ({ dispatchZoomLevelChanged }))

    const listenerRef: { current: ((direction: 'in' | 'out' | 'reset') => void) | null } = {
      current: null
    }
    vi.stubGlobal('document', { activeElement })
    vi.stubGlobal('window', {
      api: {
        ui: {
          onTerminalZoom: (listener: (direction: 'in' | 'out' | 'reset') => void) => {
            listenerRef.current = listener
            return () => {}
          },
          getZoomLevel: () => uiZoomLevel,
          set: setUI
        }
      }
    })

    const { registerZoomIpcBridge } = await import('./ipc-events/zoom-ipc-bridge')
    const unsubs: (() => void)[] = []
    registerZoomIpcBridge(unsubs)
    const fire = listenerRef.current
    if (!fire) {
      throw new Error('Expected the zoom listener to be registered')
    }
    return { fire, applyUIZoom, dispatchZoomLevelChanged, dispatchBrowserPageZoom, setUI }
  }

  it.each([
    ['terminal input', makeTarget({ hasXtermClass: true })],
    ['an editor', makeTarget({ editorClosest: true })],
    ['chat', makeTarget({ chatClosest: true })],
    ['app chrome', makeTarget({})]
  ])('zooms the whole window while %s holds focus', async (_label, activeElement) => {
    const zoom = await mountZoomBridge({ activeElement })

    zoom.fire('in')

    expect(zoom.applyUIZoom).toHaveBeenCalledWith(0.5)
    expect(zoom.setUI).toHaveBeenCalledWith({ uiZoomLevel: 0.5 })
    expect(zoom.dispatchZoomLevelChanged).toHaveBeenCalledWith('ui', 110)
    expect(zoom.dispatchBrowserPageZoom).not.toHaveBeenCalled()
  })

  it.each([
    ['its browser pane', makeTarget({ browserPageId: 'page-1' })],
    ['its page viewport', makeTarget({ viewportPageId: 'page-1' })]
  ])('zooms the page, not the app, while focus is in %s', async (_label, activeElement) => {
    const zoom = await mountZoomBridge({ activeElement })

    zoom.fire('out')

    expect(zoom.dispatchBrowserPageZoom).toHaveBeenCalledWith({
      browserPageId: 'page-1',
      direction: 'out'
    })
    expect(zoom.applyUIZoom).not.toHaveBeenCalled()
  })

  it('clamps app zoom at the supported maximum', async () => {
    const zoom = await mountZoomBridge({ uiZoomLevel: UI_ZOOM_MAX })

    zoom.fire('in')

    expect(zoom.applyUIZoom).toHaveBeenCalledWith(UI_ZOOM_MAX)
  })

  it('resets app zoom to 100% regardless of the current level', async () => {
    const zoom = await mountZoomBridge({ uiZoomLevel: 2 })

    zoom.fire('reset')

    expect(zoom.applyUIZoom).toHaveBeenCalledWith(0)
    expect(zoom.dispatchZoomLevelChanged).toHaveBeenCalledWith('ui', 100)
  })
})
