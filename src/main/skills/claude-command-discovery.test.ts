import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { DiscoveredSkill, SkillDiscoveryResult } from '../../shared/skills'
import { withClaudeCommands } from './claude-command-discovery'

function skillAt(rootPath: string, directoryPath: string, name: string): DiscoveredSkill {
  return {
    id: directoryPath,
    name,
    description: null,
    providers: ['claude'],
    sourceKind: 'home',
    sourceLabel: 'Claude Code',
    rootPath,
    directoryPath,
    skillFilePath: join(directoryPath, 'SKILL.md'),
    installed: true,
    updatedAt: null
  }
}

describe('withClaudeCommands', () => {
  it('names nested commands with colons and drops skill copies Claude Code never loads', async () => {
    const claude = mkdtempSync(join(tmpdir(), 'claude-commands-'))
    const skillsRoot = join(claude, 'skills')
    mkdirSync(join(claude, 'commands', 'git'), { recursive: true })
    writeFileSync(join(claude, 'commands', 'deploy.md'), '---\ndescription: Ship it\n---\nBody')
    writeFileSync(join(claude, 'commands', 'git', 'push.md'), 'Push it')
    writeFileSync(join(claude, 'commands', 'notes.txt'), 'Not a command')
    const result = {
      skills: [
        skillAt(skillsRoot, join(skillsRoot, 'ask-draft'), 'ask-draft'),
        skillAt(skillsRoot, join(skillsRoot, 'synced', 'a', 'pdf'), 'pdf')
      ],
      sources: [{ id: 'home-claude', path: skillsRoot }]
    } as unknown as SkillDiscoveryResult

    const { skills } = await withClaudeCommands(result)

    expect(skills.map((skill) => skill.name).sort()).toEqual(['/deploy', '/git:push', 'ask-draft'])
    const deploy = skills.find((skill) => skill.name === '/deploy')
    expect(deploy).toMatchObject({ claudeCommand: true, description: 'Ship it' })
  })
})
