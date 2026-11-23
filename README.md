<p align="center">
  <img src="https://runners.im/images/apps/prompt/icon.webp" width="96" alt="Prompt">
</p>
<h1 align="center">Prompt</h1>
<p align="center"><b>Many Claude sessions, one window.</b><br>A Mac terminal that runs many Claude Code sessions in one window, grouped by project.</p>
<p align="center">
  <a href="https://github.com/RUNNERS-IM/prompt/releases/latest/download/prompt-macos-arm64.dmg"><b>Download for Mac</b></a> ·
  <a href="https://runners.im/en/prompt">runners.im/en/prompt</a> ·
  <a href="docs/readme/README.ko.md">한국어</a>
</p>
<p align="center"><sub>Free · macOS 12 or later · Apple silicon · 20 languages</sub></p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/stage-en-dark.webp">
  <img src="https://runners.im/images/apps/prompt/stage-en-light.webp" alt="The whole Prompt window: sessions grouped by project on the left, a Claude terminal in the middle, files on the right">
</picture>

## What it does

<table>
<tr>
<td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/projects-en-dark.webp"><img src="https://runners.im/images/apps/prompt/projects-en-light.webp" alt="Workspaces and sessions under each project, each line showing its current status"></picture><br><b>See what every session is doing</b><br>Each project lists its sessions underneath, and every row shows what it's doing — editing files, running a command, done and waiting for you.</td>
<td width="50%" valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/worktrees-en-dark.webp"><img src="https://runners.im/images/apps/prompt/worktrees-en-light.webp" alt="Two workspaces (main and fix-login) under one project, next to the session terminal"></picture><br><b>A separate workspace for each task</b><br>Each workspace gets its own git worktree, so sessions never overwrite each other's files.</td>
</tr>
<tr>
<td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/keep-running-en-dark.webp"><img src="https://runners.im/images/apps/prompt/keep-running-en-light.webp" alt="A build log that keeps going without a gap after Prompt is reopened"></picture><br><b>Quit, and sessions keep going</b><br>Terminals keep running after you quit Prompt; reopen it and they reattach. Quit Completely… in the menu bar icon stops everything.</td>
<td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/folders-en-dark.webp"><img src="https://runners.im/images/apps/prompt/folders-en-light.webp" alt="A letter logo on each project, with a plain non-git folder in the same list"></picture><br><b>Any folder, with its own logo</b><br>Add plain folders as projects, not just git repositories, and give each project a logo so it stands out.</td>
</tr>
<tr>
<td valign="top"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/images/apps/prompt/usage-en-dark.webp"><img src="https://runners.im/images/apps/prompt/usage-en-light.webp" alt="Claude usage in the status bar at the bottom"></picture><br><b>Usage and finished sessions, at a glance</b><br>The status bar shows your Claude usage so limits don't surprise you, and a macOS notification appears when a session finishes.</td>
<td valign="top"><b>Sessions on your other Macs</b><br>Click the computer name at the top of the sidebar to switch to another Mac. Share This Computer… makes a link; paste it into Add Computer… on the other Mac.</td>
</tr>
</table>

## Install

Download [`prompt-macos-arm64.dmg`](https://github.com/RUNNERS-IM/prompt/releases/latest/download/prompt-macos-arm64.dmg), open it and drag Prompt into Applications. The Mac build is signed and notarized by Apple, so it opens without a security warning. There is no Intel Mac build.

The [Releases](https://github.com/RUNNERS-IM/prompt/releases/latest) page also has a Windows installer (`prompt-windows-setup.exe`, not code-signed yet, so SmartScreen warns the first time) and Linux builds (`.AppImage`, `.deb`, `.rpm`).

Prompt checks Releases for new versions and offers to install them. You can also choose Check for Updates from the menu bar icon or the app menu.

## Command line

Prompt includes a command called `prompt`. Terminals inside Prompt can run it right away; to use it elsewhere, turn it on in Settings › General › CLI, which registers `prompt` in `/usr/local/bin`. `prompt --help` lists every command, such as `prompt project list` and `prompt session list`. The old `orca` name is being retired; use `prompt`.

## Privacy

Prompt does not talk to Orca's servers and sends no usage data. When Prompt hits a JavaScript error, it sends the error type, the code lines, the app version and the OS version to RUNNERS' Sentry. Emails, tokens, your home folder name, the computer name, window titles, typed text and request bodies are removed before sending. IP addresses, screenshots, recordings, console logs and crash dumps are not sent.

## Based on Orca

Prompt is based on [Orca](https://github.com/stablyai/orca) by Stably AI. Most of the engine (terminals, worktrees, editor) comes from Orca; Prompt adds the two-level sidebar, per-session model menu, multiple windows, the menu bar icon and Mac-to-Mac sessions, and hides Orca-only services. Settings and sessions live in their own `Prompt` folder; an existing Orca folder is copied on first launch. Orca's original README is in [docs/upstream/README.orca.md](docs/upstream/README.orca.md).

## License

Copyright (c) 2026 Runners Co., Ltd. All rights reserved. See [LICENSE](LICENSE). Orca is distributed under the MIT License (Copyright (c) 2026 Lovecast Inc.); its notice and those of other third-party components are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

<p align="center"><a href="https://runners.im"><picture><source media="(prefers-color-scheme: dark)" srcset="https://runners.im/icons/logos/RUNNERS_H_W.svg"><img src="https://runners.im/icons/logos/RUNNERS_H.svg" height="20" alt="RUNNERS"></picture></a><br><sub>Made by RUNNERS · © 2026 Runners Co., Ltd. All rights reserved</sub></p>
