/* ===== slash slash — shared token engine =====
 * Loaded in BOTH the content script (isolated world) and the side panel, so
 * the utility tokens resolve and highlight identically everywhere.
 *
 * Auto-resolved utility tokens (no prompt):
 *   {date} {time} {datetime}   — locale default, or {date:iso}, {time:24}, …
 *   {clipboard}                — current clipboard text
 *   {url} {title}              — current page URL / title
 *   {uuid}                     — a random UUID
 *   {cursor}                   — final caret position (handled by the inserter)
 * Anything else in {braces} is a fill-in field the user is asked for on insert.
 */
(function (root) {
  "use strict";

  // Base names that are auto-resolved rather than prompted for.
  const UTILS = new Set([
    "date",
    "time",
    "datetime",
    "clipboard",
    "cursor",
    "url",
    "title",
    "uuid"
  ]);

  // Friendly named formats → strftime-ish patterns (see formatDate below).
  const PRESETS = {
    date: {
      iso: "YYYY-MM-DD",
      us: "MM/DD/YYYY",
      eu: "DD/MM/YYYY",
      long: "dddd, MMMM D, YYYY",
      medium: "MMM D, YYYY",
      short: "M/D/YY"
    },
    time: {
      "24": "HH:mm",
      "24s": "HH:mm:ss",
      "12": "h:mm A",
      "12s": "h:mm:ss A"
    },
    datetime: {
      iso: "YYYY-MM-DD HH:mm",
      long: "dddd, MMMM D, YYYY [at] h:mm A",
      medium: "MMM D, YYYY, h:mm A"
    }
  };

  const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const DAYS = [
    "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
  ];
  const pad = (n) => String(n).padStart(2, "0");

  // moment-lite formatter. Supports YYYY YY | MMMM MMM MM M | DD D | dddd ddd |
  // HH H hh h | mm m | ss s | A a, plus [literal text] escaping.
  function formatDate(d, pattern) {
    const h12 = d.getHours() % 12 || 12;
    const tok = {
      YYYY: d.getFullYear(),
      YY: pad(d.getFullYear() % 100),
      MMMM: MONTHS[d.getMonth()],
      MMM: MONTHS[d.getMonth()].slice(0, 3),
      MM: pad(d.getMonth() + 1),
      M: d.getMonth() + 1,
      DD: pad(d.getDate()),
      D: d.getDate(),
      dddd: DAYS[d.getDay()],
      ddd: DAYS[d.getDay()].slice(0, 3),
      HH: pad(d.getHours()),
      H: d.getHours(),
      hh: pad(h12),
      h: h12,
      mm: pad(d.getMinutes()),
      m: d.getMinutes(),
      ss: pad(d.getSeconds()),
      s: d.getSeconds(),
      A: d.getHours() < 12 ? "AM" : "PM",
      a: d.getHours() < 12 ? "am" : "pm"
    };
    // Longest tokens first so MMMM wins over MMM/MM/M, etc.
    const re =
      /\[([^\]]*)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|HH|H|hh|h|mm|m|ss|s|A|a/g;
    let out = "";
    let last = 0;
    let m;
    while ((m = re.exec(pattern))) {
      out += pattern.slice(last, m.index);
      out += m[1] !== undefined ? m[1] : String(tok[m[0]]);
      last = m.index + m[0].length;
    }
    return out + pattern.slice(last);
  }

  // Resolve a date/time/datetime token: named preset, else raw pattern, else
  // the browser's locale default when no argument was given.
  function formatKind(kind, d, arg) {
    if (!arg) {
      if (kind === "date") return d.toLocaleDateString();
      if (kind === "time") return d.toLocaleTimeString();
      return d.toLocaleString();
    }
    const preset = PRESETS[kind][arg.toLowerCase()];
    return formatDate(d, preset || arg);
  }

  function uuid() {
    try {
      if (root.crypto && root.crypto.randomUUID) return root.crypto.randomUUID();
    } catch (e) {
      /* not a secure context — fall through */
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // {name} or {name:arg} → { name (lowercased base), arg, raw (full trimmed) }.
  function parseToken(inner) {
    const i = inner.indexOf(":");
    const name = (i < 0 ? inner : inner.slice(0, i)).trim().toLowerCase();
    const arg = i < 0 ? "" : inner.slice(i + 1).trim();
    return { name, arg, raw: inner.trim() };
  }

  const isUtil = (inner) => UTILS.has(parseToken(inner).name);

  // Replace every utility token in `text`. `ctx` may carry { url, title }.
  // Leaves {cursor}, fill-in fields, and unknown tokens untouched.
  async function resolveUtils(text, ctx) {
    ctx = ctx || {};
    const now = new Date();
    let out = text.replace(/\{([^}]+)\}/g, (full, inner) => {
      const { name, arg } = parseToken(inner);
      switch (name) {
        case "date":
        case "time":
        case "datetime":
          return formatKind(name, now, arg);
        case "url":
          return ctx.url || "";
        case "title":
          return ctx.title || "";
        case "uuid":
          return uuid();
        default:
          return full; // clipboard (below), cursor, fill-ins, unknown
      }
    });
    if (/\{clipboard\}/.test(out)) {
      let clip = "";
      try {
        clip = await navigator.clipboard.readText();
      } catch (e) {
        /* permission denied / empty — leave blank */
      }
      out = out.replace(/\{clipboard\}/g, clip);
    }
    return out;
  }

  root.FillitFormat = {
    UTILS,
    PRESETS,
    formatDate,
    parseToken,
    isUtil,
    resolveUtils
  };
})(typeof self !== "undefined" ? self : this);
