import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const nodeFile = `prompt-native.${process.platform}-${process.arch}.node`
const builtModule = join(process.cwd(), 'native', 'prompt-native', nodeFile)

let appRoot: string

async function loadWithAppRoot(root: string) {
  vi.resetModules()
  const { setAppEnvironment } = await import('../shared/app-environment')
  setAppEnvironment({
    getPath: () => root,
    getAppPath: () => root,
    getVersion: () => '0.0.0-test',
    isPackaged: () => false,
    onWillQuit: () => {},
    exit: () => {},
    getAppMetrics: () => []
  })
  return await import('./prompt-native')
}

describe('loadPromptNative', () => {
  beforeEach(() => {
    appRoot = mkdtempSync(join(tmpdir(), 'prompt-native-test-'))
  })

  afterEach(() => {
    rmSync(appRoot, { recursive: true, force: true })
  })

  it('reads the dev build from native/prompt-native', async () => {
    const { promptNativePath } = await loadWithAppRoot(appRoot)

    expect(promptNativePath()).toBe(join(appRoot, 'native', 'prompt-native', nodeFile))
  })

  it('returns null when the module was never built', async () => {
    const { loadPromptNative } = await loadWithAppRoot(appRoot)

    expect(loadPromptNative()).toBeNull()
  })

  it('returns null when the file will not load', async () => {
    mkdirSync(join(appRoot, 'native', 'prompt-native'), { recursive: true })
    writeFileSync(join(appRoot, 'native', 'prompt-native', nodeFile), 'not a Mach-O file')
    const { loadPromptNative } = await loadWithAppRoot(appRoot)

    expect(loadPromptNative()).toBeNull()
  })

  // Runs where `pnpm build:prompt-native` has left a module for this machine.
  it.skipIf(process.platform !== 'darwin' || !existsSync(builtModule))(
    'reads this process footprint through the built module',
    async () => {
      const { loadPromptNative } = await loadWithAppRoot(process.cwd())

      const footprints = (await loadPromptNative()?.processFootprints()) ?? []

      const own = footprints.find(({ pid }) => pid === process.pid)
      expect(own?.bytes).toBeGreaterThan(0)
    }
  )
})
