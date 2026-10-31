import { serializeClaudeAgentViewConfig } from './agent-view-config-lock'
import {
  ownership,
  markerName,
  legacyOwnership,
  legacyMarkerName,
  planClaudeAgentViewInstall,
  planClaudeAgentViewDisable,
  withoutOwnedBinding
} from './agent-view-binding-plan'
import { dirname, join, posix } from 'node:path'
import { existsSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { readFile, rm } from 'node:fs/promises'
import type { SFTPWrapper } from 'ssh2'
import {
  readHooksJson,
  writeHooksJson,
  writeHooksJsonAsync,
  type HooksConfig
} from '../agent-hooks/installer-utils'
import { parseHooksJsonText, readHooksJsonWithRaw } from '../agent-hooks/hooks-json-read'
import {
  parseClaudeAgentViewBindings,
  serializeClaudeAgentViewBindings
} from './agent-view-keybindings'
import {
  readHooksJsonRemote,
  readTextFileRemote,
  writeHooksJsonRemote,
  renamePlain
} from '../agent-hooks/installer-utils-remote'
import { CLAUDE_AGENT_VIEW_LEGACY_NAME } from '../../shared/claude-agent-view'
export { withClaudeAgentViewShortcut } from './agent-view-binding-plan'
export { ensureClaudeAgentViewPlugin } from './agent-view-plugin'

// The skills/orca-agent-view layout predates both markers and always carries the legacy owner.
function legacySkillsRoot(configDir: string): string {
  return join(configDir, 'skills', CLAUDE_AGENT_VIEW_LEGACY_NAME)
}

function readLegacySkillsMarker(root: string): HooksConfig | null {
  return readHooksJson(join(root, '.claude-plugin', 'orca-managed.json'))
}

// Called only after the user opts in; a surviving marker remembers deletions and edited chords.
export function installClaudeAgentView(configPath: string): boolean {
  const configDir = dirname(configPath)
  const keybindings = join(configDir, 'keybindings.json')
  const { raw } = readHooksJsonWithRaw(keybindings)
  const config = raw === null ? readHooksJson(keybindings) : parseClaudeAgentViewBindings(raw)
  if (!config) {
    return false
  }
  const marker = join(configDir, markerName)
  const legacyMarker = join(configDir, legacyMarkerName)
  const skillsRoot = legacySkillsRoot(configDir)
  const skills = readLegacySkillsMarker(skillsRoot)
  if (skills?.owner === legacyOwnership.owner) {
    // Fold the old layout into the legacy marker; the migration below then moves it over.
    writeHooksJson(legacyMarker, { ...skills, setup: 'attempted' })
    rmSync(skillsRoot, { recursive: true, force: true })
  }
  const previous = existsSync(marker) ? readHooksJson(marker) : undefined
  const legacy =
    previous === undefined && existsSync(legacyMarker) ? readHooksJson(legacyMarker) : undefined
  const plan = planClaudeAgentViewInstall(raw, config, previous, legacy)
  if (plan.marker) {
    writeHooksJson(marker, plan.marker)
    writeHooksJson(keybindings, plan.config, {
      serialized: serializeClaudeAgentViewBindings(raw, plan.config)
    })
  }
  if (plan.retireLegacyMarker) {
    rmSync(legacyMarker, { force: true })
  }
  return plan.supported
}

function removeOwnedBinding(configDir: string, markerPath: string, marker: HooksConfig): void {
  const keybindings = join(configDir, 'keybindings.json')
  const { raw } = readHooksJsonWithRaw(keybindings)
  const config = raw === null ? readHooksJson(keybindings) : parseClaudeAgentViewBindings(raw)
  const plan = planClaudeAgentViewDisable(config, marker)
  writeHooksJson(markerPath, plan.marker)
  if (plan.config && JSON.stringify(config) !== JSON.stringify(plan.config)) {
    writeHooksJson(keybindings, plan.config, {
      serialized: serializeClaudeAgentViewBindings(raw, plan.config)
    })
  }
}

/**
 * Removes Prompt's own shortcut (recorded in prompt-agent-view.json) and retires the old skills
 * layout. A binding recorded only in the legacy marker is left alone: once Prompt has run with
 * the feature on, a live one there is upstream Orca's or one the user changed.
 */
export function removeClaudeAgentView(configPath: string): void {
  const configDir = dirname(configPath)
  const skillsRoot = legacySkillsRoot(configDir)
  const skills = readLegacySkillsMarker(skillsRoot)
  if (skills?.owner === legacyOwnership.owner) {
    removeOwnedBinding(configDir, join(configDir, legacyMarkerName), skills)
    rmSync(skillsRoot, { recursive: true, force: true })
  }
  const markerPath = join(configDir, markerName)
  const marker = readHooksJson(markerPath)
  if (marker?.owner === ownership.owner) {
    removeOwnedBinding(configDir, markerPath, marker)
  }
}

function retirementMarker(
  previous: HooksConfig | null,
  retiring: HooksConfig,
  config: HooksConfig | null,
  owner: string
): HooksConfig {
  const removed = config && withoutOwnedBinding(config, retiring)
  return {
    ...(previous?.owner === owner ? previous : { ...retiring, setup: 'attempted' }),
    ...(config && JSON.stringify(config) !== JSON.stringify(removed) ? { setup: 'pending' } : {}),
    cleanupPending: !config
  }
}

export function refreshClaudeAgentView(configPath: string): Promise<void> {
  return serializeClaudeAgentViewConfig(configPath, async () => {
    // Legacy first: unchanged cleanup of what Orca-era builds left (old skills layout, and a
    // legacy marker whose binding removal could not finish).
    await retireClaudeAgentViewMarker(configPath, legacyOwnership.owner, legacyMarkerName, true)
    await retireClaudeAgentViewMarker(configPath, ownership.owner, markerName, false)
  })
}

async function retireClaudeAgentViewMarker(
  configPath: string,
  owner: string,
  name: string,
  withSkills: boolean
): Promise<void> {
  const configDir = dirname(configPath)
  const root = legacySkillsRoot(configDir)
  const skills = withSkills
    ? parseHooksJsonText(
        await readFile(join(root, '.claude-plugin', 'orca-managed.json'), 'utf8').catch(() => '{}')
      )
    : null
  const markerPath = join(configDir, name)
  const previous = parseHooksJsonText(await readFile(markerPath, 'utf8').catch(() => '{}'))
  const marker =
    skills?.owner === owner ? skills : previous?.cleanupPending === true ? previous : null
  if (marker?.owner !== owner) {
    return
  }
  const keybindings = join(configDir, 'keybindings.json')
  const raw = await readFile(keybindings, 'utf8').catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null
    }
    console.warn('[agent-hooks] Claude agent view binding cleanup deferred', error)
    return undefined
  })
  const config = raw === undefined ? null : parseClaudeAgentViewBindings(raw)
  await writeHooksJsonAsync(markerPath, retirementMarker(previous, marker, config, owner))
  if (config && raw !== undefined) {
    const next = withoutOwnedBinding(config, marker)
    if (JSON.stringify(config) !== JSON.stringify(next)) {
      await writeHooksJsonAsync(keybindings, next, {
        serialized: serializeClaudeAgentViewBindings(raw, next)
      })
    }
  }
  if (skills?.owner === owner) {
    await rm(root, { recursive: true, force: true })
  }
}

