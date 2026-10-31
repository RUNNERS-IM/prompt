import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve as resolvePath } from 'node:path'
import { MAX_REPO_ICON_UPLOAD_BYTES, sanitizeRepoIcon, type RepoIcon } from '../../shared/repo-icon'
import { RuntimeClientError } from '../runtime/types'

/** Longest side, in pixels, of an icon file the CLI shrinks before sending it. */
export const PROJECT_ICON_MAX_PIXELS = 96

// macOS ships sips in /usr/bin; the absolute path keeps a PATH entry from standing in for it.
const SIPS_PATH = '/usr/bin/sips'

/** Run a program with an argument array (no shell) and resolve with its stdout. */
function runFile(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout) => (error ? reject(error) : resolve(String(stdout))))
  })
}

function isPng(bytes: Buffer): boolean {
  return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
}

function isWebp(bytes: Buffer): boolean {
  return (
    bytes.subarray(0, 4).toString('latin1') === 'RIFF' &&
    bytes.subarray(8, 12).toString('latin1') === 'WEBP'
  )
}

function overLimitError(size: number): RuntimeClientError {
  return new RuntimeClientError(
    'invalid_argument',
    `--icon file is ${Math.ceil(size / 1024)} KB; the limit is ${MAX_REPO_ICON_UPLOAD_BYTES / 1024} KB.`
  )
}

/** Longest side of the image as sips reads it, or null when sips cannot read it. */
async function readLongestSide(path: string): Promise<number | null> {
  try {
    const stdout = await runFile(SIPS_PATH, ['-g', 'pixelWidth', '-g', 'pixelHeight', path])
    const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1])
    const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1])
    return Number.isFinite(width) && Number.isFinite(height) ? Math.max(width, height) : null
  } catch {
    return null
  }
}

/** Write a PNG whose longest side is PROJECT_ICON_MAX_PIXELS to a temp folder, read it, then remove the folder. */
async function shrinkToPng(path: string): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'prompt-icon-'))
  const out = join(dir, 'icon.png')
  try {
    await runFile(SIPS_PATH, [
      '-s',
      'format',
      'png',
      '-Z',
      String(PROJECT_ICON_MAX_PIXELS),
      path,
      '--out',
      out
    ])
    return await readFile(out)
  } catch {
    throw new RuntimeClientError(
      'invalid_argument',
      `--icon file could not be shrunk to ${PROJECT_ICON_MAX_PIXELS}px: ${path}`
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

/** Bytes to send for an icon file; on macOS a file over the limit or over 96px is shrunk first. */
async function readIconFile(path: string, size: number): Promise<{ bytes: Buffer; mime: string }> {
  const canShrink = process.platform === 'darwin'
  if (size > MAX_REPO_ICON_UPLOAD_BYTES && !canShrink) {
    throw overLimitError(size)
  }
  const original = await readFile(path)
  const mime = isPng(original) ? 'image/png' : isWebp(original) ? 'image/webp' : null
  if (!mime) {
    throw new RuntimeClientError('invalid_argument', '--icon file must be a PNG or WebP image.')
  }
  if (!canShrink) {
    return { bytes: original, mime }
  }
  if (size <= MAX_REPO_ICON_UPLOAD_BYTES) {
    const longestSide = await readLongestSide(path)
    // A file sips cannot measure is sent as it is, like on other systems.
    if (longestSide === null || longestSide <= PROJECT_ICON_MAX_PIXELS) {
      return { bytes: original, mime }
    }
  }
  const shrunk = await shrinkToPng(path)
  if (shrunk.length > MAX_REPO_ICON_UPLOAD_BYTES) {
    throw overLimitError(shrunk.length)
  }
  return { bytes: shrunk, mime: 'image/png' }
}

/** Read --icon into the repo icon the sidebar renders; the host silently drops icons it rejects. */
export async function parseProjectIconFlag(value: string, cwd: string): Promise<RepoIcon | null> {
  if (value === 'none') {
    return null
  }
  let candidate: unknown
  if (value.startsWith('emoji:')) {
    candidate = { type: 'emoji', emoji: value.slice('emoji:'.length) }
  } else if (value.startsWith('lucide:')) {
    candidate = { type: 'lucide', name: value.slice('lucide:'.length) }
  } else {
    const path = resolvePath(cwd, value)
    const size = await stat(path).then(
      (stats) => (stats.isFile() ? stats.size : null),
      () => null
    )
    if (size === null) {
      throw new RuntimeClientError('invalid_argument', `--icon file not found: ${path}`)
    }
    const { bytes, mime } = await readIconFile(path, size)
    candidate = {
      type: 'image',
      src: `data:${mime};base64,${bytes.toString('base64')}`,
      source: 'file',
      label: basename(path)
    }
  }
  const icon = sanitizeRepoIcon(candidate)
  if (!icon) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--icon must be a PNG/WebP file, emoji:<emoji>, lucide:<IconName>, or none.'
    )
  }
  return icon
}
