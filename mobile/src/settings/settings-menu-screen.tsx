import type { ReactNode } from 'react'
import { LifeBuoy } from 'lucide-react-native'
import { MobileSettingsFrame, MobileSettingsSection } from './mobile-settings-menu'
import { mobileSettingsMenuItems } from './mobile-settings-menu-items'
import { useMobileTranslation } from '../i18n/use-mobile-translation'
import { PROMPT_ISSUES_URL } from '../../../src/shared/prompt-upstream'

export default function SettingsMenuScreen({
  push,
  onBack,
  openExternal,
  children
}: {
  push: (route: string) => void
  onBack?: () => void
  openExternal: (url: string) => Promise<unknown>
  children?: ReactNode
}) {
  const t = useMobileTranslation()
  return (
    <MobileSettingsFrame onBack={onBack}>
      <MobileSettingsSection items={mobileSettingsMenuItems(push)} />

      {children}

      <MobileSettingsSection
        spaced
        items={[
          // Prompt: Orca's privacy page does not describe Prompt, so the row is not offered.
          {
            id: 'support',
            label: t('settings.menuScreen.support', 'Support'),
            icon: LifeBuoy,
            external: true,
            onPress: () => void openExternal(PROMPT_ISSUES_URL)
          }
        ]}
      />
    </MobileSettingsFrame>
  )
}
