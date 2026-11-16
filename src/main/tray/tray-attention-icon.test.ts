import { describe, expect, it, vi } from 'vitest'

const createFromBitmapMock = vi.hoisted(() =>
  vi.fn((buffer: Buffer, options: { width: number; height: number }) => ({
    __image: true,
    buffer,
    ...options
  }))
)

vi.mock('electron', () => ({
  nativeImage: { createFromBitmap: createFromBitmapMock }
}))

import { composeTrayAttentionIcon, composeTrayTemplateAttentionIcon } from './tray-attention-icon'

type FakeImage = {
  getSize: () => { width: number; height: number }
  toBitmap: () => Buffer
}

function fakeBase(width: number, height: number): FakeImage {
  // Transparent base isolates pixels contributed by the attention dot/ring.
  return {
    getSize: () => ({ width, height }),
    toBitmap: () => Buffer.alloc(width * height * 4, 0)
  }
}

// Electron bitmaps use BGRA; renderer attention token is amber-500 (#f59e0b).
const AMBER = { b: 0x0b, g: 0x9e, r: 0xf5 }

describe('composeTrayAttentionIcon', () => {
  it('returns the base unchanged when it has no pixels', () => {
    const base = { getSize: () => ({ width: 0, height: 0 }), toBitmap: () => Buffer.alloc(0) }

    expect(composeTrayAttentionIcon(base as never)).toBe(base)
    expect(createFromBitmapMock).not.toHaveBeenCalled()
  })

  it('builds a new image of the same size', () => {
    createFromBitmapMock.mockClear()
    const result = composeTrayAttentionIcon(fakeBase(16, 16) as never)

    expect(createFromBitmapMock).toHaveBeenCalledTimes(1)
    const [, options] = createFromBitmapMock.mock.calls[0]
    expect(options).toEqual({ width: 16, height: 16 })
    expect(result).toMatchObject({ __image: true, width: 16, height: 16 })
  })

  it('paints an amber dot in the top-right corner and leaves the rest untouched', () => {
    createFromBitmapMock.mockClear()
    const width = 16
    const height = 16
    composeTrayAttentionIcon(fakeBase(width, height) as never)
    const bitmap = createFromBitmapMock.mock.calls[0][0]

    const pixel = (x: number, y: number): [number, number, number, number] => {
      const o = (y * width + x) * 4
      return [bitmap[o], bitmap[o + 1], bitmap[o + 2], bitmap[o + 3]]
    }

    let amberCount = 0
    let sumX = 0
    let sumY = 0
    let paintedInBottomLeft = 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const [b, g, r, a] = pixel(x, y)
        if (b === AMBER.b && g === AMBER.g && r === AMBER.r && a === 0xff) {
          amberCount++
          sumX += x
          sumY += y
        }
        if (a !== 0 && x < width / 2 && y >= height / 2) {
          paintedInBottomLeft++
        }
      }
    }

    expect(amberCount).toBeGreaterThan(0)
    expect(sumX / amberCount).toBeGreaterThan(width / 2)
    expect(sumY / amberCount).toBeLessThan(height / 2)
    expect(paintedInBottomLeft).toBe(0)
  })
})

describe('composeTrayTemplateAttentionIcon', () => {
  function opaqueBase(width: number, height: number, scale = 1) {
    return {
      getSize: () => ({ width, height }),
      toBitmap: vi.fn(() => Buffer.alloc(width * scale * height * scale * 4, 0xff))
    }
  }

  function alphaAt(buffer: Buffer, width: number, x: number, y: number): number {
    return buffer[(y * width + x) * 4 + 3]
  }

  it('returns the base unchanged when it has no pixels', () => {
    const base = { getSize: () => ({ width: 0, height: 0 }), toBitmap: () => Buffer.alloc(0) }
    expect(composeTrayTemplateAttentionIcon(base as never)).toBe(base)
  })

  it('paints an opaque dot and cuts its ring out of the glyph, leaving the rest alone', () => {
    createFromBitmapMock.mockClear()
    composeTrayTemplateAttentionIcon(opaqueBase(18, 18) as never)

    const out = createFromBitmapMock.mock.calls[0][0] as Buffer
    // 18px: dot radius 4 centred at (13, 4); the ring is the next pixel out.
    const dot = (4 * 18 + 13) * 4
    expect([...out.subarray(dot, dot + 4)]).toEqual([0, 0, 0, 0xff])
    expect(alphaAt(out, 18, 8, 4)).toBe(0x00)
    expect(alphaAt(out, 18, 2, 15)).toBe(0xff)
  })

  it('reads and sizes the requested scale factor', () => {
    createFromBitmapMock.mockClear()
    const base = opaqueBase(18, 18, 2)
    composeTrayTemplateAttentionIcon(base as never, 2)

    expect(base.toBitmap).toHaveBeenCalledWith({ scaleFactor: 2 })
    expect(createFromBitmapMock.mock.calls[0][1]).toEqual({ width: 36, height: 36, scaleFactor: 2 })
  })
})
