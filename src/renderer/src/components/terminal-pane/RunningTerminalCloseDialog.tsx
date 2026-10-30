import { useAppStore } from '@/store'
import { useRunningTerminalCloseConfirmStore } from '@/store/running-terminal-close-confirm'
import CloseTerminalDialog from './CloseTerminalDialog'
import { useCloseDialogSessionName } from './close-terminal-dialog-session-name'

/** Store-driven running-process confirmation lets tab/group/floating closes share the pane keyboard guard outside React context. */
export default function RunningTerminalCloseDialog(): React.JSX.Element {
  const request = useRunningTerminalCloseConfirmStore((state) => state.runningTerminalCloseConfirm)
  const confirmClose = useRunningTerminalCloseConfirmStore(
    (state) => state.confirmRunningTerminalClose
  )
  const confirmAllCloses = useRunningTerminalCloseConfirmStore(
    (state) => state.confirmAllRunningTerminalCloses
  )
  const dismissClose = useRunningTerminalCloseConfirmStore(
    (state) => state.dismissRunningTerminalClose
  )
  const updateSettings = useAppStore((state) => state.updateSettings)
  // Process probes can overlap the synchronous pinned queue; wait instead of stacking modal focus traps.
  const pinnedRequest = useAppStore((state) => state.pinnedTabCloseConfirm)
  const sessionName = useCloseDialogSessionName(request?.terminalTabId, request?.tabLabel)

  return (
    <CloseTerminalDialog
      open={request !== null && pinnedRequest === null}
      copyKind={request?.copyKind ?? 'command'}
      {...(sessionName ? { tabLabel: sessionName } : {})}
      // Pass the queued subject so checkbox reset runs even while the dialog stays open.
      {...(request ? { subjectKey: request.terminalTabId } : {})}
      onCancel={dismissClose}
      onConfirm={(dontAskAgain) => {
        if (dontAskAgain) {
          void updateSettings({ skipCloseTerminalWithRunningProcessConfirm: true })
          // Why: the user just opted out of this prompt; a queued one must not still appear.
          confirmAllCloses()
          return
        }
        confirmClose()
      }}
    />
  )
}
