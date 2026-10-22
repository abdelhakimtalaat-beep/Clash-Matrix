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

import { typeOfCode, syncClashTypes } from "../js/core/clashtype.js";
test("clash type follows the last letter of the code", () => {
  assert.deepEqual(["A1-AH", "B2-AC", "C1-AD", "a1-ah", "A1", "X"].map(typeOfCode), ["Hard", "Clearance", "Duplicates", "Hard", null, null]);
  const cfg = newConfig("p");
  cfg.codeMappings.push({ id: "m1", code: "A1-AD", generateTest: true, profileId: null });
  cfg.clashTests.push({ id: "t1", name: "x", sourceCode: "A1-AD", testType: "Hard", profileId: "profile-hard", locked: false });
  cfg.clashTests.push({ id: "t2", name: "y", sourceCode: "A1-AD", testType: "Hard", profileId: "profile-hard", locked: true });
  assert.ok(syncClashTypes(cfg) > 0);
  assert.equal(cfg.profiles.some((p) => p.testType === "Duplicates"), true, "Duplicates profile is created");
  assert.equal(cfg.clashTests[0].testType, "Duplicates", "existing unlocked test follows");
  assert.equal(cfg.clashTests[1].testType, "Hard", "locked test untouched");
  assert.equal(syncClashTypes(cfg), 0, "idempotent");
});

import { responsibilityOf, subPriorityOf } from "../js/core/codes.js";
test("responsibility is the 4th character of the code", () => {
  assert.equal(responsibilityOf("A4-AH"), "A-Architecture");
  assert.equal(responsibilityOf("B2-SH"), "S-Structure");
  assert.equal(responsibilityOf("C1-TD"), "T-Telecommunication");
  assert.equal(responsibilityOf("A1-XH"), null);
  assert.equal(responsibilityOf("A1"), null);
  assert.equal(subPriorityOf("A4-AH"), "4");
});

import { groupOfCode } from "../js/core/codes.js";
test("discipline groups follow the 4th character; LOD and discipline filters combine", () => {
  assert.deepEqual(["A4-AH", "A1-IH", "B2-SH", "C1-HH", "C1-EH", "C1-FH", "C1-PH", "C1-TH", "A1-LH", "A1-CH", "A1-RH", "A1-XH"].map(groupOfCode),
    ["Architecture", "Interior Design", "Structure", "MEP", "MEP", "MEP", "MEP", "MEP", "Landscape", "Infrastructure", "Roads", null]);
  const cfg = newConfig("p");
  cfg.discFilter = ["MEP"];
  assert.equal(codeActive(cfg, "B2-HH"), true);
  assert.equal(codeActive(cfg, "B2-SH"), false);
  cfg.lodFilter = ["C"];
  assert.equal(codeActive(cfg, "B2-HH"), false, "LOD must match as well");
  assert.equal(codeActive(cfg, "C3-TD"), true);
});
