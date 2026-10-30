import { Text } from 'react-native'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../src/shared/prompt-upstream'
import { useMobileTranslation } from './i18n/use-mobile-translation'
import { pairScanStyles as styles } from './pair-scan-styles'

// Prompt: relay is off, so pairing and later connections need the same network.
export function PairScanDirectOnlyHint() {
  const t = useMobileTranslation()
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES) {
    return null
  }
  return (
    <Text style={styles.stepText}>
      {t(
        'prompt.connection.directOnly',
        'Your phone and computer must be on the same Wi-Fi or Tailscale. Relay is off in Prompt.'
      )}
    </Text>
  )
}
