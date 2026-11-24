// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  HIDDEN_WEBGL_CANVAS_RELEASE_DELAY_MS,
  isWebglCanvasBackingReleased,
  releaseWebglCanvasBackingWhileHidden,
  stopReleasingWebglCanvasBacking
} from './terminal-webgl-hidden-canvas-release'

type ResizeCallback = (entries: { contentRect: { width: number; height: number } }[]) => void

function makeCanvas() {
  let onResize: ResizeCallback = () => {}
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeCallback) {
        onResize = callback
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    }
  )
  const canvas = document.createElement('canvas')
  canvas.width = 2000
  canvas.height = 1000
  return {
    canvas,
    reportBox: (width: number) => onResize([{ contentRect: { width, height: width } }])
  }
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('releaseWebglCanvasBackingWhileHidden', () => {
  it('releases a canvas attached while hidden and restores it when a box is reported', () => {
    vi.useFakeTimers()
    const { canvas, reportBox } = makeCanvas()
    const restore = vi.fn()
    releaseWebglCanvasBackingWhileHidden(canvas, () => true, restore)

    vi.advanceTimersByTime(HIDDEN_WEBGL_CANVAS_RELEASE_DELAY_MS)
    expect(canvas.width).toBe(0)
    expect(isWebglCanvasBackingReleased(canvas)).toBe(true)

    // The reveal's resize callback must restore before that frame paints.
    reportBox(500)
    expect(restore).toHaveBeenCalledTimes(1)
    expect(isWebglCanvasBackingReleased(canvas)).toBe(false)
    stopReleasingWebglCanvasBacking(canvas)
  })

  it('keeps the backing while the veto holds or the canvas has a box', () => {
    vi.useFakeTimers()
    const vetoed = makeCanvas()
    releaseWebglCanvasBackingWhileHidden(vetoed.canvas, () => false, vi.fn())
    vi.advanceTimersByTime(HIDDEN_WEBGL_CANVAS_RELEASE_DELAY_MS * 2)
    expect(vetoed.canvas.width).toBe(2000)

    const visible = makeCanvas()
    releaseWebglCanvasBackingWhileHidden(visible.canvas, () => true, vi.fn())
    visible.reportBox(500)
    vi.advanceTimersByTime(HIDDEN_WEBGL_CANVAS_RELEASE_DELAY_MS * 2)
    expect(visible.canvas.width).toBe(2000)
    stopReleasingWebglCanvasBacking(vetoed.canvas)
    stopReleasingWebglCanvasBacking(visible.canvas)
  })

  it('tells the veto how long the canvas has been hidden, so it can lapse', () => {
    vi.useFakeTimers()
    const { canvas, reportBox } = makeCanvas()
    const keepMs = HIDDEN_WEBGL_CANVAS_RELEASE_DELAY_MS * 4
    releaseWebglCanvasBackingWhileHidden(canvas, (hiddenForMs) => hiddenForMs >= keepMs, vi.fn())
    reportBox(500)
    reportBox(0)

    vi.advanceTimersByTime(keepMs - 1)
    expect(canvas.width).toBe(2000)
    vi.advanceTimersByTime(HIDDEN_WEBGL_CANVAS_RELEASE_DELAY_MS)
    expect(canvas.width).toBe(0)
    stopReleasingWebglCanvasBacking(canvas)
  })

  it('reports the release so the pane can drop its glyph atlas too', () => {
    vi.useFakeTimers()
    const { canvas } = makeCanvas()
    const onRelease = vi.fn()
    releaseWebglCanvasBackingWhileHidden(canvas, () => true, vi.fn(), onRelease)
    vi.advanceTimersByTime(HIDDEN_WEBGL_CANVAS_RELEASE_DELAY_MS - 1)
    expect(onRelease).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(canvas.width).toBe(0)
    expect(onRelease).toHaveBeenCalledTimes(1)
    stopReleasingWebglCanvasBacking(canvas)
  })
})
