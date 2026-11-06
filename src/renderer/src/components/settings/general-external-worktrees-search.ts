import { translate } from '@/i18n/i18n'
import { createLocalizedCatalog } from '@/i18n/localized-catalog'
import { translateSearchKeyword } from './settings-search-keywords'

export const getGeneralExternalWorktreesSearchEntries = createLocalizedCatalog(() => [
  {
    title: translate(
      'auto.components.settings.general.search.externalWorktrees',
      'External worktrees'
    ),
    description: translate(
      'auto.components.settings.general.search.externalWorktreesDescription',
      'Choose whether worktrees created outside Orca appear by default.'
    ),
    keywords: [
      ...translateSearchKeyword(
        'auto.components.settings.general.search.externalKeyword',
        'external'
      ),
      ...translateSearchKeyword('auto.components.settings.general.search.visibility', 'visibility'),
      ...translateSearchKeyword('auto.components.settings.general.search.sidebar', 'sidebar'),
      ...translateSearchKeyword('auto.components.settings.general.search.df10666259', 'worktree')
    ]
  }
])
