import type React from 'react'
import { useEffect, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '../../store'
import { UsageConsentSheet } from '../runners-account/runners-usage'
import { UiTextDirectionScope } from '../ui/ui-text-direction-scope'
import {
  choosePromptUsageConsent,
  getPromptUsageConsent,
  loadPromptUsageConsent,
  subscribePromptUsageConsent
} from './prompt-usage-consent'
import './prompt-runners-account.css'

/** Asks once after first run. Desktop windows on this computer only, like the account row. */
export function PromptUsageConsentSheet(): React.JSX.Element | null {
  const api = window.api.promptRunnersAccount
  const { i18n } = useTranslation()
  const remoteRuntime = useAppStore((s) => Boolean(s.settings?.activeRuntimeEnvironmentId?.trim()))
  const consent = useSyncExternalStore(subscribePromptUsageConsent, getPromptUsageConsent)

  useEffect(() => {
    if (api) {
      loadPromptUsageConsent(api)
    }
  }, [api])

  if (!api || remoteRuntime || isWebClientLocation() || consent !== 'unasked') {
    return null
  }
  return createPortal(
    <UiTextDirectionScope>
      <UsageConsentSheet
        lang={i18n.language}
        app="Prompt"
        onChoose={(granted) => choosePromptUsageConsent(api, granted)}
      />
    </UiTextDirectionScope>,
    document.body
  )
}
