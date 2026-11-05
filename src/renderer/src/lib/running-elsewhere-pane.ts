import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { stablePaneHasLivePty } from '@/lib/sleeping-agent-pane-ownership'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import {
  agentProviderSessionsEqual,
  type AgentProviderSessionMetadata
} from '../../../shared/agent-session-resume'
import type { RunningElsewhereHolder } from '../../../shared/agent-resume-refusal'

/** A pane other than `ownPaneKey` whose live agent reported this conversation. */
export function findLivePaneForProviderSession(
  agent: string,
  providerSession: AgentProviderSessionMetadata,
  ownPaneKey: string | null
): RunningElsewhereHolder | null {
  const state = useAppStore.getState()
  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    const pane = entry.paneKey === ownPaneKey ? null : parsePaneKey(entry.paneKey)
    if (
      pane &&
      entry.agentType === agent &&
      agentProviderSessionsEqual(agent, entry.providerSession, providerSession) &&
      stablePaneHasLivePty(
        pane.tabId,
        pane.leafId,
        state.ptyIdsByTabId,
        state.terminalLayoutsByTabId[pane.tabId]
      )
    ) {
      return { paneKey: entry.paneKey, name: null }
    }
  }
  return null
}

function findHolderPane(holder: RunningElsewhereHolder) {
  const pane = holder.paneKey ? parsePaneKey(holder.paneKey) : null
  if (!pane) {
    return null
  }
  const state = useAppStore.getState()
  for (const [worktreeId, tabs] of Object.entries(state.tabsByWorktree)) {
    const tab = tabs.find((entry) => entry.id === pane.tabId)
    if (tab) {
      const paneTitle = state.terminalLayoutsByTabId[pane.tabId]?.titlesByLeafId?.[pane.leafId]
      return { worktreeId, tabId: pane.tabId, leafId: pane.leafId, title: paneTitle || tab.title }
    }
  }
  return null
}

/** The line a refused pane shows: which terminal already runs the conversation. */
export function runningElsewhereNotice(holder: RunningElsewhereHolder | undefined): string {
  const name = (holder && (findHolderPane(holder)?.title || holder.name))?.trim()
  const text = name
    ? translate(
        'auto.components.terminal.pane.runningElsewhere.named',
        'This conversation is already running in “{{name}}”, so it was not opened here.',
        { name }
      )
    : translate(
        'auto.components.terminal.pane.runningElsewhere.unnamed',
        'This conversation is already running in another terminal, so it was not opened here.'
      )
  return `\r\n\x1b[2m${text}\x1b[0m\r\n`
}

/** Moves to the pane holding the conversation; false when it is not a pane of this window. */
export function revealRunningElsewherePane(holder: RunningElsewhereHolder | undefined): boolean {
  const target = holder ? findHolderPane(holder) : null
  if (!target || activateAndRevealWorkspace(target.worktreeId) === false) {
    return false
  }
  useAppStore.getState().setActiveTabType('terminal', target.worktreeId)
  activateTabAndFocusPane(target.tabId, target.leafId, {
    flashFocusedPane: true,
    scrollToBottomIfOutputSinceLastView: true
  })
  return true
}
