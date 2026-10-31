import type * as ChildProcess from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const execFileMock = vi.hoisted(() => vi.fn())

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof ChildProcess>()
  return { ...actual, execFile: execFileMock }
})

import { MAX_REPO_ICON_UPLOAD_BYTES } from '../../shared/repo-icon'
import { parseProjectIconFlag } from './prompt-project-icon'

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// A valid grey PNG of the given size; padTo adds a text chunk so the file reaches that many bytes.
function pngBytes(width: number, height: number, padTo = 0): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 0
  const rows = Buffer.alloc((width + 1) * height, 0x80)
  for (let row = 0; row < height; row += 1) {
    rows[row * (width + 1)] = 0
  }
  const parts = [PNG_SIGNATURE, chunk('IHDR', header), chunk('IDAT', deflateSync(rows))]
  const used = parts.reduce((total, part) => total + part.length, 0) + 12
  if (padTo > used + 12) {
    parts.push(
      chunk('tEXt', Buffer.concat([Buffer.from('pad\0'), Buffer.alloc(padTo - used - 16, 0x61)]))
    )
  }
  parts.push(chunk('IEND', Buffer.alloc(0)))
  return Buffer.concat(parts)
}

const originalPlatform = process.platform

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

/** sips reports the given size; a resize writes `shrunk` to the --out path. */
function mockSips(size: { width: number; height: number }, shrunk: Buffer): void {
  execFileMock.mockImplementation((_file: string, args: string[], callback: ExecFileCallback) => {
    if (args[0] === '-g') {
      callback(null, `  pixelWidth: ${size.width}\n  pixelHeight: ${size.height}\n`, '')
      return
    }
    const out = args[args.indexOf('--out') + 1]
    void writeFile(out, shrunk).then(() => callback(null, '', ''))
  })
}

describe('parseProjectIconFlag', () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'prompt-icon-test-'))
    execFileMock.mockReset()
  })

  afterEach(async () => {
    setPlatform(originalPlatform)
    await rm(dir, { recursive: true, force: true })
  })

  it('keeps emoji, lucide and none without touching files', async () => {
    await expect(parseProjectIconFlag('emoji:🚀', dir)).resolves.toMatchObject({ type: 'emoji' })
    await expect(parseProjectIconFlag('lucide:Rocket', dir)).resolves.toMatchObject({
      type: 'lucide',
      name: 'Rocket'
    })
    await expect(parseProjectIconFlag('none', dir)).resolves.toBeNull()
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('sends a small PNG as it is on macOS', async () => {
    setPlatform('darwin')
    const bytes = pngBytes(32, 32)
    await writeFile(join(dir, 'small.png'), bytes)
    mockSips({ width: 32, height: 32 }, Buffer.alloc(0))

    const icon = await parseProjectIconFlag('small.png', dir)

    expect(icon).toMatchObject({
      type: 'image',
      src: `data:image/png;base64,${bytes.toString('base64')}`,
      label: 'small.png'
    })
    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect(execFileMock.mock.calls[0][0]).toBe('/usr/bin/sips')
  })

  it('shrinks an image over 96px to a 96px PNG and removes the temp file', async () => {
    setPlatform('darwin')
    const path = join(dir, 'big.png')
    await writeFile(path, pngBytes(512, 256))
    const shrunk = pngBytes(96, 48)
    mockSips({ width: 512, height: 256 }, shrunk)

    const icon = await parseProjectIconFlag(path, '/')

    expect(icon).toMatchObject({ src: `data:image/png;base64,${shrunk.toString('base64')}` })
    const [file, args] = execFileMock.mock.calls[1] as [string, string[]]
    expect(file).toBe('/usr/bin/sips')
    expect(args.slice(0, 6)).toEqual(['-s', 'format', 'png', '-Z', '96', path])
    const out = args[args.indexOf('--out') + 1]
    expect(out.startsWith(tmpdir())).toBe(true)
    await expect(readdir(join(out, '..'))).rejects.toThrow()
  })

  it('shrinks a file over the size limit on macOS without measuring it first', async () => {
    setPlatform('darwin')
    await writeFile(join(dir, 'heavy.png'), pngBytes(8, 8, MAX_REPO_ICON_UPLOAD_BYTES + 1024))
    const shrunk = pngBytes(96, 96)
    mockSips({ width: 8, height: 8 }, shrunk)

    const icon = await parseProjectIconFlag('heavy.png', dir)

    expect(icon).toMatchObject({ src: `data:image/png;base64,${shrunk.toString('base64')}` })
    expect(execFileMock).toHaveBeenCalledTimes(1)
    expect((execFileMock.mock.calls[0][1] as string[])[0]).toBe('-s')
  })

  it('says so when sips cannot shrink the file', async () => {
    setPlatform('darwin')
    await writeFile(join(dir, 'broken.png'), pngBytes(8, 8, MAX_REPO_ICON_UPLOAD_BYTES + 1024))
    execFileMock.mockImplementation((_file: string, _args: string[], callback: ExecFileCallback) =>
      callback(new Error('sips failed'), '', '')
    )

    await expect(parseProjectIconFlag('broken.png', dir)).rejects.toThrow(
      '--icon file could not be shrunk to 96px'
    )
  })

  it('keeps rejecting files over the limit on other systems', async () => {
    setPlatform('linux')
    await writeFile(join(dir, 'heavy.png'), pngBytes(8, 8, MAX_REPO_ICON_UPLOAD_BYTES + 1024))

    await expect(parseProjectIconFlag('heavy.png', dir)).rejects.toThrow(
      /--icon file is \d+ KB; the limit is 256 KB\./
    )
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('sends a large-pixel file under the limit as it is on other systems', async () => {
    setPlatform('linux')
    const bytes = pngBytes(512, 512)
    await writeFile(join(dir, 'wide.png'), bytes)

    await expect(parseProjectIconFlag('wide.png', dir)).resolves.toMatchObject({
      src: `data:image/png;base64,${bytes.toString('base64')}`
    })
    expect(execFileMock).not.toHaveBeenCalled()
  })

  it('still rejects files that are not PNG or WebP, and missing files', async () => {
    setPlatform('darwin')
    await writeFile(join(dir, 'icon.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xe0]))

    await expect(parseProjectIconFlag('icon.jpg', dir)).rejects.toThrow(
      '--icon file must be a PNG or WebP image.'
    )
    await expect(parseProjectIconFlag('missing.png', dir)).rejects.toThrow('--icon file not found')
    expect(execFileMock).not.toHaveBeenCalled()
  })
})

describe.runIf(process.platform === 'darwin')('parseProjectIconFlag with the real sips', () => {
  it('shrinks a real 300px PNG to 96px', async () => {
    const actual = await vi.importActual<typeof ChildProcess>('node:child_process')
    execFileMock.mockReset()
    execFileMock.mockImplementation(actual.execFile)
    const dir = await mkdtemp(join(tmpdir(), 'prompt-icon-real-'))
    try {
      await writeFile(join(dir, 'real.png'), pngBytes(300, 150))

      const icon = await parseProjectIconFlag('real.png', dir)

      expect(icon?.type).toBe('image')
      const src = icon?.type === 'image' ? icon.src : ''
      const bytes = Buffer.from(src.slice('data:image/png;base64,'.length), 'base64')
      expect(bytes.subarray(0, 8).equals(PNG_SIGNATURE)).toBe(true)
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)]).toEqual([96, 48])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
