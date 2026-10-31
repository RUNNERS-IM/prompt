import type { HooksConfig } from '../agent-hooks/installer-utils'
import { isPlainObject } from '../agent-hooks/hooks-json-read'
import { claudeAgentViewChord, serializeClaudeAgentViewBindings } from './agent-view-keybindings'
import {
  CLAUDE_AGENT_VIEW_COMMAND,
  CLAUDE_AGENT_VIEW_LEGACY_NAME,
  CLAUDE_AGENT_VIEW_SHORTCUTS,
  normalizeClaudeAgentViewChord
} from '../../shared/claude-agent-view'

export function withClaudeAgentViewShortcut(config: HooksConfig): HooksConfig | null {
  const bindings = config.bindings ?? []
  if (
    !Array.isArray(bindings) ||
    bindings.some((block) => !isPlainObject(block) || !isPlainObject(block.bindings))
  ) {
    return null
  }
  const occupied = new Set<string>()
  for (const block of bindings) {
    for (const [chord, action] of Object.entries(block.bindings)) {
      if (block.context === 'Chat' && action === `command:${CLAUDE_AGENT_VIEW_COMMAND}`) {
        return config
      }
      occupied.add(normalizeClaudeAgentViewChord(chord))
    }
  }
  const shortcut = CLAUDE_AGENT_VIEW_SHORTCUTS.find(
    ({ chord }) =>
      ![...occupied].some(
        (key) =>
          key === normalizeClaudeAgentViewChord(chord) ||
          key.startsWith(`${normalizeClaudeAgentViewChord(chord)} `) ||
          normalizeClaudeAgentViewChord(chord).startsWith(`${key} `)
      )
  )
  return shortcut
    ? {
        ...config,
        bindings: [
          ...bindings,
          {
            context: 'Chat',
            bindings: { [shortcut.chord]: `command:${CLAUDE_AGENT_VIEW_COMMAND}` }
          }
        ]
      }
    : null
}

/** Marker `~/.claude/prompt-agent-view.json`: which shortcut Prompt added, and whether to retry. */
export const ownership = { owner: 'runners-im/prompt/claude-agent-view' }
export const markerName = 'prompt-agent-view.json'

/**
 * Marker `~/.claude/orca-agent-view.json`, written by upstream Orca and by Prompt before the
 * rename. Both wrote the same owner, so a legacy marker cannot tell which app made it.
 */
export const legacyOwnership = { owner: 'stablyai/orca/claude-agent-view' }
export const legacyMarkerName = 'orca-agent-view.json'

/** The keybinding action a marker's owner manages, or undefined for a foreign marker. */
function ownedAction(marker: HooksConfig): string | undefined {
  if (marker.owner === ownership.owner) {
    return `command:${CLAUDE_AGENT_VIEW_COMMAND}`
  }
  if (marker.owner === legacyOwnership.owner) {
    return `command:${CLAUDE_AGENT_VIEW_LEGACY_NAME}`
  }
  return undefined
}

function shortcutOwnership(config: HooksConfig, next: HooksConfig): HooksConfig {
  const block = config !== next && Array.isArray(next.bindings) ? next.bindings.at(-1) : undefined
  const chord =
    isPlainObject(block) && isPlainObject(block.bindings)
      ? Object.keys(block.bindings)[0]
      : undefined
  return {
    ...ownership,
    setup: 'attempted',
    ...(chord ? { binding: { context: 'Chat', chord } } : {})
  }
}

export function withoutOwnedBinding(config: HooksConfig, marker: HooksConfig): HooksConfig {
  const binding = isPlainObject(marker.binding) ? marker.binding : undefined
  const owned = ownedAction(marker)
  if (!owned || !binding || !Array.isArray(config.bindings)) {
    return config
  }
  return {
    ...config,
    bindings: config.bindings.flatMap((block) => {
      if (!isPlainObject(block) || !isPlainObject(block.bindings)) {
        return [block]
      }
      const remaining = Object.fromEntries(
        Object.entries(block.bindings).filter(
          ([chord, action]) =>
            block.context !== binding.context || chord !== binding.chord || action !== owned
        )
      )
      if (Object.keys(remaining).length === Object.keys(block.bindings).length) {
        return [block]
      }
      return Object.keys(remaining).length === 0 &&
        Object.keys(block).every((key) => key === 'context' || key === 'bindings')
        ? []
        : [{ ...block, bindings: remaining }]
    })
  }
}

/**
 * Point the legacy marker's recorded chord at the renamed command, when that exact chord still
 * runs `/orca-agent-view` in the same context. Returns null when the user removed the binding or
 * pointed the chord somewhere else, so nothing is recreated.
 */
