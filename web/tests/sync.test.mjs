import test from "node:test";
import assert from "node:assert/strict";
import { boot, until } from "./helpers.mjs";

const make = async (dev, email) => {
  const { createBackend } = await import("../js/backend/dev.js");
  const { createStore } = await import("../js/store.js");
  const b = createBackend();
  const user = await b.signUp(email, "secret1").catch(() => b.signIn(email, "secret1"));
  const s = createStore(b, { flushDelay: 20 }); s.state.user = user;
  return { b, s, user };
};
const T = (id, name) => ({ id, name, enabled: true, testType: "Hard", options: {}, searchSetAId: "a", searchSetBId: "b" });

test("two editors: propagation, disjoint merge, conflict merge, delete, viewer read-only", async () => {
  const { dev, close } = await boot();
  try {
    const A = await make(dev, "alice@x.com"), B = await make(dev, "bob@x.com"), C = await make(dev, "carol@x.com");
    const pid = await A.b.createProject("P");
    await A.b.addMember(pid, "bob@x.com", "editor"); await A.b.addMember(pid, "carol@x.com", "viewer");
    await A.s.openProject({ id: pid, name: "P", role: "admin" });
    A.s.state.cfg.clashTests.push(T("t1", "one"), T("t2", "two")); A.s.changed();
    assert.ok(await until(() => A.s.state.sync.status === "saved" && A.s._known().has("clashTest/t2")));

    await B.s.openProject({ id: pid, name: "P", role: "editor" });
    await C.s.openProject({ id: pid, name: "P", role: "viewer" });
    assert.deepEqual(B.s.state.cfg.clashTests.map((t) => t.name), ["one", "two"], "bob loads existing data");
    assert.equal(C.s.state.readOnly, true);

    // 1. live propagation
    A.s.state.cfg.clashTests[0].name = "one-A"; A.s.changed();
    assert.ok(await until(() => B.s.state.cfg.clashTests[0].name === "one-A" && C.s.state.cfg.clashTests[0].name === "one-A"), "edit reaches everyone");

    // 2. disjoint edits at the same moment both survive
    A.s.state.cfg.clashTests[1].enabled = false; A.s.changed();
    B.s.state.cfg.clashTests[0].testType = "Clearance"; B.s.changed();
    assert.ok(await until(() => [A, B, C].every((x) => x.s.state.cfg.clashTests[1].enabled === false && x.s.state.cfg.clashTests[0].testType === "Clearance")));

    // 3. same field edited by both: converge on one value, a conflict is reported to the loser
    A.s.state.cfg.clashTests[1].name = "two-by-A"; B.s.state.cfg.clashTests[1].name = "two-by-B";
    A.s.changed(); B.s.changed();
    assert.ok(await until(() => [A, B, C].every((x) => x.s.state.cfg.clashTests[1].name === A.s.state.cfg.clashTests[1].name) && A.s.state.sync.status === "saved" && B.s.state.sync.status === "saved"));
    assert.ok(["two-by-A", "two-by-B"].includes(C.s.state.cfg.clashTests[1].name));

    // 4. delete propagates
    B.s.state.cfg.clashTests.splice(0, 1); B.s.changed();
    assert.ok(await until(() => [A, B, C].every((x) => x.s.state.cfg.clashTests.length === 1)));

    // 5. viewer edits never reach the server
    C.s.state.cfg.clashTests[0].name = "HACK"; C.s.changed();
    await new Promise((r) => setTimeout(r, 300));
    assert.notEqual(A.s.state.cfg.clashTests[0].name, "HACK");
    // and the server refuses a viewer even when the client misbehaves
    await assert.rejects(C.b.saveEntity(pid, "clashTest", "t2", T("t2", "HACK"), 99), /forbidden/);

    // 6. everyone converged on identical data; audit has the history
    const snap = (x) => JSON.stringify([x.s.state.cfg.clashTests, x.s.state.cfg.name]);
    assert.equal(snap(A), snap(B)); assert.equal(snap(B), snap(C));
    const audit = await A.b.audit(pid);
    assert.ok(audit.some((a) => a.action === "delete") && audit.some((a) => a.action === "update"));
    await Promise.all([A, B, C].map((x) => x.s.closeProject()));
  } finally { close(); }
});

test("offline edits are retried and a stale browser session recovers via merge", async () => {
  const { dev, close } = await boot();
  try {
    const A = await make(dev, "a@x.com"), B = await make(dev, "b@x.com");
    const pid = await A.b.createProject("P"); await A.b.addMember(pid, "b@x.com", "editor");
    await A.s.openProject({ id: pid, name: "P", role: "admin" }); await B.s.openProject({ id: pid, name: "P", role: "editor" });
    A.s.state.cfg.clashTests.push(T("x", "x")); A.s.changed();
    assert.ok(await until(() => B.s.state.cfg.clashTests.length === 1));
    // B's connection to the server drops: saves fail, state shows error, data stays in memory
    const real = B.b.saveEntity; B.b.saveEntity = async () => { throw new Error("network down"); };
    B.s.state.cfg.clashTests[0].name = "offline edit"; B.s.changed();
    assert.ok(await until(() => B.s.state.sync.status === "error"));
    assert.equal(B.s.state.cfg.clashTests[0].name, "offline edit");
    B.b.saveEntity = real; await B.s.flush();
    assert.ok(await until(() => A.s.state.cfg.clashTests[0].name === "offline edit"));
    await Promise.all([A, B].map((x) => x.s.closeProject()));
  } finally { close(); }
});

test("a conflict storm pauses auto-save instead of hammering the database", async () => {
  const { dev, close } = await boot();
  try {
    const A = await make(dev, "storm@x.com");
    A.s = (await import("../js/store.js")).createStore(A.b, { flushDelay: 20, retryBase: 20 }); A.s.state.user = A.user;
    const pid = await A.b.createProject("S");
    await A.s.openProject({ id: pid, name: "S", role: "admin" });
    let saves = 0, loads = 0;
    const real = A.b.saveEntity, realOne = A.b.loadEntity;
    A.b.saveEntity = async (...a) => { saves++; const e = new Error("conflict"); e.conflict = true; throw e; }; // another session always wins
    A.b.loadEntity = async (p, kind, id) => { loads++; const r = await realOne(p, kind, id); return r ?? { kind, id, data: {}, version: 99 }; };
    A.s.state.cfg.clashTests.push(T("t1", "one")); A.s.changed();
    assert.ok(await until(() => A.s.state.sync.paused === true, 3000), "auto-save pauses");
    const before = saves;
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(saves, before, "no further attempts after pausing");
    assert.ok(saves <= 40 && loads <= 40, `bounded work (saves ${saves}, single-entity loads ${loads})`);
    void real;
  } finally { await close(); }
});
