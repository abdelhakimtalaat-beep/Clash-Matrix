// Vercel serverless function: a project admin creates a user (email + default password) and adds them to the project.
// Needs the server-only env var SUPABASE_SERVICE_ROLE_KEY (never put it in web/ or config.js). SUPABASE_URL is shared with the build.
// Security: the caller's Supabase session token is verified, and the caller must be an admin of the project (checked with the service key).
const ROLES = ["viewer", "editor", "admin"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const reply = (res, status, body) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(body)); };

export default async function handler(req, res) {
  if (req.method !== "POST") return reply(res, 405, { error: "POST only" });
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) return reply(res, 500, { error: "Server is not configured: set SUPABASE_SERVICE_ROLE_KEY in Vercel (Settings > Environment Variables) and redeploy." });

  const claim = (() => { try { return JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()).role; } catch { return null; } })();
  if (key.startsWith("sb_publishable_") || claim === "anon" || key === process.env.SUPABASE_ANON_KEY)
    return reply(res, 500, { error: "SUPABASE_SERVICE_ROLE_KEY in Vercel holds the public (anon/publishable) key. Put the secret key there (service_role or sb_secret_...) and redeploy." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  const { projectId, email: rawEmail, password, role } = body ?? {};
  const email = String(rawEmail ?? "").trim().toLowerCase();
  if (!UUID.test(String(projectId ?? ""))) return reply(res, 400, { error: "Bad project id" });
  if (!EMAIL.test(email)) return reply(res, 400, { error: "Invalid email address" });
  if (!ROLES.includes(role)) return reply(res, 400, { error: "Invalid role" });
  if (typeof password !== "string" || password.length < 8) return reply(res, 400, { error: "The default password must be at least 8 characters" });

  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return reply(res, 401, { error: "Not signed in" });
  // legacy service_role keys are JWTs (sent as apikey + Bearer); new sb_secret_ keys go in apikey only
  const svc = key.startsWith("sb_secret_") ? { apikey: key } : { apikey: key, Authorization: `Bearer ${key}` };
  const json = { ...svc, "Content-Type": "application/json" };

  try {
    // 1) who is calling?
    const me = await fetch(`${url}/auth/v1/user`, { headers: { apikey: process.env.SUPABASE_ANON_KEY || key, Authorization: `Bearer ${token}` } });
    if (!me.ok) return reply(res, 401, { error: "Invalid or expired session" });
    const caller = await me.json();
    // 2) are they an admin of this project?
    const adm = await fetch(`${url}/rest/v1/project_members?project_id=eq.${projectId}&user_id=eq.${caller.id}&role=eq.admin&select=role`, { headers: svc });
    if (!adm.ok) return reply(res, 500, { error: `Could not check admin rights (Supabase answered ${adm.status}): check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY` });
    if (!(await adm.json()).length) return reply(res, 403, { error: "Only a project admin can add users" });

    // 3) create the account (already confirmed, flagged so the user must choose their own password at first sign-in)
    let userId = null, created = false;
    const mk = await fetch(`${url}/auth/v1/admin/users`, { method: "POST", headers: json, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { must_change_password: true } }) });
    if (mk.ok) { userId = (await mk.json()).id; created = true; }
    else {
      const err = await mk.json().catch(() => ({}));
      if (!(mk.status === 422 || /already|registered|exists/i.test(err.msg ?? err.message ?? ""))) return reply(res, 400, { error: err.msg ?? err.message ?? "Could not create the user" });
      // account exists already: just add it to the project (its password is left untouched)
      const f = await fetch(`${url}/rest/v1/profiles?email=ilike.${encodeURIComponent(email)}&select=id`, { headers: svc });
      userId = f.ok ? (await f.json())[0]?.id : null;
      if (!userId) return reply(res, 400, { error: "This email is already registered but could not be found" });
    }

    // 4) add to the project (insert or change role)
    const add = await fetch(`${url}/rest/v1/project_members?on_conflict=project_id,user_id`, { method: "POST", headers: { ...json, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify({ project_id: projectId, user_id: userId, role }) });
    if (!add.ok) return reply(res, 500, { error: `User ${created ? "created" : "found"} but adding to the project failed: ${await add.text()}` });
    return reply(res, 200, { ok: true, created, userId });
  } catch (e) {
    return reply(res, 500, { error: String(e?.message ?? e) });
  }
}
