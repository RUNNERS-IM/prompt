import { View } from 'react-native'
import { useMobileTranslation } from './i18n/use-mobile-translation'
import { pairScanStyles as styles } from './pair-scan-styles'
import { PairScanDirectOnlyHint } from './pair-scan-direct-only-hint'
import { Step } from './pairing/pairing-visuals'

// Prompt: the steps name the Prompt desktop app and add the direct-only network hint.
export function PromptPairScanSteps() {
  const t = useMobileTranslation()
  return (
    <View style={styles.steps}>
      <Step number={1} text={t('app.pairScan.openDesktopStep', 'Open Prompt on your computer')} />
      <Step number={2} text={t('app.pairScan.openMobileSettingsStep', 'Go to Settings → Mobile')} />
      <Step number={3} text={t('app.pairScan.scanCodeStep', 'Scan the QR code')} />
      <PairScanDirectOnlyHint />
    </View>
  )
}
