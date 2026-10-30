import type React from 'react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppStore } from '../../store'
import { Separator } from '../ui/separator'
import { matchesSettingsSearch } from '../settings/settings-search'
import { PromptRunnersApps } from './PromptRunnersApps'
import { loadPromptRunnersAppGroups, openRunnersAppUrl } from './prompt-runners-apps-source'
import { localizeRunnersText, pickRunnersAppsLocale } from './runners-apps-model'

/** Last block of Settings > General: the other RUNNERS apps and services. */
export function PromptRunnersAppsSettingsSection(): React.JSX.Element | null {
  const { i18n } = useTranslation()
  const searchQuery = useAppStore((s) => s.settingsSearchQuery)
  const groups = useMemo(() => loadPromptRunnersAppGroups(), [])
  const locale = pickRunnersAppsLocale(i18n.language)

  const searchEntries = useMemo(
    () =>
      groups.map((group) => ({
        title: localizeRunnersText(group.title, locale),
        keywords: [
          'runners',
          ...group.items.flatMap((item) => [item.name, localizeRunnersText(item.desc, locale)])
        ]
      })),
    [groups, locale]
  )

  if (groups.length === 0 || !matchesSettingsSearch(searchQuery, searchEntries)) {
    return null
  }
  return (
    <section className="space-y-8">
      <Separator />
      <PromptRunnersApps groups={groups} locale={locale} onOpen={openRunnersAppUrl} />
    </section>
  )
}
