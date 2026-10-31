import { useAppStore } from '@/store'
import type { AppState } from '@/store/types'
import { probePtyRunningWork } from '@/components/terminal/pty-running-work-probe'
import { sendRuntimePtyInput } from '@/runtime/runtime-terminal-inspection'
import { revealWorkspaceSurface } from '@/lib/workspace-surface-reveal'
import { isLocalWindowsDesktopClient } from '@/lib/desktop-window-chrome'
import { isPromptLocalWorktree } from '@/lib/prompt-local-worktree'
import { locateTerminalTab } from '@/store/terminals/terminal-tab-location'
import { terminalTabWorkspaceMovePatch } from '@/store/terminals/terminal-tab-workspace-move'
import { buildActiveSurfacePatch } from '@/store/slices/tabs/tabs-surface'
import { ORCA_LAYOUT_OWNER_IS_MAIN } from '../../../shared/layout-owner-switch'
import { collectLeafIds } from '../../../shared/terminal-pane-layout-tree'
import { quotePosixShell } from '../../../shared/shell-argument-quoting'
import type {
  ShellTabMoveRefusal,
  ShellTabMoveResult
} from '../../../shared/shell-tab-workspace-move-types'

/** How long the idle check may wait for the host to list each shell's child processes. */
const IDLE_PROBE_TIMEOUT_MS = 2_000

type MoveCheck =
  | { ok: true; sourceWorktreeId: string; ptyIds: string[]; folder: string }
  | { ok: false; reason: ShellTabMoveRefusal }

/** `cd -- '<folder>'` with the folder single-quoted, so no character in it is read as shell syntax. */
export function shellChangeDirectoryCommand(folder: string): string {
  return `cd -- ${quotePosixShell(folder)}`
}

/** Terminal ids of every pane in the tab, or null when some pane has no running terminal. */
function boundTerminalIds(
  state: AppState,
  tabId: string,
  tabPtyId: string | null
): string[] | null {
  const layout = state.terminalLayoutsByTabId[tabId]
  const leafIds = collectLeafIds(layout?.root)
  if (leafIds.length === 0) {
    return tabPtyId ? [tabPtyId] : null
  }
  const ptyIds = leafIds.map((leafId) => layout?.ptyIdsByLeafId?.[leafId])
  if (ptyIds.some((ptyId) => !ptyId)) {
    return null
  }
  return [...new Set(ptyIds as string[])]
}

/** Everything that can be decided from the store, before asking whether the shells are idle. */
export function checkShellTabMove(
  state: AppState,
  tabId: string,
  targetWorktreeId: string
): MoveCheck {
  // Switch point: main-owned layouts move only editor tabs between workspaces.
  if (ORCA_LAYOUT_OWNER_IS_MAIN) {
    return { ok: false, reason: 'layout-owned-by-main' }
  }
  const located = locateTerminalTab(state.tabsByWorktree, tabId)
  if (!located) {
    return { ok: false, reason: 'tab-not-found' }
  }
  if (located.worktreeId === targetWorktreeId) {
    return { ok: false, reason: 'same-workspace' }
  }
  const target = state.getKnownWorktreeById?.(targetWorktreeId)
  if (!target) {
    return { ok: false, reason: 'target-not-found' }
  }
  if (
    !isPromptLocalWorktree(state, located.worktreeId) ||
    !isPromptLocalWorktree(state, targetWorktreeId)
  ) {
    return { ok: false, reason: 'remote' }
  }
  // `cd --` and single quotes are POSIX shell syntax; Windows shells read them differently.
  if (isLocalWindowsDesktopClient()) {
    return { ok: false, reason: 'unsupported-shell' }
  }
  const folder = target.path
  if (!folder || /[\r\n]/.test(folder)) {
    return { ok: false, reason: 'unsupported-folder' }
  }
  const ptyIds = boundTerminalIds(state, tabId, located.tab.ptyId)
  if (!ptyIds) {
    return { ok: false, reason: 'no-running-terminal' }
  }
  return { ok: true, sourceWorktreeId: located.worktreeId, ptyIds, folder }
}

/**
 * Moves a shell tab, with its running terminals, to another workspace and changes each shell's
 * folder to the target's. Only local tabs whose every pane is an idle shell (no program running in
 * it) move; anything else answers with the reason it stayed. Sidebar drag and the
 * `terminal.moveToWorkspace` runtime call both come here.
 */
export async function moveShellTabToWorkspace(args: {
  tabId: string
  targetWorktreeId: string
  /** Show the target workspace with the moved tab focused. */
  reveal?: boolean
}): Promise<ShellTabMoveResult> {
  const { tabId, targetWorktreeId } = args
  const before = checkShellTabMove(useAppStore.getState(), tabId, targetWorktreeId)
  if (!before.ok) {
    return { moved: false, reason: before.reason }
  }
  const probes = await probePtyRunningWork(before.ptyIds, { timeoutMs: IDLE_PROBE_TIMEOUT_MS })
  if (probes.some((probe) => probe.verdict === 'live')) {
    return { moved: false, reason: 'running-program' }
  }
  if (probes.length !== before.ptyIds.length || probes.some((p) => p.verdict !== 'exited')) {
    return { moved: false, reason: 'idle-unknown' }
  }
  // The probe awaited the host; the tab may have moved, closed or bound new terminals meanwhile.
  const state = useAppStore.getState()
  const after = checkShellTabMove(state, tabId, targetWorktreeId)
  if (
    !after.ok ||
    after.sourceWorktreeId !== before.sourceWorktreeId ||
    after.ptyIds.join('\0') !== before.ptyIds.join('\0')
  ) {
    return { moved: false, reason: after.ok ? 'changed' : after.reason }
  }
  const patch = terminalTabWorkspaceMovePatch(state, tabId, targetWorktreeId, after.ptyIds)
  if (!patch) {
    return { moved: false, reason: 'tab-not-found' }
  }
  useAppStore.setState(patch)
  const command = `${shellChangeDirectoryCommand(after.folder)}\r`
  for (const ptyId of after.ptyIds) {
    sendRuntimePtyInput(ptyId, command, 'orchestration')
  }
  if (args.reveal) {
    const store = useAppStore.getState()
    revealWorkspaceSurface(store, targetWorktreeId)
    store.setActiveTab(tabId)
  } else if (useAppStore.getState().activeWorktreeId === after.sourceWorktreeId) {
    // The window stays on the old workspace; its focused tab must not point at the tab that left.
    useAppStore.setState((current) =>
      buildActiveSurfacePatch(
        current,
        after.sourceWorktreeId,
        current.activeGroupIdByWorktree[after.sourceWorktreeId] ?? null
      )
    )
  }
  return { moved: true, tabId, worktreeId: targetWorktreeId }
}
