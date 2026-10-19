// Application state + IndexedDB persistence. One project at a time; everything is plain JSON.
import { newConfig } from "./core/model.js";
import { defaultDialect } from "./core/dialect.js";

export const state = { cfg: newConfig(), dialect: defaultDialect(), fixtures: { searchSets: null, clashTests: null }, github: { owner: "", repo: "", branch: "main", path: "project.json", token: "" }, sha: null, dirty: false, listeners: new Set() };

export const onChange = (f) => { state.listeners.add(f); return () => state.listeners.delete(f); };
export function changed() { state.dirty = true; scheduleSave(); for (const f of state.listeners) f(); }

const DB = "bcm", STORE = "kv";
const open = () => new Promise((res, rej) => {
  if (!globalThis.indexedDB) return rej(new Error("no indexedDB"));
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore(STORE);
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
async function kv(mode, fn) { const db = await open(); return new Promise((res, rej) => { const tx = db.transaction(STORE, mode); const rq = fn(tx.objectStore(STORE)); tx.oncomplete = () => res(rq?.result); tx.onerror = () => rej(tx.error); }); }

let saveTimer;
function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400); }
export async function persist() {
  try { await kv("readwrite", (s) => s.put({ cfg: state.cfg, dialect: state.dialect, github: { ...state.github, token: "" }, sha: state.sha }, "current")); } catch {}
}
export async function restore() {
  try {
    const d = await kv("readonly", (s) => s.get("current"));
    if (d?.cfg) { state.cfg = d.cfg; state.dialect = d.dialect ?? state.dialect; Object.assign(state.github, d.github ?? {}); state.sha = d.sha ?? null; return true; }
  } catch {}
  return false;
}
export function replaceConfig(cfg) { state.cfg = cfg; state.sha = null; changed(); }
