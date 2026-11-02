import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { claudeAgentViewChord } from './agent-view-keybindings'
import { installClaudeAgentView, removeClaudeAgentView } from './agent-view-install'
import { reconcileClaudeAgentViewConfig } from './agent-view-config'

// Moving installs made before the rename (orca-agent-view.json + command:orca-agent-view) to
// prompt-agent-view.json + command:prompt-agent-view. Runs for both the local async path
// (reconcileClaudeAgentViewConfig) and the WSL relay's sync path (installClaudeAgentView).

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

const LEGACY_OWNER = 'stablyai/orca/claude-agent-view'

function setup(legacy: object | null, keybindings: string | null) {
  const dir = mkdtempSync(join(tmpdir(), 'prompt-agent-view-migration-'))
  roots.push(dir)
  if (legacy) {
    writeFileSync(join(dir, 'orca-agent-view.json'), JSON.stringify(legacy))
  }
  if (keybindings !== null) {
    writeFileSync(join(dir, 'keybindings.json'), keybindings)
  }
  return {
    settings: join(dir, 'settings.json'),
    keybindingsPath: join(dir, 'keybindings.json'),
    legacyPath: join(dir, 'orca-agent-view.json'),
    markerPath: join(dir, 'prompt-agent-view.json'),
    read: (name: string) => readFileSync(join(dir, name), 'utf8')
  }
}

const binding = (chord: string, action: string, context = 'Chat') =>
  JSON.stringify({ bindings: [{ context, bindings: { [chord]: action } }] })

const paths = {
  async: (settings: string) => reconcileClaudeAgentViewConfig(settings, true),
  sync: async (settings: string) => {
    installClaudeAgentView(settings)
  }
}

describe.each(Object.entries(paths))('%s install path', (_name, enable) => {
  it('moves the recorded chord from /orca-agent-view to /prompt-agent-view', async () => {
    const original = `{
  // my shortcuts
  "bindings": [
    { "context": "Chat", "bindings": { "ctrl+k": "command:user", "ctrl+alt+g": "command:orca-agent-view" } }
  ]
}`
    const env = setup(
      {
        owner: LEGACY_OWNER,
        setup: 'attempted',
        binding: { context: 'Chat', chord: 'ctrl+alt+g' }
      },
      original
    )
    await enable(env.settings)
    const moved = env.read('keybindings.json')
    expect(moved).toContain('// my shortcuts')
    expect(moved).toContain('"ctrl+k": "command:user"')
    expect(moved).toContain('"ctrl+alt+g": "command:prompt-agent-view"')
    expect(moved).not.toContain('orca-agent-view')
    expect(claudeAgentViewChord(moved)).toBe('ctrl+alt+g')
    expect(JSON.parse(env.read('prompt-agent-view.json'))).toEqual({
      owner: 'runners-im/prompt/claude-agent-view',
      setup: 'attempted',
      binding: { context: 'Chat', chord: 'ctrl+alt+g' },
      migratedFrom: 'orca-agent-view.json'
    })
    expect(existsSync(env.legacyPath)).toBe(false)
    // A second launch changes nothing.
    await enable(env.settings)
    expect(env.read('keybindings.json')).toBe(moved)
  })

  it('does not recreate a shortcut the user deleted, and keeps the legacy marker', async () => {
    const legacy = {
      owner: LEGACY_OWNER,
      setup: 'attempted',
      binding: { context: 'Chat', chord: 'ctrl+alt+g' }
    }
    const env = setup(legacy, '{"bindings": []}')
    await enable(env.settings)
    expect(env.read('keybindings.json')).toBe('{"bindings": []}')
    expect(JSON.parse(env.read('prompt-agent-view.json'))).toMatchObject({
      owner: 'runners-im/prompt/claude-agent-view',
      setup: 'attempted',
      binding: { context: 'Chat', chord: 'ctrl+alt+g' }
    })
    expect(JSON.parse(env.read('orca-agent-view.json'))).toEqual(legacy)
    await enable(env.settings)
    expect(env.read('keybindings.json')).toBe('{"bindings": []}')
  })

  it.each([
    ['pointed at another command', binding('ctrl+alt+g', 'command:user')],
    ['moved to another chord', binding('ctrl+x', 'command:orca-agent-view')],
    ['moved to another context', binding('ctrl+alt+g', 'command:orca-agent-view', 'Global')]
  ])('leaves a shortcut the user %s alone', async (_case, original) => {
    const env = setup(
      {
        owner: LEGACY_OWNER,
        setup: 'attempted',
        binding: { context: 'Chat', chord: 'ctrl+alt+g' }
      },
      original
    )
    await enable(env.settings)
    expect(env.read('keybindings.json')).toBe(original)
    expect(existsSync(env.legacyPath)).toBe(true)
    expect(JSON.parse(env.read('prompt-agent-view.json')).setup).toBe('attempted')
  })

  it('installs as new when the legacy marker waits to re-add its shortcut', async () => {
    const env = setup(
      { owner: LEGACY_OWNER, setup: 'pending', binding: { context: 'Chat', chord: 'ctrl+alt+g' } },
      '{"bindings": []}'
    )
    await enable(env.settings)
    expect(JSON.parse(env.read('keybindings.json')).bindings).toEqual([
      { context: 'Chat', bindings: { 'ctrl+alt+g': 'command:prompt-agent-view' } }
    ])
    expect(existsSync(env.legacyPath)).toBe(false)
    expect(JSON.parse(env.read('prompt-agent-view.json')).owner).toBe(
      'runners-im/prompt/claude-agent-view'
    )
  })

  it('ignores a legacy-named marker another tool wrote', async () => {
    const env = setup(
      { owner: 'someone-else', binding: { context: 'Chat', chord: 'ctrl+alt+g' } },
      binding('ctrl+alt+g', 'command:orca-agent-view')
    )
    await enable(env.settings)
    expect(JSON.parse(env.read('keybindings.json')).bindings).toEqual([
      { context: 'Chat', bindings: { 'ctrl+alt+g': 'command:orca-agent-view' } },
      { context: 'Chat', bindings: { 'ctrl+alt+h': 'command:prompt-agent-view' } }
    ])
    expect(JSON.parse(env.read('orca-agent-view.json')).owner).toBe('someone-else')
  })

  it('takes the next free chord when an unmigrated Orca binding holds Ctrl+Alt+G', async () => {
    // No legacy marker: for example upstream Orca re-added its own binding after a migration.
    const env = setup(null, binding('ctrl+alt+g', 'command:orca-agent-view'))
    await enable(env.settings)
    expect(JSON.parse(env.read('keybindings.json')).bindings).toEqual([
      { context: 'Chat', bindings: { 'ctrl+alt+g': 'command:orca-agent-view' } },
      { context: 'Chat', bindings: { 'ctrl+alt+h': 'command:prompt-agent-view' } }
    ])
  })
})

