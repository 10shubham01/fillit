# Fillit — Text Snippets Anywhere

Save reusable text templates and insert them into **any** text field on the web by typing `//`.

- **Sidebar (side panel)** as the manager — no separate page
- **Local storage** as the database (`chrome.storage.local`) — no server, no account
- **No sign-in** — everything stays on your device
- A **minimal, modern** UI built with **Tailwind CSS** (light/dark/system themes)

## Features

- **`//` trigger anywhere** — type `//` + a keyword in any `input`, `textarea`, or rich-text (contenteditable) field to get an inline autocomplete, then `Enter`/`Tab`/click to insert. (It's smart enough not to fire inside URLs like `https://`.)
- **Snippet manager** — create, edit, delete snippets with a title, `//shortcut`, folder, and content.
- **Folders** — organize snippets; filter by folder chips.
- **Search** — across title, shortcut, and content.
- **Automatic utility tokens** (resolved for you, no prompt):
  - `{date}` → current date
  - `{time}` → current time
  - `{clipboard}` → current clipboard text
  - `{cursor}` → where the caret lands after insertion
- **Dynamic fill-in variables** — anything you wrap in `{}` that isn't one of the
  four utilities above becomes a variable (e.g. `{firstName}`, `{company}`). It
  has **no stored value**; each time you insert the snippet, Fillit pops a small
  inline form asking you to fill in every field, then drops the values in. Just
  type the braces in the snippet content — no setup. One-click **insert chips**
  in the editor add the tokens for you.
- **Copy to clipboard** from any card (with `{date}`/`{time}`/`{clipboard}` resolved).
- **Drag to reorder** — the picker follows your manual order.
- **Undo delete** — deleting a snippet shows a toast with an Undo button.
- **Import / Export** all snippets as JSON (backup / move between machines).
- **Themes** — light, dark, or follow system.

## Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Open the Fillit sidebar | `Ctrl/⌘ + Shift + Y` (customizable at `chrome://extensions/shortcuts`) |
| New snippet | `N` (in the list) |
| Focus search | `/` or `Ctrl/⌘ + K` |
| Save snippet | `Ctrl/⌘ + Enter` |
| Close / clear | `Esc` |
| Insert on a page | type `//`, then `Enter` / `Tab` |

## Install (unpacked)

1. Open `chrome://extensions`
2. Toggle **Developer mode** (top right)
3. Click **Load unpacked** and select this `fillit` folder
4. Pin the extension and click its icon to open the **side panel**

Three example snippets are seeded on first install.

## Usage

1. Open the side panel → **New** → give it a title, a `//shortcut`, and content.
2. Go to any website, focus a text field, and type `//` followed by your shortcut.
3. Pick from the dropdown → the snippet is inserted (variables resolved, caret placed at `{cursor}`).

## Development

The side panel UI is styled with **Tailwind CSS v4**, compiled ahead of time —
MV3's content-security policy forbids CDN scripts, so the extension ships a
static `sidepanel.css`.

```bash
npm install        # once
npm run build      # sidepanel.src.css → sidepanel.css (minified)
npm run watch      # rebuild on change while developing
```

Edit `sidepanel.src.css` (design tokens, component classes) and the Tailwind
utility classes in `sidepanel.html` / `sidepanel.js`, then rebuild. The compiled
`sidepanel.css` is committed so the extension loads without a build step.

`content.css` (the in-page `//` picker) is deliberately **not** Tailwind: it is
injected into every website, so every rule is hand-scoped under
`#fillit-autocomplete` to avoid leaking styles into host pages.

## Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest |
| `background.js` | Service worker — opens the side panel, seeds examples |
| `sidepanel.html/.js` | The snippet manager UI (the sidebar) |
| `sidepanel.src.css` | Tailwind source (tokens + components) |
| `sidepanel.css` | Compiled stylesheet (generated — don't edit by hand) |
| `content.js/.css` | The `//` trigger + inline autocomplete injected into pages |
| `icons/` | Extension icons |

## Troubleshooting

**Not working in Gmail (or any tab that was already open)?** Content scripts
are only injected into pages loaded *after* the extension is installed or
reloaded. After loading/reloading Fillit at `chrome://extensions`, **reload the
Gmail tab** (or open a fresh one) and `//` will work in the compose body. Gmail
compose is a rich-text field, which Fillit supports.

## Notes

- Data lives in `chrome.storage.local`. This is used instead of a page's `localStorage` because it's the only store the content script (running on web pages) and the side panel can share.
- No network requests are made. Nothing leaves your browser.
