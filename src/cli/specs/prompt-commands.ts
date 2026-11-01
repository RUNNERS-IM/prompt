import type { CommandSpec } from '../args'
import { GLOBAL_FLAGS, LOCAL_COMMAND_FLAGS } from '../args'
import { TERMINAL_SEND_COMMAND_SPEC } from './terminal-send'

// Commands that exist only in the `prompt` tree; their handlers live under the `prompt` key prefix.
function promptSpec(spec: Omit<CommandSpec, 'handlerPath'>): CommandSpec {
  return { ...spec, handlerPath: ['prompt', ...spec.path] }
}

const SELECTOR_NOTE =
  'Selectors accept a name, a short id prefix (6+ characters, like a git short sha), or the full id. When more than one item matches, nothing runs and the command fails with code `ambiguous` and the candidates. Scripts should pass full ids from --json.'

const PROJECT_ID_NOTE =
  'A project also answers to its project id, the projectId field of `prompt project list --json` (repo:<id> for a folder or a repository without a remote, github:owner/name for a GitHub repository).'

const SESSION_SELECTOR_NOTE =
  'A session is an agent conversation (Claude, Codex, ...) running in a terminal. <session> takes its name, a short id prefix, the full terminal id, or its resume id. Omit it to use the session in the current terminal.'

function sessionSpec(
  verb: string,
  summary: string,
  usage: string,
  flags: readonly string[],
  extra: Partial<CommandSpec> = {}
): CommandSpec {
  return promptSpec({
    path: ['session', verb],
    summary,
    usage,
    allowedFlags: [...GLOBAL_FLAGS, 'session', ...flags],
    positionalArgs: ['session'],
    notes: [SESSION_SELECTOR_NOTE, ...(extra.notes ?? [])],
    ...(extra.examples ? { examples: extra.examples } : {}),
    ...(extra.destructive ? { destructive: true } : {})
  })
}

const SEND_FLAGS = TERMINAL_SEND_COMMAND_SPEC.allowedFlags.filter(
  (flag) => !GLOBAL_FLAGS.includes(flag) && flag !== 'terminal'
)

