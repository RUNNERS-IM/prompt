import { applyUIZoom } from '@/lib/ui-zoom'
import { zoomLevelToPercent } from '@/components/settings/SettingsConstants'
import { dispatchZoomLevelChanged } from '@/lib/zoom-events'
import { stepUIZoomLevel } from '../../../../shared/ui-zoom-level'
import { focusedBrowserPageId } from '../resolve-zoom-target'
import { dispatchBrowserPageZoom } from '@/components/browser-pane/host-guest/browser-page-zoom'

/**
 * Prompt: ⌘+ / ⌘- / ⌘0 always scale the whole window (sidebar, terminal, editor, chat together),
 * wherever focus is. Only a focused web page keeps its own page zoom, as in a browser.
 */
export function registerZoomIpcBridge(unsubs: (() => void)[]): void {
  unsubs.push(
    window.api.ui.onTerminalZoom((direction) => {
      const browserPageId = focusedBrowserPageId(document.activeElement)
      if (browserPageId) {
        dispatchBrowserPageZoom({ browserPageId, direction })
        return
      }

      const current = window.api.ui.getZoomLevel()
      const next = stepUIZoomLevel(current, direction)

      applyUIZoom(next)
      void window.api.ui.set({ uiZoomLevel: next })

      dispatchZoomLevelChanged('ui', zoomLevelToPercent(next))
    })
  )
}
