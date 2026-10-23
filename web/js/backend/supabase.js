// Supabase backend. Needs web/config.js with { supabaseUrl, supabaseAnonKey } (see docs/SETUP-AR.md).
// NOTE: written against the supabase-js v2 API from documentation; it has NOT been run against a real Supabase project.
const SDK = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";
let client = null;

async function sb() {
  if (client) return client;
  const { createClient } = await import(SDK);
  const c = globalThis.__BCM_CONFIG ?? {};
  if (!c.supabaseUrl || !c.supabaseAnonKey) throw new Error("Supabase is not configured (config.js)");
  client = createClient(c.supabaseUrl, c.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true } });
  return client;
}
const must = ({ data, error }) => { if (error) { const e = new Error(error.message); e.code = error.code; e.conflict = error.code === "40001" || /conflict/.test(error.message); throw e; } return data; };
const userOf = (u) => (u ? { id: u.id, email: u.email, name: (u.email ?? "").split("@")[0] } : null);

export const backend = {
  kind: "supabase",
  async getSession() { const c = await sb(); const { data } = await c.auth.getSession(); return userOf(data.session?.user); },
  onAuth(cb) { let off = () => {}; sb().then((c) => { const { data } = c.auth.onAuthStateChange((_e, s) => cb(userOf(s?.user))); off = () => data.subscription.unsubscribe(); }); return () => off(); },
  async signUp(email, password) { const c = await sb(); const d = must(await c.auth.signUp({ email, password })); return userOf(d.user); },
  async signIn(email, password) { const c = await sb(); const d = must(await c.auth.signInWithPassword({ email, password })); return userOf(d.user); },
  async signOut() { const c = await sb(); await c.auth.signOut(); },

  async listProjects() {
    const c = await sb(); const me = (await c.auth.getUser()).data.user;
    const rows = must(await c.from("project_members").select("role, projects(id, name)").eq("user_id", me.id));
    return rows.map((r) => ({ id: r.projects.id, name: r.projects.name, role: r.role }));
  },
  async createProject(name) { const c = await sb(); return must(await c.rpc("create_project", { p_name: name })); },

  /** Admin only (row-level security); everything in the project (entities, members, audit, versions) goes with it. */
  async deleteProject(id) {
    const c = await sb(); const rows = must(await c.from("projects").delete().eq("id", id).select("id"));
    if (!rows?.length) throw new Error("Only a project admin can delete a project.");
  },

  /** One entity (used on conflicts, so a conflict never re-downloads the whole project). Returns null when it does not exist. */
  async loadEntity(pid, kind, id) {
    const c = await sb();
    const rows = must(await c.from("entities").select("kind,id,data,version").eq("project_id", pid).eq("kind", kind).eq("id", id).eq("deleted", false).limit(1));
    return rows[0] ?? null;
  },
  async loadEntities(pid) {
    const c = await sb(); const out = []; const PAGE = 500;
    for (let from = 0; ; from += PAGE) {
      const rows = must(await c.from("entities").select("kind,id,data,version").eq("project_id", pid).eq("deleted", false).order("kind").order("id").range(from, from + PAGE - 1));
      out.push(...rows); if (rows.length < PAGE) break;
    }
    return out;
  },
  async saveEntity(pid, kind, id, data, expected, deleted = false) {
    const c = await sb();
    return must(await c.rpc("save_entity", { p_project: pid, p_kind: kind, p_id: id, p_data: data, p_expected: expected, p_deleted: deleted }));
  },
  async members(pid) {
    const c = await sb();
    const rows = must(await c.from("project_members").select("user_id, role, profiles(email, display_name)").eq("project_id", pid));
    return rows.map((r) => ({ userId: r.user_id, role: r.role, email: r.profiles?.email, name: r.profiles?.display_name }));
  },
  async addMember(pid, email, role) { const c = await sb(); must(await c.rpc("add_member_by_email", { p_project: pid, p_email: email, p_role: role })); },
  async setRole(pid, userId, role) { const c = await sb(); must(await c.rpc("set_member_role", { p_project: pid, p_user: userId, p_role: role })); },
  async removeMember(pid, userId) { const c = await sb(); must(await c.rpc("remove_member", { p_project: pid, p_user: userId })); },
  async audit(pid, limit = 100) {
    const c = await sb();
    const rows = must(await c.from("audit_log").select("id, at, by_user, action, kind, entity_id, new_data, old_data").eq("project_id", pid).order("id", { ascending: false }).limit(limit));
    const ids = [...new Set(rows.map((r) => r.by_user).filter(Boolean))];
    const profs = ids.length ? must(await c.from("profiles").select("id, email").in("id", ids)) : [];
    const name = new Map(profs.map((p) => [p.id, p.email]));
    return rows.map((r) => ({ ...r, by: name.get(r.by_user) ?? null }));
  },
  async snapshots(pid) { const c = await sb(); return must(await c.from("snapshots").select("id,label,created_at,created_by").eq("project_id", pid).order("created_at", { ascending: false })); },
  async createSnapshot(pid, label, data) { const c = await sb(); must(await c.from("snapshots").insert({ project_id: pid, label, data })); },
  async loadSnapshot(id) { const c = await sb(); return must(await c.from("snapshots").select("data").eq("id", id).single()).data; },

  subscribe(pid, onEvent) {
    let ch, dead = false;
    sb().then((c) => {
      if (dead) return;
      ch = c.channel(`entities:${pid}`).on("postgres_changes", { event: "*", schema: "public", table: "entities", filter: `project_id=eq.${pid}` },
        (p) => { const r = p.new; if (r?.kind) onEvent({ kind: r.kind, id: r.id, data: r.data, version: r.version, deleted: r.deleted, by: r.updated_by }); }).subscribe();
    });
    return () => { dead = true; if (ch) client.removeChannel(ch); };
  },
  presence(pid, me, onSync) {
    let ch, dead = false, cur = "";
    sb().then((c) => {
      if (dead) return;
      ch = c.channel(`presence:${pid}`, { config: { presence: { key: me.id } } });
      ch.on("presence", { event: "sync" }, () => onSync(Object.values(ch.presenceState()).flat().map((p) => ({ id: p.id, name: p.name, page: p.page }))));
      ch.subscribe((s) => { if (s === "SUBSCRIBED") ch.track({ id: me.id, name: me.name, page: cur }); });
    });
    return { close: () => { dead = true; if (ch) client.removeChannel(ch); }, setPage: (page) => { cur = page; ch?.track({ id: me.id, name: me.name, page }); } };
  },
};
