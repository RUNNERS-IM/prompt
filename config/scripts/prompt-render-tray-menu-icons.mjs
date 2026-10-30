// 메뉴바(트레이) 메뉴 줄마다 붙는 아이콘 PNG 를 만든다.
// 규칙: ~/git/runners/_docs/작업 가이드/공통.md 「메뉴바 메뉴와 아이콘」. Lucide, 선 굵기 1.5, 16pt(@1x 16px · @2x 32px).
// 맥 template 이미지(검은 선 + 투명 바탕)로 만들어 다크 · 라이트에 맞춰 맥이 색을 바꾸게 한다.
// 상태 줄 점(●)만 색이 있어야 해서 template 이 아닌 초록 점으로 만든다.
// 아이콘 모양은 node_modules 의 lucide-react 에서 읽고, 그림은 Playwright 의 Chromium 으로 그린다.
// 다시 만들기: node config/scripts/prompt-render-tray-menu-icons.mjs
// Playwright 브라우저를 받아 두지 않았으면 PROMPT_ICON_CHROME 에 Chrome 실행 파일 경로를 넣는다.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium } from 'playwright'

const root = join(import.meta.dirname, '../..')
const outDir = join(root, 'resources/tray/menu')
const iconDir = join(root, 'node_modules/lucide-react/dist/esm/icons')

// 파일 이름 -> Lucide 이름. circle-help 는 lucide-react 안에서 circle-question-mark 의 다른 이름이다.
const ICONS = {
  'app-window': 'app-window',
  info: 'info',
  'refresh-cw': 'refresh-cw',
  settings: 'settings',
  'circle-help': 'circle-question-mark',
  'square-x': 'square-x',
  'circle-x': 'circle-x'
}

function toSvg(iconNode) {
  const children = iconNode
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ')
      return `<${tag} ${a}/>`
    })
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`
}

// 초록 점. 맥 시스템 초록(#34C759)에 가깝게, 지름 8pt.
const STATUS_DOT_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4" fill="#34C759"/></svg>'

mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch(
  process.env.PROMPT_ICON_CHROME ? { executablePath: process.env.PROMPT_ICON_CHROME } : {}
)
try {
  const jobs = []
  for (const [file, lucideName] of Object.entries(ICONS)) {
    const mod = await import(join(iconDir, `${lucideName}.js`))
    jobs.push([`${file}Template`, toSvg(mod.__iconNode)])
  }
  jobs.push(['status-dot-green', STATUS_DOT_SVG])

  for (const scale of [1, 2]) {
    const page = await browser.newPage({
      viewport: { width: 16, height: 16 },
      deviceScaleFactor: scale
    })
    for (const [name, svg] of jobs) {
      await page.setContent(
        `<html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg style="display:block" ')}</body></html>`
      )
      const suffix = scale === 2 ? '@2x' : ''
      await page.screenshot({ path: join(outDir, `${name}${suffix}.png`), omitBackground: true })
    }
    await page.close()
  }
} finally {
  await browser.close()
}
console.log(`wrote icons to ${outDir}`)