// Remote hosts never got the renamed install; this only retires what Orca-era builds left there,
// so it keeps looking for the legacy names.
export async function removeClaudeAgentViewRemote(
  sftp: SFTPWrapper,
  configPath: string
): Promise<void> {
  const configDir = posix.dirname(configPath)
  const root = posix.join(configDir, 'skills', CLAUDE_AGENT_VIEW_LEGACY_NAME)
  const legacy = await readHooksJsonRemote(
    sftp,
    posix.join(root, '.claude-plugin', 'orca-managed.json')
  )
  const markerPath = posix.join(configDir, legacyMarkerName)
  const previous = await readHooksJsonRemote(sftp, markerPath)
  const marker =
    legacy?.owner === legacyOwnership.owner
      ? legacy
      : previous?.cleanupPending === true
        ? previous
        : null
  if (marker?.owner !== legacyOwnership.owner) {
    return
  }
  const keybindings = posix.join(configDir, 'keybindings.json')
  const raw = await readTextFileRemote(sftp, keybindings).catch((error: unknown) => {
    console.warn('[agent-hooks] Remote Claude agent view binding cleanup deferred', error)
    return undefined
  })
  const config = raw === undefined ? null : parseClaudeAgentViewBindings(raw)
  await writeHooksJsonRemote(
    sftp,
    markerPath,
    retirementMarker(previous, marker, config, legacyOwnership.owner)
  )
  if (config && raw !== undefined) {
    const next = withoutOwnedBinding(config, marker)
    if (JSON.stringify(config) !== JSON.stringify(next)) {
      await writeHooksJsonRemote(sftp, keybindings, next, {
        serialized: serializeClaudeAgentViewBindings(raw, next)
      })
    }
  }
  if (legacy?.owner === legacyOwnership.owner) {
    await renamePlain(sftp, root, posix.join(configDir, `orca-agent-view-retired-${randomUUID()}`))
  }
}
