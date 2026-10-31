import { lstat, readlink, symlink, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: () => tmpdir(),
    getAppPath: () => tmpdir()
  }
}))

import { CliInstaller } from './cli-installer'
import { createPackagedMacLauncher, makeFixture } from './cli-installer-test-fixtures'

async function makeInstaller(options: { withPromptLauncher: boolean }) {
  const fixture = await makeFixture()
  const resourcesPath = await createPackagedMacLauncher(fixture.root)
  if (options.withPromptLauncher) {
    await writeFile(join(resourcesPath, 'bin', 'prompt'), '#!/usr/bin/env bash\necho prompt\n', {
      encoding: 'utf8',
      mode: 0o755
    })
  }
  const binDir = join(fixture.root, 'home', '.local', 'bin')
  const installer = new CliInstaller({
    platform: 'darwin',
    isPackaged: true,
    resourcesPath,
    userDataPath: fixture.userDataPath,
    execPath: '/Applications/Prompt.app/Contents/MacOS/Prompt',
    appPath: fixture.appPath,
    homePath: join(fixture.root, 'home'),
    // An absent default directory selects ~/.local/bin, which needs no privileged runner.
    defaultMacCommandPath: join(fixture.root, 'absent', 'orca'),
    processPathEnv: binDir
  })
  return { installer, binDir, resourcesPath }
}

describe('CliInstaller prompt command on macOS', () => {
  it.skipIf(process.platform === 'win32')('registers prompt beside orca', async () => {
    const { installer, binDir, resourcesPath } = await makeInstaller({ withPromptLauncher: true })

    const installed = await installer.install()

    expect(installed.state).toBe('installed')
    expect(await readlink(join(binDir, 'orca'))).toBe(join(resourcesPath, 'bin', 'orca'))
    expect(await readlink(join(binDir, 'prompt'))).toBe(join(resourcesPath, 'bin', 'prompt'))

    const removed = await installer.remove()
    expect(removed.state).toBe('not_installed')
    await expect(lstat(join(binDir, 'prompt'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it.skipIf(process.platform === 'win32')(
    'reports an orca-only registration as stale so it can be registered again',
    async () => {
      const { installer, binDir, resourcesPath } = await makeInstaller({ withPromptLauncher: true })
      await installer.install()
      await unlink(join(binDir, 'prompt'))

      const status = await installer.getStatus()

      expect(status.state).toBe('stale')
      expect(status.detail).toContain(join(binDir, 'prompt'))
      expect((await installer.install()).state).toBe('installed')
      expect(await readlink(join(binDir, 'prompt'))).toBe(join(resourcesPath, 'bin', 'prompt'))
    }
  )

  it.skipIf(process.platform === 'win32')(
    'leaves an unrelated prompt command alone when removing orca',
    async () => {
      const { installer, binDir } = await makeInstaller({ withPromptLauncher: true })
      await installer.install()
      await unlink(join(binDir, 'prompt'))
      await symlink('/usr/bin/true', join(binDir, 'prompt'))

      const removed = await installer.remove()

      expect(removed.state).toBe('not_installed')
      expect(await readlink(join(binDir, 'prompt'))).toBe('/usr/bin/true')
    }
  )

  it.skipIf(process.platform === 'win32')(
    'registers only orca when the build has no prompt launcher',
    async () => {
      const { installer, binDir } = await makeInstaller({ withPromptLauncher: false })

      expect((await installer.install()).state).toBe('installed')
      await expect(lstat(join(binDir, 'prompt'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  )
})
