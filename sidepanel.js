/* ===== slash slash — side panel logic ===== */

const KEY_SNIPPETS = "fillit_snippets";
const KEY_SETTINGS = "fillit_settings";

const state = {
  snippets: [],
  settings: { theme: "system" },
  activeFolder: "All",
  search: "",
  editingId: null // null = new snippet
};

/* ---------- DOM refs ---------- */
const $ = (id) => document.getElementById(id);
const listView = $("listView");
const editorView = $("editorView");
const snippetList = $("snippetList");
const folderBar = $("folderBar");
const searchInput = $("searchInput");
const countLabel = $("countLabel");

/* ---------- Storage ---------- */
async function load() {
  const data = await chrome.storage.local.get([KEY_SNIPPETS, KEY_SETTINGS]);
  state.snippets = data[KEY_SNIPPETS] || [];
  state.settings = data[KEY_SETTINGS] || { theme: "system" };
}

/* ---------- Trigger (the "//" prefix — user-configurable) ---------- */
function trigger() {
  return state.settings.trigger || "//";
}

// Reflect the current trigger in every label that shows it.
function applyTrigger() {
  const t = trigger();
  document.querySelectorAll(".trig-label").forEach((el) => (el.textContent = t));
  document.querySelectorAll(".trigger-chip").forEach((chip) => {
    chip.classList.toggle("active", chip.dataset.trigger === t);
  });
}
async function saveSnippets() {
  await chrome.storage.local.set({ [KEY_SNIPPETS]: state.snippets });
}
async function saveSettings() {
  await chrome.storage.local.set({ [KEY_SETTINGS]: state.settings });
}

/* ---------- Theme ---------- */
// Distinct icon per mode so the active theme is obvious at a glance:
// monitor = follow system, sun = light, moon = dark.
const THEME_ICONS = {
  system:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 20h8M12 17v3"/></svg>',
  light:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 3a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm0 15a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1zM4 11H3a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2zm17 0h-1a1 1 0 1 0 0 2h1a1 1 0 1 0 0-2zM6.3 5A1 1 0 0 0 5 6.3l.7.7A1 1 0 0 0 7 5.7L6.3 5zm12 12a1 1 0 0 0-1.4 1.4l.7.7a1 1 0 0 0 1.4-1.4l-.7-.7zM19 6.3A1 1 0 0 0 17.7 5l-.7.7A1 1 0 0 0 18.3 7l.7-.7zM7 18.3A1 1 0 0 0 5.7 17l-.7.7A1 1 0 0 0 6.3 19l.7-.7zM12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/></svg>',
  dark:
    '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 1 0 9.8 9.8z"/></svg>'
};

function applyTheme() {
  const t = state.settings.theme;
  const resolved =
    t === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : t;
  document.documentElement.setAttribute("data-theme", resolved);
  const btn = $("themeBtn");
  const next = { system: "light", light: "dark", dark: "system" }[t];
  btn.title = `Theme: ${t} — switch to ${next}`;
  btn.setAttribute("aria-label", `Theme: ${t}. Switch to ${next}`);
  btn.innerHTML = THEME_ICONS[t] || THEME_ICONS.system;
}

/* ---------- Rendering ---------- */
function folders() {
  const set = new Set();
  state.snippets.forEach((s) => s.folder && set.add(s.folder));
  return ["All", ...[...set].sort((a, b) => a.localeCompare(b))];
}

function filtered() {
  const q = state.search.trim().toLowerCase();
  return state.snippets
    .filter((s) => state.activeFolder === "All" || s.folder === state.activeFolder)
    .filter((s) => {
      if (!q) return true;
      return (
        (s.title || "").toLowerCase().includes(q) ||
        (s.shortcut || "").toLowerCase().includes(q) ||
        (s.content || "").toLowerCase().includes(q)
      );
    });
  // No sort — stored array order is the manual order the user drags into.
}

function renderFolders() {
  // If the active folder disappeared (rename/delete), fall back to All.
  const names = folders();
  if (!names.includes(state.activeFolder)) state.activeFolder = "All";

  folderBar.innerHTML = "";
  // "All" + a single folder is no choice at all — hide the bar.
  if (names.length <= 2) return;
  names.forEach((f) => {
    const btn = document.createElement("button");
    btn.className = "folder-pill" + (f === state.activeFolder ? " active" : "");
    btn.textContent = f;
    btn.onclick = () => {
      state.activeFolder = f;
      renderFolders();
      renderList();
    };
    folderBar.appendChild(btn);
  });
}

