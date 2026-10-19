// Test helpers: an EventSource polyfill for Node and a booted dev server.
import { createDevServer } from "../../scripts/devserver.mjs";

export class EventSource {
  constructor(url) {
    this.ctl = new AbortController(); this.h = new Map();
    (async () => {
      try {
        const res = await fetch(url, { signal: this.ctl.signal });
        const dec = new TextDecoder(); let buf = "";
        for await (const chunk of res.body) {
          buf += dec.decode(chunk, { stream: true });
          let i; while ((i = buf.indexOf("\n\n")) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const ev = /^event: (.*)$/m.exec(block)?.[1], data = /^data: (.*)$/m.exec(block)?.[1];
            if (ev && data) (this.h.get(ev) ?? []).forEach((f) => f({ data }));
          }
        }
      } catch {}
    })();
  }
  addEventListener(n, f) { this.h.set(n, [...(this.h.get(n) ?? []), f]); }
  close() { this.ctl.abort(); }
}

export async function boot() {
  globalThis.EventSource = EventSource;
  const dev = createDevServer();
  await new Promise((r) => dev.server.listen(0, r));
  globalThis.__BCM_CONFIG = { backend: "dev", devServer: `http://localhost:${dev.server.address().port}` };
  return { dev, close: () => { dev.server.closeAllConnections?.(); dev.server.close(); } };
}
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export async function until(fn, ms = 3000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await wait(20); } return false; }