export const PROMPT_NEW_COMMAND_SPECS: CommandSpec[] = [
  promptSpec({
    path: ['app', 'version'],
    summary: 'Print the version of this Prompt CLI',
    usage: 'prompt app version [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS]
  }),
  promptSpec({
    path: ['app', 'update'],
    summary: 'Download the newest Prompt release, install it, and restart the app',
    usage: 'prompt app update [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'Asks the running Prompt app to check for a new release. When there is one, it downloads it (waiting up to 10 minutes), then quits and restarts on the new version the same way the Install button does. Open terminals and sessions are handled as that button handles them.',
      'Prints `Prompt is already up to date (<version>).` when there is nothing to install, or `Installing Prompt <version> and restarting.` just before the app quits.',
      '--json prints result.status (up-to-date or installing) and result.version; installing also has result.fromVersion.',
      'A failed check or download fails the command with code `update_check_failed` or `update_download_failed`.'
    ],
    examples: ['prompt app update', 'ssh office-mac prompt app update --json']
  }),
  promptSpec({
    path: ['project', 'list'],
    summary: 'List projects and the hosts each is set up on',
    usage: 'prompt project list [--json]',
    allowedFlags: [...GLOBAL_FLAGS],
    notes: [
      'HOST shows where each project is set up: this machine, an SSH target, or a paired server. A project set up on several hosts lists them comma-separated, with the state of any host that is not ready, e.g. `this machine, gpu-box (not set up)`.',
      '--json lists projects under result.items, each with id, name, kind, path, projectId, and hosts. hosts holds { id, name, state } per host; id is the value --host takes. projectId is the project id that `prompt project setup`, `prompt workspace create --project`, and `prompt automation` flags take.',
      'A project that is set up only as a host setup, with no folder in the sidebar, is listed with its project id as id.'
    ],
    examples: ['prompt project list', 'prompt project list --json']
  }),
  promptSpec({
    path: ['project', 'add'],
    summary: 'Add a git repository or a plain folder as a project',
    usage: 'prompt project add <path> [--kind git|folder] [--name <name>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'path', 'kind', 'name'],
    positionalArgs: ['path'],
    notes: [
      '--kind folder registers a folder that is not a git repository; without --kind, Prompt detects it.',
      '--name sets the name shown in the sidebar; it defaults to the folder name.'
    ],
    examples: [
      'prompt project add ~/src/app',
      'prompt project add ~/Documents/notes --kind folder --name "Notes" --json'
    ]
  }),
  promptSpec({
    path: ['project', 'show'],
    summary: 'Show one project',
    usage: 'prompt project show <project> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'project'],
    positionalArgs: ['project'],
    notes: [SELECTOR_NOTE, PROJECT_ID_NOTE]
  }),
  promptSpec({
    path: ['project', 'set'],
    summary: 'Change a project name, icon, color, base ref, or worktree visibility',
    usage:
      'prompt project set <project> [--name <name>] [--icon <file>|emoji:<emoji>|lucide:<Icon>|none] [--color <#hex>|none] [--base-ref <ref>] [--external-worktree-visibility show|hide|inherit] [--json]',
    allowedFlags: [
      ...GLOBAL_FLAGS,
      'project',
      'name',
      'icon',
      'color',
      'base-ref',
      'external-worktree-visibility'
    ],
    positionalArgs: ['project'],
    notes: [
      SELECTOR_NOTE,
      PROJECT_ID_NOTE,
      '--icon <file> takes a PNG or WebP image. On macOS a file over 256 KB or over 96px on its longest side is shrunk to a 96px PNG first; elsewhere it must be at most 256 KB. emoji:<emoji> and lucide:<IconName> pick a built-in icon; none restores the default.',
      '--color takes a hex color such as #22c55e; none restores the default.',
      '--base-ref sets the default base ref for new workspaces.'
    ],
    examples: [
      'prompt project set app --icon ~/Pictures/app.png',
      'prompt project set 3f2a9c --name "App" --color #22c55e --json'
    ]
  }),
  promptSpec({
    path: ['project', 'remove'],
    destructive: true,
    summary: 'Remove a project from the sidebar (files on disk are kept)',
    usage: 'prompt project remove <project> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'project'],
    positionalArgs: ['project'],
    notes: [SELECTOR_NOTE, PROJECT_ID_NOTE]
  }),
  promptSpec({
    path: ['project', 'clone'],
    summary: 'Clone a git repository and add it as a project',
    usage: 'prompt project clone <url> --destination <dir> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'url', 'destination'],
    positionalArgs: ['url'],
    examples: ['prompt project clone https://github.com/owner/app.git --destination ~/src']
  }),
  promptSpec({
    path: ['project', 'create'],
    summary: 'Create a new folder or git repository and add it as a project',
    usage: 'prompt project create <name> --parent <dir> [--kind git|folder] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'name', 'parent', 'kind'],
    positionalArgs: ['name'],
    examples: ['prompt project create notes --parent ~/Documents --kind folder']
  }),
  promptSpec({
    path: ['workspace', 'list'],
    summary: 'List workspaces (worktrees and folders)',
    usage: 'prompt workspace list [--project <project>] [--limit <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'limit'],
    notes: [
      SELECTOR_NOTE,
      PROJECT_ID_NOTE,
      '--json lists workspaces under result.items, each with id, name, project, branch, and path.'
    ]
  }),
  promptSpec({
    path: ['terminal', 'list'],
    summary: 'List live terminals without their output',
    usage: 'prompt terminal list [--workspace <workspace>] [--limit <n>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'workspace', 'limit'],
    notes: [
      '--json lists terminals under result.items, each with id, name, project, workspace, agent, state, and lastOutputAt.',
      'Use `prompt terminal read <terminal>` for output.'
    ]
  }),
  promptSpec({
    path: ['session', 'list'],
    summary: 'List agent sessions and their resume ids',
    usage: 'prompt session list [--project <project>] [--workspace <workspace>] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'project', 'workspace'],
    notes: [
      'Lists terminals running an agent. resumeId is the id `prompt session resume` takes; it is empty until the agent reports it.',
      '--json lists sessions under result.items, each with id, name, agent, project, workspace, state, resumeId, and lastOutputAt.',
      'Use `prompt session read <session>` for the conversation output.'
    ]
  }),
  promptSpec({
    path: ['session', 'resume'],
    summary: 'Reopen an earlier agent conversation in a new terminal',
    usage:
      'prompt session resume <resume-id> [--agent claude|codex] [--workspace <workspace>] [--name <name>] [--focus] [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'resume-id', 'agent', 'workspace', 'name', 'focus'],
    positionalArgs: ['resume-id'],
    notes: [
      '--agent defaults to claude. The conversation reopens in the workspace that contains the current directory unless --workspace names another; agents look up the conversation by that folder.',
      'Refuses when a live session already has this resume id; use that session instead.'
    ],
    examples: [
      'prompt session resume 0f5c2d1e-7a4b-4c1e-9d0a-2b6f8e3c1a77',
      'prompt session resume 0f5c2d1e-7a4b-4c1e-9d0a-2b6f8e3c1a77 --workspace app --focus'
    ]
  }),
  promptSpec({
    path: ['session', 'move'],
    summary: 'Move a session to another workspace',
    usage: 'prompt session move <session> --workspace <workspace> [--json]',
    allowedFlags: [...GLOBAL_FLAGS, 'session', 'workspace'],
    positionalArgs: ['session'],
    notes: [
      'Moves the tab and its shell to the target workspace on this computer. A session that is running a program is not moved: the command fails with code `not_moved` and the reason, and changes nothing.'
    ]
  }),
  sessionSpec(
    'close',
    'Close a session and its tab, and wait until the close is saved',
    'prompt session close [<session>] [--json]',
    [],
    { destructive: true, examples: ['prompt session close 3f2a9c'] }
  ),
  sessionSpec(
    'rename',
    'Rename a session',
    'prompt session rename [<session>] --name <name> [--json]',
    ['name'],
    { notes: ['Pass an empty --name to return to the automatic name.'] }
  ),
  sessionSpec(
    'read',
    "Read a session's recent output",
    'prompt session read [<session>] [--cursor <n>] [--limit <n>] [--screen] [--json]',
    ['cursor', 'limit', 'screen'],
    { notes: ['Takes the same reading flags as `prompt terminal read`.'] }
  ),
  sessionSpec(
    'send',
    'Send a message or keys to a session',
    'prompt session send [<session>] [--text <text>] [--enter] [--interrupt] [--wait-submit <seconds>] [--retry-request <id>] [--json]',
    SEND_FLAGS,
    {
      notes: ['Takes the same flags as `prompt terminal send`.'],
      examples: ['prompt session send app --text "Run the tests" --enter']
    }
  ),
  sessionSpec(
    'wait',
    'Wait until a session is idle or has exited',
    'prompt session wait [<session>] --for exit|tui-idle [--timeout-ms <ms>] [--json]',
    ['for', 'timeout-ms']
  )
]
