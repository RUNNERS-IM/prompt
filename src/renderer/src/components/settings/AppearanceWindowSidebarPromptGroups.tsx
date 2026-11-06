import type React from 'react'
import { Fragment } from 'react'

import { SettingsSubsectionHeader } from './SettingsFormControls'
import { translate } from '@/i18n/i18n'

type AppearanceWindowSidebarPromptGroupsProps = {
  showSidebar: boolean
  sidebarRows: React.ReactNode[]
  statusBarTitle: string
  statusBarDescription: string
  statusBarRows: React.ReactNode | null
  fileExplorerRows: React.ReactNode[] | null
}

// Prompt: Window & Sidebar as three titled boxes; the Orca-only sidebar buttons and card layout are left out.
export function AppearanceWindowSidebarPromptGroups({
  showSidebar,
  sidebarRows,
  statusBarTitle,
  statusBarDescription,
  statusBarRows,
  fileExplorerRows
}: AppearanceWindowSidebarPromptGroupsProps): React.JSX.Element {
  return (
    <>
      {showSidebar ? (
        <section>
          <SettingsSubsectionHeader
            title={translate('auto.components.settings.AppearancePane.dc29f3cc0d', 'Sidebar')}
          />
          {sidebarRows.map((row, index) => (
            <Fragment key={index}>{row}</Fragment>
          ))}
        </section>
      ) : null}
      {statusBarRows ? (
        <section>
          <SettingsSubsectionHeader title={statusBarTitle} description={statusBarDescription} />
          {statusBarRows}
        </section>
      ) : null}
      {fileExplorerRows ? (
        <section>
          <SettingsSubsectionHeader
            title={translate('auto.components.settings.AppearancePane.d496901cd0', 'File Explorer')}
          />
          {fileExplorerRows.map((row, index) => (
            <Fragment key={index}>{row}</Fragment>
          ))}
        </section>
      ) : null}
    </>
  )
}
