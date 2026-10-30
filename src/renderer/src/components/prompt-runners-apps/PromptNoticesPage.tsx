import type React from 'react'
import { useEffect, useMemo, useState } from 'react'
import { translate } from '@/i18n/i18n'
import { formatNotices } from './prompt-notices-format'

/** Content of the "Open Source Notices" window, laid out like Split's notices sheet: a title,
 *  THIRD_PARTY_NOTICES.md as scrollable text (read by main from the copy bundled with the app),
 *  a line that opens Chromium's licenses file, and a default Close button. */
export function PromptNoticesPage(): React.JSX.Element {
  const api = window.api.promptThirdPartyNotices
  const [text, setText] = useState<string | null | undefined>(undefined)
  const blocks = useMemo(() => (text ? formatNotices(text) : []), [text])

  useEffect(() => {
    let cancelled = false
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
    const closeOnKey = (event: KeyboardEvent): void => {
      // Return closes like Split's default button, unless another button has focus.
      const onOtherButton =
        event.target instanceof HTMLButtonElement &&
        !event.target.classList.contains('prompt-notices-close')
      if (event.key === 'Escape' || (event.key === 'Enter' && !onOtherButton)) {
        event.preventDefault()
        window.close()
      }
    }
    window.addEventListener('keydown', closeOnKey)
    return () => {
      cancelled = true
      window.removeEventListener('keydown', closeOnKey)
    }
  }, [api])

  return (
    <main className="prompt-notices">
      <h1 className="prompt-notices-title">
        {translate('prompt.about.notices', 'Open Source Notices')}
      </h1>
      <div className="prompt-notices-text">
        {text === null ? (
          <p>{translate('prompt.about.noticesMissing', 'The notices file could not be read.')}</p>
        ) : (
          blocks.map((block, index) =>
            block.kind === 'heading' ? (
              <h2 key={index} className="prompt-notices-heading">
                {block.text}
              </h2>
            ) : (
              <p key={index}>
                {block.lines.map((line, lineIndex) => (
                  <span key={lineIndex} className="prompt-notices-line">
                    {line}
                  </span>
                ))}
              </p>
            )
          )
        )}
      </div>
      <footer className="prompt-notices-footer">
        {api ? (
          <button
            type="button"
            className="prompt-notices-chromium"
            onClick={() => void api.openChromiumLicenses()}
          >
            {translate('prompt.about.chromiumLicenses', 'Open Chromium licenses')}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          className="prompt-notices-close"
          autoFocus
          onClick={() => window.close()}
        >
          {translate('prompt.about.close', 'Close')}
        </button>
      </footer>
    </main>
  )
}
