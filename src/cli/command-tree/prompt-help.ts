import type { CommandSpec } from '../command-spec'

/** Top-level groups of the `prompt` tree, in the order `prompt --help` lists them. */
export const PROMPT_GROUPS: readonly (readonly [name: string, summary: string])[] = [
  ['app', 'Open, serve, update, and inspect the Prompt app'],
  ['project', 'Projects in the sidebar: git repositories and plain folders'],
  ['workspace', 'Workspaces (worktrees and folders) inside a project'],
  ['session', 'Agent conversations (Claude, Codex, ...) and their resume ids'],
  ['terminal', 'Terminals, including the ones sessions run in'],
  ['browser', 'Drive the built-in browser: tabs, pages, input, cookies'],
  ['computer', 'Drive desktop apps (computer use)'],
  ['emulator', 'Drive mobile emulators and simulators'],
  ['connect', 'Linear, Jira, and connector integrations'],
  ['automation', 'Scheduled agent automations'],
  ['orchestration', 'Coordinate several agents on one task'],
  ['skill', 'Agent skill guides bundled with Prompt'],
  ['account', 'Managed agent accounts'],
  ['env', 'Remote environments, hosts, and VM recipes'],
  ['util', 'Files, ports, search, references, artifacts, speech']
]

export const PROMPT_ROOT_HELP_TEXT = [
  'Usage: prompt <group> <command> [options]',
  '',
  ...PROMPT_GROUPS.map(([name, summary]) => `  ${name.padEnd(14)} ${summary}`),
  '',
  'Run `prompt <group> --help` for its commands. Pass --json for machine-readable output.'
].join('\n')

// Subgroups get one line in their parent's help instead of one line per command.
const SUBGROUP_SUMMARIES: Readonly<Record<string, string>> = {
  'app serve': 'Run Prompt as a headless runtime server',
  'app diagnostics': 'Collect diagnostics',
  'app terminal-daemon': 'Inspect or restart the terminal daemon',
  'app profile-state': 'Export or roll back profile state',
  'app agent-hooks': 'Agent status hooks',
  'project setup': 'Per-host project setups',
  'browser tab': 'Browser tabs and profiles',
  'browser identity': 'Browser identity',
  'browser cookie': 'Cookies',
  'browser intercept': 'Request interception',
  'browser capture': 'Network capture',
  'browser mouse': 'Low-level mouse input',
  'browser set': 'Device, network, and media emulation',
  'browser clipboard': 'Clipboard',
  'browser dialog': 'JavaScript dialogs',
  'browser storage': 'Local and session storage',
  'connect linear': 'Linear issues, teams, and comments',
  'connect jira': 'Jira issues, projects, and comments',
  'connect connector': 'Connector sessions',
  'env environment': 'Saved remote Prompt runtimes',
  'env host': 'Machines commands can target',
  'env vm': 'Per-workspace environment recipes',
  'util reference': 'Linked reviews and issues',
  'util file': 'Open files and diffs',
  'util artifacts': 'Shared artifacts',
  'util speech': 'Speech recognition keys'
}

export function promptSubgroupSummary(path: readonly string[], commandCount: number): string {
  return SUBGROUP_SUMMARIES[path.join(' ')] ?? `${commandCount} commands`
}

// Flag help for flags whose shared wording describes a different command.
const PROMPT_FLAG_HELP: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  name: {
    'project add': '--name <name>          Name shown in the sidebar',
    'project set': '--name <name>          Name shown in the sidebar',
    'project create': '--name <name>          Folder name to create',
    'session rename': '--name <name>          New session name ("" resets it)',
    'session resume': '--name <name>          Name for the reopened session'
  },
  kind: {
    'project add': '--kind git|folder      Register as a git repository or a plain folder',
    'project create': '--kind git|folder      Create a git repository or a plain folder'
  },
  path: { 'project add': '--path <path>          Folder to add' },
  project: {
    '*': '--project <project>    Project name, short id, full id, or project id',
    'workspace create': '--project <project>    Project name, short id, full id, or project id'
  },
  host: {
    'workspace create':
      '--host <host>          Create where the project is set up on this host (default: this computer)'
  },
  workspace: {
    '*': '--workspace <workspace> Workspace selector: name, short id, identity:<id>, path:<path>, branch:<branch>, or active'
  },
  session: {
    '*': '--session <session>    Session name, short id, full id, or resume id'
  },
  icon: {
    'project set':
      '--icon <file>          PNG/WebP file (shrunk to 96px on macOS), emoji:<emoji>, lucide:<Icon>, or none'
  },
  color: { 'project set': '--color <#hex>         Badge color, or none for the default' },
  'base-ref': { 'project set': '--base-ref <ref>       Default base ref for new workspaces' },
  url: { 'project clone': '--url <url>            Git URL to clone' },
  destination: { 'project clone': '--destination <dir>    Folder to clone into' },
  parent: { 'project create': '--parent <dir>         Folder to create the project in' },
  'resume-id': { 'session resume': '--resume-id <id>       Resume id from `prompt session list`' }
}

export function promptFlagHelp(spec: CommandSpec, shownFlag: string): string | null {
  const byCommand = PROMPT_FLAG_HELP[shownFlag]
  if (!byCommand) {
    return null
  }
  if (spec.handlerPath?.[0] !== 'prompt') {
    // Moved commands keep their own help unless reworded here; a respelled flag needs new wording.
    return (
      byCommand[spec.path.join(' ')] ??
      (spec.flagAliases?.[shownFlag] ? (byCommand['*'] ?? null) : null)
    )
  }
  return byCommand[spec.path.join(' ')] ?? byCommand['*'] ?? null
}