function esc(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// Escape text and wrap {tokens} in colored spans (utils vs fill-in fields).
function highlightVars(text) {
  let out = "";
  let last = 0;
  const re = /\{([^}]+)\}/g;
  let m;
  while ((m = re.exec(text))) {
    out += esc(text.slice(last, m.index));
    const cls = FillitFormat.isUtil(m[1]) ? "vtok util" : "vtok field";
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += esc(text.slice(last));
  return out;
}

function renderList() {
  const items = filtered();
  const total = state.snippets.length;
  countLabel.textContent =
    items.length === total
      ? `${total} snippet${total === 1 ? "" : "s"}`
      : `${items.length} of ${total} snippets`;

  if (items.length === 0) {
    const isEmpty = total === 0;
    snippetList.innerHTML = `
      <div class="flex flex-1 flex-col items-center justify-center gap-1.5 px-8 py-10 text-center text-ink-3">
        <div class="mb-2 text-[30px] opacity-85">${isEmpty ? "✍️" : "🔍"}</div>
        <div class="text-[15px] font-semibold text-ink">${isEmpty ? "No snippets yet" : "Nothing found"}</div>
        <div class="max-w-[230px] text-[13px] leading-normal">${
          isEmpty
            ? `Create your first template, then type ${esc(trigger())} in any text field to insert it.`
            : "Try a different search or folder."
        }</div>
        ${isEmpty ? '<button id="emptyNewBtn" class="btn-primary mt-3 h-9">New snippet</button>' : ""}
      </div>`;
    const cta = $("emptyNewBtn");
    if (cta) cta.onclick = () => openEditor(null);
    return;
  }

  snippetList.innerHTML = "";
  items.forEach((s) => {
    const card = document.createElement("div");
    card.className = "snip-card group";
    card.dataset.id = s.id;
    card.draggable = true;
    // Reachable and operable by keyboard, not just the mouse.
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Edit snippet ${s.title || s.shortcut}`);
    card.innerHTML = `
      <div class="mb-[5px] flex items-center gap-2">
        <span class="snip-grip -ml-1.5 grid w-3.5 shrink-0 cursor-grab place-items-center text-ink-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 active:cursor-grabbing" title="Drag to reorder">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
        </span>
        <span class="flex-1 truncate text-[13.5px] font-semibold tracking-tight">${esc(s.title || "Untitled")}</span>
        <span class="font-mono text-[11.5px] font-semibold whitespace-nowrap text-accent">${esc(trigger())}${esc(s.shortcut)}</span>
      </div>
      <div class="line-clamp-2 text-[12.5px] break-words whitespace-pre-wrap text-ink-2">${highlightVars(s.content)}</div>
      <div class="flex max-h-0 gap-1.5 overflow-hidden opacity-0 transition-all duration-150 group-hover:mt-2.5 group-hover:max-h-10 group-hover:opacity-100 group-focus-within:mt-2.5 group-focus-within:max-h-10 group-focus-within:opacity-100">
        <button class="mini-btn act-copy">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke-width="2"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
          Copy
        </button>
        <button class="mini-btn act-edit">
          <svg viewBox="0 0 24 24" width="13" height="13" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>
          Edit
        </button>
      </div>`;

    card.onclick = () => {
      if (card.dataset.dragged) return; // ignore the click that ends a drag
      openEditor(s.id);
    };
    // Enter / Space open the snippet, matching the click affordance.
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openEditor(s.id);
      }
    });
    card.querySelector(".act-edit").onclick = (e) => {
      e.stopPropagation();
      openEditor(s.id);
    };
    card.querySelector(".act-copy").onclick = async (e) => {
      e.stopPropagation();
      const text = await resolveForCopy(s.content);
      await navigator.clipboard.writeText(text);
      toast("Copied to clipboard");
    };

    card.addEventListener("dragstart", (e) => {
      card.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      try {
        e.dataTransfer.setData("text/plain", s.id);
      } catch (err) {
        /* some browsers require a set; ignore */
      }
    });
    card.addEventListener("dragend", onDragEnd);

    snippetList.appendChild(card);
  });
}

/* ---------- Drag to reorder ---------- */
function getDragAfterElement(container, y) {
  const cards = [...container.querySelectorAll(".snip-card:not(.dragging)")];
  let closest = { offset: -Infinity, el: null };
  for (const el of cards) {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el };
  }
  return closest.el;
}

function onDragOver(e) {
  const dragging = snippetList.querySelector(".snip-card.dragging");
  if (!dragging) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const after = getDragAfterElement(snippetList, e.clientY);
  if (after == null) snippetList.appendChild(dragging);
  else snippetList.insertBefore(dragging, after);
}

async function onDragEnd(e) {
  const card = e.currentTarget;
  card.classList.remove("dragging");
  // Persist the new order from the DOM, then swallow the trailing click.
  const ids = [...snippetList.querySelectorAll(".snip-card")].map(
    (c) => c.dataset.id
  );
  applyVisibleOrder(ids);
  await saveSnippets();
  card.dataset.dragged = "1";
  setTimeout(() => delete card.dataset.dragged, 50);
}

// Reorder only the currently-visible snippets within state.snippets, leaving
// any filtered-out snippets in their existing slots.
function applyVisibleOrder(orderedVisibleIds) {
  const visible = new Set(orderedVisibleIds);
  const slots = [];
  state.snippets.forEach((s, i) => {
    if (visible.has(s.id)) slots.push(i);
  });
  const byId = new Map(state.snippets.map((s) => [s.id, s]));
  orderedVisibleIds.forEach((id, k) => {
    state.snippets[slots[k]] = byId.get(id);
  });
}

// { url, title } of the tab the user is looking at, for {url}/{title} on copy.
async function activeTabContext() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true
    });
    return { url: tab?.url || "", title: tab?.title || "" };
  } catch (e) {
    return { url: "", title: "" };
  }
}

// For copy: resolve every util token, strip {cursor}, then reduce any leftover
// fill-in braces to their bare names (copy can't prompt for values).
async function resolveForCopy(content) {
  const ctx = await activeTabContext();
  let out = await FillitFormat.resolveUtils(content, ctx);
  out = out.replace(/\{cursor\}/g, "");
  return out.replace(/\{([^}]+)\}/g, "$1");
}

function refresh() {
  renderFolders();
  renderList();
  refreshFolderOptions();
}

/* ---------- Editor ---------- */
function openEditor(id) {
  state.editingId = id;
  const s = id ? state.snippets.find((x) => x.id === id) : null;
  $("editorTitle").textContent = s ? "Edit snippet" : "New snippet";
  $("fTitle").value = s ? s.title : "";
  $("fShortcut").value = s ? s.shortcut : "";
  $("fFolder").value = s ? s.folder || "" : "";
  $("fContent").value = s ? s.content : "";
  $("deleteBtn").classList.toggle("hidden", !s);
  refreshFolderOptions();
  listView.classList.add("hidden");
  editorView.classList.remove("hidden");
  $("fTitle").focus();
}

function closeEditor() {
  editorView.classList.add("hidden");
  listView.classList.remove("hidden");
  state.editingId = null;
}

/* ---------- Help ---------- */
function openHelp() {
  listView.classList.add("hidden");
  editorView.classList.add("hidden");
  $("helpView").classList.remove("hidden");
}
function closeHelp() {
  $("helpView").classList.add("hidden");
  listView.classList.remove("hidden");
}

function refreshFolderOptions() {
  const dl = $("folderOptions");
  dl.innerHTML = "";
  folders()
    .filter((f) => f !== "All")
    .forEach((f) => {
      const o = document.createElement("option");
      o.value = f;
      dl.appendChild(o);
    });
}

// A shortcut can't contain whitespace, braces, or any trigger character
// (/ ? > ; :) — the page-side trigger regex could never match them, and the
// user may switch triggers at any time. Strip them on save.
function normalizeShortcut(raw) {
  return raw.trim().replace(/[\s/?>;:{}]+/g, "");
}

async function saveSnippet() {
  const title = $("fTitle").value.trim();
  const shortcut = normalizeShortcut($("fShortcut").value);
  const folder = $("fFolder").value.trim() || "General";
  const content = $("fContent").value;

  if (!shortcut) {
    toast("Add a shortcut");
    $("fShortcut").focus();
    return;
  }
  if (!content.trim()) {
    toast("Content can't be empty");
    $("fContent").focus();
    return;
  }

  // Block duplicate shortcuts (case-insensitive, different snippet).
  const dup = state.snippets.find(
    (s) =>
      s.shortcut.toLowerCase() === shortcut.toLowerCase() &&
      s.id !== state.editingId
  );
  if (dup) {
    toast(`Shortcut ${trigger()}${dup.shortcut} already exists`);
    $("fShortcut").focus();
    return;
  }

  const now = Date.now();
  const existing = state.editingId
    ? state.snippets.find((x) => x.id === state.editingId)
    : null;
  if (existing) {
    Object.assign(existing, {
      title: title || shortcut,
      shortcut,
      folder,
      content,
      updatedAt: now
    });
  } else {
    // New snippet — or the edited one vanished from storage mid-edit.
    state.snippets.push({
      id: state.editingId || crypto.randomUUID(),
      title: title || shortcut,
      shortcut,
      folder,
      content,
      createdAt: now,
      updatedAt: now,
      uses: 0
    });
  }
  await saveSnippets();
  refresh();
  closeEditor();
  toast("Saved");
}

async function deleteSnippet() {
  if (!state.editingId) return;
  const idx = state.snippets.findIndex((s) => s.id === state.editingId);
  if (idx === -1) return closeEditor();
  const [removed] = state.snippets.splice(idx, 1);
  await saveSnippets();
  refresh();
  closeEditor();
  toast("Deleted", {
    label: "Undo",
    onClick: async () => {
      state.snippets.splice(Math.min(idx, state.snippets.length), 0, removed);
      await saveSnippets();
      refresh();
      toast("Restored");
    }
  });
}

/* ---------- Variable helper chips ---------- */
function insertToken(token) {
  const ta = $("fContent");
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? ta.value.length;
  ta.value = ta.value.slice(0, start) + token + ta.value.slice(end);
  // For the blank "{}" chip, drop the caret between the braces.
  const caret = token === "{}" ? start + 1 : start + token.length;
  ta.focus();
  ta.setSelectionRange(caret, caret);
}

/* ---------- Import / Export ---------- */
function exportSnippets() {
  const blob = new Blob([JSON.stringify(state.snippets, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "slashslash-snippets.json";
  a.click();
  URL.revokeObjectURL(url);
  closeSheet();
  toast("Exported");
}

function importSnippets(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!Array.isArray(parsed)) throw new Error("bad format");
      const taken = new Set(state.snippets.map((s) => s.shortcut.toLowerCase()));
      let added = 0;
      parsed.forEach((s) => {
        if (!s || !s.shortcut || !s.content) return;
        const base = normalizeShortcut(String(s.shortcut));
        if (!base) return;
        // Suffix until unique: sig, sig-1, sig-2, …
        let shortcut = base;
        let n = 1;
        while (taken.has(shortcut.toLowerCase())) shortcut = `${base}-${n++}`;
        taken.add(shortcut.toLowerCase());
        state.snippets.push({
          id: crypto.randomUUID(),
          title: String(s.title || shortcut),
          shortcut,
          folder: String(s.folder || "Imported"),
          content: String(s.content),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          uses: 0
        });
        added++;
      });
      await saveSnippets();
      refresh();
      closeSheet();
      toast(`Imported ${added} snippet${added === 1 ? "" : "s"}`);
    } catch (e) {
      toast("Invalid file");
    }
  };
  reader.readAsText(file);
}

/* ---------- Sheet ---------- */
function openSheet() {
  $("sheet").classList.remove("hidden");
}
function closeSheet() {
  $("sheet").classList.add("hidden");
}

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg, action) {
  const el = $("toast");
  el.textContent = "";
  el.appendChild(document.createTextNode(msg));
  if (action) {
    const btn = document.createElement("button");
    btn.className =
      "cursor-pointer rounded-full border-0 bg-transparent px-1 font-sans text-[13px] font-bold text-accent";
    btn.textContent = action.label;
    btn.onclick = () => {
      clearTimeout(toastTimer);
      el.classList.add("hidden");
      el.classList.remove("flex");
      action.onClick();
    };
    el.appendChild(btn);
  }
  el.classList.remove("hidden");
  el.classList.add("flex");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(
    () => {
      el.classList.add("hidden");
      el.classList.remove("flex");
    },
    action ? 4500 : 1800
  );
}

/* ---------- Events ---------- */
function bind() {
  $("newBtn").onclick = () => openEditor(null);
  $("backBtn").onclick = closeEditor;
  $("cancelBtn").onclick = closeEditor;
  $("saveBtn").onclick = saveSnippet;
  $("deleteBtn").onclick = deleteSnippet;

  $("helpBtn").onclick = openHelp;
  $("helpBackBtn").onclick = closeHelp;
  $("helpDoneBtn").onclick = closeHelp;

  document.querySelectorAll(".var-chip").forEach((chip) => {
    chip.onclick = () => insertToken(chip.dataset.token);
  });

  searchInput.oninput = (e) => {
    state.search = e.target.value;
    renderList();
  };

  snippetList.addEventListener("dragover", onDragOver);

  $("themeBtn").onclick = async () => {
    const order = ["system", "light", "dark"];
    const cur = order.indexOf(state.settings.theme);
    state.settings.theme = order[(cur + 1) % order.length];
    await saveSettings();
    applyTheme();
    toast(`Theme: ${state.settings.theme}`);
  };

  document.querySelectorAll(".trigger-chip").forEach((chip) => {
    chip.onclick = async () => {
      state.settings.trigger = chip.dataset.trigger;
      await saveSettings();
      applyTrigger();
      renderList();
      toast(`Trigger: ${chip.dataset.trigger}`);
    };
  });

  $("menuBtn").onclick = openSheet;
  $("sheet").querySelector(".sheet-backdrop").onclick = closeSheet;
  $("exportBtn").onclick = exportSnippets;
  $("importBtn").onclick = () => $("importFile").click();
  $("importFile").onchange = (e) => {
    if (e.target.files[0]) importSnippets(e.target.files[0]);
    e.target.value = "";
  };
  $("editShortcutsBtn").onclick = () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    closeSheet();
  };

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const inEditor = !editorView.classList.contains("hidden");
    const inHelp = !$("helpView").classList.contains("hidden");
    const sheetOpen = !$("sheet").classList.contains("hidden");
    const el = e.target;
    const typing =
      el &&
      (el.tagName === "INPUT" ||
        el.tagName === "TEXTAREA" ||
        el.isContentEditable);
    const noMods = !e.metaKey && !e.ctrlKey && !e.altKey;

    if (inHelp) {
      if (e.key === "Escape") closeHelp();
      return;
    }

    // Editor-scoped
    if (inEditor) {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        saveSnippet();
      }
      if (e.key === "Escape") closeEditor();
      return;
    }

    if (e.key === "Escape") {
      if (sheetOpen) return closeSheet();
      if (state.search) {
        state.search = "";
        searchInput.value = "";
        renderList();
        searchInput.blur();
      }
      return;
    }

    // List-scoped single-key shortcuts (only when not typing in a field)
    if (!typing && !sheetOpen && noMods) {
      if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        openEditor(null);
      } else if (e.key === "/") {
        e.preventDefault();
        searchInput.focus();
      }
    }

    // Ctrl/Cmd+K focuses search from anywhere in the list view
    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  // React to system theme changes when in "system" mode
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (state.settings.theme === "system") applyTheme();
    });

  // Live-update if storage changes elsewhere (e.g. content script bumps uses)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[KEY_SNIPPETS]) {
      state.snippets = changes[KEY_SNIPPETS].newValue || [];
      if (editorView.classList.contains("hidden")) refresh();
    }
    if (changes[KEY_SETTINGS]) {
      state.settings = changes[KEY_SETTINGS].newValue || { theme: "system" };
      applyTheme();
      applyTrigger();
    }
  });
}

/* ---------- Init ---------- */
(async function init() {
  await load();
  applyTheme();
  applyTrigger();
  bind();
  refresh();
})();
