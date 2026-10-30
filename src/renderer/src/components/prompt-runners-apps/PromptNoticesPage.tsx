import type React from 'react'
import { useEffect, useState } from 'react'
import { translate } from '@/i18n/i18n'

/** Content of the "Open source notices" window: THIRD_PARTY_NOTICES.md as plain scrollable text,
 *  read by main from the copy bundled with the app. */
export function PromptNoticesPage(): React.JSX.Element {
  const [text, setText] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const api = window.api.promptThirdPartyNotices
    if (!api) {
      setText(null)
    } else {
      void api
        .read()
        .then((value) => {
          if (!cancelled) {
            setText(value)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setText(null)
          }
        })
    }
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
    <main className="prompt-notices">
      <h1 className="prompt-notices-title">
        {translate('prompt.about.notices', 'Open source notices')}
      </h1>
      <pre className="prompt-notices-text">
        {text === null
          ? translate('prompt.about.noticesMissing', 'The notices file could not be read.')
          : (text ?? '')}
      </pre>
    </main>
  )
}
