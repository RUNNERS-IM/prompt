import { useAppStore } from '../store'
import type { AppState } from '../store/types'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { folderWorkspaceKey } from '../../../shared/workspace-scope'
import { getRepoIdFromWorktreeId } from '../../../shared/worktree/id'
import { buildValidWorktreeIdsForSessionHydration } from '../../../shared/worktree/degraded-repo-worktree-validity'
import type {
  PreviousVersionSessionTabCandidate,
  PreviousVersionSessionTabsReport,
  PreviousVersionSessionWindowSkipReason
} from '../../../shared/previous-version-session-tabs'

type PlanState = Pick<
  AppState,
  | 'tabsByWorktree'
  | 'terminalLayoutsByTabId'
  | 'ptyIdsByTabId'
  | 'pendingReconnectPtyIdByTabId'
  | 'repos'
  | 'worktreesByRepo'
  | 'detectedWorktreesByRepo'
  | 'folderWorkspaces'
>

export type PreviousVersionSessionTabPlan = {
  create: PreviousVersionSessionTabCandidate[]
  skipped: PreviousVersionSessionTabsReport['skipped']
}

function collectTabPtyIds(state: PlanState): Set<string> {
  const ptyIds = new Set<string>()
  for (const tabs of Object.values(state.tabsByWorktree)) {
    for (const tab of tabs) {
      if (tab.ptyId) {
        ptyIds.add(tab.ptyId)
      }
      for (const ptyId of Object.values(
        state.terminalLayoutsByTabId[tab.id]?.ptyIdsByLeafId ?? {}
      )) {
        ptyIds.add(ptyId)
      }
      for (const ptyId of state.ptyIdsByTabId[tab.id] ?? []) {
        ptyIds.add(ptyId)
      }
    }
  }
  for (const ptyId of Object.values(state.pendingReconnectPtyIdByTabId)) {
    ptyIds.add(ptyId)
  }
  return ptyIds
}

/** Which previous-version sessions get a new tab: no tab names them and their workspace still exists locally. */
export function planPreviousVersionSessionTabs(
  state: PlanState,
  candidates: readonly PreviousVersionSessionTabCandidate[]
): PreviousVersionSessionTabPlan {
  const tabPtyIds = collectTabPtyIds(state)
  const candidateWorktreeIds = candidates.map((candidate) => candidate.worktreeId)
  // Same rule as session hydration: a failed listing cannot prove a workspace was deleted.
  const validWorktreeIds = buildValidWorktreeIdsForSessionHydration(state, candidateWorktreeIds)
  validWorktreeIds.add(FLOATING_TERMINAL_WORKTREE_ID)
  for (const workspace of state.folderWorkspaces) {
    validWorktreeIds.add(folderWorkspaceKey(workspace.id))
  }
  const repoById = new Map(state.repos.map((repo) => [repo.id, repo]))
  const create: PreviousVersionSessionTabCandidate[] = []
  const skipped: PreviousVersionSessionTabPlan['skipped'] = {}
  const skip = (reason: PreviousVersionSessionWindowSkipReason): void => {
    skipped[reason] = (skipped[reason] ?? 0) + 1
  }
  for (const candidate of candidates) {
    if (tabPtyIds.has(candidate.sessionId)) {
      skip('has-tab')
      continue
    }
    if (!validWorktreeIds.has(candidate.worktreeId)) {
      skip('workspace-gone')
      continue
    }
    const repo = repoById.get(getRepoIdFromWorktreeId(candidate.worktreeId))
    if (repo?.connectionId || (repo?.executionHostId && repo.executionHostId !== 'local')) {
      skip('remote-workspace')
      continue
    }
    tabPtyIds.add(candidate.sessionId)
    create.push(candidate)
  }
  return { create, skipped }
}

/**
 * Once after the data-folder move: give recently used terminals left running by the previous
 * version a tab in their workspace. The tab only records the session; it attaches when opened.
 */
export async function createPreviousVersionSessionTabs(): Promise<void> {
  const api = window.api.pty.management.previousVersionSessionTabs
  const listed = await api.list()
  if (listed.status !== 'pending') {
    return
  }
  const plan = planPreviousVersionSessionTabs(useAppStore.getState(), listed.candidates)
  const skipped = { ...plan.skipped }
  let created = 0
  for (const candidate of plan.create) {
    try {
      useAppStore.getState().createTab(candidate.worktreeId, undefined, undefined, {
        activate: false,
        recordInteraction: false,
        initialPtyId: candidate.sessionId
      })
      created += 1
    } catch (error) {
      console.warn('[startup] could not create a tab for a previous-version terminal', error)
      skipped['create-failed'] = (skipped['create-failed'] ?? 0) + 1
    }
  }
  await api.report({ created, skipped })
}
