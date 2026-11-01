import { isWebRuntimeSessionActive } from '@/runtime/web-runtime-session-environment'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { useAppStore } from '@/store'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import type { TuiAgent } from '../../../../shared/tui-agent'

/**
 * Whether a new-agent-tab launch shows the start box first: Claude only, in a workspace whose
 * tabs this window creates. The floating panel and a paired host's tabs launch as before.
 */
export function opensPromptClaudeStartBox(worktreeId: string, agent: TuiAgent): boolean {
  if (agent !== 'claude' || worktreeId === FLOATING_TERMINAL_WORKTREE_ID) {
    return false
  }
  const environmentId = runtimeEnvironmentIdOrLocalUnlessTwin(useAppStore.getState(), worktreeId)
  return !isWebRuntimeSessionActive(environmentId)
}
