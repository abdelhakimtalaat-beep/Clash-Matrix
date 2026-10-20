import test from "node:test";
import assert from "node:assert/strict";
import { resolvePriority, priorityXml, lodRules } from "../js/core/lod.js";
import { defaultDialect } from "../js/core/dialect.js";
import { newConfig } from "../js/core/model.js";

test("priority follows the first letter of the test code", () => {
  const cfg = newConfig("p");
  const r = (code) => resolvePriority(cfg, { sourceCode: code, name: "x" });
  assert.deepEqual([r("A1-AH"), r("B2"), r("C2-SH"), r("D1")].map((x) => [x.lod, x.priority]), [["LOD200", "High"], ["LOD300", "Medium"], ["LOD350", "Low"], ["LOD400", "Low"]]);
  assert.equal(r("a9").priority, "High", "case-insensitive");
  assert.equal(r("Z1").priority, null);
  assert.equal(resolvePriority(cfg, { sourceCode: "A1", priorityOverride: "Low" }).priority, "Low", "manual override wins");
  assert.equal(resolvePriority(cfg, { name: "B3_x vs y" }).priority, "Medium", "falls back to the test name");
  assert.equal(lodRules(cfg).length, 4);
});

test("XML priority uses the dialect mapping, default 0 until confirmed", () => {
  const cfg = newConfig("p"), d = defaultDialect(), t = { sourceCode: "A1" };
  assert.equal(priorityXml(cfg, t, d), "0");
  d.priorityValues.High = 3;
  assert.equal(priorityXml(cfg, t, d), "3");
});
