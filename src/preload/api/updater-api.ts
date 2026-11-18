import type {
  LinuxPackageInstallInstructions,
  ReleaseBuildListResult,
  UpdateCheckOptions,
  UpdateStatus
} from '../../shared/update-status-types'
import type { ReleaseChannel } from '../../shared/release-channel'

export type UpdaterApi = {
  getVersion: () => Promise<string>
  getStatus: () => Promise<UpdateStatus>
  check: (options?: UpdateCheckOptions) => Promise<void>
  download: () => Promise<void>
  quitAndInstall: () => Promise<void>
  dismissNudge: () => Promise<void>
  dismissAvailableUpdate: () => Promise<void>
  /** Prompt: 저절로 깐 뒤 처음 열 때 한 번 보여 줄 판. 없으면 null. */
  getAutoUpdatedNotice?: () => Promise<{ version: string; releaseUrl: string } | null>
  dismissAutoUpdatedNotice?: () => Promise<void>
  /** Desktop-only. Rejects unless the current status carries `linux-package-install` recovery. */
  getLinuxPackageInstallInstructions: () => Promise<LinuxPackageInstallInstructions>
  /** Desktop-only. Reveals the revalidated cached package in the native file manager. */
  showLinuxPackage: () => Promise<void>
  /** Use force to bypass the cache only for an explicit refresh. */
  listBuilds: (
    channel: ReleaseChannel,
    options?: { force?: boolean }
  ) => Promise<ReleaseBuildListResult>

  onStatus: (callback: (status: UpdateStatus) => void) => () => void
  onClearDismissal: (callback: () => void) => () => void
  /** 쉬는 중 저절로 깔 때가 됐다고 본체가 알린다. 화면은 카드와 같은 길로 깐다. */
  onAutoInstallRequested: (callback: () => void) => () => void
}
