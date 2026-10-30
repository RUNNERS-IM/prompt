import os from 'node:os'
import { runProcess } from '@orca/process-host'

/**
 * The short network name of this Mac (`scutil --get LocalHostName`), e.g. `m2-pro-1`. The office
 * Macs reach each other by this name (it is also the Tailscale MagicDNS name), so the share dialog
 * prefills it as the address other computers should use.
 */
export async function readPromptLocalHostName(
  args: {
    platform?: NodeJS.Platform
    hostname?: () => string
    run?: typeof runProcess
  } = {}
): Promise<string> {
  const fallback = shortHostName((args.hostname ?? os.hostname)())
  if ((args.platform ?? process.platform) !== 'darwin') {
    return fallback
  }
  try {
    const result = await (args.run ?? runProcess)({
      program: '/usr/sbin/scutil',
      args: ['--get', 'LocalHostName'],
      timeoutMs: 3_000,
      maxOutputBytes: 1024,
      env: { ...process.env, LC_ALL: 'C', LANG: 'C' }
    })
    const name = result.code === 0 && !result.timedOut ? result.stdout.trim() : ''
    return name || fallback
  } catch {
    return fallback
  }
}

/** `m2-pro-1.local` and `m2-pro-1.tail1234.ts.net` both become `m2-pro-1`. */
export function shortHostName(hostname: string): string {
  return hostname.trim().split('.')[0] ?? ''
}
