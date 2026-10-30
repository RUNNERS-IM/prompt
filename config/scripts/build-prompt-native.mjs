#!/usr/bin/env node
// Builds Prompt's native module (native/prompt-native, napi-rs) into
// native/prompt-native/prompt-native.darwin-<arch>.node, one file per Mac CPU.
// Why both CPUs: the mac release packages arm64 and x64 in one run on an Apple silicon runner,
// and electron-builder copies the file matching each slice (extraResources ${arch}).
// Why macOS only for now: its only part (process footprint) has nothing to do elsewhere. The crate compiles on
// every OS, so Windows/Linux builds join here once a part for them moves in.
import { execFileSync } from 'node:child_process'
import { copyFileSync } from 'node:fs'
import path from 'node:path'

const repoRoot = path.resolve(import.meta.dirname, '../..')
const crateRoot = path.join(repoRoot, 'native', 'prompt-native')
const TRIPLES = { arm64: 'aarch64-apple-darwin', x64: 'x86_64-apple-darwin' }

if (process.platform !== 'darwin') {
  console.log(`[prompt-native] nothing to build on ${process.platform}`)
  process.exit(0)
}

const argv = process.argv.slice(2)
// Dev and local checks only need the host CPU.
const arches = argv.includes('--single-arch') ? [process.arch] : ['arm64', 'x64']
const targetDir = path.join(crateRoot, 'target')

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
      // Same floor as the Swift helpers this module replaces.
      env: { ...process.env, CARGO_TARGET_DIR: targetDir, MACOSX_DEPLOYMENT_TARGET: '11.0' }
    }
  )
  const built = path.join(targetDir, triple, 'release', 'libprompt_native.dylib')
  const output = path.join(crateRoot, `prompt-native.darwin-${arch}.node`)
  copyFileSync(built, output)
  // A wrong-CPU file would only fail when the packaged app loads it.
  execFileSync('/usr/bin/lipo', [output, '-verify_arch', arch === 'x64' ? 'x86_64' : 'arm64'])
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
