import type React from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '../../store'
import { SignInSheet, accountText } from '../runners-account/runners-account'
import { UiTextDirectionScope } from '../ui/ui-text-direction-scope'
import { SettingsRow, SettingsSubsectionHeader } from '../settings/SettingsFormControls'
import { usePromptRunnersSignIn } from './use-prompt-runners-sign-in'
import { PromptRunnersNickname } from './PromptRunnersNickname'
import './prompt-runners-account.css'

/** Settings › Account: the RUNNERS account row, Log In while signed out and the email with Log Out after.
 *  Desktop windows on this computer only: the web client and a window driving a remote runtime draw nothing. */
export function PromptRunnersAccountSettings(): React.JSX.Element | null {
  const account = usePromptRunnersSignIn()
  const remoteRuntime = useAppStore((s) => Boolean(s.settings?.activeRuntimeEnvironmentId?.trim()))
  const { api, lang, email } = account

  if (!api || remoteRuntime || isWebClientLocation() || email === undefined) {
    return null
  }
  return (
    <section className="space-y-4">
      <SettingsSubsectionHeader title="RUNNERS" />
      {/* Signed in: the nickname above the email, as in Draw and the other RUNNERS apps. */}
      <SettingsRow
        label={email ? (account.profile?.nickname ?? email) : accountText(lang, 'title')}
        description={email ?? accountText(lang, 'sheetIntro')}
        control={
          email ? (
            <Button type="button" variant="outline" size="sm" onClick={account.signOut}>
              {accountText(lang, 'signOut')}
            </Button>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={account.openSignIn}>
              {accountText(lang, 'signIn')}
            </Button>
          )
        }
      />
      {email && account.profile ? (
        <PromptRunnersNickname api={api} profile={account.profile} />
      ) : null}
      {/* Why a portal: the sheet covers the whole window, not just the scrolling settings pane. */}
      {account.signingIn
        ? createPortal(
            <UiTextDirectionScope>
              <SignInSheet
                lang={lang}
                signIn={account.signIn}
                sendCode={account.sendCode}
                resetPassword={account.resetPassword}
                onClose={account.closeSignIn}
              />
            </UiTextDirectionScope>,
            document.body
          )
        : null}
    </section>
  )
}
