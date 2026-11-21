import type React from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { translate } from '@/i18n/i18n'
import {
  PROMPT_RUNNERS_NICKNAME_MAX,
  type PromptRunnersAccountApi,
  type PromptRunnersProfile
} from '../../../../shared/prompt-runners-account'
import { SettingsRow } from '../settings/SettingsFormControls'
import { setRunnersAccountProfile } from './prompt-runners-account-profile'

type SaveState = 'idle' | 'saving' | 'saved' | 'long' | 'failed'

/** The nickname line under the account (runners-wiki 2026-11-19 2B, 2026-11-21 1A): one name for every RUNNERS
 *  app, kept on the account server. Same field, button and words as Draw's Settings › Account. */
export function PromptRunnersNickname(props: {
  api: PromptRunnersAccountApi
  profile: PromptRunnersProfile
}): React.JSX.Element {
  const { api, profile } = props
  const shown = profile.custom ? (profile.nickname ?? '') : ''
  const [draft, setDraft] = useState(shown)
  const [state, setState] = useState<SaveState>('idle')

  // Why: a nickname read from the server after the pane opened fills the field, unless the person is typing.
  useEffect(() => {
    if (state === 'idle' || state === 'saved') {
      setDraft(shown)
    }
  }, [shown]) // eslint-disable-line react-hooks/exhaustive-deps

  const changed = draft.trim() !== shown
  const save = (): void => {
    // Why the button stays on past the limit: pressing it says what is wrong instead of doing nothing.
    if (draft.trim().length > PROMPT_RUNNERS_NICKNAME_MAX) {
      setState('long')
      return
    }
    setState('saving')
    void api.setNickname(draft).then(
      (result) => {
        if (result.ok) {
          setRunnersAccountProfile(result.profile)
          setState('saved')
        } else {
          setState(result.problem === 'format' ? 'long' : 'failed')
        }
      },
      () => setState('failed')
    )
  }
  const label = translate('prompt.runnersAccount.nickname', 'Nickname')
  const note =
    state === 'long'
      ? translate('prompt.runnersAccount.nicknameLong', 'A nickname can be up to 30 characters.')
      : state === 'failed'
        ? translate(
            'prompt.runnersAccount.network',
            'Could not reach the server. Try again in a moment.'
          )
        : null

  return (
    <SettingsRow
      label={label}
      description={
        note ? (
          <span className="prompt-runners-nickname-note" role="alert">
            {note}
          </span>
        ) : (
          translate(
            'prompt.runnersAccount.nicknameHint',
            'Shown beside the panda and in the other RUNNERS apps. Leave it empty to use the part of your email before @.'
          )
        )
      }
      control={
        <div className="flex items-center gap-2">
          <Input
            className="h-7 w-48 text-xs"
            value={draft}
            maxLength={PROMPT_RUNNERS_NICKNAME_MAX + 10}
            placeholder={profile.email?.split('@')[0] ?? ''}
            aria-label={label}
            data-prompt-runners-nickname=""
            onChange={(event) => {
              setDraft(event.target.value)
              setState('idle')
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && changed) {
                save()
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!changed || state === 'saving'}
            onClick={save}
          >
            {state === 'saved' && !changed
              ? translate('prompt.runnersAccount.saved', 'Saved')
              : translate('prompt.runnersAccount.save', 'Save')}
          </Button>
        </div>
      }
    />
  )
}
