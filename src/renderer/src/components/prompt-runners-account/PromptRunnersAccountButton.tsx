import type React from 'react'
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '../../store'
import type {
  PromptRunnersCodePurpose,
  PromptRunnersSignInResult,
  PromptRunnersSignMode
} from '../../../../shared/prompt-runners-account'
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

  const lang = i18n.language

  // The shared sheet reads the failure's short code (bad, none, code, …) from the error's message.
  const signedIn = useCallback((result: PromptRunnersSignInResult) => {
    if (!result.ok) {
      throw new Error(result.problem)
    }
    setRunnersAccountEmail(result.email)
  }, [])
  const signIn = useCallback(
    async (mode: PromptRunnersSignMode, address: string, password: string, code?: string) => {
      if (!api) {
        throw new Error('network')
      }
      signedIn(await api.signIn(mode, address, password, code))
    },
    [api, signedIn]
  )
  const sendCode = useCallback(
    async (purpose: PromptRunnersCodePurpose, address: string) => {
      const result = api ? await api.sendCode(purpose, address, lang) : null
      if (!result?.ok) {
        throw new Error(result?.problem ?? 'network')
      }
    },
    [api, lang]
  )
  const resetPassword = useCallback(
    async (address: string, code: string, password: string) => {
      if (!api) {
        throw new Error('network')
      }
      signedIn(await api.resetPassword(address, code, password))
    },
    [api, signedIn]
  )

  if (!api || remoteRuntime || isWebClientLocation() || email === undefined) {
    return null
  }
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
            <SignInSheet
              lang={lang}
              signIn={signIn}
              sendCode={sendCode}
              resetPassword={resetPassword}
              onClose={closeSignIn}
            />,
            document.body
          )
        : null}
    </div>
  )
}
