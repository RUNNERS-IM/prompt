import { runProcessSync } from '@orca/process-host'

// macOS ships Bash 3.2, which has no mapfile and treats empty arrays as unbound; CI steps assume Bash 4+.
export function findModernBash() {
  for (const program of ['bash', '/opt/homebrew/bin/bash', '/usr/local/bin/bash']) {
    try {
      const probe = runProcessSync({
        program,
        args: ['-c', 'echo "${BASH_VERSINFO[0]}"'],
        timeoutMs: 5000
      })
      if (probe.code === 0 && Number(probe.stdout.trim()) >= 4) {
        return program
      }
    } catch {
      // This candidate is not installed.
    }
  }
  return null
}
