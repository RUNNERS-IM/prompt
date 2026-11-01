import { useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { persistAgentLaunchTabOrder } from '@/lib/launch-agent-tab-order'
import { launchAgentInNewTab } from '@/lib/launch-agent-in-new-tab'
import { newAgentLaunchRequestId } from '@/lib/agent-launch-request-id'
import { insertUnifiedTabAfterAnchor } from '@/lib/unified-tab-anchor-insertion'
import { findWorktreeById } from '@/store/github/worktree-refresh'
import {
  parsePromptClaudeStartChoices,
  type PromptClaudeStartChoices
} from './prompt-claude-start-launch'

// A "new Claude session" first opens a tab that shows the start box instead of a terminal. The
// tab has no PTY until Start, which opens the real Claude tab in its place and closes it.

const PENDING_STORAGE_KEY = 'orca.prompt.claude-start.pending-tabs.v1'
const CHOICES_STORAGE_KEY = 'orca.prompt.claude-start.choices.v1'
// Box tabs survive a restart through this list; stale ids are harmless, so only its length is capped.
const MAX_PENDING_REMEMBERED = 50

function readStoredJson(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeStoredJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be full or blocked; the box still works for this run.
  }
}

let pendingTabIds: ReadonlySet<string> | null = null
const listeners = new Set<() => void>()

function pendingSet(): ReadonlySet<string> {
  if (!pendingTabIds) {
    const stored = readStoredJson(PENDING_STORAGE_KEY)
    pendingTabIds = new Set(
      Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : []
    )
  }
  return pendingTabIds
}

function setPending(tabId: string, pending: boolean): void {
  const current = pendingSet()
  if (current.has(tabId) === pending) {
    return
  }
  const next = new Set(current)
  if (pending) {
    next.add(tabId)
  } else {
    next.delete(tabId)
  }
  pendingTabIds = next
  writeStoredJson(PENDING_STORAGE_KEY, [...next].slice(-MAX_PENDING_REMEMBERED))
  for (const listener of listeners) {
    listener()
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function isPromptClaudeStartTab(tabId: string): boolean {
  return pendingSet().has(tabId)
}

export function usePromptClaudeStartTab(tabId: string): boolean {
  return useSyncExternalStore(subscribe, () => pendingSet().has(tabId))
}

/** Test-only: forget the in-memory list so the next read comes from storage. */
export function resetPromptClaudeStartTabsForTest(): void {
  pendingTabIds = null
  listeners.clear()
}

/** Opens a box tab at the end of the strip, in the pane the session was asked for. */
export function openPromptClaudeStartTab(worktreeId: string, groupId: string | undefined): string {
  const store = useAppStore.getState()
  const tabId = createBrowserUuid()
  // Marked before the tab exists so its first render is the box, never a shell.
  setPending(tabId, true)
  // launchAgent makes the sidebar row read "New Session" like any Claude launch.
  store.createTab(worktreeId, groupId, undefined, { id: tabId, launchAgent: 'claude' })
  store.setActiveTabType('terminal', worktreeId)
  persistAgentLaunchTabOrder(worktreeId, tabId)
  return tabId
}

function unifiedTabIdFor(worktreeId: string, terminalTabId: string): string | null {
  const tabs = useAppStore.getState().unifiedTabsByWorktree[worktreeId] ?? []
  return (
    tabs.find((tab) => tab.contentType === 'terminal' && tab.entityId === terminalTabId)?.id ?? null
  )
}

/**
 * Start from the box: open the Claude tab the usual way with the picked flags, put it where the
 * box tab was, then close the box tab. A launch that cannot be built keeps the box open.
 */
export function startPromptClaudeFromBox(args: {
  tabId: string
  worktreeId: string
  launch: { sessionOptions?: Record<string, string>; agentArgs?: string }
}): boolean {
  const { tabId, worktreeId, launch } = args
  const store = useAppStore.getState()
  const groupId =
    (store.unifiedTabsByWorktree[worktreeId] ?? []).find(
      (tab) => tab.contentType === 'terminal' && tab.entityId === tabId
    )?.groupId ?? undefined
  const before = new Set((store.tabsByWorktree[worktreeId] ?? []).map((tab) => tab.id))
  const result = launchAgentInNewTab({
    requestId: newAgentLaunchRequestId(),
    agent: 'claude',
    worktreeId,
    ...(groupId ? { groupId } : {}),
    ...(launch.sessionOptions ? { sessionOptions: launch.sessionOptions } : {}),
    ...(launch.agentArgs !== undefined ? { agentArgs: launch.agentArgs } : {}),
    launchSource: 'shortcut'
  })
  if (!result) {
    toast.error(
      translate('prompt.claudeStart.launchFailed', 'Could not start Claude with these options.')
    )
    return false
  }
  const created = (useAppStore.getState().tabsByWorktree[worktreeId] ?? []).find(
    (tab) => !before.has(tab.id)
  )
  const anchor = unifiedTabIdFor(worktreeId, tabId)
  const placed = created ? unifiedTabIdFor(worktreeId, created.id) : null
  if (anchor && placed) {
    insertUnifiedTabAfterAnchor(worktreeId, placed, anchor)
  }
  setPending(tabId, false)
  useAppStore.getState().closeTab(tabId, { recordInteraction: false, captureRecentlyClosed: false })
  return true
}

/** Remembered picks are per project, so each repo's worktrees open with the same box. */
export function promptClaudeStartProjectKey(worktreeId: string): string {
  return findWorktreeById(useAppStore.getState(), worktreeId)?.repoId ?? worktreeId
}

export function readPromptClaudeStartChoices(projectKey: string): PromptClaudeStartChoices {
  const stored = readStoredJson(CHOICES_STORAGE_KEY)
  const byProject = stored && typeof stored === 'object' ? (stored as Record<string, unknown>) : {}
  return parsePromptClaudeStartChoices(byProject[projectKey])
}

export function writePromptClaudeStartChoices(
  projectKey: string,
  choices: PromptClaudeStartChoices
): void {
  const stored = readStoredJson(CHOICES_STORAGE_KEY)
  const byProject =
    stored && typeof stored === 'object' ? { ...(stored as Record<string, unknown>) } : {}
  byProject[projectKey] = choices
  writeStoredJson(CHOICES_STORAGE_KEY, byProject)
}
