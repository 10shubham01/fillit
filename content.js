/* ===== slash slash — content script =====
 * Detects "//keyword" typed in any input, textarea, or contenteditable,
 * shows an inline autocomplete, and inserts the matching snippet.
 */
(function () {
  "use strict";

  const KEY_SNIPPETS = "fillit_snippets";
  // Shared token engine (format.js, loaded before this script).
  const F = self.FillitFormat;

  let snippets = [];
  let box = null; // dropdown element
  let items = []; // currently shown snippets
  let activeIdx = 0;
  let target = null; // the field being typed in
  let triggerStart = -1; // index where "//" begins (for input/textarea)
  let mode = "list"; // "list" (snippet picker) | "form" (fill-in fields)

  // True only while this content script is still connected to a live extension.
  // After the extension is reloaded/updated, old scripts in open tabs lose their
  // context and any chrome.* call throws "Extension context invalidated".
  function extAlive() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (e) {
      return false;
    }
  }

  /* ---------- Load + keep snippets in sync ---------- */
  try {
    chrome.storage.local.get(KEY_SNIPPETS, (d) => {
      if (chrome.runtime.lastError) return;
      snippets = d[KEY_SNIPPETS] || [];
    });
    chrome.storage.onChanged.addListener((c, area) => {
      if (area !== "local") return;
      if (c[KEY_SNIPPETS]) snippets = c[KEY_SNIPPETS].newValue || [];
    });
  } catch (e) {
    /* context already gone — nothing to sync */
  }

  /* ---------- Field helpers ---------- */
  function isTextInput(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === "TEXTAREA") return true;
    if (el.tagName === "INPUT") {
      // Only input types that support the selection API — `email`/`number` don't
      // (their selectionStart is null), so the // trigger can't work there.
      const t = (el.type || "text").toLowerCase();
      return ["text", "search", "url", "tel", ""].includes(t);
    }
    return false;
  }

  // Returns { query, start } if "//query" sits just before the caret.
  function detectTrigger(el) {
    let textBefore, caret;
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return null;
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return null;
      textBefore = node.textContent.slice(0, range.startOffset);
      caret = range.startOffset;
    } else {
      caret = el.selectionStart;
      if (caret !== el.selectionEnd) return null;
      textBefore = el.value.slice(0, caret);
    }
    const m = textBefore.match(/\/\/([^\s/]*)$/);
    if (!m) return null;
    const start = caret - m[0].length;
    // Don't fire inside URLs: "https://…", "file:///…", "example.com//x".
    const prev = textBefore[start - 1];
    if (prev === ":" || prev === "/") return null;
    return { query: m[1], start };
  }

  function matches(query) {
    const q = query.toLowerCase();
    return snippets
      .map((s, i) => ({ s, i }))
      .filter(
        ({ s }) =>
          (s.shortcut || "").toLowerCase().startsWith(q) ||
          (s.title || "").toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // shortcut-prefix matches first, then the user's manual list order
        const ap = (a.s.shortcut || "").toLowerCase().startsWith(q) ? 0 : 1;
        const bp = (b.s.shortcut || "").toLowerCase().startsWith(q) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return a.i - b.i;
      })
      .slice(0, 8)
      .map(({ s }) => s);
  }

  function htmlEsc(s) {
    return s.replace(/[&<>"]/g, (c) =>
      c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"
    );
  }

  // Escape text and wrap {tokens} in colored spans (utils vs fill-in fields).
  function highlightVarsHTML(text) {
    let out = "";
    let last = 0;
    const re = /\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(text))) {
      out += htmlEsc(text.slice(last, m.index));
      const cls = F.isUtil(m[1]) ? "fillit-var util" : "fillit-var field";
      out += '<span class="' + cls + '">' + htmlEsc(m[0]) + "</span>";
      last = m.index + m[0].length;
    }
    out += htmlEsc(text.slice(last));
    return out;
  }

  /* ---------- Variables ---------- */
  // Unique, in-order list of dynamic fill-in fields in a snippet
  // (everything in {braces} that isn't a reserved util token).
  function dynamicFields(content) {
    const out = [];
    const seen = new Set();
    const re = /\{([^}]+)\}/g;
    let m;
    while ((m = re.exec(content))) {
      const name = m[1].trim();
      if (!name || F.isUtil(m[1])) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  }

  /* ---------- Caret pixel position ---------- */
  function getCaretRect(el) {
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0).cloneRange();
        const rect = r.getBoundingClientRect();
        if (rect && (rect.left || rect.top)) return rect;
      }
      return el.getBoundingClientRect();
    }
    // Mirror technique for input/textarea
    return mirrorCaretRect(el);
  }

  const MIRROR_PROPS = [
    "boxSizing","width","height","paddingTop","paddingRight","paddingBottom",
    "paddingLeft","borderTopWidth","borderRightWidth","borderBottomWidth",
    "borderLeftWidth","fontStyle","fontVariant","fontWeight","fontStretch",
    "fontSize","fontSizeAdjust","lineHeight","fontFamily","textAlign",
    "textTransform","textIndent","textDecoration","letterSpacing","wordSpacing",
    "whiteSpace","wordWrap","wordBreak"
  ];

  function mirrorCaretRect(el) {
    const div = document.createElement("div");
    const style = window.getComputedStyle(el);
    MIRROR_PROPS.forEach((p) => (div.style[p] = style[p]));
    div.style.position = "absolute";
    div.style.visibility = "hidden";
    div.style.whiteSpace = el.tagName === "INPUT" ? "nowrap" : "pre-wrap";
    div.style.overflow = "hidden";
    document.body.appendChild(div);

    const pos = el.selectionStart;
    div.textContent = el.value.slice(0, pos);
    const span = document.createElement("span");
    span.textContent = el.value.slice(pos) || ".";
    div.appendChild(span);

    const elRect = el.getBoundingClientRect();
    // div is at (0,0); span offset within gives caret offset
    const top =
      elRect.top + (span.offsetTop - el.scrollTop) + parseFloat(style.fontSize) * 1.15;
    const left = elRect.left + (span.offsetLeft - el.scrollLeft);
    document.body.removeChild(div);
    return { left, top, bottom: top, right: left };
  }

  /* ---------- Dropdown ---------- */
  function ensureBox() {
    if (box) return box;
    box = document.createElement("div");
    box.id = "fillit-autocomplete";
    // Keep the target field focused when clicking list rows, but allow the
    // fill-in form's own inputs/buttons to receive focus.
    box.addEventListener("mousedown", (e) => {
      const t = e.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON"))
        return;
      e.preventDefault();
    });
    document.body.appendChild(box);
    return box;
  }

  function positionBox(rect) {
    const bw = box.offsetWidth || 320;
    let left = Math.min(rect.left, window.innerWidth - bw - 12);
    left = Math.max(8, left);
    box.style.left = left + window.scrollX + "px";
    const boxH = box.offsetHeight || 200;
    let top = rect.top + window.scrollY + (rect.height || 18) + 4;
    if (rect.top + (rect.height || 18) + boxH + 12 > window.innerHeight) {
      top = rect.top + window.scrollY - boxH - 6;
    }
    box.style.top = Math.max(window.scrollY + 4, top) + "px";
  }

  function showBox(list, rect) {
    ensureBox();
    mode = "list";
    items = list;
    activeIdx = 0;
    renderBox();
    box.style.display = "block";
    positionBox(rect);
  }

  function hideBox() {
    if (box) box.style.display = "none";
    mode = "list";
    items = [];
    target = null;
    triggerStart = -1;
  }

  function renderBox() {
    box.innerHTML = "";
    if (!items.length) {
      hideBox();
      return;
    }
    items.forEach((s, i) => {
      const row = document.createElement("div");
      row.className = "fillit-item" + (i === activeIdx ? " active" : "");
      const preview = s.content.replace(/\s+/g, " ").trim().slice(0, 90);
      row.innerHTML =
        '<div class="fillit-item-main">' +
        '<span class="fillit-item-title"></span>' +
        '<span class="fillit-item-shortcut"></span>' +
        "</div>" +
        '<div class="fillit-item-preview"></div>';
      row.querySelector(".fillit-item-title").textContent = s.title || s.shortcut;
      row.querySelector(".fillit-item-shortcut").textContent = "//" + s.shortcut;
      row.querySelector(".fillit-item-preview").innerHTML = highlightVarsHTML(preview);
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        pick(items[i]);
      });
      row.addEventListener("mouseenter", () => {
        activeIdx = i;
        highlight();
      });
      box.appendChild(row);
    });

    const hint = document.createElement("div");
    hint.className = "fillit-hint";
    hint.innerHTML =
      "<span><kbd>↑↓</kbd> navigate</span>" +
      "<span><kbd>↵</kbd> insert</span>" +
      "<span><kbd>esc</kbd> dismiss</span>";
    box.appendChild(hint);
  }

  function highlight() {
    [...box.querySelectorAll(".fillit-item")].forEach((c, i) => {
      c.classList.toggle("active", i === activeIdx);
      if (i === activeIdx) c.scrollIntoView({ block: "nearest" });
    });
  }

  /* ---------- Picking a snippet ---------- */
  // Snapshot exactly where the snippet should land, BEFORE focus moves to the
  // fill-in form. Also stash the caret rect for positioning the form.
  function captureAnchor(el) {
    const rect = getCaretRect(el);
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return null;
      const range = sel.getRangeAt(0);
      const node = range.startContainer;
      if (node.nodeType !== Node.TEXT_NODE) return null;
      const caret = range.startOffset;
      const m = node.textContent.slice(0, caret).match(/\/\/([^\s/]*)$/);
      const from = m ? caret - m[0].length : caret;
      return { el, editable: true, node, from, to: caret, rect };
    }
    const caret = el.selectionStart;
    const trig = detectTrigger(el);
    const from = trig ? trig.start : triggerStart >= 0 ? triggerStart : caret;
    return { el, editable: false, from, to: caret, rect };
  }

  function pick(snippet) {
    if (!target) return;
    const anchor = captureAnchor(target);
    if (!anchor) return;
    const fields = dynamicFields(snippet.content);
    if (fields.length) {
      showForm(snippet, fields, anchor);
    } else {
      finalize(snippet, {}, anchor);
    }
  }

  /* ---------- Fill-in form (dynamic variables) ---------- */
  function showForm(snippet, fields, anchor) {
    ensureBox();
    mode = "form";
    items = [];
    box.innerHTML = "";

    const form = document.createElement("form");
    form.className = "fillit-form";

    const title = document.createElement("div");
    title.className = "fillit-form-title";
    title.textContent = snippet.title || snippet.shortcut;
    form.appendChild(title);

    const inputs = {};
    fields.forEach((name, i) => {
      const label = document.createElement("label");
      label.className = "fillit-field";
      const span = document.createElement("span");
      span.className = "fillit-field-label";
      span.textContent = name;
      const input = document.createElement("input");
      input.type = "text";
      input.className = "fillit-field-input";
      input.placeholder = "Enter " + name + "…";
      label.appendChild(span);
      label.appendChild(input);
      form.appendChild(label);
      inputs[name] = input;
    });

    const actions = document.createElement("div");
    actions.className = "fillit-form-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "fillit-btn ghost";
    cancel.textContent = "Cancel";
    cancel.addEventListener("click", () => {
      const el = anchor.el;
      hideBox();
      el.focus();
    });
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "fillit-btn";
    submit.textContent = "Insert";
    actions.appendChild(cancel);
    actions.appendChild(submit);
    form.appendChild(actions);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const values = {};
      fields.forEach((n) => (values[n] = inputs[n].value));
      finalize(snippet, values, anchor);
    });
    form.addEventListener("keydown", (e) => {
      // Don't let the page act on these while filling in fields.
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        const el = anchor.el;
        hideBox();
        el.focus();
      }
    });

    box.appendChild(form);
    box.style.display = "block";
    positionBox(anchor.rect);
    setTimeout(() => inputs[fields[0]] && inputs[fields[0]].focus(), 0);
  }

  /* ---------- Insertion ---------- */
  async function finalize(snippet, values, anchor) {
    // 1) Substitute dynamic fields with user-entered values.
    let content = snippet.content.replace(/\{([^}]+)\}/g, (full, raw) => {
      if (F.isUtil(raw)) return full; // util — resolved below
      const name = raw.trim();
      return name in values ? values[name] : full;
    });
    // 2) Resolve auto utils (date/time/datetime/clipboard/url/title/uuid).
    const resolved = await F.resolveUtils(content, {
      url: location.href,
      title: document.title
    });

    // 3) Handle {cursor} for final caret placement, strip any leftover braces.
    const curIdx = resolved.indexOf("{cursor}");
    const finalText = resolved.replace(/\{cursor\}/g, "");
    const cleanText = finalText.replace(/\{([^}]+)\}/g, "$1");
    const caretOffset =
      curIdx >= 0
        ? resolved
            .slice(0, curIdx)
            .replace(/\{[^}]+\}/g, (m) => m.slice(1, -1)).length
        : cleanText.length;

    const el = anchor.el;
    el.focus();
    if (anchor.editable) {
      insertEditableAt(anchor, cleanText, caretOffset);
    } else {
      const before = el.value.slice(0, anchor.from);
      const after = el.value.slice(anchor.to);
      el.value = before + cleanText + after;
      const pos = before.length + caretOffset;
      el.selectionStart = el.selectionEnd = pos;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    bumpUsage(snippet.id);
    hideBox();
  }

  function appendMultiline(frag, text) {
    const parts = text.split("\n");
    parts.forEach((p, i) => {
      if (i > 0) frag.appendChild(document.createElement("br"));
      if (p) frag.appendChild(document.createTextNode(p));
    });
  }

  function insertEditableAt(anchor, text, caretOffset) {
    const { node, from, to } = anchor;
    const range = document.createRange();
    try {
      const len = node.textContent.length;
      range.setStart(node, Math.min(from, len));
      range.setEnd(node, Math.min(to, len));
    } catch (e) {
      // Fall back to the live selection if the saved node moved.
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      range.setStart(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
      range.collapse(true);
    }
    range.deleteContents();

    const frag = document.createDocumentFragment();
    appendMultiline(frag, text.slice(0, caretOffset));
    const marker = document.createTextNode("");
    frag.appendChild(marker);
    appendMultiline(frag, text.slice(caretOffset));
    range.insertNode(frag);

    const sel = window.getSelection();
    const r2 = document.createRange();
    r2.setStartAfter(marker);
    r2.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r2);
    anchor.el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function bumpUsage(id) {
    if (!extAlive()) return; // extension was reloaded; skip the write
    try {
      // Read fresh before writing so a stale local copy can't clobber
      // edits made in the side panel since this tab loaded.
      chrome.storage.local.get(KEY_SNIPPETS, (d) => {
        if (chrome.runtime.lastError) return;
        const list = d[KEY_SNIPPETS] || [];
        const s = list.find((x) => x.id === id);
        if (!s) return;
        s.uses = (s.uses || 0) + 1;
        chrome.storage.local.set({ [KEY_SNIPPETS]: list });
      });
    } catch (e) {
      /* context invalidated between check and call — ignore */
    }
  }

  /* ---------- Event wiring ---------- */
  function onInput(e) {
    if (mode === "form") return; // filling in fields — ignore field typing
    const el = e.target;
    if (!isTextInput(el)) return;
    const trig = detectTrigger(el);
    if (!trig) {
      hideBox();
      return;
    }
    const list = matches(trig.query);
    if (!list.length) {
      hideBox();
      return;
    }
    target = el;
    triggerStart = trig.start;
    const rect = getCaretRect(el);
    showBox(list, rect);
  }

  function onKeydown(e) {
    if (!box || box.style.display === "none" || !items.length) return;
    // Keys we handle must not also reach the page (Gmail, editors, etc.).
    const stop = () => {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    };
    switch (e.key) {
      case "ArrowDown":
        stop();
        activeIdx = (activeIdx + 1) % items.length;
        highlight();
        break;
      case "ArrowUp":
        stop();
        activeIdx = (activeIdx - 1 + items.length) % items.length;
        highlight();
        break;
      case "Enter":
      case "Tab":
        stop();
        pick(items[activeIdx]);
        break;
      case "Escape":
        stop();
        hideBox();
        break;
    }
  }

  document.addEventListener("input", onInput, true);
  document.addEventListener("keydown", onKeydown, true);
  // Reposition/close the picker on scroll — but never yank away an open form.
  document.addEventListener(
    "scroll",
    () => {
      if (mode === "list") hideBox();
    },
    true
  );
  document.addEventListener(
    "click",
    (e) => {
      if (box && box.style.display !== "none" && !box.contains(e.target)) hideBox();
    },
    true
  );
  // Closing on blur is fine for the list, but the fill-in form steals focus on
  // purpose — don't hide when focus moves into our own box.
  document.addEventListener(
    "focusout",
    () => {
      setTimeout(() => {
        if (mode === "form" && box && box.contains(document.activeElement)) return;
        if (mode === "form") return; // keep the form open while editing fields
        hideBox();
      }, 120);
    },
    true
  );
})();
