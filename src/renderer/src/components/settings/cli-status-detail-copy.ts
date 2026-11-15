import { translate } from '@/i18n/i18n'

// Main builds CLI status and error text in English; matching it here keeps the upstream installer files untouched.
type DetailPattern = {
  pattern: RegExp
  key: string
  fallback: string
  names: readonly string[]
}

const PATTERNS: readonly DetailPattern[] = [
  {
    pattern: /^(.+) contains an older Orca launcher\.$/,
    key: 'olderLauncherContent',
    fallback: '{{path}} contains an older Orca launcher.',
    names: ['path']
  },
  {
    pattern: /^(.+) exists but is not an Orca symlink\.$/,
    key: 'notOrcaSymlink',
    fallback: '{{path}} exists but is not an Orca symlink.',
    names: ['path']
  },
  {
    pattern: /^(.+) cannot be read\. Register again to repair it\.$/,
    key: 'unreadable',
    fallback: '{{path}} cannot be read. Register again to repair it.',
    names: ['path']
  },
  {
    pattern: /^Registered in (.+?) at (.+)\.$/,
    key: 'registeredInDistro',
    fallback: 'Registered in {{distro}} at {{path}}.',
    names: ['distro', 'path']
  },
  {
    pattern: /^Registered at (.+)\.$/,
    key: 'registered',
    fallback: 'Registered at {{path}}.',
    names: ['path']
  },
  {
    pattern: /^(.+) points to an older Orca launcher\.$/,
    key: 'olderLauncherTarget',
    fallback: '{{path}} points to an older Orca launcher.',
    names: ['path']
  },
  {
    pattern: /^(.+) points to a non-Orca launcher\.$/,
    key: 'nonOrcaLauncher',
    fallback: '{{path}} points to a non-Orca launcher.',
    names: ['path']
  },
  {
    pattern: /^(.+) points to a different Orca launcher\.$/,
    key: 'differentOrcaLauncher',
    fallback: '{{path}} points to a different Orca launcher.',
    names: ['path']
  },
  {
    pattern: /^(.+) points to a different launcher\.$/,
    key: 'differentLauncher',
    fallback: '{{path}} points to a different launcher.',
    names: ['path']
  },
  {
    pattern: /^Register (.+) to use Orca from the terminal\.$/,
    key: 'registerTerminal',
    fallback: 'Register {{path}} to use Orca from the terminal.',
    names: ['path']
  },
  {
    pattern: /^Register (.+) to use Orca from Command Prompt or PowerShell\.$/,
    key: 'registerWindows',
    fallback: 'Register {{path}} to use Orca from Command Prompt or PowerShell.',
    names: ['path']
  },
  {
    pattern: /^Register (.+) to use Orca from WSL\.$/,
    key: 'registerWsl',
    fallback: 'Register {{path}} to use Orca from WSL.',
    names: ['path']
  },
  {
    pattern: /^(.+) exists but is not an Orca launcher script\.$/,
    key: 'notLauncherScript',
    fallback: '{{path}} exists but is not an Orca launcher script.',
    names: ['path']
  },
  {
    pattern: /^(.+) exists but is not managed by Orca\.$/,
    key: 'notManaged',
    fallback: '{{path}} exists but is not managed by Orca.',
    names: ['path']
  },
  {
    pattern: /^(.+) is missing its PowerShell bridge\.$/,
    key: 'missingBridge',
    fallback: '{{path}} is missing its PowerShell bridge.',
    names: ['path']
  },
  {
    pattern: /^(.+) does not point to the current Orca AppImage payload\.$/,
    key: 'staleAppImage',
    fallback: '{{path}} does not point to the current Orca AppImage payload.',
    names: ['path']
  },
  {
    pattern:
      /^(.+) already exists and is not a Prompt command\. Remove it to use `prompt` from the terminal\.$/,
    key: 'promptConflict',
    fallback:
      '{{path}} already exists and is not a Prompt command. Remove it to use `prompt` from the terminal.',
    names: ['path']
  },
  {
    pattern: /^(.+) is not registered yet\. Register again to add the `prompt` command\.$/,
    key: 'promptMissing',
    fallback: '{{path}} is not registered yet. Register again to add the `prompt` command.',
    names: ['path']
  },
  {
    pattern: /^(.+) is registered, but WSL's login PATH could not be read in (.+)\.$/,
    key: 'wslPathUnreadable',
    fallback: "{{path}} is registered, but WSL's login PATH could not be read in {{distro}}.",
    names: ['path', 'distro']
  },
  {
    pattern: /^(.+) is registered, but (.+) is not on PATH in (.+)\.$/,
    key: 'wslNotOnPath',
    fallback: '{{path}} is registered, but {{folder}} is not on PATH in {{distro}}.',
    names: ['path', 'folder', 'distro']
  },
  {
    pattern: /^(.+) is registered, but (.+) is not on PATH for this shell\.$/,
    key: 'notOnPath',
    fallback: '{{path}} is registered, but {{folder}} is not on PATH for this shell.',
    names: ['path', 'folder']
  },
  {
    pattern: /^(.+) is registered\. Restart your shell if the command is not visible yet\.$/,
    key: 'restartShell',
    fallback: '{{path}} is registered. Restart your shell if the command is not visible yet.',
    names: ['path']
  },
  {
    pattern:
      /^The AppImage file at (.+) is missing\. Move it back or re-run CLI registration from the current AppImage location\.$/,
    key: 'appImageMissing',
    fallback:
      'The AppImage file at {{path}} is missing. Move it back or re-run CLI registration from the current AppImage location.',
    names: ['path']
  },
  {
    pattern:
      /^Refusing to replace non-Orca command at (.+)\. Remove it and register again if it is no longer needed\.$/,
    key: 'refuseReplace',
    fallback:
      'Refusing to replace non-Orca command at {{path}}. Remove it and register again if it is no longer needed.',
    names: ['path']
  },
  {
    pattern: /^Refusing to remove non-Orca command at (.+)\.$/,
    key: 'refuseRemove',
    fallback: 'Refusing to remove non-Orca command at {{path}}.',
    names: ['path']
  },
  {
    pattern: /^Refusing to remove a command not owned by Orca at (.+)\.$/,
    key: 'refuseRemoveNotOwned',
    fallback: 'Refusing to remove a command not owned by Orca at {{path}}.',
    names: ['path']
  },
  {
    pattern: /^WSL \((.+)\) did not respond in time\. It may still be starting; try again\.$/,
    key: 'wslTimeoutRetry',
    fallback: 'WSL ({{distro}}) did not respond in time. It may still be starting; try again.',
    names: ['distro']
  },
  {
    pattern:
      /^WSL \((.+)\) did not respond in time\. It may still be starting; refresh to try again\.$/,
    key: 'wslTimeoutRefresh',
    fallback:
      'WSL ({{distro}}) did not respond in time. It may still be starting; refresh to try again.',
    names: ['distro']
  },
  {
    pattern: /^WSL \((.+)\) is not running\. Refresh to start it and check the CLI\.$/,
    key: 'wslStopped',
    fallback: 'WSL ({{distro}}) is not running. Refresh to start it and check the CLI.',
    names: ['distro']
  },
  {
    pattern: /^WSL didn't say whether (.+) is running\. Refresh to try again\.$/,
    key: 'wslUnknownState',
    fallback: "WSL didn't say whether {{distro}} is running. Refresh to try again.",
    names: ['distro']
  }
]

