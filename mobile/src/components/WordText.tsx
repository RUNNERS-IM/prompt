import { Platform, Text, type TextProps } from 'react-native'

// A Hangul syllable directly followed by another Hangul syllable.
const HANGUL_PAIR = /([가-힣])(?=[가-힣])/g

// Why: iOS (even with hangul-word) and Android both treat the spot between a Latin word or digit
// and the Korean particle glued to it as a break, so "Remotrol을" wrapped as "Remotrol" / "을 …"
// with the particle starting the next line. Same rule as runners-app-kit 0.1.52 keepParticles.
const LATIN_THEN_HANGUL = /([A-Za-z0-9)\]’”%])(?=[가-힣])/g

/** A WORD JOINER (U+2060) only between a Latin word, digit or closing mark and the Hangul after it. */
export function keepParticles(text: string): string {
  return text.replace(LATIN_THEN_HANGUL, '$1⁠')
}

/** keepParticles plus a WORD JOINER between Hangul syllables, for places that cannot use WordText. */
export function keepWords(text: string): string {
  return keepParticles(text).replace(HANGUL_PAIR, '$1⁠')
}

/**
 * Guide text that can wrap. Korean wraps only at spaces, never inside a word ("카/메라") and never
 * between an English word and its particle ("Remotrol/을"). iOS keeps words with
 * lineBreakStrategyIOS and needs joiners only before particles; Android has no such setting, so
 * joiners also go between Hangul syllables. Other scripts get nothing, so their wrapping is
 * unchanged. Screen readers get the original text so the invisible marks never reach TalkBack.
 */
export function WordText({ children, ...props }: TextProps) {
  const text =
    typeof children === 'string'
      ? Platform.OS === 'android'
        ? keepWords(children)
        : keepParticles(children)
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
