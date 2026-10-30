import type {
  RuntimeRendererSyncWindowGraph,
  RuntimeSyncWindowGraphResult
} from '../../shared/runtime-session-contracts'
import { PROMPT_MAIN_WINDOW_KEY as MAIN } from '../../shared/prompt-windows'
import {
  isPromptExtraWindowSender,
  promptExtraWindowCount,
  promptTabOwnerKey,
  promptWindowKeyOfSender
} from './prompt-window-registry'

/**
 * Orca's runtime takes the terminal graph (tabs and panes the renderer shows) from one window,
 * the main window, and rejects other publishers. The CLI, agent messaging and phones use that
 * graph, so it must name every window's terminals. Prompt keeps the last graph of each window
 * and publishes their union as the main window's graph: each window counts only for the tabs it
 * owns (a window that just handed a tab over may still list it until it reloads).
 */

type Graph = RuntimeRendererSyncWindowGraph
type Publish = (windowId: number, graph: Graph) => RuntimeSyncWindowGraphResult

const lastGraphByKey = new Map<string, Graph>()
let mainWindowId: number | null = null

function ownPart(key: string, graph: Graph): Pick<Graph, 'tabs' | 'leaves'> {
  return {
    tabs: graph.tabs.filter((tab) => promptTabOwnerKey(tab.tabId) === key),
    leaves: graph.leaves.filter((leaf) => promptTabOwnerKey(leaf.tabId) === key)
  }
}

export function promptMergedWindowGraph(main: Graph): Graph {
  const extras = [...lastGraphByKey.entries()].filter(([key]) => key !== MAIN)
  if (extras.length === 0) {
    return main
  }
  const own = ownPart(MAIN, main)
  const tabs = [...own.tabs]
  const leaves = [...own.leaves]
  for (const [key, graph] of extras) {
    const part = ownPart(key, graph)
    tabs.push(...part.tabs)
    leaves.push(...part.leaves)
  }
  return { ...main, tabs, leaves }
}

/** An extra window closed: its graph no longer counts. */
export function forgetPromptWindowGraph(key: string): void {
  lastGraphByKey.delete(key)
}

/**
 * `runtime:syncWindowGraph`. The main window's graph is published with the extra windows'
 * tabs added; an extra window's graph is stored and the union published again under the main
 * window, once the main window has published at least once.
 */
export function promptSyncWindowGraph(
  sender: { id: number },
  windowId: number,
  graph: Graph,
  publish: Publish,
  status: () => RuntimeSyncWindowGraphResult
): RuntimeSyncWindowGraphResult {
  if (!isPromptExtraWindowSender(sender)) {
    lastGraphByKey.set(MAIN, graph)
    mainWindowId = windowId
    return publish(windowId, promptExtraWindowCount() > 0 ? promptMergedWindowGraph(graph) : graph)
  }
  lastGraphByKey.set(promptWindowKeyOfSender(sender), graph)
  const main = lastGraphByKey.get(MAIN)
  if (!main || mainWindowId === null) {
    return status()
  }
  try {
    // Without the main window's mobile fields: those were already applied with its own graph.
    const { mobileSessionTabs: _m, unchangedMobileSessionWorktrees: _u, ...rest } = main
    return publish(mainWindowId, promptMergedWindowGraph(rest as Graph))
  } catch {
    // The main window is reloading; its next graph carries this window's tabs.
    return status()
  }
}

/** Test seam. */
export function resetPromptWindowGraphForTests(): void {
  lastGraphByKey.clear()
  mainWindowId = null
}
