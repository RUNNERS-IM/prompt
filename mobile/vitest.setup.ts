import { vi } from 'vitest'

// Native SVG's generated components import Flow-only native subpaths outside the RN host mocks.
vi.mock('react-native-svg', () => ({
  default: 'Svg',
  Defs: 'Defs',
  G: 'G',
  LinearGradient: 'LinearGradient',
  Path: 'Path',
  Rect: 'Rect',
  Stop: 'Stop'
}))

// Many tests mock react-native without Platform, which WordText reads; there it is plain Text.
vi.mock('./src/components/WordText', async () => {
  const { createElement } = await import('react')
  const { Text } = await import('react-native')
  return {
    WordText: (props: Record<string, unknown>) => createElement(Text, props)
  }
})

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
