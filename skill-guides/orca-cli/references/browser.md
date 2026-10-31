# Built-in browser commands

Use a snapshot-interact-re-snapshot loop:

```text
PROMPT browser goto --url https://example.com --json
PROMPT browser snapshot --json
PROMPT browser click --element @e3 --json
PROMPT browser snapshot --json
```

Common commands:

```text
PROMPT browser goto --url <url> --json
PROMPT browser back --json
PROMPT browser reload --json
PROMPT browser snapshot --json
PROMPT browser screenshot --json
PROMPT browser full-screenshot --json
PROMPT browser pdf --json
PROMPT browser click --element <ref> --json
PROMPT browser fill --element <ref> --value <text> --json
PROMPT browser type --input <text> --json
PROMPT browser select --element <ref> --value <value> --json
PROMPT browser check --element <ref> --json
PROMPT browser scroll --direction down --amount 1000 --json
PROMPT browser hover --element <ref> --json
PROMPT browser focus --element <ref> --json
PROMPT browser keypress --key Enter --json
PROMPT browser upload --element <ref> --files <paths> --json
PROMPT browser wait --text <text> --json
PROMPT browser wait --url <substring> --json
PROMPT browser wait --selector <css> --json
PROMPT browser wait --load networkidle --json
PROMPT browser eval --expression <js> --json
PROMPT browser set device --name "iPhone 15" --json
PROMPT browser viewport --width 390 --height 844 --scale 3 --mobile --json
PROMPT browser tab list --json
PROMPT browser tab create --url <url> --json
PROMPT browser tab switch --index <n> --json
PROMPT browser tab close --index <n> --json
PROMPT browser cookie get --json
PROMPT browser capture start --json
PROMPT browser console --limit 50 --json
PROMPT browser network --limit 50 --json
PROMPT browser exec --command "help" --json
```

Browser rules:

- Re-snapshot after navigation, tab switches, clicks that change the page, and any `browser_stale_ref`.
- Refs like `@e1` are assigned by `snapshot`, scoped to one tab, and invalidated by navigation or tab switch.
- Browser commands default to the current worktree and its active tab. Use `--worktree all` only intentionally.
- For concurrent browser work, run `PROMPT browser tab list --json`, read `tabs[].browserPageId`, and pass `--page <browserPageId>` on later commands.
- Use typed tab commands (`PROMPT browser tab list/create/close/switch`), not `PROMPT browser exec --command "tab ..."`, so Orca keeps UI state synchronized.
- Use `PROMPT browser set device` or `PROMPT browser viewport --mobile`, not `PROMPT browser exec --command "set device ..."`, so the page also gets touch input and `pointer: coarse`. Each page load (reload, `goto`, link click) resets it, so run it again after navigating.
- Prefer `wait --text`, `--url`, `--selector`, or `--load` after async page changes instead of bare timeouts.
- Anything not listed above goes through `PROMPT browser exec --command "<agent-browser command>"`.
- If `fill` or `type` fails on a custom input, try `PROMPT browser focus --element @e1 --json` then `PROMPT browser inserttext --text "text" --json`.
- A client-hosted page renders in the paired desktop's browser engine, so every command against it needs that desktop online and returns `browser_host_unavailable` while it is closed, asleep, or disconnected. Server-hosted pages run with no desktop attached; prefer them for long or unattended automation.

Common recoveries:

- `browser_no_tab`: open a tab with `PROMPT browser tab create --url <url> --json`.
- `browser_stale_ref`: run `PROMPT browser snapshot --json` and retry with fresh refs.
- `browser_tab_not_found`: run `PROMPT browser tab list --json` before switching or closing.
- `browser_host_unavailable`: the desktop hosting the page is offline. Bring it back, or recreate the page with server placement if the work must outlive the desktop session.
