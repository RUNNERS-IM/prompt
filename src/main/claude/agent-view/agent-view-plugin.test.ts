import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  ensureClaudeAgentViewPluginAsync,
  removeLegacyClaudeAgentViewPlugins
} from './agent-view-plugin'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function tempUserData(name: string): string {
  const root = mkdtempSync(join(tmpdir(), 'prompt-agent-view-plugin-'))
  roots.push(root)
  return join(root, name)
}

function writeLegacyPlugin(userData: string, version: string): string {
  const dir = join(userData, 'claude-agent-view', version, 'orca-agent-view')
  mkdirSync(join(dir, '.claude-plugin'), { recursive: true })
  writeFileSync(join(dir, '.claude-plugin', 'plugin.json'), '{"name":"orca-agent-view"}')
  return dir
}

it('names the plugin folder and manifest after Prompt', async () => {
  const userData = tempUserData('Prompt')
  const root = await ensureClaudeAgentViewPluginAsync(userData)
  expect(basename(root)).toBe('prompt-agent-view')
  const manifest = JSON.parse(readFileSync(join(root, '.claude-plugin', 'plugin.json'), 'utf8'))
  expect(manifest.name).toBe('prompt-agent-view')
  expect(manifest.description).toBe('Open Claude subagents from the Prompt sidebar')
  expect(JSON.stringify(manifest)).not.toMatch(/orca/i)
})

it('removes plugin folders left under the old name and keeps the current one', async () => {
  const userData = tempUserData('Prompt')
  const legacy = writeLegacyPlugin(userData, 'aaaaaaaaaaaaaaaaaaaa')
  const root = await ensureClaudeAgentViewPluginAsync(userData)
  expect(existsSync(legacy)).toBe(false)
  expect(existsSync(dirname(legacy))).toBe(false)
  expect(existsSync(join(root, 'hooks', 'register.js'))).toBe(true)
})

it('keeps a version folder that also holds something besides the old plugin', async () => {
  const userData = tempUserData('Prompt')
  const legacy = writeLegacyPlugin(userData, 'bbbbbbbbbbbbbbbbbbbb')
  writeFileSync(join(dirname(legacy), 'other.txt'), 'keep')
  await removeLegacyClaudeAgentViewPlugins(userData)
  expect(existsSync(legacy)).toBe(false)
  expect(readFileSync(join(dirname(legacy), 'other.txt'), 'utf8')).toBe('keep')
})

it('leaves old plugin folders alone while running from the shared orca data folder', async () => {
  const userData = tempUserData('orca')
  const legacy = writeLegacyPlugin(userData, 'cccccccccccccccccccc')
  await removeLegacyClaudeAgentViewPlugins(userData)
  expect(existsSync(legacy)).toBe(true)
})

it('does nothing when no plugin folder exists yet', async () => {
  await expect(removeLegacyClaudeAgentViewPlugins(tempUserData('Prompt'))).resolves.toBeUndefined()
})
