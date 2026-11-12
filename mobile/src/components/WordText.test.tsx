import { createElement } from 'react'
import { act, create, type ReactTestRenderer } from 'react-test-renderer'
import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = vi.hoisted(() => ({ OS: 'android' }))

vi.mock('react-native', () => ({
  Platform: platform,
  Text: (props: Record<string, unknown>) => createElement('Text', props)
}))

const { WordText } = await vi.importActual<typeof import('./WordText')>('./WordText')

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
})
