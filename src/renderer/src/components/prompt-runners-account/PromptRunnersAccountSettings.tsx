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
import { SignInSheet, accountText } from '../runners-account/runners-account'
import { UiTextDirectionScope } from '../ui/ui-text-direction-scope'
import { SettingsRow, SettingsSubsectionHeader } from '../settings/SettingsFormControls'
import {
  getRunnersAccountEmail,
  loadRunnersAccountEmail,
  setRunnersAccountEmail,
  subscribeRunnersAccountEmail
} from './prompt-runners-account-email'
import './prompt-runners-account.css'

/** Settings › Account: the RUNNERS account row, Log In while signed out and the email with Log Out after.
 *  Desktop windows on this computer only: the web client and a window driving a remote runtime draw nothing. */
export function PromptRunnersAccountSettings(): React.JSX.Element | null {
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
    <section className="space-y-4">
      <SettingsSubsectionHeader title="RUNNERS" />
      <SettingsRow
        label={accountText(lang, 'title')}
        description={email ?? accountText(lang, 'sheetIntro')}
        control={
          email ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setRunnersAccountEmail(null)
                void api.signOut()
              }}
            >
              {accountText(lang, 'signOut')}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setSigningIn(true)}>
              {accountText(lang, 'signIn')}
            </Button>
          )
        }
      />
      {/* Why a portal: the sheet covers the whole window, not just the scrolling settings pane. */}
      {signingIn
        ? createPortal(
            <UiTextDirectionScope>
              <SignInSheet
                lang={lang}
                signIn={signIn}
                sendCode={sendCode}
                resetPassword={resetPassword}
                onClose={closeSignIn}
              />
            </UiTextDirectionScope>,
            document.body
          )
        : null}
    </section>
  )
}
