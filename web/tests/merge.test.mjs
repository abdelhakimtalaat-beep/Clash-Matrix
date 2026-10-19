import test from "node:test";
import assert from "node:assert/strict";
import { mergeConfigs } from "../js/core/merge.js";

const mk = (tests, extra = {}) => ({ name: "P", clashTests: tests, ...extra });
const T = (id, name, enabled = true) => ({ id, name, enabled });

test("disjoint edits from two people both survive", () => {
  const base = mk([T("a", "A"), T("b", "B")]);
  const me = mk([T("a", "A2"), T("b", "B")]);
  const you = mk([T("a", "A"), T("b", "B2", false)]);
  const r = mergeConfigs(base, me, you);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.merged.clashTests, [T("a", "A2"), T("b", "B2", false)]);
});
test("additions on both sides are kept, remote deletion applies", () => {
  const base = mk([T("a", "A"), T("b", "B")]);
  const me = mk([T("a", "A"), T("b", "B"), T("m", "mine")]);
  const you = mk([T("a", "A"), T("y", "yours")]);
  const r = mergeConfigs(base, me, you);
  assert.deepEqual(r.merged.clashTests.map((x) => x.id).sort(), ["a", "m", "y"]);
});
test("same field changed differently = conflict, local wins", () => {
  const base = mk([T("a", "A")]);
  const r = mergeConfigs(base, mk([T("a", "mine")]), mk([T("a", "yours")]));
  assert.equal(r.merged.clashTests[0].name, "mine");
  assert.deepEqual(r.conflicts, ["/clashTests/a/name"]);
});
test("untouched local takes remote; scalars merge", () => {
  const base = mk([], { naming: { sep: "-", zone: null } });
  const r = mergeConfigs(base, mk([], { naming: { sep: "_", zone: null } }), mk([], { naming: { sep: "-", zone: "Z1" } }));
  assert.deepEqual(r.merged.naming, { sep: "_", zone: "Z1" });
});
