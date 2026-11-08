import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { statSync } from 'node:fs'
import { parse, resolve } from 'node:path'
import type { RuntimeTerminalSend } from '../../shared/runtime-terminal-contracts'
import { quotePosixShell } from '../../shared/shell-argument-quoting'
import { getOptionalStringFlag } from '../flags'
import { RuntimeClientError } from '../runtime/types'
import { resolveCliLocale } from '../command-tree/cli-surface'
import { formatTerminalSend } from '../terminal-format'

const REMOTE_PROMPT_CLI = '/Applications/Prompt.app/Contents/Resources/bin/prompt'
const SSH_OPTIONS = [
  '-o',
  'BatchMode=yes',
  '-o',
  'StrictHostKeyChecking=yes',
  '-o',
  'ConnectTimeout=8'
]
const TAILSCALE_CANDIDATES = [
  'tailscale',
  '/opt/homebrew/bin/tailscale',
  '/usr/local/bin/tailscale',
  '/Applications/Tailscale.app/Contents/MacOS/Tailscale'
]
const HOST_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/
const INBOX = '~/prompt-inbox'
const LIST_TIMEOUT_MS = 20_000
const SEND_TIMEOUT_MS = 60_000
const UPLOAD_TIMEOUT_MS = 5 * 60_000
// These only make sense on the sending Mac; a remote `prompt` would reject or misread them.
const LOCAL_ONLY_FLAGS = new Set(['ssh-host', 'attach', 'environment', 'pairing-code', 'help'])

export type CommandRunner = (file: string, args: string[], timeoutMs: number) => Promise<string>

export const runCommand: CommandRunner = (file, args, timeoutMs) =>
  new Promise((done, fail) => {
    execFile(
      file,
      args,
      { timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          // The CLI reports its failures on stdout under --json; ssh reports on stderr.
          const detail = String(stderr).trim() || String(stdout).trim() || error.message
          fail(Object.assign(new Error(detail), { code: error.code }))
          return
        }
        done(String(stdout))
      }
    )
  })

export function assertMacHostCommands(flag: string): void {
  if (process.platform !== 'darwin') {
    throw new RuntimeClientError(
      'unsupported_platform',
      `${flag} reaches Prompt on other Macs over SSH and works only from macOS.`
    )
  }
}

function readHostName(flags: Map<string, string | boolean>): string {
  const host = getOptionalStringFlag(flags, 'ssh-host')
  // A leading "-" would be read by ssh as an option.
  if (!host || !HOST_NAME.test(host)) {
    throw new RuntimeClientError(
      'invalid_argument',
      '--host takes a Mac name such as m2-pro-1 (letters, digits, ".", "_", "-").'
    )
  }
  return host
}

function inboxFileName(localPath: string, unique: string): string {
  const { name, ext } = parse(localPath)
  const clean = (text: string): string =>
    text
      .normalize('NFC')
      .replace(/[^\p{L}\p{N}._-]+/gu, '-')
      .replace(/^[-.]+|-+$/g, '')
  // Only safe characters remain, so scp's remote path needs no quoting in either transfer mode.
  return `${clean(name) || 'file'}-${unique}${clean(ext) ? `.${clean(ext)}` : ''}`
}

function remoteCommand(args: readonly string[]): string {
  return [REMOTE_PROMPT_CLI, ...args].map(quotePosixShell).join(' ')
}

async function uploadAttachment(
  host: string,
  localPath: string,
  run: CommandRunner
): Promise<string> {
  await run('ssh', [...SSH_OPTIONS, host, `mkdir -p ${INBOX}`], SEND_TIMEOUT_MS)
  const remotePath = `${INBOX}/${inboxFileName(localPath, randomBytes(3).toString('hex'))}`
  await run(
    'scp',
    ['-q', ...SSH_OPTIONS, '--', localPath, `${host}:${remotePath}`],
    UPLOAD_TIMEOUT_MS
  )
  return remotePath
}

function readAttachment(flags: Map<string, string | boolean>, cwd: string): string | null {
  const attach = getOptionalStringFlag(flags, 'attach')
  if (!attach) {
    return null
  }
  const localPath = resolve(cwd, attach)
  if (!statSync(localPath, { throwIfNoEntry: false })?.isFile()) {
    throw new RuntimeClientError('invalid_argument', `--attach file not found: ${attach}`)
  }
  return localPath
}

function forwardedSendArgs(
  flags: Map<string, string | boolean>,
  text: string | undefined
): string[] {
  const args = ['session', 'send']
  for (const [flag, value] of flags) {
    if (LOCAL_ONLY_FLAGS.has(flag) || flag === 'text' || flag === 'json') {
      continue
    }
    args.push(`--${flag}`, ...(value === true ? [] : [String(value)]))
  }
  return text === undefined ? [...args, '--json'] : [...args, '--text', text, '--json']
}

