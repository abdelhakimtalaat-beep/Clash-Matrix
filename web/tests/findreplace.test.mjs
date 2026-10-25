import test from "node:test";
import assert from "node:assert/strict";
import { findReplace } from "../js/core/findreplace.js";
import { newConfig, newSearchSet, newCondition } from "../js/core/model.js";
const mk = (name, folder, values) => { const s = newSearchSet(); s.name = name; s.folder = folder; s.root = { mode: "All", conditions: values.map((v) => ({ ...newCondition(), operator: "Contains", value: v })), groups: [] }; return s; };
test("find & replace changes Value cells, by scope, case and whole-value options", () => {
  const cfg = newConfig("p");
  cfg.searchSets.push(mk("A-Walls", "A-Architecture", ["A-Navisworks", "Wall"]), mk("A-Doors", "A-Architecture", ["A-Navis"]), mk("S-Beams", "S-Structure", ["A-Navis", "Framing"]));
  assert.equal(findReplace(cfg, { find: "a-navis" }).values, 3, "case-insensitive by default");
  assert.equal(findReplace(cfg, { find: "a-navis", matchCase: true }).values, 0);
  assert.equal(findReplace(cfg, { find: "A-Navis", scope: "folder", folder: "A-Architecture" }).values, 2);
  assert.equal(findReplace(cfg, { find: "A-Navis", wholeValue: true }).values, 2, "whole value skips A-Navisworks");
  const r = findReplace(cfg, { find: "A-Navis", replace: "AR-ZZ", apply: true });
  assert.deepEqual(cfg.searchSets.map((s) => s.root.conditions.map((c) => c.value)), [["AR-ZZworks", "Wall"], ["AR-ZZ"], ["AR-ZZ", "Framing"]]);
  assert.equal(r.values, 3);
  assert.equal(findReplace(cfg, { find: "ZZ", scope: "set", setId: cfg.searchSets[1].id, replace: "Q", apply: true, wholeValue: false }).values, 1);
  assert.equal(findReplace(cfg, { find: "" }).values, 0);
});
