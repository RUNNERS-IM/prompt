import type React from 'react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '../../store'
import type { PromptRunnersSignMode } from '../../../../shared/prompt-runners-account'
import { AccountButton, SignInSheet, accountText } from '../runners-account/runners-account'
import {
  getRunnersAccountEmail,
  loadRunnersAccountEmail,
  setRunnersAccountEmail,
  subscribeRunnersAccountEmail
} from './prompt-runners-account-email'
import './prompt-runners-account.css'

/** The RUNNERS account at the window's top right: Log In while signed out, the email's first-letter badge after.
 *  Desktop windows on this computer only: the web client and a window driving a remote runtime draw nothing. */
export function PromptRunnersAccountButton(): React.JSX.Element | null {
  const api = window.api.promptRunnersAccount
  const { i18n } = useTranslation()
  const remoteRuntime = useAppStore((s) => Boolean(s.settings?.activeRuntimeEnvironmentId?.trim()))
  const email = useSyncExternalStore(subscribeRunnersAccountEmail, getRunnersAccountEmail)
  const [signingIn, setSigningIn] = useState(false)
  const closeSignIn = useCallback(() => setSigningIn(false), [])

  useEffect(() => {
    if (api) {
      loadRunnersAccountEmail(api)
    }
  }, [api])

  // The shared sheet reads the failure's short code (bad, exists) from the error's message.
  const signIn = useCallback(
    async (mode: PromptRunnersSignMode, address: string, password: string) => {
      if (!api) {
        throw new Error('network')
      }
      const result = await api.signIn(mode, address, password)
      if (!result.ok) {
        throw new Error(result.problem)
      }
      setRunnersAccountEmail(result.email)
    },
    [api]
  )

  if (!api || remoteRuntime || isWebClientLocation() || email === undefined) {
    return null
  }
  const lang = i18n.language
  return (
    <div className="ml-1.5 flex shrink-0 items-center [-webkit-app-region:no-drag]">
      {email ? (
        <AccountButton
          lang={lang}
          account={email}
          onSignOut={() => {
            setRunnersAccountEmail(null)
            void api.signOut()
          }}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-7"
          onClick={() => setSigningIn(true)}
        >
          {accountText(lang, 'signIn')}
        </Button>
      )}
      {/* Why a portal: an unfocused split's opacity makes a stacking context that would trap the full-window sheet. */}
      {signingIn
        ? createPortal(
            <SignInSheet lang={lang} signIn={signIn} onClose={closeSignIn} />,
            document.body
          )
        : null}
    </div>
  )
}
