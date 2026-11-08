import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { parseTailscaleMacs, sendToHost, type CommandRunner } from './prompt-session-hosts'

const SENT_REPLY = JSON.stringify({
  ok: true,
  result: { send: { handle: 'term_1', accepted: true, bytesWritten: 3 } }
})

function recordingRunner(): { run: CommandRunner; calls: { file: string; args: string[] }[] } {
  const calls: { file: string; args: string[] }[] = []
  return {
    calls,
    run: async (file, args) => {
      calls.push({ file, args })
      return SENT_REPLY
    }
  }
}

function flags(entries: [string, string | boolean][]): Map<string, string | boolean> {
  return new Map(entries)
}

describe('sendToHost', () => {
  beforeEach(() => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
  })

  it('quotes the message so the remote shell cannot run any of it', async () => {
    const { run, calls } = recordingRunner()
    await sendToHost(
      flags([
        ['ssh-host', 'm2-pro-1'],
        ['session', "a'; touch /tmp/x #"],
        ['text', '$(touch /tmp/y)'],
        ['enter', true]
      ]),
      '/tmp',
      run
    )
    const remote = calls[0].args.at(-1)
    expect(remote).toContain(`'a'\\''; touch /tmp/x #'`)
    expect(remote).toContain(`'--text' '$(touch /tmp/y)'`)
    expect(remote).toContain(`'--enter'`)
    expect(remote).not.toContain('ssh-host')
  })

  it('fails on the remote error even though ssh reported success', async () => {
    const reply = JSON.stringify({
      ok: false,
      error: { code: 'selector_not_found', message: 'No session matches "x".' }
    })
    await expect(
      sendToHost(flags([['ssh-host', 'm2-pro-1']]), '/tmp', async () => reply)
    ).rejects.toThrow('No session matches "x".')
  })

  it('does not call an unreadable reply a success', async () => {
    await expect(
      sendToHost(flags([['ssh-host', 'm2-pro-1']]), '/tmp', async () => '')
    ).rejects.toThrow(/may not have been delivered/)
  })

  it('refuses a host name ssh would read as an option', async () => {
    const { run, calls } = recordingRunner()
    await expect(
      sendToHost(flags([['ssh-host', '-oProxyCommand=x']]), '/tmp', run)
    ).rejects.toThrow(/Mac name/)
    expect(calls).toHaveLength(0)
  })

  it('never accepts a new host key', async () => {
    const { run, calls } = recordingRunner()
    await sendToHost(flags([['ssh-host', 'm2-pro-1']]), '/tmp', run)
    expect(calls[0].args).toEqual(
      expect.arrayContaining(['StrictHostKeyChecking=yes', 'BatchMode=yes'])
    )
  })

  it('uploads first with a shell-safe name and names the file in the message', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'prompt-attach-'))
    const file = join(dir, "화면 $(x)'.png")
    writeFileSync(file, 'x')
    const { run, calls } = recordingRunner()
    await sendToHost(
      flags([
        ['ssh-host', 'm2-pro-1'],
        ['text', '이 화면 깨짐'],
        ['attach', file]
      ]),
      '/tmp',
      run
    )
    expect(calls.map((call) => call.file)).toEqual(['ssh', 'scp', 'ssh'])
    const target = calls[1].args.at(-1) ?? ''
    expect(target).toMatch(/^m2-pro-1:~\/prompt-inbox\/화면-x-[0-9a-f]{6}\.png$/)
    expect(calls[2].args.at(-1)).toContain(
      `'이 화면 깨짐 (사진: ${target.slice('m2-pro-1:'.length)})'`
    )
  })

  it('sends nothing when the file is missing', async () => {
    const { run, calls } = recordingRunner()
    await expect(
      sendToHost(
        flags([
          ['ssh-host', 'm2-pro-1'],
          ['attach', 'no-such-file.png']
        ]),
        '/tmp',
        run
      )
    ).rejects.toThrow(/not found/)
    expect(calls).toHaveLength(0)
  })

  it('explains itself off macOS', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
    await expect(sendToHost(flags([['ssh-host', 'm2-pro-1']]), '/tmp', vi.fn())).rejects.toThrow(
      /only from macOS/
    )
  })
})

describe('parseTailscaleMacs', () => {
  it('keeps only online Macs and marks this one', () => {
    const device = (name: string, OS: string, Online: boolean, HostName = name) => ({
      HostName,
      DNSName: `${name}.tail.ts.net.`,
      OS,
      Online
    })
    expect(
      parseTailscaleMacs(
        JSON.stringify({
          Self: device('m2-pro-1', 'macOS', true),
          Peer: {
            a: device('s24', 'android', true, '폰'),
            b: device('m1-pro-1', 'macOS', false),
            c: device('m1-max-1', 'macOS', true, 'M1 Max')
          }
        })
      )
    ).toEqual([
      { name: 'm1-max-1', self: false },
      { name: 'm2-pro-1', self: true }
    ])
  })
})
