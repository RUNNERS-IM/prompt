import { describe, expect, it } from 'vitest'
import { resolveMacOSHostAppPath } from './macos-native-provider-paths'

describe('resolveMacOSHostAppPath', () => {
  it('returns the app bundle the main process runs from', () => {
    expect(resolveMacOSHostAppPath('/Applications/Prompt.app/Contents/MacOS/Prompt')).toBe(
      '/Applications/Prompt.app'
    )
  })

  it('returns the outermost bundle for nested Helper processes', () => {
    expect(
      resolveMacOSHostAppPath(
        '/Applications/Prompt.app/Contents/Frameworks/Prompt Helper.app/Contents/MacOS/Prompt Helper'
      )
    ).toBe('/Applications/Prompt.app')
  })

  it('returns null outside an app bundle', () => {
    expect(resolveMacOSHostAppPath('/usr/local/bin/node')).toBeNull()
  })
})