function parseRemoteReply(output: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(output))
  } catch {
    return null
  }
}

// ssh over these links can report 0 even when the remote command failed, so only the reply counts.
function readRemoteSendReply(output: string, host: string, json: boolean): string {
  const reply = parseRemoteReply(output)
  const send = asRecord(reply?.result)?.send
  if (reply?.ok === true && isRuntimeTerminalSend(send)) {
    return json ? output : `${formatTerminalSend({ send })}\n`
  }
  const error = asRecord(reply?.error)
  throw new RuntimeClientError(
    typeof error?.code === 'string' ? error.code : 'runtime_error',
    typeof error?.message === 'string'
      ? error.message
      : `${host} gave no readable reply, so the message may not have been delivered.`
  )
}

function isRuntimeTerminalSend(value: unknown): value is RuntimeTerminalSend {
  const record = asRecord(value)
  return typeof record?.accepted === 'boolean' && typeof record.handle === 'string'
}

export function assertNoAttachWithoutHost(flags: Map<string, string | boolean>): void {
  if (flags.has('attach') && !flags.has('ssh-host')) {
    throw new RuntimeClientError('invalid_argument', '--attach requires --host.')
  }
}

/** Runs `session send` on another Mac and returns what that Mac's CLI printed. */
export async function sendToHost(
  flags: Map<string, string | boolean>,
  cwd: string,
  run: CommandRunner = runCommand
): Promise<string> {
  assertMacHostCommands('--host')
  const host = readHostName(flags)
  const attachment = readAttachment(flags, cwd)
  const text = getOptionalStringFlag(flags, 'text')
  // Upload first: if it fails, the session never gets a message naming a missing file.
  const remotePath = attachment ? await uploadAttachment(host, attachment, run) : null
  const note = remotePath ? `(사진: ${remotePath})` : undefined
  const message = note ? (text ? `${text} ${note}` : note) : text
  const waitSubmitSeconds = Number(flags.get('wait-submit')) || 0
  const output = await run(
    'ssh',
    [...SSH_OPTIONS, host, remoteCommand(forwardedSendArgs(flags, message))],
    SEND_TIMEOUT_MS + waitSubmitSeconds * 1000
  )
  return readRemoteSendReply(output, host, flags.has('json'))
}

export type TailscaleMac = { name: string; self: boolean }

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : null
}

function tailscaleMac(device: unknown, self: boolean): TailscaleMac[] {
  const record = asRecord(device)
  if (!record || record.OS !== 'macOS' || record.Online !== true) {
    return []
  }
  // DNS names stay ASCII and are what ssh resolves; the device's display name may not be.
  const dns = typeof record.DNSName === 'string' ? record.DNSName.split('.')[0] : ''
  return HOST_NAME.test(dns) ? [{ name: dns, self }] : []
}

export function parseTailscaleMacs(statusJson: string): TailscaleMac[] {
  const status = asRecord(JSON.parse(statusJson))
  const peers = Object.values(asRecord(status?.Peer) ?? {})
  return [
    ...tailscaleMac(status?.Self, true),
    ...peers.flatMap((peer) => tailscaleMac(peer, false))
  ].sort((a, b) => a.name.localeCompare(b.name))
}

export async function listTailscaleMacs(run: CommandRunner = runCommand): Promise<TailscaleMac[]> {
  let lastError: unknown
  for (const candidate of TAILSCALE_CANDIDATES) {
    try {
      return parseTailscaleMacs(await run(candidate, ['status', '--json'], LIST_TIMEOUT_MS))
    } catch (error) {
      lastError = error
    }
  }
  throw new RuntimeClientError(
    'tailscale_unavailable',
    `--all-hosts needs Tailscale to list the Macs: ${lastError instanceof Error ? lastError.message : String(lastError)}`
  )
}

export async function readRemoteSessionList(
  host: string,
  run: CommandRunner = runCommand
): Promise<unknown> {
  const output = await run(
    'ssh',
    [...SSH_OPTIONS, host, remoteCommand(['session', 'list', '--json'])],
    LIST_TIMEOUT_MS
  )
  return asRecord(asRecord(JSON.parse(output))?.result)?.items
}

export function skippedHostLabel(reason: string): string {
  const label = resolveCliLocale() === 'ko' ? '건너뜀' : 'skipped'
  const firstLine = reason.split('\n')[0].trim().slice(0, 60)
  return firstLine ? `(${label}: ${firstLine})` : `(${label})`
}
