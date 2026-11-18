import { app, powerMonitor } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { UpdateCheckOptions, UpdateStatus } from '../../shared/update-status-types'
import { getReleaseNotesUrlForVersion } from '../../shared/release-channel'
import { recordUpdaterLifecycle } from '../updater-lifecycle-diagnostics'
import {
  AUTO_INSTALL_POLL_MS,
  EMPTY_AUTO_INSTALL_RECORD,
  canAutoInstallNow,
  parseAutoInstallRecord,
  resolveAutoInstallRecordOnLaunch,
  type AutoInstallRecord
} from './auto-install-policy'
import { UpdaterDownloadInstall } from './updater-download-install'

const AUTO_INSTALL_RECORD_FILE = 'prompt-auto-update.json'

export type AutoUpdatedNotice = { version: string; releaseUrl: string }

/**
 * 새 판 저절로 깔기. 「업데이트 자동 확인」이 켜져 있고 저절로 한 확인에서 새 판을 찾으면
 * 카드 없이 바로 받고, 맥 입력이 10분 없고 답을 쓰는 Claude 가 없을 때 깐다.
 * 앱을 끌 때는 Squirrel 이 받아 둔 판을 깔므로(autoInstallOnAppQuit) 여기서는 기록만 남긴다.
 * 메뉴 「업데이트 확인」으로 찾은 새 판은 지금처럼 카드로 묻는다.
 */
export abstract class UpdaterAutoInstall extends UpdaterDownloadInstall {
  protected _getWorkingAgentCount: (() => number) | null = null
  // 마지막 확인이 메뉴에서 직접 누른 것인지. 그때 찾은 새 판은 카드로 묻는다.
  private lastCheckFromMenu = false
  // 지금 받는 · 받아 둔 판이 저절로 받은 것인지.
  private autoInstallCycle = false
  private autoInstallTimer: ReturnType<typeof setInterval> | null = null
  private autoInstallRecord: AutoInstallRecord | null = null

  protected checkForUpdatesFromMenu(options?: UpdateCheckOptions): void {
    this.lastCheckFromMenu = true
    this.stopAutoInstallCycle()
    super.checkForUpdatesFromMenu(options)
  }

  protected runBackgroundUpdateCheck(nudgeId?: string | null): boolean {
    const launched =
      nudgeId === undefined
        ? super.runBackgroundUpdateCheck()
        : super.runBackgroundUpdateCheck(nudgeId)
    if (launched) {
      this.lastCheckFromMenu = false
    }
    return launched
  }

  protected sendStatus(status: UpdateStatus, options?: { force?: boolean }): void {
    if (status.state === 'available') {
      this.autoInstallCycle = !this.lastCheckFromMenu && this.isAutoInstallAllowed(status)
    } else if (
      status.state !== 'downloading' &&
      status.state !== 'downloaded' &&
      status.state !== 'error'
    ) {
      this.stopAutoInstallCycle()
    }
    const tagged = this.autoInstallCycle ? tagAutoInstallStatus(status) : status
    super.sendStatus(tagged, options)
    if (!this.autoInstallCycle) {
      return
    }
    if (status.state === 'available') {
      recordUpdaterLifecycle('auto_install_download_started', { version: status.version })
      // 카드 쪽 상태 전달이 끝난 뒤 받기 시작한다.
      setImmediate(() => this.downloadUpdate())
    } else if (status.state === 'downloaded' && !status.installing) {
      this.writeAutoInstallRecord({ ...this.readAutoInstallRecord(), pendingVersion: status.version })
      this.startAutoInstallTimer()
    } else if (status.state === 'error') {
      this.stopAutoInstallCycle()
    }
  }

  /** 다음에 열 때 한 번 보여 줄 「… 로 업데이트했습니다」. 닫으면 다시 안 뜬다. */
  getAutoUpdatedNotice(): AutoUpdatedNotice | null {
    const version = this.readAutoInstallRecord().noticeVersion
    return version ? { version, releaseUrl: getReleaseNotesUrlForVersion(version) } : null
  }

  dismissAutoUpdatedNotice(): void {
    const record = this.readAutoInstallRecord()
    if (record.noticeVersion) {
      this.writeAutoInstallRecord({ ...record, noticeVersion: null })
    }
  }

  private isAutoInstallAllowed(status: Extract<UpdateStatus, { state: 'available' }>): boolean {
    return (
      this.updateInstallMode === 'interactive' &&
      this.activeUpdateSource === 'release' &&
      !this.isPinnedBuildActive &&
      !status.externallyManaged &&
      (this._isAutomaticCheckOn?.() ?? true)
    )
  }

  private startAutoInstallTimer(): void {
    if (this.autoInstallTimer) {
      return
    }
    this.autoInstallTimer = setInterval(() => this.tryAutoInstallWhileIdle(), AUTO_INSTALL_POLL_MS)
    this.autoInstallTimer.unref?.()
  }

  private tryAutoInstallWhileIdle(): void {
    if (!this.autoInstallCycle || this.currentStatus.state !== 'downloaded') {
      this.stopAutoInstallTimer()
      return
    }
    const idleSeconds = powerMonitor.getSystemIdleTime()
    const workingAgentCount = this._getWorkingAgentCount?.() ?? 0
    if (!canAutoInstallNow({ idleSeconds, workingAgentCount })) {
      return
    }
    this.stopAutoInstallTimer()
    recordUpdaterLifecycle('auto_install_idle_started', {
      version: this.currentStatus.version,
      idleSeconds
    })
    this.quitAndInstall()
  }

  private stopAutoInstallTimer(): void {
    if (this.autoInstallTimer) {
      clearInterval(this.autoInstallTimer)
      this.autoInstallTimer = null
    }
  }

  private stopAutoInstallCycle(): void {
    this.autoInstallCycle = false
    this.stopAutoInstallTimer()
  }

  private recordFilePath(): string {
    return path.join(app.getPath('userData'), AUTO_INSTALL_RECORD_FILE)
  }

  // 처음 읽을 때 열기 전 받아 둔 판이 깔렸는지 정리한다.
  private readAutoInstallRecord(): AutoInstallRecord {
    if (this.autoInstallRecord) {
      return this.autoInstallRecord
    }
    let stored = EMPTY_AUTO_INSTALL_RECORD
    try {
      stored = parseAutoInstallRecord(JSON.parse(readFileSync(this.recordFilePath(), 'utf8')))
    } catch {
      // 기록이 없거나 깨졌으면 빈 기록으로 본다.
    }
    const resolved = resolveAutoInstallRecordOnLaunch(stored, app.getVersion())
    if (resolved !== stored) {
      this.writeAutoInstallRecord(resolved)
    } else {
      this.autoInstallRecord = resolved
    }
    return resolved
  }

  private writeAutoInstallRecord(record: AutoInstallRecord): void {
    this.autoInstallRecord = record
    try {
      writeFileSync(this.recordFilePath(), JSON.stringify(record))
    } catch (error) {
      recordUpdaterLifecycle(
        'auto_install_record_write_failed',
        { errorType: error instanceof Error ? error.name : typeof error },
        { level: 'warn' }
      )
    }
  }
}

function tagAutoInstallStatus(status: UpdateStatus): UpdateStatus {
  if (
    status.state === 'available' ||
    status.state === 'downloading' ||
    status.state === 'downloaded'
  ) {
    return { ...status, autoInstall: true }
  }
  return status
}
