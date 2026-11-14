import { describe, expect, it } from 'vitest'
import { buildAgentResumeStartupPlan } from './tui-agent-resume-startup'

const resume = (
  agent: 'claude' | 'codex' | 'gemini' | 'opencode',
  cwd: string,
  launchCwd: string,
  options: {
    shell?: 'powershell' | 'cmd'
    notice?: (folder: string) => string
  } = {}
) =>
  buildAgentResumeStartupPlan({
    agent,
    providerSession: { key: 'session_id', id: 's1', cwd },
    cmdOverrides: {},
    platform: options.shell ? 'win32' : 'darwin',
    shell: options.shell,
    launchCwd,
    recordedCwdNotice: options.notice
  })?.launchCommand

describe('resume folder (decision 2026-11-06 1C 2B)', () => {
  it('keeps Claude in the tab folder and prints one line naming the folder it ran in', () => {
    expect(resume('claude', '/repo-wt-gone', '/repo')).toBe(
      "printf '%s\\n' '[Prompt] Continuing in this folder, not /repo-wt-gone where it last ran'; claude '--resume' 's1'"
    )
    expect(resume('claude', '/repo/', '/repo')).toBe("claude '--resume' 's1'")
  })

  it('prints the caller’s translated line', () => {
    expect(
      resume('claude', '/repo/pkg', '/repo', {
        notice: (f) => `[Prompt] ${f} 대신 이 폴더`
      })
    ).toBe("printf '%s\\n' '[Prompt] /repo/pkg 대신 이 폴더'; claude '--resume' 's1'")
  })

  it('uses each Windows shell’s own print command', () => {
    expect(resume('claude', 'C:\\gone', 'C:\\repo', { shell: 'powershell' })).toMatch(
      /^Write-Output '\[Prompt\] Continuing in this folder, not C:\\gone where it last ran'; /
    )
    expect(resume('claude', 'C:\\gone', 'C:\\repo', { shell: 'cmd' })).toMatch(/^echo "/)
  })

  it('keeps Codex in the tab folder instead of asking for the old one (#17745)', () => {
    const command = resume('codex', '/repo-wt-gone', '/repo')
    expect(command).not.toContain('cd ')
    expect(command).toContain('tui.resume_cwd=current')
    expect(resume('codex', '/repo', '/repo')).not.toContain('tui.resume_cwd=current')
  })

  it('keeps other agents in the tab folder too', () => {
    expect(resume('opencode', '/repo-wt-gone', '/repo')).not.toContain('cd ')
  })

  it('still moves Gemini to its folder, which it needs to find the chat, unless that folder is gone', () => {
    expect(resume('gemini', '/repo/pkg', '/repo')).toMatch(/^cd '\/repo\/pkg'; /)
  })
})
