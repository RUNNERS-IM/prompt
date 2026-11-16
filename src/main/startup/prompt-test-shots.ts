// 시험 촬영 모드(RUNNERS_TEST_SHOTS). 앱이 스스로 작업 창 · 설정 탭 · 계정 메뉴 · 정보 · 메뉴 막대 패널을
// 열어 언어 × 밝은 · 어두운으로 찍고 꺼진다. 공통 부분은 runners-app-kit/test-shots.ts 가 맡고,
// 여기에는 Prompt 의 화면을 여는 차례만 둔다(규약: ~/git/runners/_docs/[PROGRAM] 시험 촬영 규약.md).
// 켜고 끄는 것은 RUNNERS_TEST_SHOTS 하나로만 정한다(개발 전용 분기 뒤에 두지 않아 CI 운영 빌드에서도 찍힌다).
// 언어를 바꾸려고 설정의 uiLanguage 에 쓰므로, 끝나면 처음 값으로 되돌린 뒤 끈다. 시험은 시험용 사용자 자료 폴더로 돌린다.
import { app, nativeTheme, type BrowserWindow } from 'electron'
import { mainProcessState as state } from './main-process-state'
import {
  keepHidden,
  prepareTestShots,
  readTestShots,
  runTestShots,
  type TestShotPass
} from '../runners-app-kit/test-shots'
import { showPromptMenuPanelForTestShots } from '../tray/prompt-menu-panel-window'
import { openPromptNoticesWindowForTestShots } from '../window/prompt-notices-window'

const config = readTestShots()

const SHOT_WIDTH = 1280
const SHOT_HEIGHT = 800
/** 누른 뒤 화면이 다시 그려질 때까지 기다리는 시간. */
const SETTLE_MS = 1200

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** app.whenReady 앞에서 부른다. */
export function preparePromptTestShots(): void {
  prepareTestShots(config, app.commandLine)
}

/** 화면을 가리지 않게: 투명하게 한 뒤 앞으로 올리지 않고 보인다. 보이지 않은 창은 그려지지 않아 찍히지 않는다. */
function hideAndShow(window: BrowserWindow): void {
  keepHidden(window)
  window.show = () => window.showInactive()
  window.focus = () => {}
}

async function waitForMainWindow(): Promise<BrowserWindow> {
  for (;;) {
    const window = state.mainWindow
    if (window && !window.isDestroyed() && !window.webContents.isLoading()) {
      return window
    }
    await pause(250)
  }
}

async function waitForLoad(window: BrowserWindow): Promise<void> {
  if (window.webContents.isLoading()) {
    await new Promise<void>((resolve) =>
      window.webContents.once('did-finish-load', () => resolve())
    )
  }
}

