import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'
import { parse } from 'yaml'
import {
  compileOrcadPromptNative,
  promptNativeWindowsModule,
  stageOrcadPromptNative
} from './orcad-prompt-native.mjs'

const roots = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

function peBytes(machine) {
  const bytes = Buffer.alloc(0x90)
  bytes.write('MZ')
  bytes.writeUInt32LE(0x80, 0x3c)
  bytes.write('PE\0\0', 0x80)
  bytes.writeUInt16LE(machine, 0x84)
  return bytes
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'orcad-prompt-native-'))
  roots.push(root)
  const output = join(root, 'output')
  mkdirSync(output)
  const write = (arch, machine) => {
    const source = promptNativeWindowsModule(root, arch)
    mkdirSync(dirname(source), { recursive: true })
    writeFileSync(source, peBytes(machine))
    return source
  }
  return { root, output, write }
}

it('stages the module for each Windows architecture after checking its machine', () => {
  const { root, output, write } = fixture()
  const x64 = write('x64', 0x8664)
  stageOrcadPromptNative(root, output, 'win32-x64')
  expect(readFileSync(join(output, 'prompt-native.node'))).toEqual(readFileSync(x64))

  const arm64 = write('arm64', 0xaa64)
  stageOrcadPromptNative(root, output, 'win32-arm64')
  expect(readFileSync(join(output, 'prompt-native.node'))).toEqual(readFileSync(arm64))
})

it('reads the file build-prompt-native.mjs writes, which the desktop package ships too', () => {
  expect(promptNativeWindowsModule('/repo', 'arm64')).toBe(
    join('/repo', 'native', 'prompt-native', 'prompt-native.win32-arm64.node')
  )
})

it('rejects a binary built for the wrong architecture', () => {
  const { root, output, write } = fixture()
  write('arm64', 0x8664)
  expect(() => stageOrcadPromptNative(root, output, 'win32-arm64')).toThrow('machine 0x8664')
  expect(existsSync(join(output, 'prompt-native.node'))).toBe(false)
})

it('fails the build off Windows when the module was never built, and compiles it on Windows', () => {
  const { root, output, write } = fixture()
  expect(() => stageOrcadPromptNative(root, output, 'win32-x64', { platform: 'linux' })).toThrow(
    'build-prompt-native.mjs --arch x64'
  )

  const compile = vi.fn((_root, arch) => write(arch, 0x8664))
  stageOrcadPromptNative(root, output, 'win32-x64', { platform: 'win32' }, compile)
  expect(compile).toHaveBeenCalledWith(root, 'x64')
  expect(existsSync(join(output, 'prompt-native.node'))).toBe(true)
  compile.mockClear()
  stageOrcadPromptNative(root, output, 'win32-x64', { platform: 'win32' }, compile)
  expect(compile).not.toHaveBeenCalled()
})

it('stages nothing for non-Windows slots', () => {
  const { root, output } = fixture()
  stageOrcadPromptNative(root, output, 'linux-x64-glibc', { platform: 'linux' })
  stageOrcadPromptNative(root, output, 'darwin-arm64', { platform: 'darwin' })
  expect(existsSync(join(output, 'prompt-native.node'))).toBe(false)
})

it('compiles through build-prompt-native.mjs and reports a failed child', () => {
  const run = vi.fn(() => ({ code: 0 }))
  compileOrcadPromptNative('/repo', 'arm64', run)
  expect(run).toHaveBeenCalledWith({
    program: process.execPath,
    args: [join('/repo', 'config/scripts/build-prompt-native.mjs'), '--arch', 'arm64'],
    cwd: '/repo',
    stdio: 'inherit',
    timeoutMs: null
  })
  expect(() => compileOrcadPromptNative('/repo', 'x64', () => ({ code: 1 }))).toThrow(
    'failed with exit 1'
  )
})

it.each([
  ['older', false],
  ['current', true]
])(
  'builds and collects the modules only when the %s source has the Rust part',
  (_source, ships) => {
    const workflow = parse(readFileSync('.github/workflows/node-server-tests.yml', 'utf8'))
    const steps = [
      ...workflow.jobs.persistence.steps.filter((step) =>
        ['Build', 'Keep'].some((verb) => step.name?.startsWith(`${verb} the Prompt native modules`))
      ),
      workflow.jobs.desktop_template.steps.find(
        (step) => step.name === 'Collect the Prompt native modules'
      )
    ]
    expect(steps).toHaveLength(3)
    for (const step of steps) {
      const hashFiles = vi.fn((path) => {
        expect(path).toBe('native/prompt-native/src/windows_security.rs')
        return ships ? 'source-hash' : ''
      })
      expect(
        runInNewContext(step.if ?? 'true', {
          inputs: { build_template: true },
          matrix: { os: 'windows-2022' },
          hashFiles
        }),
        step.name
      ).toBe(ships)
      expect(hashFiles).toHaveBeenCalledOnce()
      expect(step['continue-on-error']).toBeUndefined()
    }
    const keep = steps[1]
    const collect = steps[2]
    expect(keep.with.name).toBe(collect.with.name)
    // The upload root is native/prompt-native, so downloading there puts each file back where staging reads it.
    expect(keep.with.path).toBe('native/prompt-native/prompt-native.win32-*.node')
    expect(collect.with.path).toBe('native/prompt-native')
  }
)
