import { getPtyIpc } from '../pty-host-bindings'
import { runPtyIpcSpawn } from './spawn-run'
import type { PtySpawnIpcArgs, PtySpawnIpcDeps } from './spawn-types'
import { getConnectionExecutionHostId } from '../../../../shared/execution-host'
import { attachOnlyViewOf, attachViewAfterHiddenStart } from '../pane/attach-only-view'
import {
  recordPromptPtyOwner,
  recordPromptPtyWorktree,
  runPromptSpawnFor
} from '../../../prompt-windows/prompt-project-window-registry'

export function installPtySpawnIpcHandler(deps: PtySpawnIpcDeps): void {
  const ipcMain = getPtyIpc()
  const { getLocalPtyStartupPromise } = deps

  ipcMain.handle('pty:spawn', async (_event, args: PtySpawnIpcArgs) => {
    recordPromptPtyWorktree(args.sessionId, args.worktreeId)
    recordPromptPtyOwner(args.sessionId, _event?.sender)
    const startupPromise = getLocalPtyStartupPromise(
      getConnectionExecutionHostId(args.connectionId)
    )
    if (startupPromise) {
      await startupPromise
    }
    const spawn = (): ReturnType<typeof runPtyIpcSpawn> =>
      runPromptSpawnFor(_event?.sender, () => runPtyIpcSpawn(deps, args))
    if (attachOnlyViewOf(args) && args.sessionId && args.initiallyHidden !== true) {
      return attachViewAfterHiddenStart(
        args.sessionId,
        deps.transitionSpawnHiddenRendererPtyDeliveryState,
        spawn
      )
    }
    return spawn()
  })
}