/** 고르는 글과 맞는 n 번째 보이는 요소의 가운데 좌표. 없으면 null. */
async function centerOf(
  window: BrowserWindow,
  selector: string,
  text: string | null,
  index = 0
): Promise<{ x: number; y: number } | null> {
  return window.webContents.executeJavaScript(`(() => {
    const text = ${JSON.stringify(text)}
    const found = [...document.querySelectorAll(${JSON.stringify(selector)})].filter((el) => {
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0 && (text === null || el.textContent.includes(text))
    })[${index}]
    if (!found) return null
    const r = found.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
}

/** Radix 메뉴는 pointerdown 으로 열리므로 element.click() 대신 실제 마우스 입력을 보낸다. */
async function press(
  window: BrowserWindow,
  selector: string,
  text: string | null = null,
  index = 0
): Promise<boolean> {
  const point = await centerOf(window, selector, text, index)
  if (!point) {
    return false
  }
  const base = { x: point.x, y: point.y, button: 'left' as const, clickCount: 1 }
  window.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y })
  window.webContents.sendInputEvent({ type: 'mouseDown', ...base })
  window.webContents.sendInputEvent({ type: 'mouseUp', ...base })
  await pause(SETTLE_MS)
  return true
}

async function escape(window: BrowserWindow): Promise<void> {
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await pause(500)
}

const SETTINGS_NAV = '[data-prompt-settings-sidebar] button'

async function settingsLabels(window: BrowserWindow): Promise<string[]> {
  return window.webContents.executeJavaScript(`(() =>
    [...document.querySelectorAll(${JSON.stringify(SETTINGS_NAV)})]
      .slice(1)
      .map((el) => el.textContent.trim())
      .filter(Boolean)
  )()`)
}

async function closeSettings(window: BrowserWindow): Promise<void> {
  // 첫 단추가 「앱으로 돌아가기」다.
  await press(window, SETTINGS_NAV)
}

async function promptScenes(window: BrowserWindow, pass: TestShotPass): Promise<void> {
  await pass.shot(window, 'main', '작업 창')

  // 계정: 사이드바의 Claude 계정 고르기 메뉴
  const opened =
    (await press(window, 'button', '시스템 기본값')) ||
    (await press(window, 'button', 'System default'))
  if (opened) {
    await pass.shot(window, 'account', '계정 고르기')
    await escape(window)
  } else {
    pass.note('사이드바 계정 고르기 단추를 찾지 못함')
  }

  // 설정: 사이드바에 보이는 탭 전부. 이름은 그 언어로 보이는 글 그대로 쓴다.
  window.webContents.send('ui:openSettings')
  await pause(SETTLE_MS * 2)
  const labels = await settingsLabels(window)
  if (labels.length === 0) {
    pass.note('설정 탭을 찾지 못함')
  }
  for (const [index, label] of labels.entries()) {
    await press(window, SETTINGS_NAV, null, index + 1)
    await pass.shot(window, 'settings', label)
  }
  await closeSettings(window)

  // 창: 정보(설정의 정보 칸)와 오픈 소스 고지 창
  window.webContents.send('ui:openAboutSettings')
  await pause(SETTLE_MS * 2)
  await pass.shot(window, 'popups', '정보')
  await closeSettings(window)
  if (pass.wants('popups')) {
    const notices = openPromptNoticesWindowForTestShots(state.store, hideAndShow)
    await waitForLoad(notices)
    await pause(SETTLE_MS * 2)
    await pass.shot(notices, 'popups', '오픈-소스-고지')
    notices.destroy()
  } else {
    await pass.shot(window, 'popups', '오픈-소스-고지')
  }
  pass.note('업데이트 창: Prompt 는 따로 된 업데이트 창이 없어 찍지 않음')

  // 메뉴 막대 패널(맥만)
  const panel = pass.wants('menu') ? showPromptMenuPanelForTestShots(hideAndShow) : null
  if (panel) {
    await waitForLoad(panel)
    await pause(SETTLE_MS)
    await pass.shot(panel, 'menu', '메뉴-막대-패널')
    panel.hide()
  } else {
    await pass.shot(window, 'menu', '메뉴-막대-패널')
    if (pass.wants('menu')) {
      pass.note('메뉴 막대 패널 없음(맥이 아님)')
    }
  }
}

/** 시작이 끝난 뒤 부른다. 시험 촬영 모드가 아니면 아무것도 안 한다. */
export async function startPromptTestShots(): Promise<void> {
  if (!config) {
    return
  }
  const window = await waitForMainWindow()
  hideAndShow(window)
  window.showInactive()
  window.setContentSize(SHOT_WIDTH, SHOT_HEIGHT)
  // 첫 화면이 다 그려질 때까지
  await pause(SETTLE_MS * 4)
  if (config.account) {
    config.warnings.push(`RUNNERS_TEST_ACCOUNT=${config.account} 는 Prompt 에서 아직 쓰지 않음`)
  }
  const firstLanguage: unknown = await window.webContents.executeJavaScript(
    'window.api.settings.get().then((settings) => settings?.uiLanguage ?? null)'
  )
  await runTestShots({
    config,
    app: {
      getVersion: () => app.getVersion(),
      quit: () => {
        // 끄기 확인 창 등으로 멈추지 않게
        setTimeout(() => app.exit(0), 10_000).unref()
        void window.webContents
          .executeJavaScript(
            `window.api.settings.set({ uiLanguage: ${JSON.stringify(firstLanguage ?? 'system')} })`
          )
          .catch(() => {})
          .finally(() => app.quit())
      }
    },
    nativeTheme,
    settleMs: SETTLE_MS,
    async setLanguage(lang) {
      await window.webContents.executeJavaScript(
        `window.api.settings.set({ uiLanguage: ${JSON.stringify(lang)} })`
      )
      const loaded = new Promise<void>((resolve) =>
        window.webContents.once('did-finish-load', () => resolve())
      )
      window.webContents.reload()
      await loaded
      await pause(SETTLE_MS * 4)
    },
    scenes: (pass) => promptScenes(window, pass)
  })
}
