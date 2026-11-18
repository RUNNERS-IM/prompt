import type { UpdateStatus } from '../../../../shared/update-status-types'
import { useAppStore } from '../../store'

/** Installs updater listeners in their historical snapshot-before-push order. */
export function registerUpdaterStatusIpcBridge(unsubs: (() => void)[]): void {
  // Current behavior intentionally permits the initial snapshot to overwrite an earlier push.
  window.api.updater.getStatus().then((status) => {
    useAppStore.getState().setUpdateStatus(status as UpdateStatus)
  })

  unsubs.push(
    window.api.updater.onStatus((raw) => {
      useAppStore.getState().setUpdateStatus(raw as UpdateStatus)
    })
  )
  unsubs.push(
    window.api.updater.onClearDismissal(() => {
      useAppStore.getState().clearDismissedUpdateVersion()
    })
  )
  unsubs.push(
    window.api.updater.onAutoInstallRequested(() => {
      // 카드의 「다시 시작」과 같은 길: 편집기 글을 백업하고 상태를 저장한 뒤 깐다.
      void window.api.updater.quitAndInstall().catch((error) => {
        console.warn('[updater] auto install was not started', error)
      })
    })
  )
}
