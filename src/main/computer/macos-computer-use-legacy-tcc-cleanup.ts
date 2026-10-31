import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { resetMacosTccPermission, type MacosTccResetResult } from '../macos-tcc-reset'

// The helper's own identity from before it ran as Prompt's responsible child. Only this id is
// ever reset here; Prompt's grants are left alone.
export const LEGACY_COMPUTER_USE_BUNDLE_ID = 'com.stablyai.orca.computer-use'
const LEGACY_TCC_SERVICES = ['Accessibility', 'ScreenCapture'] as const
const LEGACY_TCC_CLEANUP_MARKER = 'computer-use-legacy-tcc-reset-v1'
const LEGACY_TCC_CLEANUP_DELAY_MS = 30_000

export type LegacyComputerUseTccCleanupResult = 'skipped' | 'cleaned' | 'failed'

let cleanupScheduled = false

export async function cleanupLegacyComputerUseTccOnce(
  userDataPath: string,
  reset: (
    service: string,
    bundleId: string
  ) => Promise<MacosTccResetResult> = resetMacosTccPermission
): Promise<LegacyComputerUseTccCleanupResult> {
  const markerPath = join(userDataPath, LEGACY_TCC_CLEANUP_MARKER)
  if (existsSync(markerPath)) {
    return 'skipped'
  }
  const failures: string[] = []
  for (const service of LEGACY_TCC_SERVICES) {
    const result = await reset(service, LEGACY_COMPUTER_USE_BUNDLE_ID)
    if (!result.ok) {
      failures.push(`${service}: ${result.detail}`)
    }
  }
  // One attempt only: tccutil refuses ids LaunchServices no longer knows, so retrying every
  // launch would fail the same way. The leftover row then only needs removing by hand.
  await writeFile(markerPath, `${new Date().toISOString()}\n`, 'utf8')
  if (failures.length > 0) {
    console.warn('[computer-use] legacy helper TCC reset failed:', failures.join('; '))
    return 'failed'
  }
  return 'cleaned'
}

// Deferred past startup so two tccutil runs never compete with first paint.
export function scheduleLegacyComputerUseTccCleanup(userDataPath: string): void {
  if (process.platform !== 'darwin' || cleanupScheduled) {
    return
  }
  cleanupScheduled = true
  setTimeout(() => {
    cleanupLegacyComputerUseTccOnce(userDataPath).catch((error) => {
      console.warn('[computer-use] legacy helper TCC cleanup failed:', error)
    })
  }, LEGACY_TCC_CLEANUP_DELAY_MS).unref()
}
