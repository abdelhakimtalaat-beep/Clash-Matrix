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

test("XML priority uses the dialect mapping (1=High, 2=Medium, 3=Low); unknown letters get the default", () => {
  const cfg = newConfig("p"), d = defaultDialect();
  assert.deepEqual(["A1", "B1", "C1", "D1", "Z1"].map((c) => priorityXml(cfg, { sourceCode: c }, d)), ["1", "2", "3", "3", "0"]);
  d.priorityValues.High = null;
  assert.equal(priorityXml(cfg, { sourceCode: "A1" }, d), "0", "unmapped priority falls back to the default");
});

import { generateTests } from "../js/core/generate.js";
import { codeActive, lodActive } from "../js/core/lod.js";
test("LOD filter limits which codes are active", () => {
  const cfg = newConfig("p");
  assert.equal(codeActive(cfg, "H"), true, "no filter = everything");
  cfg.lodFilter = ["C"];
  assert.deepEqual(["C2-SH", "A1-AH", "c1"].map((c) => codeActive(cfg, c)), [true, false, true]);
  assert.equal(lodActive(cfg, { name: "A1_x vs y" }), false);
  void generateTests;
});
