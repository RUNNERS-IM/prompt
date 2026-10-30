import { copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { runProcessSync } from '@orca/process-host'
import { ORCAD_PROMPT_NATIVE_FILENAME } from '../../src/shared/orcad-artifacts.ts'

const { PE_MACHINE, describePeMachine, readPeMachine } = createRequire(import.meta.url)(
  './windows-pe-machine.cjs'
)

/** Where build-prompt-native.mjs leaves the Windows module; the desktop package ships the same file. */
export function promptNativeWindowsModule(root, arch) {
  return join(root, 'native', 'prompt-native', `prompt-native.win32-${arch}.node`)
}

// Prompt's native module carries the Windows ACL calls; without it orcad's data-root privacy check fails closed
// before Windows startup, so every Windows slot ships one.
export function stageOrcadPromptNative(
  root,
  outputDir,
  target,
  host = { platform: process.platform },
  compile = compileOrcadPromptNative
) {
  if (!target.startsWith('win32-')) {
    return
  }
  const arch = target.slice('win32-'.length)
  const source = promptNativeWindowsModule(root, arch)
  if (!existsSync(source)) {
    if (host.platform !== 'win32') {
      throw new Error(
        `Orcad ${target} requires Prompt's native module. On Windows, run: ` +
          `node config/scripts/build-prompt-native.mjs --arch ${arch}`
      )
    }
    compile(root, arch)
  }
  const machine = readPeMachine(source)
  if (machine !== PE_MACHINE[arch]) {
    throw new Error(`Orcad ${target} Prompt native module has ${describePeMachine(machine)}`)
  }
  copyFileSync(source, join(outputDir, ORCAD_PROMPT_NATIVE_FILENAME))
}

export function compileOrcadPromptNative(root, arch, run = runProcessSync) {
  const result = run({
    program: process.execPath,
    args: [join(root, 'config/scripts/build-prompt-native.mjs'), '--arch', arch],
    cwd: root,
    stdio: 'inherit',
    timeoutMs: null
  })
  if (result.code !== 0) {
    throw new Error(`Prompt native module build for ${arch} failed with exit ${result.code}`)
  }
}
