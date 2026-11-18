import type React from 'react'
import { createPortal } from 'react-dom'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '@/i18n/i18n'
import { isWebClientLocation } from '@/lib/web-client-location'
import { useAppStore } from '../../store'
import { AccountButton, SignInSheet, accountText } from '../runners-account/runners-account'
import { UiTextDirectionScope } from '../ui/ui-text-direction-scope'
import { usePromptRunnersSignIn } from './use-prompt-runners-sign-in'
import './prompt-runners-account.css'

/** The RUNNERS account at the window's top right (runners-wiki 2026-11-19 1B): Log In while signed out, the
 *  round panda badge after, whose menu holds the email, Account settings and Log Out. Desktop windows on this
 *  computer only: the web client and a window driving a remote runtime draw nothing. */
export function PromptRunnersAccountButton(): React.JSX.Element | null {
  const account = usePromptRunnersSignIn()
  const remoteRuntime = useAppStore((s) => Boolean(s.settings?.activeRuntimeEnvironmentId?.trim()))
  const openSettingsTarget = useAppStore((s) => s.openSettingsTarget)
  const { api, lang, email } = account

  if (!api || remoteRuntime || isWebClientLocation() || email === undefined) {
    return null
  }
  return (
    <div
      className="ml-1 flex shrink-0 items-center [-webkit-app-region:no-drag]"
      data-prompt-runners-account=""
    >
      {email ? (
        <AccountButton
          lang={lang}
          account={email}
          items={[
            {
              label: translate('prompt.runnersAccount.settings', 'Account settings'),
              icon: <Settings className="size-4" strokeWidth={1.5} />,
              onSelect: () => openSettingsTarget({ pane: 'prompt-account', repoId: null })
            }
          ]}
          onSignOut={account.signOut}
        />
      ) : (
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-7"
          onClick={account.openSignIn}
        >
          {accountText(lang, 'signIn')}
        </Button>
      )}
      {/* Why a portal: an unfocused split's opacity makes a stacking context that would trap the full-window sheet. */}
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
    </div>
  )
}
