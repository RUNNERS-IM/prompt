import { readdir, readFile, stat } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { summarizeSkillMarkdown } from '../../shared/skill-metadata'
import type { DiscoveredSkill, SkillDiscoveryResult } from '../../shared/skills'
import { sortDiscoveredSkills } from './skill-discovery-sources'

const MAX_COMMAND_FILES = 500

async function listCommandFiles(directory: string, found: string[] = []): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (found.length >= MAX_COMMAND_FILES) {
      break
    }
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      await listCommandFiles(path, found)
    } else if (entry.name.endsWith('.md')) {
      found.push(path)
    }
  }
  return found
}

async function readCommand(
  commandsRoot: string,
  skillsRoot: string,
  skillFilePath: string
): Promise<DiscoveredSkill | null> {
  try {
    const [markdown, info] = await Promise.all([
      readFile(skillFilePath, 'utf8'),
      stat(skillFilePath)
    ])
    // Claude Code names nested command files with colons: commands/git/push.md is /git:push.
    const name = relative(commandsRoot, skillFilePath).slice(0, -3).split(sep).join(':')
    return {
      id: `claude-command:${skillFilePath}`,
      name: `/${name}`,
      description: summarizeSkillMarkdown(markdown).description,
      providers: ['claude'],
      sourceKind: 'home',
      sourceLabel: 'Claude Code',
      rootPath: skillsRoot,
      directoryPath: dirname(skillFilePath),
      skillFilePath,
      installed: true,
      updatedAt: info.mtimeMs,
      claudeCommand: true
    }
  } catch {
    return null
  }
}

/** Lists what Claude Code really offers, using the skills root the scan already resolved so a relocated config directory is honored. */
export async function withClaudeCommands(
  result: SkillDiscoveryResult
): Promise<SkillDiscoveryResult> {
  const skillsRoot = result.sources.find((source) => source.id === 'home-claude')?.path
  if (!skillsRoot) {
    return result
  }
  // Claude Code loads only skills/<name>/SKILL.md; deeper copies such as skills/synced/* never run.
  const skills = result.skills.filter(
    (skill) => skill.rootPath !== skillsRoot || dirname(skill.directoryPath) === skillsRoot
  )
  const commandsRoot = join(dirname(skillsRoot), 'commands')
  const files = await listCommandFiles(commandsRoot)
  const commands = await Promise.all(
    files.map((file) => readCommand(commandsRoot, skillsRoot, file))
  )
  return {
    ...result,
    skills: sortDiscoveredSkills([...skills, ...commands.filter((command) => command !== null)])
  }
}