describe('after the move', () => {
  it('turning the feature off removes only the renamed binding, and on again restores it', async () => {
    const env = setup(
      {
        owner: LEGACY_OWNER,
        setup: 'attempted',
        binding: { context: 'Chat', chord: 'ctrl+alt+g' }
      },
      binding('ctrl+alt+g', 'command:orca-agent-view')
    )
    await reconcileClaudeAgentViewConfig(env.settings, true)
    // Upstream Orca, finding no marker, adds its own binding on the next free chord.
    const withOrca = JSON.parse(env.read('keybindings.json'))
    withOrca.bindings.push({
      context: 'Chat',
      bindings: { 'ctrl+alt+h': 'command:orca-agent-view' }
    })
    writeFileSync(env.keybindingsPath, JSON.stringify(withOrca))
    await reconcileClaudeAgentViewConfig(env.settings, false)
    expect(JSON.parse(env.read('keybindings.json')).bindings).toEqual([
      { context: 'Chat', bindings: { 'ctrl+alt+h': 'command:orca-agent-view' } }
    ])
    await reconcileClaudeAgentViewConfig(env.settings, true)
    expect(JSON.parse(env.read('keybindings.json')).bindings).toEqual([
      { context: 'Chat', bindings: { 'ctrl+alt+h': 'command:orca-agent-view' } },
      { context: 'Chat', bindings: { 'ctrl+alt+g': 'command:prompt-agent-view' } }
    ])
  })
})

describe('legacy marker without a move', () => {
  it('turning the feature off before any move leaves the legacy binding alone', async () => {
    const original = binding('ctrl+alt+g', 'command:orca-agent-view')
    const env = setup(
      {
        owner: LEGACY_OWNER,
        setup: 'attempted',
        binding: { context: 'Chat', chord: 'ctrl+alt+g' }
      },
      original
    )
    await reconcileClaudeAgentViewConfig(env.settings, false)
    expect(env.read('keybindings.json')).toBe(original)
    expect(existsSync(env.markerPath)).toBe(false)
  })

  it('removing hooks leaves a binding recorded only in the legacy marker', () => {
    const original = binding('ctrl+alt+g', 'command:orca-agent-view')
    const env = setup(
      {
        owner: LEGACY_OWNER,
        setup: 'attempted',
        binding: { context: 'Chat', chord: 'ctrl+alt+g' }
      },
      original
    )
    removeClaudeAgentView(env.settings)
    expect(env.read('keybindings.json')).toBe(original)
  })

  it('recognizes the old command only when asked for it', () => {
    const old = binding('ctrl+alt+g', 'command:orca-agent-view')
    expect(claudeAgentViewChord(old)).toBeUndefined()
    expect(claudeAgentViewChord(old, 'orca-agent-view')).toBe('ctrl+alt+g')
  })
})
