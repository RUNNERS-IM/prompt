import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '../..')
// Built by `pnpm build:prompt-native`; the Rust unit tests cover the fallbacks, this covers the real framework.
const promptNative = join(
  root,
  'native',
  'prompt-native',
  `prompt-native.darwin-${process.arch}.node`
)

describe.skipIf(process.platform !== 'darwin')('native ShipIt scheduling', () => {
  it('changes only ProcessType in the real Electron job, retaining native install and retry settings', () => {
    if (!existsSync(promptNative)) {
      throw new Error(`${promptNative} is missing; run pnpm build:prompt-native first`)
    }
    // .noindex keeps Spotlight and Launchpad from listing the throwaway Probe.app.
    const base = mkdtempSync(join(tmpdir(), 'prompt-shipit-contract-'))
    const work = join(base, 'probe.noindex')
    const bundleId = `im.runners.prompt.shipit-contract.${base.split('-').at(-1).toLowerCase()}`
    try {
      // Loading outside Electron must fail safely when Squirrel is absent.
      const holder = { exports: {} }
      process.dlopen(holder, promptNative)
      expect(holder.exports.configureShipItScheduling()).toBe(false)

      const contents = join(work, 'Probe.app', 'Contents')
      const executable = join(contents, 'MacOS', 'probe')
      mkdirSync(dirname(executable), { recursive: true })
      writeFileSync(
        join(contents, 'Info.plist'),
        `<?xml version="1.0"?><plist version="1.0"><dict>
        <key>CFBundleIdentifier</key><string>${bundleId}</string>
        <key>CFBundleExecutable</key><string>probe</string></dict></plist>`
      )
      execFileSync('/usr/bin/clang', [
        '-fobjc-arc',
        '-framework',
        'Foundation',
        join(root, 'native/prompt-native/probes/shipit-job-dictionary.m'),
        '-o',
        executable
      ])
      // Only the path of the pinned Electron is used, to find its Frameworks; Electron itself is not started.
      const electron = require('electron')
      const frameworks = resolve(dirname(electron), '../Frameworks')
      const job = JSON.parse(
        execFileSync(executable, [frameworks, promptNative], {
          encoding: 'utf8',
          timeout: 20_000,
          env: { ...process.env, ORCA_BACKGROUND_LAUNCH: '1' }
        })
      )
      expect(job.ProcessType).toBe('Interactive')
      expect(job.Label).toBe(`${bundleId}.ShipIt`)
      expect(job.ProgramArguments).toEqual([
        join(frameworks, 'Squirrel.framework/Resources/ShipIt'),
        job.Label,
        join(homedir(), 'Library/Caches', job.Label, 'ShipItState.plist')
      ])
      expect(job.KeepAlive).toEqual({ SuccessfulExit: false })
      expect(job.MachServices).toEqual({ [job.Label]: true })
    } finally {
      rmSync(base, { recursive: true, force: true })
      rmSync(join(homedir(), 'Library/Caches', `${bundleId}.ShipIt`), {
        recursive: true,
        force: true
      })
    }
  }, 90_000)
})
