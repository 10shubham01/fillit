#!/usr/bin/env node
/* Build the Chrome Web Store upload zip.
 *
 *   npm run package        →  dist/slashslash-v<version>.zip
 *
 * Whitelist-based: only the files the extension needs at runtime go in.
 * Everything else (demo/, node_modules/, README, tailwind source, …) stays out.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cd = (p) => join(root, p);

// ---- everything the packed extension ships ---------------------------------
const FILES = [
  "manifest.json",
  "background.js",
  "format.js",
  "content.js",
  "content.css",
  "sidepanel.html",
  "sidepanel.css",
  "sidepanel.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png"
];

// ---- sanity checks ----------------------------------------------------------
const manifest = JSON.parse(readFileSync(cd("manifest.json"), "utf8"));
const version = manifest.version;
if (!/^\d+(\.\d+)*$/.test(version)) {
  console.error(`✗ manifest version "${version}" is not a valid extension version`);
  process.exit(1);
}

let ok = true;
for (const f of FILES) {
  if (!existsSync(cd(f))) {
    console.error(`✗ missing: ${f}`);
    ok = false;
  }
}
// every file the manifest references must be in the zip
const referenced = [
  manifest.background?.service_worker,
  manifest.side_panel?.default_path,
  ...(manifest.content_scripts ?? []).flatMap((cs) => [...(cs.js ?? []), ...(cs.css ?? [])]),
  ...Object.values(manifest.icons ?? {})
].filter(Boolean);
for (const f of referenced) {
  if (!FILES.includes(f)) {
    console.error(`✗ manifest references "${f}" but it's not in the package list`);
    ok = false;
  }
}
// Note: `npm run package` always rebuilds the CSS first. This is only a hint
// for direct `node scripts/package.mjs` runs — and tailwind skips rewriting
// unchanged output, so an older mtime here is usually fine, not an error.
try {
  if (statSync(cd("sidepanel.src.css")).mtimeMs > statSync(cd("sidepanel.css")).mtimeMs) {
    console.warn("⚠ sidepanel.src.css is newer than sidepanel.css — if you changed styles, run `npm run build`");
  }
} catch { /* source file optional in a checkout without dev files */ }
if (!ok) process.exit(1);

// ---- zip it -----------------------------------------------------------------
mkdirSync(cd("dist"), { recursive: true });
const out = cd(`dist/slashslash-v${version}.zip`);
rmSync(out, { force: true });
execFileSync("zip", ["-q", "-X", out, ...FILES], { cwd: root });

const kb = (statSync(out).size / 1024).toFixed(1);
console.log(`✓ ${out.replace(root + "/", "")} (${kb} KB, ${FILES.length} files)`);
console.log("  Upload at https://chrome.google.com/webstore/devconsole");