const FIXED: Readonly<Record<string, string>> = {
  'CLI registration is not implemented on this platform.': 'platformUnsupported',
  'Orca could not verify the inherited AppImage runtime identity, so CLI registration is unavailable.':
    'appImageUnverified',
  'The bundled CLI launcher is missing from this Orca build.': 'launcherMissing',
  'Development mode uses a generated launcher for validation only.': 'devLauncher',
  'The Orca launcher exists, but Orca could not check your Windows user PATH.':
    'windowsPathUnchecked',
  'CLI registration is unavailable on this build.': 'buildUnavailable',
  'The Windows user PATH registry is only available on Windows.': 'registryWindowsOnly',
  'Orca could not read the Windows user PATH registry key.': 'registryKeyUnreadable',
  'The Windows user PATH registry value has an unsupported format.': 'registryFormat',
  'Orca could not read the Windows user PATH registry value.': 'registryValueUnreadable',
  'Could not reach the WSL distro. Try again.': 'wslUnreachable',
  'No WSL distribution is available.': 'wslNone',
  'Unable to resolve the WSL home directory.': 'wslHome',
  'WSL CLI registration is only available on Windows.': 'wslWindowsOnly',
  'WSL CLI registration is unavailable.': 'wslUnavailable',
  'WSL Windows interop is unavailable; Orca cannot launch the Windows CLI from WSL.': 'wslInterop',
  'The Windows Orca CLI launcher is missing.': 'windowsLauncherMissing'
}

const NO_PATH_CHANGES = ' No PATH changes were made.'

/** Shows main's English CLI status or error text in the UI language; unknown text stays as main wrote it. */
export function localizeCliStatusDetail(detail: string): string {
  const text = detail.trim()
  if (text.endsWith(NO_PATH_CHANGES)) {
    const reason = localizeCliStatusDetail(text.slice(0, -NO_PATH_CHANGES.length))
    return translate('prompt.cliStatus.noPathChanges', '{{reason}} No PATH changes were made.', {
      reason
    })
  }
  const fixedKey = FIXED[text]
  if (fixedKey) {
    return translate(`prompt.cliStatus.${fixedKey}`, text)
  }
  for (const { pattern, key, fallback, names } of PATTERNS) {
    const match = pattern.exec(text)
    if (match) {
      const values = Object.fromEntries(names.map((name, index) => [name, match[index + 1]]))
      return translate(`prompt.cliStatus.${key}`, fallback, values)
    }
  }
  return detail
}
