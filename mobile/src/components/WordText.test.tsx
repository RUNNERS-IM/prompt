import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'android' }))

vi.mock('react-native', () => ({
  Platform: platform,
  Text: (props: Record<string, unknown>) => createElement('Text', props)
}))

const { WordText, keepParticles, keepWords } =
  await vi.importActual<typeof import('./WordText')>('./WordText')

let renderer: ReactTestRenderer | undefined

afterEach(() => {
  act(() => renderer?.unmount())
  renderer = undefined
  platform.OS = 'android'
})

function renderText(children: string) {
  act(() => {
    renderer = create(createElement(WordText, null, children))
  })
  return renderer!.root.findByType('Text' as never).props as Record<string, unknown>
}

describe('WordText', () => {
  it('joins Hangul syllables on Android so a line breaks only at spaces', () => {
    const props = renderText('카메라를 맞추세요. QR code')
    expect(props.children).toBe('카⁠메⁠라⁠를 맞⁠추⁠세⁠요. QR code')
    expect(props.accessibilityLabel).toBe('카메라를 맞추세요. QR code')
    expect(props.lineBreakStrategyIOS).toBe('hangul-word')
  })

  it('leaves text without Hangul pairs untouched', () => {
    const props = renderText('Point at the QR code')
    expect(props.children).toBe('Point at the QR code')
    expect(props.accessibilityLabel).toBeUndefined()
  })

  it('relies on the iOS line break strategy instead of joiners', () => {
    platform.OS = 'ios'
    const props = renderText('카메라를 맞추세요.')
    expect(props.children).toBe('카메라를 맞추세요.')
    expect(props.lineBreakStrategyIOS).toBe('hangul-word')
  })

  it('keeps a particle on the line of the English word before it on iOS too', () => {
    platform.OS = 'ios'
    const props = renderText('Remotrol을 다시 켜거나')
    expect(props.children).toBe('Remotrol⁠을 다시 켜거나')
    expect(props.accessibilityLabel).toBe('Remotrol을 다시 켜거나')
  })

  it('joins particles and syllables on Android', () => {
    expect(renderText('Mac에서 켜').children).toBe('Mac⁠에⁠서 켜')
  })
})

describe('keepParticles', () => {
  it('joins only after a Latin word, digit, closing mark or percent', () => {
    expect(keepParticles('3개 · 50%가 (Mac)에서')).toBe('3⁠개 · 50%⁠가 (Mac)⁠에서')
    expect(keepParticles('Google Chrome 끄기')).toBe('Google Chrome 끄기')
  })

  it('keepWords adds syllable joiners on top', () => {
    expect(keepWords('Remotrol을 켜')).toBe('Remotrol⁠을 켜')
  })
})
