import { loadPromptNative } from './prompt-native'

export type WindowsNativeRegistryValue = {
  name?: unknown
  type?: unknown
  value?: unknown
}

export type WindowsNativeRegistryModule = {
  HK: { CU: number; LM: number }
  getRegistryKey: (
    root: number,
    path: string
  ) => Record<string, WindowsNativeRegistryValue | undefined> | null | undefined
}

export const WINDOWS_REG_SZ = 1
export const WINDOWS_REG_EXPAND_SZ = 2

// Predefined HKEY handles; the native side maps each to its windows-sys constant.
const HK = {
  CR: 0x80000000,
  CU: 0x80000001,
  LM: 0x80000002,
  U: 0x80000003,
  PD: 0x80000004,
  CC: 0x80000005,
  DD: 0x80000006
}

export function loadWindowsNativeRegistry(): WindowsNativeRegistryModule {
  const native = loadPromptNative()
  if (!native?.windowsRegistryKey) {
    // Callers already treat a throw as "registry unavailable" and fall back.
    throw new Error('prompt-native windows registry reader is unavailable')
  }
  const readKey = native.windowsRegistryKey
  return {
    HK,
    getRegistryKey(root, path) {
      const values = readKey(root, path)
      if (!values) {
        return null
      }
      // Null-prototype: a value literally named __proto__ must become an entry, not the prototype.
      const byName: Record<string, WindowsNativeRegistryValue> = Object.create(null)
      for (const value of values) {
        byName[value.name] = value
      }
      return byName
    }
  }
}
