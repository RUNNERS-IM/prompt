import { useEffect, useState } from 'react'

// Prompt: a white logo set as a project icon vanishes on the light sidebar. Such an image is drawn
// as a mask filled with the text colour instead, so it follows dark/light like the Lucide icons.
// "White glyph" = every visible pixel is near-white. Checked once per image source.
const cache = new Map<string, boolean>()
const SAMPLE = 32
const NEAR_WHITE = 225
const MIN_VISIBLE_ALPHA = 40

function measureWhiteGlyph(image: HTMLImageElement): boolean {
  const canvas = document.createElement('canvas')
  canvas.width = SAMPLE
  canvas.height = SAMPLE
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) {
    return false
  }
  context.drawImage(image, 0, 0, SAMPLE, SAMPLE)
  // Cross-origin images taint the canvas and throw here; they keep the plain <img>.
  const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE)
  let visible = 0
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < MIN_VISIBLE_ALPHA) {
      continue
    }
    visible += 1
    if (data[i] < NEAR_WHITE || data[i + 1] < NEAR_WHITE || data[i + 2] < NEAR_WHITE) {
      return false
    }
  }
  // A fully opaque white square is a photo/background, not a glyph.
  return visible > 0 && visible < SAMPLE * SAMPLE * 0.9
}

/** True once the image is known to be a single-colour white glyph with transparency. */
export function useIsWhiteGlyphImage(src: string | null): boolean {
  const [isWhite, setIsWhite] = useState(() => (src ? (cache.get(src) ?? false) : false))
  useEffect(() => {
    if (!src) {
      setIsWhite(false)
      return
    }
    const known = cache.get(src)
    if (known !== undefined) {
      setIsWhite(known)
      return
    }
    let cancelled = false
    const image = new Image()
    image.onload = () => {
      let result = false
      try {
        result = measureWhiteGlyph(image)
      } catch {
        result = false
      }
      cache.set(src, result)
      if (!cancelled) {
        setIsWhite(result)
      }
    }
    image.onerror = () => cache.set(src, false)
    image.src = src
    return () => {
      cancelled = true
    }
  }, [src])
  return isWhite
}
