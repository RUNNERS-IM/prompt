import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { setMovedTerminalOwnerSession } from '../../shared/moved-terminal-owner'
import type { Store } from '../persistence'

/** Terminals moved between workspaces answer to the workspace holding their tab (teardown, restart). */
export function installMovedTerminalOwners(getStore: () => Store | null | undefined): void {
  setMovedTerminalOwnerSession(() => getStore()?.getWorkspaceSession(LOCAL_EXECUTION_HOST_ID))
}
