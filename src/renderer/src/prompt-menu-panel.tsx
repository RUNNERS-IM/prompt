import { StrictMode } from 'react'
import { PromptMenuPanel } from './components/prompt-menu-panel/PromptMenuPanel'
import './components/prompt-menu-panel/prompt-menu-panel.css'
import { getOrCreateRendererRoot } from './lib/react-renderer-root'

// 맥 메뉴 막대 패널(src/renderer/prompt-menu-panel.html)의 React 뿌리. 글은 main 이 번역해 보내므로 i18n 을 싣지 않는다.

const api = window.api.promptMenuPanel
const rootElement = document.getElementById('root')
if (rootElement && api) {
  getOrCreateRendererRoot(rootElement, import.meta.hot?.data).render(
    <StrictMode>
      <PromptMenuPanel api={api} />
    </StrictMode>
  )
}
