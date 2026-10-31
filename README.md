<h1 align="center">
  <img src="resources/build/icon.png" alt="" width="64" valign="middle" /> Prompt
</h1>

<p align="center">
  A Mac terminal that runs many Claude Code sessions, grouped by project, in one window.<br/>
  <a href="https://runners.im/prompt">runners.im/prompt</a>
</p>

<p align="center">
  <sub>English · <a href="docs/readme/README.ko.md">한국어</a></sub>
</p>

<!-- Screenshot from runners.im/prompt goes here. -->

## 1. Install

Prompt is published on [GitHub Releases](https://github.com/RUNNERS-IM/prompt/releases/latest).

**macOS (Apple silicon):** download
[`prompt-macos-arm64.dmg`](https://github.com/RUNNERS-IM/prompt/releases/latest/download/prompt-macos-arm64.dmg),
open it and drag Prompt into Applications. The Mac build is signed with a Developer ID and
notarized by Apple, so it opens without a security warning.

The same release page also has these builds:

- **Windows (x64):** `prompt-windows-setup.exe`. It is not code-signed yet, so Windows SmartScreen
  shows a warning the first time. Choose "More info", then "Run anyway".
- **Linux (x64):** `prompt-linux.AppImage`, plus `.deb` and `.rpm` packages.

There is no Intel Mac build at the moment.

**Updates:** Prompt checks the same GitHub Releases page for new versions and offers to install
them. You can also check by hand from the menu bar icon or the app menu ("Check for Updates").

## 2. What you can do

1. **See every session by project in the sidebar.** The sidebar has two levels: a row for each
   project, and under it one row per Claude session. Each session row shows its name, how long
   ago it was active, what it is doing now, and a status icon (working, waiting for your answer,
   done, failed).
2. **Manage sessions from the sidebar.** Right-click a session to rename it, give its tab a color,
   copy it into a new window, or close it. A project row has a menu for starting a new session.
3. **Choose the Claude model per session.** Each session has a model menu. Picking a model types
   `/model` into that Claude session for you. Tabs and sidebar rows show the model only when it is
   not the default one.
4. **Use several windows.** Open a new window, move a tab to another window or to a new one, and
   open a project in its own window. With "Remember Open Windows" in Settings, Prompt reopens the
   windows with their tabs, size and position the next time it starts.
5. **Switch Claude accounts and watch usage.** The status bar at the bottom shows Claude usage and
   lets you switch between Claude accounts. Accounts are added in Settings.
6. **See from the menu bar that Claude is working.** The `>_` icon in the macOS menu bar blinks its
   cursor while an agent is working, and stays still when everything is idle.
7. **Split terminals.** One tab can hold several terminal panes side by side.
8. **Use a Mac-style interface.** Prompt uses the system font, your macOS accent color, and follows
   the system light or dark mode. The terminal uses the "Prompt Dark" theme by default.
9. **Use it in Korean.** The interface is available in Korean and other languages, and Korean
   strings missing upstream are filled in.

## 3. CLI

Prompt includes a command line tool. **It is still called `orca`** (the name it has in Orca), and
it is being redesigned, so command names may change.

- Terminals opened inside Prompt can already run `orca`.
- To use it in other terminals, turn it on in Settings > General, in the CLI section. On macOS this
  registers `orca` in `/usr/local/bin`.
- `orca --help` lists every command. Today they include, for example, `orca status`,
  `orca worktree list` and `orca terminal list`.

## 4. How Prompt differs from Orca

Prompt is based on [Orca](https://github.com/stablyai/orca). Most of the engine (terminals,
worktrees, editor) comes from Orca and is merged from upstream regularly. Prompt changes:

- **Name and identity:** app name Prompt, bundle id `im.runners.prompt`, and links that start with
  `prompt://`.
- **No Orca services:** Prompt does not talk to Orca's servers. Orca sign-in, relay, push, plugin
  catalogs and update feeds are turned off, and no usage data (telemetry) is sent.
- **Its own data folder:** settings and sessions live in a `Prompt` folder. On first launch, an
  existing Orca folder is copied into it; the Orca folder itself is only read, never changed.
- **Claude-focused interface:** the two-level sidebar, per-session model menu, multi-window
  support and menu bar icon above are Prompt additions. Usage meters for other AI providers are
  hidden.
- **Fewer settings pages:** settings pages for Orca-only features (orchestration, computer use,
  voice, Orca account, mobile, plugins, automations, tasks and others) are hidden.
- **Shorter first run:** the welcome steps appear only on a brand-new profile and cover theme,
  notifications and Yolo mode.
- **Updates and issues** come from and go to [RUNNERS-IM/prompt](https://github.com/RUNNERS-IM/prompt).

Orca's original README is kept in [docs/upstream/README.orca.md](docs/upstream/README.orca.md).

## 5. Made by · License

Prompt is made by RUNNERS (Runners Co., Ltd.).

Copyright (c) 2026 Runners Co., Ltd. All rights reserved. See [LICENSE](LICENSE).

Prompt is based on Orca by Stably AI, distributed under the MIT License
(Copyright (c) 2026 Lovecast Inc.). Orca's full copyright and permission notice, and the notices
of the other third-party components, are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
