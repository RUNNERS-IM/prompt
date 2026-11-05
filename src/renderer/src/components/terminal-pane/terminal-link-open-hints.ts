import {
  canSourceOwnerOpenInOrca,
  type HttpLinkActionDestinations
} from '@/lib/http-link-destinations'
import type { HttpLinkSourceOwner } from '@/lib/http-link-routing'
import { translate } from '@/i18n/i18n'
import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'

export function isMacPlatform(): boolean {
  return navigator.userAgent.includes('Mac')
}

// Prompt: hints go through translations (Korean, and "Orca" shown as Prompt); unit tests keep the
// upstream English text so upstream tests pass through daily merges.
function linkHint(key: string, english: string): string {
  const mac = isMacPlatform()
  const values: Record<string, string> = {
    mod: mac ? '⌘' : 'Ctrl',
    shiftMod: mac ? '⇧⌘' : 'Shift+Ctrl'
  }
  if (!PROMPT_BLOCK_UPSTREAM_SERVICES) {
    return english.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => values[name] ?? '')
  }
  return translate(`prompt.terminalLinkHint.${key}`, english, values)
}

function terminalLinkActionHintPrefix(showActions: boolean): string {
  return showActions ? linkHint('actionsPrefix', 'Click for actions, ') : ''
}

export function getTerminalFileOpenHint(showActions = true): string {
  const prefix = terminalLinkActionHintPrefix(showActions)
  return `${prefix}${linkHint('fileOpen', '{{mod}}+click to open, or {{shiftMod}}+click for default app')}`
}

export function getTerminalOrcaFileOpenHint(showActions = true): string {
  const prefix = showActions ? linkHint('actionsOrPrefix', 'Click for actions or ') : ''
  return `${prefix}${linkHint('orcaFileOpen', '{{mod}}+click to open in Orca')}`
}

// Why: Shift+modifier on a local HTML file always takes the other link-routing destination.
export function getTerminalHtmlFileOpenHint(
  destinations: HttpLinkActionDestinations,
  showActions = true
): string {
  return getTerminalUrlOpenHint({
    openLinksInApp: destinations.primary === 'orca',
    modifierInverts: true,
    showActions
  })
}

export type TerminalUrlOpenHintOptions = {
  openLinksInApp?: boolean
  modifierInverts?: boolean
  showActions?: boolean
}

// Why: remote owners advertise Orca only when their existing browser route is eligible.
export function terminalUrlOpenHintOptionsFor(
  settings:
    | {
        openLinksInApp?: boolean
        openLinksInAppModifierInverts?: boolean
        activeRuntimeEnvironmentId?: string | null
      }
    | null
    | undefined,
  sourceOwner?: HttpLinkSourceOwner,
  canOpenOwnedBrowser = false
): TerminalUrlOpenHintOptions {
  const sourceCanOpenInOrca = sourceOwner
    ? canSourceOwnerOpenInOrca(sourceOwner, canOpenOwnedBrowser)
    : !settings?.activeRuntimeEnvironmentId?.trim()
  return {
    openLinksInApp: settings?.openLinksInApp === true,
    modifierInverts: settings?.openLinksInAppModifierInverts === true && sourceCanOpenInOrca
  }
}

// With inversion, Shift means the other destination; name the resolved one instead of always promising the system browser.
export function getTerminalUrlOpenHint(options: TerminalUrlOpenHintOptions = {}): string {
  const invertsToOrca = options.modifierInverts === true && options.openLinksInApp !== true
  const prefix = terminalLinkActionHintPrefix(options.showActions !== false)
  if (invertsToOrca) {
    return `${prefix}${linkHint('urlInvertsToOrca', '{{mod}}+click to open, or {{shiftMod}}+click to open in Orca')}`
  }
  return `${prefix}${linkHint('urlSystemBrowser', '{{mod}}+click to open, or {{shiftMod}}+click for system browser')}`
}

export function getTerminalUrlSystemBrowserHint(): string {
  return linkHint('systemBrowserOnly', '{{shiftMod}}+click for system browser')
}

// Invert the hint too when plain click already opens the system browser.
export function getTerminalUrlOrcaBrowserHint(): string {
  return linkHint('orcaBrowserOnly', '{{shiftMod}}+click to open in Orca')
}

export function getTerminalWorktreePathOpenHint(
  canOpenWithSystemDefault: boolean,
  showActions = true
): string {
  const prefix = terminalLinkActionHintPrefix(showActions)
  if (!canOpenWithSystemDefault) {
    const directPrefix = showActions ? linkHint('actionsOrPrefix', 'Click for actions or ') : ''
    return `${directPrefix}${linkHint('switchWorkspace', '{{mod}}+click to switch workspace')}`
  }

  return isMacPlatform()
    ? `${prefix}${linkHint('switchWorkspaceFinder', '{{mod}}+click to switch workspace, or {{shiftMod}}+click to open in Finder')}`
    : `${prefix}${linkHint('switchWorkspaceFolder', '{{mod}}+click to switch workspace, or {{shiftMod}}+click to open folder')}`
}
