import { app } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * "Open at login": Prompt starts with the Mac, like Split, Monitor and Remote (decided default on, 2026-10-30 4B).
 *
 * The first release launch on a Mac registers the login item once and leaves a marker file, so turning it off
 * later in System Settings sticks. When macOS opens Prompt at login, the main window stays hidden: Prompt waits in
 * the menu bar and the Dock until the person opens it.
 *
 * macOS only for now. Windows has no "opened at login" signal without extra launch arguments, so a window would pop
 * up at every sign-in there.
 */
const DEFAULT_APPLIED = 'open-at-login-default'

export type OpenAtLoginDefaultInput = {
  platform: NodeJS.Platform
  packaged: boolean
  /** The one-time default was applied on this Mac before. */
  applied: boolean
  /** The login item is registered right now. */
  on: boolean
}

export function shouldRegisterOpenAtLogin(input: OpenAtLoginDefaultInput): boolean {
  if (input.platform !== 'darwin' || !input.packaged || input.applied) {
    return false
  }
  return !input.on
}

/** Whether to write the marker: once per Mac, on release builds, whether or not it had to register. */
export function shouldMarkOpenAtLoginApplied(input: Omit<OpenAtLoginDefaultInput, 'on'>): boolean {
  return input.platform === 'darwin' && input.packaged && !input.applied
}

let openedAtLogin = false

/** Call once after app 'ready' on desktop launches only (not serve, sidecar or automated runs). */
export function applyOpenAtLoginDefault(): void {
  if (process.platform !== 'darwin') {
    return
  }
  try {
    const settings = app.getLoginItemSettings()
    // Why: read at startup; the launch reason belongs to this process's first moments.
    openedAtLogin = settings.wasOpenedAtLogin === true
    const marker = join(app.getPath('userData'), DEFAULT_APPLIED)
    const base = {
      platform: process.platform,
      packaged: app.isPackaged,
      applied: existsSync(marker)
    }
    if (shouldRegisterOpenAtLogin({ ...base, on: settings.openAtLogin })) {
      app.setLoginItemSettings({ openAtLogin: true })
    }
    if (shouldMarkOpenAtLoginApplied(base)) {
      mkdirSync(app.getPath('userData'), { recursive: true })
      writeFileSync(marker, '')
    }
  } catch (error) {
    // Left for the next launch.
    console.warn('[open-at-login] Could not apply the default:', error)
  }
}

/** True when macOS opened Prompt at login, so the first window stays hidden. */
export function wasOpenedAtLogin(): boolean {
  return openedAtLogin
}

/** 설정 › 일반 「로그인할 때 열기」: 지금 로그인 항목에 들어 있는지. 읽지 못하면 꺼짐으로 본다. */
export function isOpenAtLoginOn(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin === true
  } catch (error) {
    console.warn('[open-at-login] Could not read the login item:', error)
    return false
  }
}

/** 설정 › 일반 「로그인할 때 열기」 스위치. 바꾼 뒤 실제 상태를 돌려준다. */
export function setOpenAtLogin(on: boolean): boolean {
  try {
    app.setLoginItemSettings({ openAtLogin: on })
  } catch (error) {
    console.warn('[open-at-login] Could not change the login item:', error)
  }
  return isOpenAtLoginOn()
}
