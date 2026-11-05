import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createRunnersAccountFile } from './prompt-runners-account-file'

const saved = { email: 'a@runners.im', tokens: { accessToken: 'access', refreshToken: 'refresh' } }
const flip = (data: Buffer): Buffer => Buffer.from(data.map((byte) => byte ^ 0xff))

describe('createRunnersAccountFile', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('keeps the account sealed on disk, reads it back after a restart, and deletes it on sign-out', () => {
    dir = mkdtempSync(join(tmpdir(), 'runners-account-'))
    const path = join(dir, 'sub', 'runners-account.bin')
    const options = {
      path,
      seal: (text: string) => flip(Buffer.from(text)),
      unseal: (data: Buffer) => flip(data).toString('utf8')
    }

    createRunnersAccountFile(options).save(saved)
    expect(readFileSync(path).toString('utf8')).not.toContain('refresh')
    expect(createRunnersAccountFile(options).load()).toEqual(saved)

    const afterRestart = createRunnersAccountFile(options)
    afterRestart.save(null)
    expect(existsSync(path)).toBe(false)
    expect(afterRestart.load()).toBeNull()
  })

  it('reads a file it cannot unseal as signed out, and keeps nothing on disk when sealing fails', () => {
    dir = mkdtempSync(join(tmpdir(), 'runners-account-'))
    const path = join(dir, 'runners-account.bin')
    createRunnersAccountFile({ path, seal: (text) => Buffer.from(text), unseal: String }).save(
      saved
    )
    const broken = createRunnersAccountFile({
      path,
      seal: () => {
        throw new Error('no keychain')
      },
      unseal: () => {
        throw new Error('other user')
      }
    })
    expect(broken.load()).toBeNull()

    broken.save(saved)
    expect(existsSync(path)).toBe(false)
    expect(broken.load()).toEqual(saved)
  })
})
