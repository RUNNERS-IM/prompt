import {
  resolveTerminalTabTitle,
  resolveUnifiedTabLabel
} from '../../../shared/tab-title-resolution'
import type { Tab } from '../../../shared/tab-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { localizedTerminalTitle } from './terminal-default-title-label'

/** Palette title in the screen's language, so searching and highlighting both use what the row shows. */
export function resolveTerminalPaletteTitle(
  tab: Tab,
  terminalTab: TerminalTab | undefined,
  generatedTitlesEnabled: boolean
): string {
  const terminalTitle = terminalTab
    ? resolveTerminalTabTitle(terminalTab, generatedTitlesEnabled, 'Terminal')
    : 'Terminal'
  return localizedTerminalTitle(
    resolveUnifiedTabLabel(
      {
        ...tab,
        customLabel: tab.customLabel ?? terminalTab?.customTitle ?? null,
        quickCommandLabel: tab.quickCommandLabel ?? terminalTab?.quickCommandLabel,
        generatedLabel: tab.generatedLabel ?? terminalTab?.generatedTitle
      },
      generatedTitlesEnabled,
      terminalTitle
    )
  )
}
