import { Switch } from 'react-native'
import { colors } from '../theme/mobile-theme'
import { useMobileColorScheme } from '../theme/use-mobile-color-scheme'

export type MobileSwitchProps = {
  value: boolean
  onValueChange: (value: boolean) => void
  accessibilityLabel: string
  disabled?: boolean
  testID?: string
}

/** The app's switch: shared RUNNERS green track and white thumb. */
export function MobileSwitch(props: MobileSwitchProps) {
  useMobileColorScheme()
  // RN Web defaults active thumb to teal; override via activeThumbColor absent from native types.
  const onThumb = { activeThumbColor: colors.switchThumb }
  return (
    <Switch
      {...props}
      {...onThumb}
      trackColor={{ false: colors.bgRaised, true: colors.switchOn }}
      thumbColor={colors.switchThumb}
    />
  )
}
