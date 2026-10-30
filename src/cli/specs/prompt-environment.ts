import type { CommandSpec } from '../args'
import { LOCAL_COMMAND_FLAGS } from '../args'

export const PROMPT_ENVIRONMENT_COMMAND_SPECS: CommandSpec[] = [
  {
    path: ['environment', 'share'],
    summary: 'Print a pairing link for this computer, advertised at the given address',
    usage: 'orca environment share --address <host> [--json]',
    allowedFlags: [...LOCAL_COMMAND_FLAGS, 'address'],
    notes: [
      'Asks the app already running on this computer, over its local socket, to create a runtime pairing link. Paired clients and remote connections are refused.',
      'Opens this computer to the network the same way "Share this computer" does. The link reaches <host> on the runtime port (6768 by default).',
      'Running it again before anyone pairs prints the same link. Revoke links in the share dialog.',
      'Typical use over SSH: `ssh other-mac orca environment share --address other-mac`, then `orca environment add --name other-mac --pairing-code <link>` here.'
    ],
    examples: [
      'orca environment share --address m2-pro-1',
      'orca environment share --address 100.64.0.7 --json'
    ]
  }
]
