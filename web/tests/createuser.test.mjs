import test from "node:test";
import assert from "node:assert/strict";
import handler from "../../api/create-user.js";

const PID = "11111111-1111-4111-8111-111111111111";
const mkRes = () => { const r = { headers: {} }; r.setHeader = (k, v) => (r.headers[k] = v); r.end = (b) => (r.body = JSON.parse(b)); return r; };
async function call({ body = {}, token = "tok", admin = true, exists = false, method = "POST", env = true } = {}) {
  process.env.SUPABASE_URL = env ? "https://x.supabase.co" : ""; process.env.SUPABASE_SERVICE_ROLE_KEY = env ? "svc" : "";
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const J = (st, b) => ({ ok: st < 300, status: st, json: async () => b, text: async () => JSON.stringify(b) });
    if (url.endsWith("/auth/v1/user")) return token === "tok" ? J(200, { id: "caller" }) : J(401, {});
    if (url.includes("/rest/v1/project_members?project_id")) return J(200, admin ? [{ role: "admin" }] : []);
    if (url.endsWith("/auth/v1/admin/users")) return exists ? J(422, { msg: "A user with this email address has already been registered" }) : J(200, { id: "new-user" });
    if (url.includes("/rest/v1/profiles")) return J(200, [{ id: "old-user" }]);
    if (url.includes("on_conflict")) return J(201, {});
    throw new Error("unexpected " + url);
  };
  const res = mkRes();
  await handler({ method, body, headers: { authorization: `Bearer ${token}` } }, res);
  return { res, calls };
}
const ok = { projectId: PID, email: "New@Co.com", password: "Passw0rd!", role: "editor" };

test("admin creates a confirmed user flagged to change password, then adds membership", async () => {
  const { res, calls } = await call({ body: ok });
  assert.equal(res.statusCode, 200); assert.deepEqual(res.body, { ok: true, created: true, userId: "new-user" });
  const mk = JSON.parse(calls.find((c) => c.url.endsWith("/admin/users")).init.body);
  assert.deepEqual(mk, { email: "new@co.com", password: "Passw0rd!", email_confirm: true, user_metadata: { must_change_password: true } });
  const add = JSON.parse(calls.find((c) => c.url.includes("on_conflict")).init.body);
  assert.deepEqual(add, { project_id: PID, user_id: "new-user", role: "editor" });
});
test("non-admin is refused and nothing is created", async () => {
  const { res, calls } = await call({ body: ok, admin: false });
  assert.equal(res.statusCode, 403); assert.ok(!calls.some((c) => c.url.endsWith("/admin/users")));
});
test("bad session, short password, bad email, bad role, GET and missing config are rejected", async () => {
  assert.equal((await call({ body: ok, token: "bad" })).res.statusCode, 401);
  assert.equal((await call({ body: { ...ok, password: "short" } })).res.statusCode, 400);
  assert.equal((await call({ body: { ...ok, email: "nope" } })).res.statusCode, 400);
  assert.equal((await call({ body: { ...ok, role: "owner" } })).res.statusCode, 400);
  assert.equal((await call({ body: ok, method: "GET" })).res.statusCode, 405);
  assert.equal((await call({ body: ok, env: false })).res.statusCode, 500);
});
test("existing account is only added to the project, password untouched", async () => {
  const { res, calls } = await call({ body: ok, exists: true });
  assert.equal(res.statusCode, 200); assert.equal(res.body.created, false); assert.equal(res.body.userId, "old-user");
  assert.deepEqual(JSON.parse(calls.find((c) => c.url.includes("on_conflict")).init.body).user_id, "old-user");
});
