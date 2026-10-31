import { basename, join } from 'node:path'
import { createHash } from 'node:crypto'
import { readdir, rm, rmdir } from 'node:fs/promises'
import { writeHooksJson, writeManagedScript } from '../agent-hooks/installer-utils'
import { writeHooksJsonAsync } from '../agent-hooks/hooks-json-write-async'
import {
  CLAUDE_AGENT_VIEW_LEGACY_NAME,
  CLAUDE_AGENT_VIEW_PLUGIN
} from '../../shared/claude-agent-view'
import { PROMPT_APP_NAME } from '../../shared/prompt-brand'
import { LEGACY_USER_DATA_DIR_NAME } from '../../shared/prompt-user-data-location'
import { CLAUDE_AGENT_VIEW_MOD_SOURCE } from './agent-view-mod-source'

export const CLAUDE_AGENT_VIEW_PLUGIN_FILES: Record<string, string> = {
  '.claude-plugin/plugin.json': JSON.stringify({
    name: CLAUDE_AGENT_VIEW_PLUGIN,
    version: '0.2.0',
    description: `Open Claude subagents from the ${PROMPT_APP_NAME} sidebar`,
    author: { name: 'RUNNERS-IM' },
    license: 'MIT'
  }),
  'hooks/hooks.json': JSON.stringify({ modules: ['./register.js'] }),
  'hooks/register.js': CLAUDE_AGENT_VIEW_MOD_SOURCE
}

export function ensureClaudeAgentViewPlugin(
  userDataPath: string,
  source = CLAUDE_AGENT_VIEW_MOD_SOURCE
): string {
  const files = { ...CLAUDE_AGENT_VIEW_PLUGIN_FILES, 'hooks/register.js': source }
  const version = createHash('sha256').update(JSON.stringify(files)).digest('hex').slice(0, 20)
  const root = join(userDataPath, 'claude-agent-view', version, CLAUDE_AGENT_VIEW_PLUGIN)
  for (const [path, content] of Object.entries(files)) {
    if (path.endsWith('.json')) {
      writeHooksJson(join(root, path), {}, { serialized: content })
    } else {
      writeManagedScript(join(root, path), content)
    }
  }
  return root
}

export async function ensureClaudeAgentViewPluginAsync(userDataPath: string): Promise<string> {
  const version = createHash('sha256')
    .update(JSON.stringify(CLAUDE_AGENT_VIEW_PLUGIN_FILES))
    .digest('hex')
    .slice(0, 20)
  const root = join(userDataPath, 'claude-agent-view', version, CLAUDE_AGENT_VIEW_PLUGIN)
  for (const [path, content] of Object.entries(CLAUDE_AGENT_VIEW_PLUGIN_FILES)) {
    await writeHooksJsonAsync(join(root, path), {}, { serialized: content })
  }
  await removeLegacyClaudeAgentViewPlugins(userDataPath)
  return root
}

/**
 * Delete `claude-agent-view/<hash>/orca-agent-view` folders written before the plugin was renamed.
 * Nothing launches with them any more; their `/orca-agent-view` command no longer matches the
 * shortcut, which now points at `/prompt-agent-view`.
 *
 * Skipped while Prompt still runs from the inherited `orca` data folder (the move to `Prompt`
 * failed or was deferred): upstream Orca writes the same folders there and may be using them.
 * Only the local copy is cleaned; WSL relays keep theirs because `~/.orca-relay` may be shared
 * with upstream Orca.
 */
export async function removeLegacyClaudeAgentViewPlugins(userDataPath: string): Promise<void> {
  if (basename(userDataPath) === LEGACY_USER_DATA_DIR_NAME) {
    return
  }
  const parent = join(userDataPath, 'claude-agent-view')
  const versions = await readdir(parent).catch(() => [] as string[])
  for (const version of versions) {
    const dir = join(parent, version)
    try {
      await rm(join(dir, CLAUDE_AGENT_VIEW_LEGACY_NAME), { recursive: true, force: true })
      // Fails with ENOTEMPTY when a renamed plugin lives in the same version folder.
      await rmdir(dir)
    } catch {
      // Best effort: a later launch tries again.
    }
  }
}
