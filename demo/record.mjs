// Frame-by-frame renderer: drives demo/launch.html over CDP, capturing one
// screenshot per frame at 30fps. Deterministic — every run yields identical
// frames. Usage: node record.mjs (expects Chrome already listening on :9222)
import { writeFileSync, mkdirSync } from "node:fs";

const FPS = 30;
const PORT = 9222;
const OUT = new URL("./frames/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

// -- find the page target --------------------------------------------------
async function pageWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.url.includes("launch.html"));
      if (page) return page.webSocketDebuggerUrl;
    } catch (e) {
      /* chrome not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Could not find launch.html target on :9222");
}

// -- minimal CDP client ------------------------------------------------------
const ws = new WebSocket(await pageWs());
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { res, rej } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
  }
};
const cdp = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

// Pin the viewport to the stage size — the raw headless viewport can come up
// short (and odd-height frames break yuv420p encoding).
await cdp("Emulation.setDeviceMetricsOverride", {
  width: 1280, height: 800, deviceScaleFactor: 1, mobile: false
});

// -- render ------------------------------------------------------------------
const { result: durRes } = await cdp("Runtime.evaluate", { expression: "window.DUR" });
const DUR = durRes.value;
const total = Math.round(DUR * FPS);
console.log(`rendering ${total} frames @ ${FPS}fps (${DUR}s)…`);

const t0 = Date.now();
for (let f = 0; f < total; f++) {
  const t = f / FPS;
  await cdp("Runtime.evaluate", {
    expression: `seek(${t})`,
    awaitPromise: true // resolves after a double-rAF, so layout is flushed
  });
  const shot = await cdp("Page.captureScreenshot", { format: "jpeg", quality: 92 });
  writeFileSync(`${OUT}f${String(f).padStart(4, "0")}.jpg`, Buffer.from(shot.data, "base64"));
  if (f % 150 === 0) {
    const rate = (f + 1) / ((Date.now() - t0) / 1000);
    console.log(`  frame ${f}/${total} (${rate.toFixed(1)} fps render)`);
  }
}
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
ws.close();
