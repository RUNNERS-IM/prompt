// 메뉴바에 늘 떠 있는 Prompt 아이콘 PNG 두 장(커서 켜짐 · 커서 꺼짐)을 만든다.
// 모양은 세 앱(Split · Prompt · Monitor) 공통 규칙: 둥근 네모 화면 테두리 안에 앱 그림. Prompt 는 꺾쇠와 밑줄 커서(>_).
// 24 격자 기준 테두리 rect x2.5 y4.5 w19 h15 rx3 선 2, 꺾쇠 6.5,8.5 → 10,12 → 6.5,15.5 선 1.8, 커서 12,15.5 → 17.5,15.5 선 1.8.
// 18pt(@1x 18px · @2x 36px) 맥 template 이미지(검은 선 + 투명 바탕)라서 다크 · 라이트에 맞춰 맥이 색을 바꾼다.
// 커서 꺼짐 그림은 일하는 세션이 있을 때 깜박임에 쓴다(src/main/tray/system-tray.ts).
// 다시 만들기: node config/scripts/prompt-render-menu-bar-icon.mjs
// Playwright 브라우저를 받아 두지 않았으면 PROMPT_ICON_CHROME 에 Chrome 실행 파일 경로를 넣는다.
import { join } from 'node:path'
import { chromium } from 'playwright'

const outDir = join(import.meta.dirname, '../../resources/tray')

const FRAME = '<rect x="2.5" y="4.5" width="19" height="15" rx="3" stroke-width="2"/>'
const CHEVRON = '<polyline points="6.5,8.5 10,12 6.5,15.5" stroke-width="1.8"/>'
const CURSOR = '<line x1="12" y1="15.5" x2="17.5" y2="15.5" stroke-width="1.8"/>'

function toSvg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-linecap="round" stroke-linejoin="round" style="display:block">${body}</svg>`
}

// 켜짐 그림 파일 이름은 Orca 때 이름을 그대로 둔다. 원본 합치기 때 import 줄이 덜 부딪힌다.
const jobs = [
  ['orca-menu-barTemplate', toSvg(FRAME + CHEVRON + CURSOR)],
  ['prompt-menu-bar-offTemplate', toSvg(FRAME + CHEVRON)]
]

const browser = await chromium.launch(
  process.env.PROMPT_ICON_CHROME ? { executablePath: process.env.PROMPT_ICON_CHROME } : {}
)
try {
  for (const scale of [1, 2]) {
    const page = await browser.newPage({
      viewport: { width: 18, height: 18 },
      deviceScaleFactor: scale
    })
    for (const [name, svg] of jobs) {
      await page.setContent(
        `<html><body style="margin:0;background:transparent">${svg}</body></html>`
      )
      const suffix = scale === 2 ? '@2x' : ''
      await page.screenshot({ path: join(outDir, `${name}${suffix}.png`), omitBackground: true })
    }
    await page.close()
  }
} finally {
  await browser.close()
}
console.log(`wrote menu bar icons to ${outDir}`)
