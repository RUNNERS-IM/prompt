import { loadPromptNative } from '../prompt-native'
import { recordUpdaterLifecycle } from '../updater-lifecycle-diagnostics'

let configured = false

/** Keep Squirrel's native install and verification; change only its launchd resource class. */
export function configureMacShipItScheduling(): void {
  if (process.platform !== 'darwin' || configured) {
    return
  }
  let reason = 'load_failed'
  try {
    // The hook lives in Prompt's Rust module (native/prompt-native/src/shipit_scheduling.rs).
    const native = loadPromptNative()
    if (!native) {
      throw new Error('Prompt native module is unavailable')
    }
    reason = 'missing_export'
    if (typeof native.configureShipItScheduling !== 'function') {
      throw new Error('Squirrel installer scheduling is unavailable')
    }
    reason = 'configure_failed'
    const result = native.configureShipItScheduling()
    reason = 'contract_mismatch'
    if (result !== true) {
      throw new Error('Squirrel installer scheduling is unavailable')
    }
    configured = true
    recordUpdaterLifecycle('macos_installer_scheduling_configured', { processType: 'Interactive' })
  } catch (error) {
    // An Electron API change must leave the native updater usable.
    recordUpdaterLifecycle(
      'macos_installer_scheduling_unavailable',
      { reason, errorType: error instanceof Error ? error.name : typeof error },
      { level: 'warn', message: 'Could not configure macOS installer scheduling' }
    )
  }
}
