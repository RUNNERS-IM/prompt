import './components/prompt-runners-apps/prompt-about.css'
import { StrictMode, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { PromptAboutPage } from './components/prompt-runners-apps/PromptAboutPage'
import { PromptNoticesPage } from './components/prompt-runners-apps/PromptNoticesPage'
import { I18nProvider } from './i18n/I18nProvider'
import { applyDocumentTheme } from './lib/document-theme'
import { getOrCreateRendererRoot } from './lib/react-renderer-root'
import { useAppStore } from './store'
import type { GlobalSettings } from '../../shared/global-settings-types'

// Prompt's About window and, with ?view=notices, its "Open source notices" window: one small React
// root (src/renderer/prompt-about.html). It only reads settings for theme and UI language.

const view = new URLSearchParams(window.location.search).get('view')

let startupSettings: GlobalSettings | null = null
try {
  startupSettings = window.api.settings.getSync()
} catch {
  // The async read below still applies theme and language.
}
if (startupSettings) {
  useAppStore.setState({ settings: startupSettings })
}
applyDocumentTheme(startupSettings?.theme ?? 'system', { disableTransitions: false })

function AboutSettingsSync(): null {
  const theme = useAppStore((state) => state.settings?.theme ?? 'system')

  useEffect(() => {
    const offChanged = window.api.settings.onChanged((updates) => {
      const current = useAppStore.getState().settings
      if (current) {
        useAppStore.setState({ settings: { ...current, ...updates } })
      }
    })
    void window.api.settings
      .get()
      .then((settings) => useAppStore.setState({ settings }))
      .catch(() => undefined)
    return offChanged
  }, [])

  useEffect(() => {
    applyDocumentTheme(theme, { disableTransitions: false })
    if (theme !== 'system') {
      return
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (): void => applyDocumentTheme('system')
    media.addEventListener('change', handleChange)
    return () => media.removeEventListener('change', handleChange)
  }, [theme])

  return null
}

function AboutRoot(): React.JSX.Element {
  // Re-render when the catalog finishes loading so the credit line switches language.
  useTranslation()
  return view === 'notices' ? <PromptNoticesPage /> : <PromptAboutPage />
}

const rootElement = document.getElementById('root')
if (rootElement) {
  getOrCreateRendererRoot(rootElement, import.meta.hot?.data).render(
    <StrictMode>
      <I18nProvider>
        <AboutSettingsSync />
        <AboutRoot />
      </I18nProvider>
    </StrictMode>
  )
}
