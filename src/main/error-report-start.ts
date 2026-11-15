// Starts error reporting before the other main modules load, so errors thrown while index.ts imports are caught and
// @sentry/electron registers its renderer protocol before app ready. Index.ts imports this first.
// With no DSN (development runs, builds before the secret is set) nothing starts and nothing is sent.
import * as Sentry from '@sentry/electron/main'
import { app } from 'electron'
import { hostname, userInfo } from 'node:os'
import { startErrorReport } from '../renderer/src/components/runners-account/error-report'

startErrorReport(Sentry, {
  dsn: import.meta.env.MAIN_VITE_SENTRY_DSN,
  release: `prompt@${app.getVersion()}`,
  environment: app.isPackaged ? 'production' : 'development',
  hide: [hostname(), userInfo().username]
})
