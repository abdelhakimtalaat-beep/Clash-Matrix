// Local stand-in for Supabase, used ONLY for development and automated tests. In-memory, no security hardening.
// Mirrors the semantics of supabase/migrations/0001_schema.sql (roles, optimistic versions, soft delete, audit, snapshots).
import http from "node:http";
import { randomUUID } from "node:crypto";

export function createDevServer() {
  const users = new Map(), tokens = new Map(), projects = new Map(); // projects: id -> {id,name,members:Map,entities:Map,audit:[],snaps:[],sse:Set,presence:Map}
  const fail = (code, error, status = 400) => Object.assign(new Error(error), { code, status });
  const userOf = (tok) => { const u = tokens.get(tok); if (!u) throw fail("28000", "not_authenticated", 401); return u; };
  const proj = (id) => { const p = projects.get(id); if (!p) throw fail("42501", "forbidden", 403); return p; };
  const roleOf = (p, u) => p.members.get(u.id) ?? null;
  const need = (p, u, roles) => { const r = roleOf(p, u); if (!r || (roles && !roles.includes(r))) throw fail("42501", "forbidden", 403); return r; };
  const pub = (u) => ({ id: u.id, email: u.email, name: u.email.split("@")[0] });
  const emit = (p, row) => { for (const r of p.sse) r.write(`event: entity\ndata: ${JSON.stringify(row)}\n\n`); };
  const presenceBroadcast = (p) => { const list = [...p.presence.values()].map((x) => ({ id: x.user.id, name: x.name, page: x.page })); for (const r of p.sse2) r.write(`event: presence\ndata: ${JSON.stringify(list)}\n\n`); };

  const rpc = {
    signUp: ({ email, password }) => {
      if (!email || !password || password.length < 6) throw fail("400", "invalid email or password (min 6 chars)");
      if ([...users.values()].some((u) => u.email === email.toLowerCase())) throw fail("23505", "already registered");
      const u = { id: randomUUID(), email: email.toLowerCase(), password }; users.set(u.id, u);
      const token = randomUUID(); tokens.set(token, u); return { token, user: pub(u) };
    },
    signIn: ({ email, password }) => {
      const u = [...users.values()].find((x) => x.email === String(email).toLowerCase() && x.password === password);
      if (!u) throw fail("400", "Invalid login credentials", 400);
      const token = randomUUID(); tokens.set(token, u); return { token, user: pub(u) };
    },
    me: (_a, u) => pub(u),
    listProjects: (_a, u) => [...projects.values()].filter((p) => p.members.has(u.id)).map((p) => ({ id: p.id, name: p.name, role: p.members.get(u.id) })),
    createProject: ({ name }, u) => {
      if (!name?.trim()) throw fail("23514", "name required");
      const p = { id: randomUUID(), name, members: new Map([[u.id, "admin"]]), entities: new Map(), audit: [], snaps: [], sse: new Set(), sse2: new Set(), presence: new Map() };
      projects.set(p.id, p); return { id: p.id };
    },
    loadEntity: ({ pid, kind, id }, u) => { const p = proj(pid); need(p, u); const e = p.entities.get(`${kind}/${id}`); return e && !e.deleted ? { kind: e.kind, id: e.id, data: e.data, version: e.version } : null; },
    loadEntities: ({ pid }, u) => { const p = proj(pid); need(p, u); return [...p.entities.values()].filter((e) => !e.deleted).map(({ kind, id, data, version }) => ({ kind, id, data, version })); },
    saveEntity: ({ pid, kind, id, data, expected, deleted }, u) => {
      const p = proj(pid); need(p, u, ["editor", "admin"]);
      const k = `${kind}/${id}`, cur = p.entities.get(k);
      if (expected === 0) { if (cur) throw fail("40001", "conflict", 409); }
      else if (!cur || cur.version !== expected) throw fail("40001", "conflict", 409);
      const row = { kind, id, data, version: (cur?.version ?? 0) + 1, deleted: !!deleted };
      p.entities.set(k, row);
      p.audit.push({ id: p.audit.length + 1, at: new Date().toISOString(), by: u.email, action: !cur ? "insert" : deleted && !cur.deleted ? "delete" : cur.deleted && !deleted ? "restore" : "update", kind, entity_id: id, old_data: cur?.data ?? null, new_data: data });
      emit(p, { ...row, by: u.id });
      return { version: row.version };
    },
    members: ({ pid }, u) => { const p = proj(pid); need(p, u); return [...p.members].map(([userId, role]) => ({ userId, role, email: users.get(userId).email, name: users.get(userId).email.split("@")[0] })); },
    addMember: ({ pid, email, role }, u) => {
      const p = proj(pid); need(p, u, ["admin"]);
      const t = [...users.values()].find((x) => x.email === String(email).trim().toLowerCase());
      if (!t) throw fail("P0002", "user_not_found"); p.members.set(t.id, role); return {};
    },
    setRole: ({ pid, userId, role }, u) => {
      const p = proj(pid); need(p, u, ["admin"]);
      if (role !== "admin" && [...p.members].filter(([id, r]) => r === "admin" && id !== userId).length === 0) throw fail("P0001", "last_admin");
      p.members.set(userId, role); return {};
    },
    removeMember: ({ pid, userId }, u) => {
      const p = proj(pid); if (userId !== u.id) need(p, u, ["admin"]);
      if (p.members.get(userId) === "admin" && [...p.members].filter(([id, r]) => r === "admin" && id !== userId).length === 0) throw fail("P0001", "last_admin");
      p.members.delete(userId); return {};
    },
    audit: ({ pid, limit }, u) => { const p = proj(pid); need(p, u); return [...p.audit].reverse().slice(0, limit ?? 100); },
    snapshots: ({ pid }, u) => { const p = proj(pid); need(p, u); return p.snaps.map(({ id, label, created_at }) => ({ id, label, created_at })).reverse(); },
    createSnapshot: ({ pid, label, data }, u) => { const p = proj(pid); need(p, u, ["editor", "admin"]); p.snaps.push({ id: randomUUID(), label, data, created_at: new Date().toISOString() }); return {}; },
    loadSnapshot: ({ id }, u) => { for (const p of projects.values()) { const s = p.snaps.find((x) => x.id === id); if (s) { need(p, u); return s.data; } } throw fail("PGRST116", "not found", 404); },
    presencePage: ({ pid, page }, u) => { const p = proj(pid); for (const x of p.presence.values()) if (x.user.id === u.id) x.page = page; presenceBroadcast(p); return {}; },
  };

  const server = http.createServer(async (req, res) => {
    const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
    const url = new URL(req.url, "http://x");
    if (req.method === "OPTIONS") { res.writeHead(204, cors); return res.end(); }
    try {
      if (url.pathname === "/events" || url.pathname === "/presence") {
        const u = userOf(url.searchParams.get("token")), p = proj(url.searchParams.get("pid")); need(p, u);
        res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
        res.write(": ok\n\n");
        if (url.pathname === "/events") { p.sse.add(res); req.on("close", () => p.sse.delete(res)); }
        else {
          const key = randomUUID(); p.presence.set(key, { user: u, name: url.searchParams.get("name") || u.email, page: "" }); p.sse2.add(res);
          presenceBroadcast(p);
          req.on("close", () => { p.presence.delete(key); p.sse2.delete(res); presenceBroadcast(p); });
        }
        return;
      }
      const m = /^\/rpc\/(\w+)$/.exec(url.pathname);
      if (!m || !rpc[m[1]]) { res.writeHead(404, cors); return res.end("{}"); }
      let body = ""; for await (const c of req) body += c;
      const args = body ? JSON.parse(body) : {};
      const auth = (req.headers.authorization ?? "").replace(/^Bearer /, "");
      const u = ["signUp", "signIn"].includes(m[1]) ? null : userOf(auth);
      const out = rpc[m[1]](args, u);
      res.writeHead(200, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify(out));
    } catch (e) {
      res.writeHead(e.status ?? 400, { ...cors, "Content-Type": "application/json" }); res.end(JSON.stringify({ error: e.message, code: e.code }));
    }
  });
  return { server, rpc, users, projects };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  createDevServer().server.listen(port, () => console.log(`dev server on http://localhost:${port}`));
}
