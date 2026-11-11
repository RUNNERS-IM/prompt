import type React from 'react'
import './prompt-runners-apps.css'
import {
  isSafeRunnersAppUrl,
  localizeRunnersAppName,
  localizeRunnersText,
  type RunnersAppGroup,
  type RunnersAppsLocale
} from './runners-apps-model'

// "More apps from RUNNERS" / "Services from RUNNERS" cards, shared in shape by Split, Prompt and
// Monitor. Self-contained on purpose: plain props, its own CSS file, no app store or i18n
// library, so another app can copy this folder and pass its own groups and open handler.

export type PromptRunnersAppsProps = {
  groups: RunnersAppGroup[]
  locale: RunnersAppsLocale
  getLabel: string
  /** Called with an https url when "Get" is pressed; the app opens it in the default browser. */
  onOpen: (url: string) => void
}

export function PromptRunnersApps({
  groups,
  locale,
  getLabel,
  onOpen
}: PromptRunnersAppsProps): React.JSX.Element | null {
  if (groups.length === 0) {
    return null
  }
  return (
    <div className="runners-apps">
      {groups.map((group) => {
        const titleId = `runners-apps-${group.id}`
        return (
          <section key={group.id} className="runners-apps-group" aria-labelledby={titleId}>
            <h3 id={titleId} className="runners-apps-title">
              {localizeRunnersText(group.title, locale)}
            </h3>
            <ul className="runners-apps-card">
              {group.items.map((item) => (
                <li key={item.id} className="runners-apps-row">
                  {item.iconUrl ? (
                    // Dark screens (the app theme drives nativeTheme) swap in the black icon.
                    <picture>
                      {item.iconDarkUrl && (
                        <source media="(prefers-color-scheme: dark)" srcSet={item.iconDarkUrl} />
                      )}
                      <img
                        className="runners-apps-icon"
                        src={item.iconUrl}
                        alt=""
                        draggable={false}
                      />
                    </picture>
                  ) : (
                    <span className="runners-apps-icon" aria-hidden="true" />
                  )}
                  <div className="runners-apps-text">
                    <div className="runners-apps-name">{localizeRunnersAppName(item, locale)}</div>
                    <div className="runners-apps-desc">
                      {localizeRunnersText(item.desc, locale)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="runners-apps-get"
                    aria-label={`${getLabel} ${localizeRunnersAppName(item, locale)}`}
                    onClick={() => {
                      if (isSafeRunnersAppUrl(item.url)) {
                        onOpen(item.url)
                      }
                    }}
                  >
                    {getLabel}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
