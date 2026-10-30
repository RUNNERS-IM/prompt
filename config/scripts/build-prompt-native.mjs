#!/usr/bin/env node
// Builds Prompt's native module (native/prompt-native, napi-rs) into
// native/prompt-native/prompt-native.<platform>-<arch>.node; electron-builder copies the file matching each slice
// (extraResources ${arch}) to Resources/prompt-native.node.
// macOS builds both CPUs: the mac release packages arm64 and x64 in one run on an Apple silicon runner.
// Windows builds the host CPU (the release packages only that); `--arch arm64` cross-compiles the other one.
// Linux has no part in the module yet, so nothing is built there.
import { execFileSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const { PE_MACHINE, readPeMachine } = createRequire(import.meta.url)('./windows-pe-machine.cjs')
const repoRoot = path.resolve(import.meta.dirname, '../..')
const crateRoot = path.join(repoRoot, 'native', 'prompt-native')
const PLATFORMS = {
  darwin: {
    triples: { arm64: 'aarch64-apple-darwin', x64: 'x86_64-apple-darwin' },
    built: 'libprompt_native.dylib'
  },
  win32: {
    triples: { arm64: 'aarch64-pc-windows-msvc', x64: 'x86_64-pc-windows-msvc' },
    built: 'prompt_native.dll'
  }
}

const platform = PLATFORMS[process.platform]
if (!platform) {
  console.log(`[prompt-native] nothing to build on ${process.platform}`)
  process.exit(0)
}

const argv = process.argv.slice(2)
const archIndex = argv.indexOf('--arch')
const arches =
  archIndex !== -1
    ? [argv[archIndex + 1]]
    : // Dev and local checks only need the host CPU.
      process.platform === 'win32' || argv.includes('--single-arch')
      ? [process.arch]
      : ['arm64', 'x64']
for (const arch of arches) {
  if (!platform.triples[arch]) {
    throw new Error(`[prompt-native] unsupported ${process.platform} architecture: ${arch}`)
  }
}
const targetDir = path.join(crateRoot, 'target')
const TRIPLES = platform.triples

ensureRustTargets(arches.map((arch) => TRIPLES[arch]))
for (const arch of arches) {
  const triple = TRIPLES[arch]
  execFileSync(
    'cargo',
    [
      'build',
      '--release',
      '--locked',
      '--manifest-path',
      path.join(crateRoot, 'Cargo.toml'),
      '--target',
      triple
    ],
    {
      stdio: 'inherit',
      // Same floor as the Swift helpers this module replaces (ignored off macOS).
      env: { ...process.env, CARGO_TARGET_DIR: targetDir, MACOSX_DEPLOYMENT_TARGET: '11.0' }
    }
  )
  const built = path.join(targetDir, triple, 'release', platform.built)
  const output = path.join(crateRoot, `prompt-native.${process.platform}-${arch}.node`)
  copyFileSync(built, output)
  // A wrong-CPU file would only fail when the packaged app loads it.
  if (process.platform === 'darwin') {
    execFileSync('/usr/bin/lipo', [output, '-verify_arch', arch === 'x64' ? 'x86_64' : 'arm64'])
  } else if (readPeMachine(output) !== PE_MACHINE[arch]) {
    throw new Error(`[prompt-native] ${output} is not a ${arch} Windows module`)
  }
  console.log(`[prompt-native] built ${path.relative(repoRoot, output)}`)
}

function ensureRustTargets(triples) {
  let installed
  try {
    installed = execFileSync('rustup', ['target', 'list', '--installed'], { encoding: 'utf8' })
  } catch {
    // Without rustup (a plain cargo install) cargo itself reports a missing target.
    return
  }
  const missing = triples.filter((triple) => !installed.split('\n').includes(triple))
  if (missing.length === 0) {
    return
  }
  // CI images ship only the host target; a developer's toolchain is left for them to change.
  if (!process.env.CI) {
    throw new Error(`[prompt-native] missing Rust targets: rustup target add ${missing.join(' ')}`)
  }
  execFileSync('rustup', ['target', 'add', ...missing], { stdio: 'inherit' })
}
