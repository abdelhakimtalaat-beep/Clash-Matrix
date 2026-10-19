import test from "node:test";
import assert from "node:assert/strict";
import { newConfig } from "../js/core/model.js";
import { cfgToEntities, entitiesToCfg, diffEntities, hydrate } from "../js/core/entities.js";

test("config round-trips through entities", () => {
  const c = newConfig("N"); c.clashTests.push(hydrate("clashTest", { id: "t", name: "T" })); c.searchSets.push(hydrate("searchSet", { id: "s", name: "S" }));
  const back = entitiesToCfg(cfgToEntities(c), newConfig());
  assert.deepEqual(back, c);
});
test("diff reports only changed entities", () => {
  const c = newConfig("N"); c.clashTests.push({ id: "t", name: "T" }, { id: "u", name: "U" });
  const before = structuredClone(cfgToEntities(c)); c.clashTests[0].name = "T2"; c.clashTests.pop(); c.searchSets.push({ id: "s", name: "S" });
  const d = diffEntities(before, cfgToEntities(c));
  assert.deepEqual(d.upserts.map((e) => `${e.kind}/${e.id}`).sort(), ["clashTest/t", "searchSet/s"]);
  assert.deepEqual(d.deletes.map((e) => `${e.kind}/${e.id}`), ["clashTest/u"]);
});

test("derived fields are not persisted, and are restored with defaults", () => {
  const c = newConfig("N");
  c.clashTests.push({ id: "t", name: "T", resolvedTolerance: { value: "1", unit: "Meters" }, toleranceSource: "x", status: "Valid" });
  c.searchSets.push({ id: "s", name: "S", status: { syntacticallyValid: true, representable: true, modelVerified: false, modelHitCount: null } });
  const ents = cfgToEntities(c);
  assert.equal(ents.find((e) => e.id === "t").data.resolvedTolerance, undefined);
  assert.equal(ents.find((e) => e.id === "s").data.status.representable, undefined);
  const back = entitiesToCfg(ents, newConfig());
  assert.equal(back.clashTests[0].status, "Unvalidated");
  assert.equal(back.searchSets[0].status.representable, false);
});
