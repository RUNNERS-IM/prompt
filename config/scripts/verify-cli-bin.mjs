#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { chmodSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { resolveBuildSourceCommit } from './build-source-commit.mjs'

// Packager restamps channel version after compilation; compiled CLI’s commit pins official skill installs.
function buildOutPackageJson(version, commit) {
  return `${JSON.stringify(
    { name: 'orca-compiled-output', type: 'commonjs', private: true, version, commit },
    null,
    2
  )}\n`
}

function verifyBinEntry(projectDir, name, binTarget) {
  if (typeof binTarget !== 'string' || binTarget.length === 0) {
    throw new Error(`package.json must declare bin.${name}`)
  }
  const binPath = path.resolve(projectDir, binTarget)
  const stats = statSync(binPath)
  if (!stats.isFile()) {
    throw new Error(`bin.${name} target is not a file: ${binTarget}`)
  }
  if (stats.size === 0) {
    throw new Error(`bin.${name} target is empty: ${binTarget}`)
  }
  const content = readFileSync(binPath, 'utf8')
  if (!content.startsWith('#!/usr/bin/env node\n')) {
    throw new Error(`bin.${name} target must start with a Node shebang: ${binTarget}`)
  }
  return { name, binPath, binTarget, stats }
}

export function verifyPackageCliBin({
  projectDir = path.resolve(import.meta.dirname, '..', '..'),
  fixExecutable = false,
  fixPackageJson = false,
  sourceCommit,
  runHelp = false
} = {}) {
  const packageJsonPath = path.join(projectDir, 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  if (typeof packageJson.bin?.orca !== 'string' || packageJson.bin.orca.length === 0) {
    throw new Error('package.json must declare bin.orca')
  }
  // `prompt` is the renamed entrypoint; `orca` stays as the legacy alias until it is removed.
  const bins = ['orca', 'prompt']
    .filter((name) => packageJson.bin?.[name] !== undefined)
    .map((name) => verifyBinEntry(projectDir, name, packageJson.bin[name]))
  const { binPath } = bins[0]

  const outPackageJsonPath = path.join(projectDir, 'out', 'package.json')
  if (fixPackageJson) {
    mkdirSync(path.dirname(outPackageJsonPath), { recursive: true })
    writeFileSync(
      outPackageJsonPath,
      buildOutPackageJson(packageJson.version, sourceCommit),
      'utf8'
    )
  }
  let outPackageJson
  try {
    outPackageJson = JSON.parse(readFileSync(outPackageJsonPath, 'utf8'))
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      throw new Error(
        `compiled CLI package boundary is missing: ${path.relative(projectDir, outPackageJsonPath)}`
      )
    }
    throw error
  }
  if (outPackageJson.type !== 'commonjs') {
    throw new Error(
      `compiled CLI package boundary must declare type=commonjs: ${path.relative(
        projectDir,
        outPackageJsonPath
      )}`
    )
  }

  for (const bin of bins) {
    if (process.platform !== 'win32' && (bin.stats.mode & 0o111) === 0) {
      if (!fixExecutable) {
        throw new Error(`bin.${bin.name} target is not executable: ${bin.binTarget}`)
      }
      chmodSync(bin.binPath, bin.stats.mode | 0o755)
    }
  }

  if (runHelp) {
    execFileSync(process.execPath, [binPath, '--help'], {
      cwd: projectDir,
      stdio: 'ignore'
    })
  }

  return { binPath, outPackageJsonPath, size: statSync(binPath).size }
}

function main() {
  const args = new Set(process.argv.slice(2))
  const result = verifyPackageCliBin({
    fixExecutable: args.has('--fix-executable'),
    fixPackageJson: args.has('--fix-package-json'),
    sourceCommit: args.has('--fix-package-json') ? resolveBuildSourceCommit() : undefined,
    runHelp: args.has('--run-help')
  })
  console.log(
    `[cli-bin] verified ${path.relative(process.cwd(), result.binPath)} (${result.size} bytes)`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