function withMovedLegacyBinding(config: HooksConfig, legacy: HooksConfig): HooksConfig | null {
  const binding = isPlainObject(legacy.binding) ? legacy.binding : undefined
  if (!binding || !Array.isArray(config.bindings)) {
    return null
  }
  const legacyAction = `command:${CLAUDE_AGENT_VIEW_LEGACY_NAME}`
  let moved = false
  const bindings = config.bindings.map((block) => {
    if (
      !isPlainObject(block) ||
      !isPlainObject(block.bindings) ||
      block.context !== binding.context ||
      typeof binding.chord !== 'string' ||
      block.bindings[binding.chord] !== legacyAction
    ) {
      return block
    }
    moved = true
    return {
      ...block,
      bindings: { ...block.bindings, [binding.chord]: `command:${CLAUDE_AGENT_VIEW_COMMAND}` }
    }
  })
  return moved ? { ...config, bindings } : null
}

export type ClaudeAgentViewInstallPlan = {
  config: HooksConfig
  marker?: HooksConfig
  supported: boolean
  /** Delete the legacy marker after writing `marker` and the bindings. */
  retireLegacyMarker?: boolean
}

/**
 * Moving an install from the legacy marker (only when Prompt's own marker does not exist yet).
 *
 * Upstream Orca may share this `~/.claude`, and its marker is indistinguishable from the one
 * Prompt wrote before the rename. The rules keep both apps working:
 *  - The recorded chord still runs `/orca-agent-view`: Prompt takes that chord over (it now runs
 *    `/prompt-agent-view`) and deletes the legacy marker. If upstream Orca is still in use, its
 *    next start finds no marker, treats the install as new and adds its own binding on the next
 *    free default chord (Ctrl+Alt+H, then V), so Orca keeps a working shortcut.
 *  - The legacy marker is `pending` (the binding was removed because the feature was turned off,
 *    to be re-added when it is turned back on): Prompt installs as new and deletes the legacy
 *    marker. For Orca, no marker means the same thing as `pending`.
 *  - Otherwise the user removed the binding or pointed the chord somewhere else. Prompt records
 *    that in its own marker and does not recreate it, and keeps the legacy marker so Orca also
 *    keeps remembering the removal.
 * Prompt never edits or removes a binding that still runs `/orca-agent-view` in any other case.
 */
function planLegacyMigration(
  raw: string | null,
  config: HooksConfig,
  legacy: HooksConfig
): ClaudeAgentViewInstallPlan | 'install-fresh' {
  const moved = withMovedLegacyBinding(config, legacy)
  const binding = isPlainObject(legacy.binding) ? { binding: legacy.binding } : {}
  if (moved) {
    return {
      config: moved,
      marker: { ...ownership, setup: 'attempted', ...binding, migratedFrom: legacyMarkerName },
      supported: claudeAgentViewChord(serializeClaudeAgentViewBindings(raw, moved)) !== undefined,
      retireLegacyMarker: true
    }
  }
  if (legacy.setup === 'pending') {
    return 'install-fresh'
  }
  return {
    config,
    marker: { ...ownership, setup: 'attempted', ...binding, migratedFrom: legacyMarkerName },
    supported: claudeAgentViewChord(raw ?? '') !== undefined
  }
}

export function planClaudeAgentViewInstall(
  raw: string | null,
  config: HooksConfig,
  previous: HooksConfig | null | undefined,
  legacy?: HooksConfig | null
): ClaudeAgentViewInstallPlan {
  let retireLegacyMarker = false
  if (previous === undefined && legacy?.owner === legacyOwnership.owner) {
    const migration = planLegacyMigration(raw, config, legacy)
    if (migration !== 'install-fresh') {
      return migration
    }
    retireLegacyMarker = true
  }
  if (
    previous !== undefined &&
    (previous?.owner !== ownership.owner || previous.setup !== 'pending')
  ) {
    return { config, supported: claudeAgentViewChord(raw ?? '') !== undefined }
  }
  const next = withClaudeAgentViewShortcut(config)
  if (!next) {
    return { config, supported: false }
  }
  return {
    config: next,
    marker:
      config === next && previous?.owner === ownership.owner
        ? { ...previous, setup: 'attempted', cleanupPending: false }
        : shortcutOwnership(config, next),
    supported: claudeAgentViewChord(serializeClaudeAgentViewBindings(raw, next)) !== undefined,
    ...(retireLegacyMarker ? { retireLegacyMarker } : {})
  }
}

export function planClaudeAgentViewDisable(
  config: HooksConfig | null,
  marker: HooksConfig
): { config: HooksConfig | null; marker: HooksConfig } {
  const next = config && withoutOwnedBinding(config, marker)
  const removed = config && JSON.stringify(config) !== JSON.stringify(next)
  return {
    config: next,
    marker: { ...marker, ...(removed ? { setup: 'pending' } : {}), cleanupPending: !config }
  }
}
