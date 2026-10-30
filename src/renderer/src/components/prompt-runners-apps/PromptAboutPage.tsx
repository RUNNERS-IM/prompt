import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { translate } from '@/i18n/i18n'
import appIconUrl from '../../../../../resources/icon.png?url'
import { PromptRunnersApps } from './PromptRunnersApps'
import { loadPromptRunnersAppGroups, openRunnersAppUrl } from './prompt-runners-apps-source'
import { isSafeRunnersAppUrl, pickRunnersAppsLocale } from './runners-apps-model'

const COPYRIGHT = '© 2026 RUNNERS. All rights reserved.'

const WEBSITE_URL = 'https://runners.im/prompt'
const GITHUB_URL = 'https://github.com/RUNNERS-IM/prompt'

/** Content of Prompt's About window, laid out like Split's: app icon, name, version line, website and
 *  GitHub buttons, the RUNNERS app cards, then one footer line with the copyright and a link to the
 *  open source notices window (the Orca credit lives there). Replaces the native About panel,
 *  which cannot hold cards. */
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

  const noticesApi = window.api.promptThirdPartyNotices
  const openLink = (url: string): void => {
    if (isSafeRunnersAppUrl(url)) {
      openRunnersAppUrl(url)
    }
  }

  return (
    <main className="prompt-about">
      <header className="prompt-about-header">
        <img className="prompt-about-icon" src={appIconUrl} alt="" draggable={false} />
        <h1 className="prompt-about-name">Prompt</h1>
        <p className="prompt-about-version">
          {version
            ? translate('prompt.about.versionLine', 'Version {{version}} · Free', {
                version
              })
            : '\u00a0'}
        </p>
        <div className="prompt-about-links">
          <button type="button" className="prompt-about-link" onClick={() => openLink(WEBSITE_URL)}>
            {translate('prompt.about.website', 'Website')}
          </button>
          <button type="button" className="prompt-about-link" onClick={() => openLink(GITHUB_URL)}>
            GitHub
          </button>
        </div>
      </header>
      <PromptRunnersApps groups={groups} locale={locale} onOpen={openRunnersAppUrl} />
      <footer className="prompt-about-footer">
        {COPYRIGHT}
        {noticesApi ? (
          <>
            {' · '}
            <button
              type="button"
              className="prompt-about-notice"
              onClick={() => void noticesApi.open()}
            >
              {translate('prompt.about.notices', 'Open source notices')}
            </button>
          </>
        ) : null}
      </footer>
    </main>
  )
}
