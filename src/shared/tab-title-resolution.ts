import type { Tab } from './tab-types'
import type { TerminalTab } from './terminal-tab-types'
import { isMeaningfulOpenCodeTerminalTitle } from './opencode-terminal-title'

// The numbered name a new terminal tab starts with ("Terminal 3"), also as translated UIs show it
// (ko, ru, ja, zh-TW, zh-CN). Escaped because the orcad server bundle must stay ASCII.
const DEFAULT_TERMINAL_TAB_NAME_RE = /^(?:terminal|\ud130\ubbf8\ub110|\u0442\u0435\u0440\u043c\u0438\u043d\u0430\u043b|\u30bf\u30fc\u30df\u30ca\u30eb|\u7d42\u7aef\u6a5f|\u7ec8\u7aef) \d+$/i

/** True when a name is only the numbered "Terminal N" a new terminal tab starts with. */
export function isDefaultTerminalTabName(name: string | null | undefined): boolean {
  return DEFAULT_TERMINAL_TAB_NAME_RE.test(name?.trim() ?? '')
}

/**
 * The tab's set name, or '' when there is none. A set name that is only the starting "Terminal N"
 * is treated as none: no one chose it, and as the strongest name it would hide every later one
 * (a `/rename`, the agent's title). defaultTitle itself is not compared: a tab made with a title
 * keeps that title as its defaultTitle too, and it stays a chosen name.
 */
export function terminalTabSetName(tab: { customTitle?: string | null }): string {
  const name = tab.customTitle?.trim() ?? ''
  return isDefaultTerminalTabName(name) ? '' : name
}

export function resolveTerminalTabTitle(
  tab: Pick<TerminalTab, 'quickCommandLabel' | 'aiVaultTitle' | 'generatedTitle' | 'title'> & {
    customTitle?: string | null
  },
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const liveTitle = tab.title?.trim() ?? ''
  return (
    terminalTabSetName(tab) ||
    tab.quickCommandLabel?.trim() ||
    (isMeaningfulOpenCodeTerminalTitle(liveTitle) ? liveTitle : '') ||
    tab.aiVaultTitle?.title.trim() ||
    (generatedTitlesEnabled ? tab.generatedTitle?.trim() : '') ||
    liveTitle ||
    fallback
  )
}

export function resolveUnifiedTabLabel(
  tab:
    | (Pick<
        Tab,
        'customLabel' | 'quickCommandLabel' | 'aiVaultTitle' | 'generatedLabel' | 'label'
      > &
        Partial<Pick<Tab, 'contentType'>>)
    | undefined,
  generatedTitlesEnabled: boolean,
  fallback = ''
): string {
  const liveLabel = tab?.label?.trim() ?? ''
  // Only a terminal tab starts with a "Terminal N" name; other tabs keep any label they were given.
  const customLabel =
    tab?.contentType === 'terminal'
      ? terminalTabSetName({ customTitle: tab.customLabel })
      : tab?.customLabel?.trim()
  return (
    customLabel ||
    tab?.quickCommandLabel?.trim() ||
    (isMeaningfulOpenCodeTerminalTitle(liveLabel) ? liveLabel : '') ||
    tab?.aiVaultTitle?.title.trim() ||
    (generatedTitlesEnabled ? tab?.generatedLabel?.trim() : '') ||
    liveLabel ||
    fallback
  )
}
