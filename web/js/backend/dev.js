// Development backend: talks to scripts/devserver.mjs over HTTP + SSE. Same interface as backend/supabase.js.
// It exists so the whole app (two browsers, roles, realtime, conflicts) can be exercised without a Supabase project.
const BASE = () => globalThis.__BCM_CONFIG?.devServer ?? "http://localhost:8787";
export function createBackend() {
let token = null;
try { token = sessionStorage.getItem("dev-token"); } catch {}

async function call(name, args = {}) {
  const res = await fetch(`${BASE()}/rpc/${name}`, { method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(args) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(body.error ?? `HTTP ${res.status}`); e.code = body.code; e.conflict = body.code === "40001"; throw e; }
  return body;
}
const listeners = new Set();
const setToken = (t, user) => { token = t; try { t ? sessionStorage.setItem("dev-token", t) : sessionStorage.removeItem("dev-token"); } catch {} listeners.forEach((f) => f(user)); };

return {
  kind: "dev",
  async getSession() { if (!token) return null; try { return await call("me"); } catch { token = null; return null; } },
  onAuth(cb) { listeners.add(cb); return () => listeners.delete(cb); },
  async signUp(email, password) { const r = await call("signUp", { email, password }); setToken(r.token, r.user); return r.user; },
  async signIn(email, password) { const r = await call("signIn", { email, password }); setToken(r.token, r.user); return r.user; },
  async signOut() { setToken(null, null); },
  listProjects: () => call("listProjects"),
  createProject: (name) => call("createProject", { name }).then((r) => r.id),
  loadEntities: (pid) => call("loadEntities", { pid }),
  saveEntity: (pid, kind, id, data, expected, deleted = false) => call("saveEntity", { pid, kind, id, data, expected, deleted }).then((r) => r.version),
  members: (pid) => call("members", { pid }),
  addMember: (pid, email, role) => call("addMember", { pid, email, role }),
  setRole: (pid, userId, role) => call("setRole", { pid, userId, role }),
  removeMember: (pid, userId) => call("removeMember", { pid, userId }),
  audit: (pid, limit = 100) => call("audit", { pid, limit }),
  snapshots: (pid) => call("snapshots", { pid }),
  createSnapshot: (pid, label, data) => call("createSnapshot", { pid, label, data }),
  loadSnapshot: (id) => call("loadSnapshot", { id }),
  /** onEvent({kind,id,data,version,deleted,by}) for every entity change made by anybody (including me). */
  subscribe(pid, onEvent) {
    const es = new EventSource(`${BASE()}/events?pid=${pid}&token=${encodeURIComponent(token)}`);
    es.addEventListener("entity", (m) => onEvent(JSON.parse(m.data)));
    return () => es.close();
  },
  presence(pid, me, onSync) {
    const es = new EventSource(`${BASE()}/presence?pid=${pid}&token=${encodeURIComponent(token)}&name=${encodeURIComponent(me.name)}&page=`);
    es.addEventListener("presence", (m) => onSync(JSON.parse(m.data)));
    return { close: () => es.close(), setPage: (page) => call("presencePage", { pid, page }).catch(() => {}) };
  },
};
}
export const backend = createBackend();
