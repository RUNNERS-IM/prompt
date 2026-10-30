import { execFileSync } from 'node:child_process'
import { beforeAll, describe, expect, it } from 'vitest'
import { setAppEnvironment } from '../shared/app-environment'
import {
  loadWindowsNativeRegistry,
  WINDOWS_REG_EXPAND_SZ,
  WINDOWS_REG_SZ
} from './windows-native-registry'

// Compare prompt-native's registry reader with reg.exe as an independent one. Needs `pnpm build:prompt-native`.
const describeWindows = process.platform === 'win32' ? describe : describe.skip

function regQuery(key: string, name: string): { type: string; data: string } | null {
  let stdout: string
  try {
    stdout = execFileSync('reg.exe', ['query', key, '/v', name], { encoding: 'utf8' })
  } catch {
    return null
  }
  // Registry value names are case-insensitive; reg.exe preserves their stored casing.
  const wanted = name.toLowerCase()
  const line = stdout
    .split(/\r?\n/)
    .find((candidate) => candidate.trim().toLowerCase().startsWith(wanted))
  if (!line) {
    return null
  }
  const match = line.trim().match(/^(\S+)\s+(REG_\w+)\s+([\s\S]*)$/)
  return match ? { type: match[2], data: match[3] } : null
}

describeWindows('prompt-native windows registry reader', () => {
  beforeAll(() => {
    // The dev path: native/prompt-native/prompt-native.win32-<arch>.node under the checkout.
    setAppEnvironment({
      getPath: () => process.cwd(),
      getAppPath: () => process.cwd(),
      getVersion: () => '0.0.0-test',
      isPackaged: () => false,
      onWillQuit: () => {},
      exit: () => {},
      getAppMetrics: () => []
    })
  })

  it('decodes the user PATH exactly as reg.exe reports it', () => {
    const registry = loadWindowsNativeRegistry()
    const values = registry.getRegistryKey(registry.HK.CU, 'Environment')
    expect(values).toBeTruthy()

    const oracle = regQuery('HKCU\\Environment', 'Path')
    if (!oracle) {
      expect(Object.keys(values ?? {}).some((name) => name.toLowerCase() === 'path')).toBe(false)
      return
    }

    const entry = Object.entries(values ?? {}).find(([name]) => name.toLowerCase() === 'path')?.[1]
    expect(entry).toBeTruthy()
    expect(entry?.value).toBe(oracle.data)
    expect(entry?.type).toBe(
      oracle.type === 'REG_EXPAND_SZ' ? WINDOWS_REG_EXPAND_SZ : WINDOWS_REG_SZ
    )
  })

  it('reads the machine environment key through HKLM', () => {
    const registry = loadWindowsNativeRegistry()
    const values = registry.getRegistryKey(
      registry.HK.LM,
      'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
    )
    const entry = Object.entries(values ?? {}).find(([name]) => name.toLowerCase() === 'path')?.[1]
    expect(typeof entry?.value).toBe('string')
    expect(String(entry?.value).length).toBeGreaterThan(0)
  })

  it('returns null for a key that does not exist instead of throwing', () => {
    const registry = loadWindowsNativeRegistry()
    expect(registry.getRegistryKey(registry.HK.CU, 'Software\\PromptNoSuchKey\\Absent')).toBeNull()
  })

  it('reports every value in the key keyed by its own name', () => {
    const registry = loadWindowsNativeRegistry()
    const values = registry.getRegistryKey(registry.HK.CU, 'Environment') ?? {}
    for (const [name, entry] of Object.entries(values)) {
      expect(entry?.name).toBe(name)
      expect(typeof entry?.type).toBe('number')
    }
  })
})
