// Application state and project sync. The config object (state.cfg) is edited by the views exactly as before;
// this module turns edits into per-entity saves (optimistic versions) and applies other people's changes as they arrive.
import { newConfig } from "./core/model.js";
import { defaultDialect, upgradeDialect } from "./core/dialect.js";
import { cfgToEntities, entitiesToCfg, diffEntities, keyOf, hydrate } from "./core/entities.js";
import { mergeConfigs } from "./core/merge.js";

const COLLECTIONS = { profile: "profiles", codeMapping: "codeMappings", searchSet: "searchSets", clashTest: "clashTests" };
const SINGLETONS = { meta: null, naming: "naming", tolerances: "tolerances", matrix: "matrix" };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (v) => (v === null || v === undefined ? v : structuredClone(v)); // known[] and cfg must never share objects

export function createStore(initialBackend = null, { flushDelay = 400 } = {}) {
  const state = {
    backend: initialBackend, user: null, project: null, // {id,name,role}
    cfg: newConfig(), dialect: defaultDialect(), fixtures: { searchSets: null, clashTests: null },
    readOnly: false, presence: [], members: [],
    sync: { status: "idle", pending: 0, conflicts: [], error: null, lastSaved: null },
    onRemote: null, onStatus: null,
  };
  let known = new Map(); // key -> {version, data}: the last server state we have seen for each entity
  let timer = null, flushing = false, again = false, unsub = null, pres = null;
  const listeners = new Set();

  const status = (patch) => { Object.assign(state.sync, patch); state.onStatus?.(); };
  const currentEntities = () => [...cfgToEntities(state.cfg), { kind: "dialect", id: "dialect", data: state.dialect }];

  function applyEntity(kind, id, data /* null = removed */) {
    data = data === null ? null : hydrate(kind, clone(data));
    if (kind === "dialect") { if (data) state.dialect = upgradeDialect(data); return; }
    if (kind in COLLECTIONS) {
      const list = state.cfg[COLLECTIONS[kind]], i = list.findIndex((x) => x.id === id);
      if (data === null) { if (i >= 0) list.splice(i, 1); } else if (i >= 0) list[i] = data; else list.push(data);
      return;
    }
    if (kind === "meta") { if (data) Object.assign(state.cfg, data); return; }
    if (data) state.cfg[SINGLETONS[kind]] = data;
  }
  const currentData = (kind, id) => currentEntities().find((e) => e.kind === kind && e.id === id)?.data ?? null;

  // ---- local edits -> server ----
  function changed() {
    for (const f of listeners) f();
    if (state.project && state.readOnly) { revertToServer(); return; } // viewers cannot change anything: show the server's truth again
    if (!state.project) return;
    status({ status: "dirty" });
    clearTimeout(timer); timer = setTimeout(flush, flushDelay);
  }

  function revertToServer() {
    const ents = [...known].map(([k, v]) => { const [kind, ...r] = k.split("/"); return { kind, id: r.join("/"), data: clone(v.data) }; });
    state.cfg = entitiesToCfg(ents.filter((e) => e.kind !== "dialect"), newConfig(state.project.name));
    const d = ents.find((e) => e.kind === "dialect"); if (d) state.dialect = upgradeDialect(d.data);
    state.onRemote?.();
  }

  async function flush() {
    if (!state.project || state.readOnly) return;
    if (flushing) { again = true; return; }
    flushing = true;
    try {
      do {
        again = false;
        const before = [...known].map(([k, v]) => { const [kind, ...r] = k.split("/"); return { kind, id: r.join("/"), data: v.data }; });
        const { upserts, deletes } = diffEntities(before, currentEntities());
        status({ status: upserts.length + deletes.length ? "saving" : state.sync.status, pending: upserts.length + deletes.length, error: null });
        const ops = [...upserts.map((e) => ({ ...e, del: false })), ...deletes.map((e) => ({ ...e, del: true }))];
        for (let i = 0; i < ops.length; i += 8) await Promise.all(ops.slice(i, i + 8).map(saveOne));
        status({ status: "saved", pending: 0, lastSaved: new Date() });
      } while (again);
    } catch (e) {
      status({ status: "error", error: e.message });
      clearTimeout(timer); timer = setTimeout(flush, 5000); // retry later; edits stay in memory
    } finally { flushing = false; }
  }

  async function saveOne(op) {
    const k = keyOf(op.kind, op.id);
    let data = op.data;
    for (let attempt = 0; attempt < 4; attempt++) {
      const kn = known.get(k);
      try {
        const version = await state.backend.saveEntity(state.project.id, op.kind, op.id, data, kn?.version ?? 0, op.del);
        if (op.del) known.delete(k); else known.set(k, { version, data: clone(data) });
        return;
      } catch (e) {
        if (!e.conflict) throw e;
        // someone saved this entity first: fetch it, merge three-way (base = what I last saw), then retry
        const remote = (await state.backend.loadEntities(state.project.id)).find((r) => r.kind === op.kind && r.id === op.id);
        if (!remote) { known.delete(k); continue; } // deleted remotely: recreate with my data
        if (op.del) { // I deleted something that changed meanwhile: keep theirs
          known.set(k, { version: remote.version, data: clone(remote.data) }); applyEntity(op.kind, op.id, remote.data);
          status({ conflicts: [...state.sync.conflicts, { key: k, at: Date.now() }] }); state.onRemote?.(); return;
        }
        const m = mergeConfigs(kn?.data, data, remote.data);
        if (m.conflicts.length) status({ conflicts: [...state.sync.conflicts, { key: k, at: Date.now(), paths: m.conflicts }] });
        data = m.merged; known.set(k, { version: remote.version, data: clone(remote.data) });
        applyEntity(op.kind, op.id, data); state.onRemote?.();
      }
    }
    throw new Error(`could not save ${k}: too many conflicts`);
  }

  // ---- server -> local ----
  async function onEvent(ev) {
    const k = keyOf(ev.kind, ev.id), kn = known.get(k);
    if (kn && ev.version <= kn.version) return; // my own echo or an older event
    let { data } = ev;
    if (!ev.deleted && (data === null || data === undefined)) { // payload too large for realtime: fetch it
      data = (await state.backend.loadEntities(state.project.id)).find((r) => r.kind === ev.kind && r.id === ev.id)?.data;
      if (!data) return;
    }
    const mine = currentData(ev.kind, ev.id);
    const untouched = !kn ? mine === null : same(mine, kn.data);
    if (ev.deleted) {
      if (untouched) { applyEntity(ev.kind, ev.id, null); known.delete(k); }
      else { known.delete(k); status({ conflicts: [...state.sync.conflicts, { key: k, at: Date.now(), paths: ["deleted remotely, kept my edit"] }] }); changed(); }
    } else if (untouched) {
      applyEntity(ev.kind, ev.id, data); known.set(k, { version: ev.version, data: clone(data) });
    } else {
      const m = mergeConfigs(kn?.data, mine, data);
      if (m.conflicts.length) status({ conflicts: [...state.sync.conflicts, { key: k, at: Date.now(), paths: m.conflicts }] });
      applyEntity(ev.kind, ev.id, m.merged); known.set(k, { version: ev.version, data: clone(data) });
      changed();
    }
    state.onRemote?.();
  }

  // ---- project lifecycle ----
  async function openProject(project) {
    await closeProject();
    const ents = await state.backend.loadEntities(project.id);
    known = new Map(ents.map((e) => [keyOf(e.kind, e.id), { version: e.version, data: clone(e.data) }]));
    const dialectEnt = ents.find((e) => e.kind === "dialect");
    state.project = project; state.readOnly = project.role === "viewer";
    // a brand-new project starts from the default config (including the starter profiles)
    state.cfg = ents.length ? entitiesToCfg(clone(ents.filter((e) => e.kind !== "dialect")), newConfig(project.name)) : newConfig(project.name);
    state.cfg.name ||= project.name;
    state.dialect = upgradeDialect(clone(dialectEnt?.data)) ?? defaultDialect();
    state.sync.conflicts = []; status({ status: "saved", pending: 0, error: null });
    unsub = state.backend.subscribe(project.id, (ev) => onEvent(ev).catch((e) => status({ error: e.message })));
    if (state.user) pres = state.backend.presence(project.id, state.user, (list) => { state.presence = list; state.onStatus?.(); });
    // a brand-new project has nothing on the server yet: the first flush creates the base entities
    if (!ents.length && !state.readOnly) { state.cfg.name = project.name; changed(); }
  }
  async function closeProject() {
    clearTimeout(timer); if (state.project && !state.readOnly) await flush().catch(() => {});
    unsub?.(); unsub = null; pres?.close?.(); pres = null;
    state.project = null; state.presence = []; known = new Map();
  }
  const setPage = (p) => pres?.setPage?.(p);
  const onChange = (f) => { listeners.add(f); return () => listeners.delete(f); };

  /** Replaces the whole config (e.g. restoring a snapshot); saved as normal edits so it is audited. */
  function replaceConfig(cfg, dialect) { state.cfg = cfg; if (dialect) state.dialect = dialect; changed(); }

  return { state, changed, flush, openProject, closeProject, setPage, onChange, replaceConfig, setBackend: (b) => (state.backend = b), _known: () => known };
}

// default singleton used by the UI
export const app = createStore();
export const state = app.state;
export const changed = app.changed;
export const onChange = app.onChange;
export const replaceConfig = app.replaceConfig;
