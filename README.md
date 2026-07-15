# slash slash — Text Snippets Anywhere

A minimal Chrome extension for the text you type again and again: save it once,
then drop it into **any** text field on the web by typing `//`. Addresses,
sign-offs, meeting links, out-of-office replies — one trigger away.

## Demo

![slash slash demo](demo/slashslash-launch.gif)

> 🎬 Full-quality launch video with sound: [`demo/slashslash-launch.mp4`](demo/slashslash-launch.mp4).
> Preview it live by opening `demo/launch.html?play=1` in a browser, or re-render
> it from code — see [`demo/README.md`](demo/README.md).

Built on three principles:
- **Side panel** as the manager — always a keystroke away, never a separate tab
- **Local-first** — `chrome.storage.local` is the only database; no server, no
  account, no sign-in, no network requests
- **Minimal, modern UI** — light/dark/system themes, keyboard-driven

## Features

- **`//` trigger anywhere** — type `//` + a keyword in any `input`, `textarea`, or rich-text (contenteditable) field to get an inline autocomplete, then `Enter`/`Tab`/click to insert.
- **Snippet manager** — create, edit, delete snippets with a title, `//shortcut`, folder, and content.
- **Folders** — organize snippets; filter by folder chips.
- **Search** — across title, shortcut, and content.
- **Automatic utility tokens** (resolved for you, no prompt):
  - `{current date}` → today · `{time}` / `{current time}` → now ·
    `{datetime}` / `{current datetime}` → both
  - `{clipboard}` → current clipboard text
  - `{url}` / `{title}` → the current page's URL / title
  - `{uuid}` → a random UUID
  - `{cursor}` → where the caret lands after insertion
- **Date picker** — `{date}`, or any field with "date" in its name
  (`{return date}`, `{due date}`), opens a **calendar** in the fill-in form when
  you insert the snippet, so you can pick any date instead of today's.
- **Custom date / time formats** — add a format after a colon. Use a friendly
  preset or a `moment`-style pattern:
  - Presets: `{current date:iso}` (`2026-07-15`), `{current date:us}`,
    `{current date:eu}`, `{current date:long}`, `{current date:medium}`,
    `{time:24}`, `{time:12}`, `{time:24s}`, `{datetime:iso}`, `{datetime:long}`
  - Patterns: `{current date:DD MMM YYYY}`, `{time:h:mm A}`,
    `{datetime:YYYY-MM-DD HH:mm}` — tokens:
    `YYYY YY · MMMM MMM MM M · DD D · dddd ddd · HH H hh h · mm m · ss s · A a`;
    wrap literal text in `[brackets]`.
- **Dynamic fill-in variables** — anything you wrap in `{}` that isn't a utility
  token becomes a variable (e.g. `{firstName}`, `{company}`). It has **no stored
  value**; each time you insert the snippet, slash slash pops a small inline form
  asking you to fill in every field (a text box, or a calendar for date fields),
  then drops the values in. Just type the braces in the snippet content — no setup.
- **Copy to clipboard** from any card.
- **Import / Export** all snippets as JSON (backup / move between machines).
- **Custom trigger** — `//` by default, but pick `??`, `>>`, `;;`, or `::` from the
  ⋯ menu if `//` clashes with what you type (e.g. code or URLs).
- **Themes** — light, dark, or follow system.
- **Manual ordering** — drag snippets by the grip to arrange them; the `//` picker
  follows the same order, with shortcut-prefix matches surfaced first.

## Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Open the slash slash sidebar | `Ctrl/⌘ + Shift + Y` (customizable at `chrome://extensions/shortcuts`) |
| New snippet | `N` (in the list) |
| Focus search | `/` or `Ctrl/⌘ + K` |
| Save snippet | `Ctrl/⌘ + Enter` |
| Close / clear | `Esc` |
| Insert on a page | type `//`, then `Enter` / `Tab` |

## Install (unpacked)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked** and select this project folder
4. Pin the extension and click its icon to open the **side panel**

A handful of example snippets are seeded on first install.

## Usage

1. Open the side panel → **New** → give it a title, a `//shortcut`, and content.
2. Go to any website, focus a text field, and type `//` followed by your shortcut.
3. Pick from the dropdown → the snippet is inserted (variables resolved, caret placed at `{cursor}`).

## Development

```bash
npm install            # tailwind (the only dev dependency)
npm run build          # compile sidepanel.src.css → sidepanel.css
npm run watch          # …same, on every change
npm run package        # build + create dist/slashslash-v<version>.zip
```

`npm run package` produces the zip you upload at the
[Chrome Web Store developer console](https://chrome.google.com/webstore/devconsole).
It's whitelist-based — only runtime files go in (no demo, docs, or sources) —
and it fails loudly if a file referenced by the manifest is missing or the
compiled CSS is stale.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker — side panel, seeds, tab re-injection |
| `format.js` | Shared token engine — utility tokens + date/time formatting |
| `sidepanel.html/.css/.js` | The snippet manager UI (the sidebar) |
| `sidepanel.src.css` | Tailwind source for `sidepanel.css` |
| `content.js/.css` | The trigger + inline autocomplete injected into pages |
| `icons/` | Extension icons |
| `scripts/package.mjs` | Builds the Web Store upload zip |
| `demo/` | Launch video (`.mp4`/`.gif`) + the code-rendered pipeline behind it |

## Troubleshooting

**Not working in Gmail (or any tab that was already open)?** On install or
update, slash slash automatically re-injects itself into every open tab — so the
trigger should work right away, no tab reload needed. If a tab was open across
*several* extension reloads (common while developing), an orphaned older copy of
the script can linger and intercept keystrokes; reloading that tab clears it.
Gmail compose is a rich-text field, which slash slash fully supports.

**Changed the trigger but pages still react to the old one?** Same cause as
above — reload that tab once. Newly loaded pages always use the trigger
currently selected in the ⋯ menu.

## Notes

- Data lives in `chrome.storage.local`. This is used instead of a page's `localStorage` because it's the only store the content script (running on web pages) and the side panel can share.
- No network requests are made. Nothing leaves your browser.
