import type React from 'react'
import './prompt-runners-apps.css'
import {
  isSafeRunnersAppUrl,
  localizeRunnersText,
  type RunnersAppGroup,
  type RunnersAppsLocale
} from './runners-apps-model'

// "More apps from RUNNERS" / "Services from RUNNERS" cards, shared in shape by Split, Prompt and
// Monitor. Self-contained on purpose: plain props, its own CSS file, no app store or i18n
// library, so another app can copy this folder and pass its own groups and open handler.

const GET_LABEL: Record<RunnersAppsLocale, string> = { ko: '받기', en: 'Get' }

export type PromptRunnersAppsProps = {
  groups: RunnersAppGroup[]
  locale: RunnersAppsLocale
  /** Called with an https url when "Get" is pressed; the app opens it in the default browser. */
  onOpen: (url: string) => void
}

export function PromptRunnersApps({
  groups,
  locale,
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
                    <img
                      className="runners-apps-icon"
                      src={item.iconUrl}
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <span className="runners-apps-icon" aria-hidden="true" />
                  )}
                  <div className="runners-apps-text">
                    <div className="runners-apps-name">{item.name}</div>
                    <div className="runners-apps-desc">
                      {localizeRunnersText(item.desc, locale)}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="runners-apps-get"
                    aria-label={`${GET_LABEL[locale]} ${item.name}`}
                    onClick={() => {
                      if (isSafeRunnersAppUrl(item.url)) {
                        onOpen(item.url)
                      }
                    }}
                  >
                    {GET_LABEL[locale]}
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
