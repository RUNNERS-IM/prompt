import { compareVersions } from '../updater-fallback'

// 새 판 저절로 깔기(위키 「2026-11-19 새 판은 쉬는 중 10분 · 앱을 끌 때 저절로 깔고, 다음에 열 때 한 번 알림」).
// 맥 입력이 이만큼 없으면 쉬는 중으로 본다.
export const AUTO_INSTALL_IDLE_SECONDS = 10 * 60
// 다 받은 뒤 쉬는 중인지 보는 간격.
export const AUTO_INSTALL_POLL_MS = 60 * 1000

/** 다 받아 둔 판(pendingVersion)과, 다음에 열 때 한 번 알릴 판(noticeVersion). */
export type AutoInstallRecord = {
  pendingVersion: string | null
  noticeVersion: string | null
}

export const EMPTY_AUTO_INSTALL_RECORD: AutoInstallRecord = {
  pendingVersion: null,
  noticeVersion: null
}

/** 쉬는 중 10분이 지났고, 답을 쓰는 중인 Claude 세션이 하나도 없을 때만 깐다. */
export function canAutoInstallNow({
  idleSeconds,
  workingAgentCount
}: {
  idleSeconds: number
  workingAgentCount: number
}): boolean {
  return idleSeconds >= AUTO_INSTALL_IDLE_SECONDS && workingAgentCount === 0
}

/**
 * 앱을 열 때 기록을 정리한다. 받아 둔 판이 지금 판이면 깔린 것이므로 알림으로 옮기고,
 * 지금 판이 더 새것이면 다른 길로 깔린 것이라 지운다. 아직 옛 판이면 그대로 둔다.
 */
export function resolveAutoInstallRecordOnLaunch(
  record: AutoInstallRecord,
  currentVersion: string
): AutoInstallRecord {
  const pending = record.pendingVersion
  if (!pending) {
    return record
  }
  const order = compareVersions(currentVersion, pending)
  if (order === 0) {
    return { pendingVersion: null, noticeVersion: pending }
  }
  if (order > 0) {
    return { ...record, pendingVersion: null }
  }
  return record
}

export function parseAutoInstallRecord(raw: unknown): AutoInstallRecord {
  if (!raw || typeof raw !== 'object') {
    return EMPTY_AUTO_INSTALL_RECORD
  }
  const stored: { pendingVersion?: unknown; noticeVersion?: unknown } = raw
  const pick = (key: 'pendingVersion' | 'noticeVersion'): string | null => {
    const value = stored[key]
    return typeof value === 'string' && value ? value : null
  }
  return { pendingVersion: pick('pendingVersion'), noticeVersion: pick('noticeVersion') }
}
