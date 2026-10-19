import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseBatch, applyBatch } from "../js/core/nwimport.js";
import { defaultDialect } from "../js/core/dialect.js";
import { newConfig } from "../js/core/model.js";
import { writeClashTestsXml, writeSearchSetsXml } from "../js/core/xmlwriters.js";
import { parseXml } from "../js/core/xml.js";
import { representability } from "../js/core/validate.js";

const fx = readFileSync(new URL("./fixtures/mini-batch.xml", import.meta.url), "utf8");
const attrs = (el) => JSON.stringify(Object.entries(el.attrs).filter(([k]) => k !== "guid"));
const find = (el, name, out = []) => { if (el.name === name) out.push(el); el.children.forEach((c) => find(c, name, out)); return out; };

test("parse a batch export: folders, OR-groups, flags, units", () => {
  const d = defaultDialect(), p = parseBatch(fx, d);
  assert.equal(p.units, "Feet");
  assert.equal(p.searchSets.length, 2);
  const walls = p.searchSets.find((s) => s.name === "S-Walls");
  assert.equal(walls.folder, "S-Structure");
  assert.equal(walls.root.mode, "Any");
  assert.equal(walls.root.groups.length, 2);              // (Walls AND title) OR (Floors AND >=w AND no_prop)
  assert.equal(walls.root.groups[0].conditions.length, 2);
  assert.equal(walls.root.groups[1].conditions[0].flags, 400);
  assert.equal(p.tests[0].tolerance, "0.0820209974");
  assert.ok(p.combos.some((c) => c.propertyInternal === "lcldrevit_parameter_-1001301"));
  assert.equal(p.searchSets.every((s) => representability(s, d).length === 0), true);
});

test("round trip: parse -> write keeps every condition, flag and OR boundary", () => {
  const d = defaultDialect(), p = parseBatch(fx, d);
  const cfg = newConfig("Mini"); cfg.projectId = "p1";
  applyBatch(cfg, d, p);
  for (const s of cfg.searchSets) s.status.representable = true;
  const out = parseXml(writeSearchSetsXml(cfg, d).xml);
  const src = parseXml(fx);
  const conds = (el) => find(el, "condition").map((c) => JSON.stringify([c.attrs, c.children.map((k) => JSON.stringify([k.name, k.attrs, k.children.map((z) => [z.name, z.attrs, z.text, z.children.map((q) => [q.name, q.attrs, q.text])])]))]));
  assert.deepEqual(conds(out), conds(src));
  assert.deepEqual(find(out, "viewfolder").map((v) => v.attrs.name), ["A-Architecture", "S-Structure"]);
  assert.equal(find(out, "findspec").every((f) => attrs(f) === attrs(find(src, "findspec")[0])), true);
});

test("clash tests: locator, tolerance rounding, required selectionsets", () => {
  const d = defaultDialect(), p = parseBatch(fx, d);
  const cfg = newConfig("Mini"); cfg.projectId = "p1";
  applyBatch(cfg, d, p);
  const [a, b] = ["A-Doors", "S-Walls"].map((n) => cfg.searchSets.find((s) => s.name === n));
  a.status.representable = b.status.representable = true;
  cfg.clashTests.push({ id: "t", name: "T1_A-Doors vs S-Walls", testType: "Hard", searchSetAId: a.id, searchSetBId: b.id, enabled: true, options: { mergeComposites: true }, resolvedTolerance: { value: "25", unit: "Millimeters" } });
  const root = parseXml(writeClashTestsXml(cfg, d).xml), src = parseXml(fx);
  const t = find(root, "clashtest")[0], s = find(src, "clashtest")[0];
  assert.deepEqual(t.attrs, s.attrs);                      // tolerance 25 mm == 0.0820209974 ft, exactly as Navisworks wrote it
  assert.deepEqual(find(t, "locator").map((l) => l.text), find(s, "locator").map((l) => l.text));
  assert.deepEqual(t.children.map((c) => c.name), s.children.map((c) => c.name));
  assert.equal(find(root, "batchtest")[0].children.map((c) => c.name).join(), "clashtests,selectionsets");
});
