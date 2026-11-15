import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/i18n/i18n', () => ({
  translate: (key: string, _fallback: string, values?: Record<string, string>) =>
    values ? `${key} ${JSON.stringify(values)}` : key
}))

import { localizeCliStatusDetail } from './cli-status-detail-copy'

const LOCALES_DIR = join(__dirname, '../../i18n/locales')

describe('localizeCliStatusDetail', () => {
  it('translates the macOS stale launcher detail with its path', () => {
    expect(localizeCliStatusDetail('/usr/local/bin/orca contains an older Orca launcher.')).toBe(
      'prompt.cliStatus.olderLauncherContent {"path":"/usr/local/bin/orca"}'
    )
  })

  it('reads each capture into its own placeholder', () => {
    expect(
      localizeCliStatusDetail(
        '/home/me/.local/bin/orca-ide is registered, but /home/me/.local/bin is not on PATH in Ubuntu.'
      )
    ).toBe(
      'prompt.cliStatus.wslNotOnPath {"path":"/home/me/.local/bin/orca-ide","folder":"/home/me/.local/bin","distro":"Ubuntu"}'
    )
    expect(localizeCliStatusDetail('Registered in Ubuntu at /home/me/.local/bin/orca-ide.')).toBe(
      'prompt.cliStatus.registeredInDistro {"distro":"Ubuntu","path":"/home/me/.local/bin/orca-ide"}'
    )
  })

  it('translates fixed sentences', () => {
    expect(
      localizeCliStatusDetail('The bundled CLI launcher is missing from this Orca build.')
    ).toBe('prompt.cliStatus.launcherMissing')
  })

  it('translates the reason inside a PATH read failure', () => {
    expect(
      localizeCliStatusDetail(
        'Orca could not read the Windows user PATH registry key. No PATH changes were made.'
      )
    ).toBe('prompt.cliStatus.noPathChanges {"reason":"prompt.cliStatus.registryKeyUnreadable"}')
  })

  it('keeps text it does not know as main wrote it', () => {
    expect(localizeCliStatusDetail('EACCES: permission denied')).toBe('EACCES: permission denied')
  })
})

describe('prompt.cliStatus catalog', () => {
  const read = (file: string): Record<string, string> =>
    JSON.parse(readFileSync(join(LOCALES_DIR, file), 'utf8')).prompt.cliStatus
  const placeholders = (value: string): string =>
    [...value.matchAll(/\{\{\w+\}\}/g)]
      .map((match) => match[0])
      .sort()
      .join('|')
  const english = read('en.json')

  it.each(readdirSync(LOCALES_DIR).filter((file) => file.endsWith('.json')))(
    '%s has every key with the same placeholders',
    (file) => {
      const catalog = read(file)
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(english).sort())
      for (const [key, value] of Object.entries(english)) {
        expect(placeholders(catalog[key]), `${file} ${key}`).toBe(placeholders(value))
      }
    }
  )
})
