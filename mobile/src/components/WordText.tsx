import { Platform, Text, type TextProps } from 'react-native'

// A Hangul syllable directly followed by another Hangul syllable.
const HANGUL_PAIR = /([가-힣])(?=[가-힣])/g

/**
 * Guide text that can wrap. Korean wraps only at spaces, never inside a word ("카/메라").
 * iOS does this with lineBreakStrategyIOS; Android has no such setting, so a WORD JOINER (U+2060)
 * goes between Hangul syllables. Other scripts get nothing, so their wrapping is unchanged.
 * Screen readers get the original text so the invisible marks never reach TalkBack.
 */
export function WordText({ children, ...props }: TextProps) {
  const text =
    Platform.OS === 'android' && typeof children === 'string'
      ? children.replace(HANGUL_PAIR, '$1⁠')
      : children
  return (
    <Text
      lineBreakStrategyIOS="hangul-word"
      accessibilityLabel={text !== children ? (children as string) : undefined}
      {...props}
    >
      {text}
    </Text>
  )
}
