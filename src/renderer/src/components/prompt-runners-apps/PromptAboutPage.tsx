import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translate } from '@/i18n/i18n'
import appIconUrl from '../../../../../resources/icon.png?url'
import { PromptRunnersApps } from './PromptRunnersApps'
import { loadPromptRunnersAppGroups, openRunnersAppUrl } from './prompt-runners-apps-source'
import { pickRunnersAppsLocale } from './runners-apps-model'

// Written out here instead of translate(): the i18n brand post-processor turns every "Orca" into
// "Prompt", and this line must name the original project. Same wording as native.about.originalCredit.
const ORIGINAL_CREDIT = {
  ko: '원본: Orca (Stably AI) · MIT 라이선스',
  en: 'Based on Orca by Stably AI (MIT License)'
} as const

/** Content of Prompt's About window: app icon, name, version, RUNNERS, the original Orca credit,
 *  then the RUNNERS app cards. Replaces the native About panel, which cannot hold cards. */
export function PromptAboutPage(): React.JSX.Element {
  const { i18n } = useTranslation()
  const [version, setVersion] = useState('')
  const groups = useMemo(() => loadPromptRunnersAppGroups(), [])
  const locale = pickRunnersAppsLocale(i18n.language)

  useEffect(() => {
    let cancelled = false
    void window.api.updater
      .getVersion()
      .then((value) => {
        if (!cancelled) {
          setVersion(value)
        }
      })
      .catch(() => undefined)
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        window.close()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      cancelled = true
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  return (
    <main className="prompt-about">
      <header className="prompt-about-header">
        <img className="prompt-about-icon" src={appIconUrl} alt="" draggable={false} />
        <h1 className="prompt-about-name">Prompt</h1>
        <p className="prompt-about-version">
          {version ? translate('prompt.about.version', 'Version {{version}}', { version }) : ' '}
        </p>
        <p className="prompt-about-line">© RUNNERS</p>
        <p className="prompt-about-hint">{ORIGINAL_CREDIT[locale]}</p>
      </header>
      <PromptRunnersApps groups={groups} locale={locale} onOpen={openRunnersAppUrl} />
    </main>
  )
}
