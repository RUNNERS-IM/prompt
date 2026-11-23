import { chmod, lstat, mkdir, readFile, readlink, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir(),
    getAppPath: () => tmpdir()
  }
}))

import { CliInstaller } from './cli-installer'
import { createPackagedMacLauncher, makeFixture } from './cli-installer-test-fixtures'

const lockedDirectories: string[] = []

afterEach(async () => {
  await Promise.all(lockedDirectories.splice(0).map((path) => chmod(path, 0o700)))
  vi.restoreAllMocks()
})

// Older Prompt builds registered `orca` beside `prompt`; this build ships and registers only `prompt`.
async function makeInstaller(options: { useUsrLocalBin?: boolean } = {}) {
  const fixture = await makeFixture()
  const resourcesPath = await createPackagedMacLauncher(fixture.root)
  const homePath = join(fixture.root, 'home')
  const homeBin = join(homePath, '.local', 'bin')
  const usrLocalBin = join(fixture.root, 'usr', 'local', 'bin')
  await mkdir(homeBin, { recursive: true })
  if (options.useUsrLocalBin) {
    await mkdir(usrLocalBin, { recursive: true })
  }
  const installer = new CliInstaller({
    platform: 'darwin',
    isPackaged: true,
    resourcesPath,
    userDataPath: fixture.userDataPath,
    execPath: '/Applications/Prompt.app/Contents/MacOS/Prompt',
    appPath: fixture.appPath,
    homePath,
    // An absent default directory selects ~/.local/bin, which needs no privileged runner.
    defaultMacCommandPath: options.useUsrLocalBin
      ? join(usrLocalBin, 'prompt')
      : join(fixture.root, 'absent', 'prompt'),
    processPathEnv: options.useUsrLocalBin ? `${usrLocalBin}:${homeBin}` : homeBin,
    privilegedRunner: async () => {
      throw new Error('privileged registration is not available in this test')
    }
  })
  return {
    installer,
    root: fixture.root,
    resourcesPath,
    homeBin,
    usrLocalBin,
    bundledOrcaPath: join(resourcesPath, 'bin', 'orca'),
    oldAppOrcaPath: join(fixture.root, 'Old Prompt.app', 'Contents', 'Resources', 'bin', 'orca')
  }
}

describe.skipIf(process.platform === 'win32')('CliInstaller prompt command on macOS', () => {
  it('registers only prompt and does not ship or link orca', async () => {
    const { installer, homeBin, resourcesPath } = await makeInstaller()

    const installed = await installer.install()

    expect(installed.state).toBe('installed')
    expect(installed.commandPath).toBe(join(homeBin, 'prompt'))
    expect(installed.launcherPath).toBe(join(resourcesPath, 'bin', 'prompt'))
    expect(await readlink(join(homeBin, 'prompt'))).toBe(join(resourcesPath, 'bin', 'prompt'))
    await expect(lstat(join(homeBin, 'orca'))).rejects.toMatchObject({ code: 'ENOENT' })

    const removed = await installer.remove()
    expect(removed.state).toBe('not_installed')
    await expect(lstat(join(homeBin, 'prompt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('removes the orca links an older Prompt registered when prompt is registered', async () => {
    const { installer, homeBin, usrLocalBin, bundledOrcaPath, oldAppOrcaPath, resourcesPath } =
      await makeInstaller({ useUsrLocalBin: true })
    // This app's own launcher (no longer shipped) and another, possibly deleted, Prompt.app.
    await symlink(bundledOrcaPath, join(usrLocalBin, 'orca'))
    await symlink(oldAppOrcaPath, join(homeBin, 'orca'))

    const installed = await installer.install()

    expect(installed.state).toBe('installed')
    expect(await readlink(join(usrLocalBin, 'prompt'))).toBe(join(resourcesPath, 'bin', 'prompt'))
    await expect(lstat(join(usrLocalBin, 'orca'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(join(homeBin, 'orca'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('asks to register again while an older Prompt orca link is left beside prompt', async () => {
    const { installer, homeBin, bundledOrcaPath } = await makeInstaller()
    await installer.install()
    await symlink(bundledOrcaPath, join(homeBin, 'orca'))

    const stale = await installer.getStatus()
    expect(stale.state).toBe('stale')
    expect(stale.detail).toContain(join(homeBin, 'orca'))

    expect((await installer.install()).state).toBe('installed')
    await expect(lstat(join(homeBin, 'orca'))).rejects.toMatchObject({ code: 'ENOENT' })
    expect((await installer.getStatus()).state).toBe('installed')
  })

  it('removes an older Prompt orca link when prompt is removed', async () => {
    const { installer, homeBin, bundledOrcaPath } = await makeInstaller()
    await installer.install()
    await symlink(bundledOrcaPath, join(homeBin, 'orca'))

    const removed = await installer.remove()

    expect(removed.state).toBe('not_installed')
    await expect(lstat(join(homeBin, 'prompt'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(lstat(join(homeBin, 'orca'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('leaves an orca command that Prompt does not own alone', async () => {
    const { installer, homeBin, usrLocalBin } = await makeInstaller({ useUsrLocalBin: true })
    await symlink('/usr/bin/true', join(usrLocalBin, 'orca'))
    await writeFile(join(homeBin, 'orca'), '#!/bin/sh\necho screen-reader\n', { mode: 0o755 })

    expect((await installer.install()).state).toBe('installed')
    expect((await installer.remove()).state).toBe('not_installed')

    expect(await readlink(join(usrLocalBin, 'orca'))).toBe('/usr/bin/true')
    expect(await readFile(join(homeBin, 'orca'), 'utf8')).toContain('screen-reader')
  })

  it.skipIf(process.getuid?.() === 0)(
    'still registers prompt when an old orca link cannot be removed',
    async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { installer, homeBin, usrLocalBin, oldAppOrcaPath, resourcesPath } =
        await makeInstaller({ useUsrLocalBin: true })
      await symlink(oldAppOrcaPath, join(homeBin, 'orca'))
      await chmod(homeBin, 0o500)
      lockedDirectories.push(homeBin)

      const installed = await installer.install()

      // `prompt` works; the leftover link keeps Settings offering to register again.
      expect(installed.state).toBe('stale')
      expect(await readlink(join(usrLocalBin, 'prompt'))).toBe(join(resourcesPath, 'bin', 'prompt'))
      expect(await readlink(join(homeBin, 'orca'))).toBe(oldAppOrcaPath)
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(join(homeBin, 'orca')),
        expect.any(String)
      )
    }
  )
})
