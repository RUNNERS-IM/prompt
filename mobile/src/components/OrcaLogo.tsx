import Svg, { Path, Rect } from 'react-native-svg'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'

type Props = {
  size?: number
  color?: string
}

// Prompt: the desktop mark (resources/logo.svg), a prompt chevron with a cursor bar.
// The name stays OrcaLogo so upstream imports and tests keep working through merges.
export function OrcaLogo({ size = 24, color = colors.textPrimary }: Props) {
  useMobileColorScheme()
  const aspectRatio = 560 / 440
  const width = size * aspectRatio
  return (
    <Svg width={width} height={size} viewBox="220 280 560 440">
      <Path
        fill={color}
        d="M232.3 286.3a42 42 0 0 1 59.4 0l180 180a42 42 0 0 1 0 59.4l-180 180a42 42 0 0 1-59.4-59.4L382.6 496 232.3 345.7a42 42 0 0 1 0-59.4z"
      />
      <Rect x={512} y={626} width={250} height={88} rx={36} fill={color} />
    </Svg>
  )
}
