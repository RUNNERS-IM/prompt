import { nativeImage, type NativeImage } from 'electron'

// Match renderer attention/unread amber-500, including FloatingTerminalToggleButton.
const DOT_RGB = { r: 0xf5, g: 0x9e, b: 0x0b }
// A near-white halo separates the dot from the icon glyph on any tray theme.
const RING_RGB = { r: 0xff, g: 0xff, b: 0xff }

/** Composite BGRA directly because NativeImage has no layering API; preserve the base on empty input so tray creation never blanks it. */
export function composeTrayAttentionIcon(base: NativeImage): NativeImage {
  const { width, height } = base.getSize()
  if (width <= 0 || height <= 0) {
    return base
  }

  // Keep Electron's BGRA format through the bitmap round trip.
  const bitmap = Buffer.from(base.toBitmap())
  const dotRadius = Math.max(2, Math.round(Math.min(width, height) * 0.2))
  const ringRadius = dotRadius + 1
  // Top-right badge preserves the main bottom-left glyph; only the outer ring may clip a corner pixel.
  const centerX = width - 1 - dotRadius
  const centerY = dotRadius
  const dotRadiusSq = dotRadius * dotRadius
  const ringRadiusSq = ringRadius * ringRadius

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      const dy = y - centerY
      const distSq = dx * dx + dy * dy
      if (distSq > ringRadiusSq) {
        continue
      }
      const offset = (y * width + x) * 4
      const color = distSq <= dotRadiusSq ? DOT_RGB : RING_RGB
      bitmap[offset] = color.b
      bitmap[offset + 1] = color.g
      bitmap[offset + 2] = color.r
      bitmap[offset + 3] = 0xff
    }
  }

  return nativeImage.createFromBitmap(bitmap, { width, height })
}

/** macOS badge as a template image (user decision 2026-11-16 1A): the dot is opaque and its ring is cut out of the
    glyph, so the OS tints glyph and dot together for a light or dark menu bar. macOS 26 can draw a light bar while the
    system is dark, so a literal white glyph went invisible there. */
export function composeTrayTemplateAttentionIcon(base: NativeImage, scaleFactor = 1): NativeImage {
  const { width: pointWidth, height: pointHeight } = base.getSize()
  if (pointWidth <= 0 || pointHeight <= 0) {
    return base
  }
  const width = pointWidth * scaleFactor
  const height = pointHeight * scaleFactor

  const bitmap = Buffer.from(base.toBitmap({ scaleFactor }))
  const dotRadius = Math.max(2, Math.round(Math.min(width, height) * 0.2))
  const ringRadius = dotRadius + scaleFactor
  const centerX = width - 1 - dotRadius
  const centerY = dotRadius
  const dotRadiusSq = dotRadius * dotRadius
  const ringRadiusSq = ringRadius * ringRadius

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = x - centerX
      const dy = y - centerY
      const distSq = dx * dx + dy * dy
      if (distSq > ringRadiusSq) {
        continue
      }
      const offset = (y * width + x) * 4
      // Template images use alpha only; premultiplied black keeps the dot opaque and the ring empty.
      const alpha = distSq <= dotRadiusSq ? 0xff : 0x00
      bitmap[offset] = 0x00
      bitmap[offset + 1] = 0x00
      bitmap[offset + 2] = 0x00
      bitmap[offset + 3] = alpha
    }
  }

  return nativeImage.createFromBitmap(bitmap, { width, height, scaleFactor })
}
