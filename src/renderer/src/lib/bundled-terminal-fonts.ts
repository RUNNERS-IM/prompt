// 앱에 넣어 보내는 터미널 글꼴(main.css 의 @font-face). 브라우저는 이런 글꼴을 처음 쓰일 때에야 읽는다.
const BUNDLED_TERMINAL_FONTS = new Set(['d2coding'])

const settled = new Set<string>()
const loading = new Set<string>()
const listeners = new Set<() => void>()

/**
 * The family to hand xterm right now. A bundled family stays out until both faces load: xterm measures
 * its cell once, so measuring against the stand-in font would leave Hangul and Latin at the wrong width.
 */
export function terminalFontFamilyReadyForMeasure(fontFamily: string): string {
  const name = fontFamily.trim()
  const key = name.toLowerCase()
  if (!BUNDLED_TERMINAL_FONTS.has(key) || settled.has(key)) {
    return fontFamily
  }
  const fonts = typeof document === 'undefined' ? undefined : document.fonts
  if (!fonts) {
    return fontFamily
  }
  if (!loading.has(key)) {
    loading.add(key)
    void Promise.all([fonts.load(`400 16px "${name}"`), fonts.load(`700 16px "${name}"`)])
      .catch(() => undefined)
      .then(() => {
        // A failed load also settles, so the family falls back the ordinary way instead of never applying.
        settled.add(key)
        for (const listener of listeners) {
          listener()
        }
      })
  }
  return ''
}

/** Runs when a bundled terminal font finishes loading, so mounted terminals can remeasure with it. */
export function subscribeBundledTerminalFontSettled(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function resetBundledTerminalFontsForTests(): void {
  settled.clear()
  loading.clear()
  listeners.clear()
}
