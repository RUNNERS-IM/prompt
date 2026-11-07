import { PROMPT_BLOCK_UPSTREAM_SERVICES } from '../../../../shared/prompt-upstream'

// Prompt keeps the pane header empty, split panes included (runners-wiki 2026-11-05 1C): hand-off,
// chat view and split live in menus and shortcuts, and a pane closes from its tab X or Cmd+W.
// Unit tests keep upstream behavior.
export const SHOWS_PANE_HEADER_ACTIONS = !PROMPT_BLOCK_UPSTREAM_SERVICES
