import { addLibrary } from "../js/core/sslink.js";
import { parseBatch, applyBatch } from "../js/core/nwimport.js";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loadWorkbook, detectLayout, importMatrix } from "../js/core/xlsx.js";
import { newConfig } from "../js/core/model.js";
import { generateTests, addMissingMappings, resolveAllTolerances } from "../js/core/generate.js";
import { validateConfig } from "../js/core/validate.js";
import { defaultDialect, signatureOf, compareWithFixtures } from "../js/core/dialect.js";
import { writeSearchSetsXml, writeClashTestsXml } from "../js/core/xmlwriters.js";
import { buildExport } from "../js/core/exporter.js";
import { readZip, bytesToText } from "../js/core/zip.js";
import { parseXml } from "../js/core/xml.js";
import { convert, compareMeasures } from "../js/core/units.js";

import { relinkTests } from "../js/core/sslink.js";
import { newSearchSet } from "../js/core/model.js";
import { searchSetName } from "../js/core/naming.js";
/** A person adds a search set for every system that the library does not cover. */
function fillSets(cfg) {
  for (const sys of cfg.matrix.systems) if (!cfg.searchSets.some((x) => x.systemId === sys.id)) {
    const ss = newSearchSet(searchSetName(sys, cfg.naming)); ss.systemId = sys.id; ss.root.conditions[0] = { ...ss.root.conditions[0], category: "Item", property: "Name", operator: "Contains", value: sys.label, isPlaceholder: false }; cfg.searchSets.push(ss);
  }
  relinkTests(cfg);
}
async function sample() {
  const buf = readFileSync(new URL("./sample-matrix.xlsx", import.meta.url));
  const wb = await loadWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const sh = wb.sheet(wb.sheetNames[0]);
  const { matrix, suggestedMappings } = importMatrix(sh, detectLayout(sh), { defaultDiscipline: "", sourceFileName: "s.xlsx" });
  const cfg = newConfig("T");
  cfg.matrix = matrix;
  addMissingMappings(cfg, suggestedMappings);
  return cfg;
}

test("units are exact", () => {
  assert.equal(convert("1.5", "Millimeters", "Meters").value, "0.0015");
  assert.ok(convert("1", "Inches", "Meters").value === "0.0254");
  assert.equal(compareMeasures({ value: "1000", unit: "Millimeters" }, { value: "1", unit: "Meters" }), 0);
});

test("full pipeline on the sample matrix", async () => {
  const cfg = await sample();
  assert.equal(cfg.matrix.cells.length, 27);
  // codes ending in H/C/D get their clash type from the code; every other code generates nothing until a type is chosen
  let r = generateTests(cfg);
  assert.ok(cfg.clashTests.length > 0 && cfg.clashTests.every((t) => /[HCD]$/i.test(t.sourceCode)), "only rule-typed codes generate by themselves");
  // decide: every suggested code generates with the Hard profile, except X (skip)
  for (const m of cfg.codeMappings) { m.generateTest = m.code !== "X"; m.profileId = "profile-hard"; }
  r = generateTests(cfg);
  assert.ok(cfg.clashTests.length > 0);
  const n = cfg.clashTests.length;
  const again = generateTests(cfg);
  assert.equal(cfg.clashTests.length, n, "idempotent");
  assert.equal(again.created, 0);
  // search sets are never invented: tests start without Selection A/B until a library is added on purpose
  assert.equal(cfg.searchSets.length, 0, "generating tests must not create search sets");
  assert.ok(cfg.clashTests.every((t) => !t.searchSetAId && !t.searchSetBId));
  assert.ok(validateConfig(cfg, defaultDialect()).some((i) => i.code === "TEST_WITHOUT_SEARCHSET"));
  const lib = await addLibrary(cfg, defaultDialect(), "published-views", { parseBatch, applyBatch, fetchText: async (f) => (await import("node:fs")).readFileSync(new URL("../" + f, import.meta.url), "utf8") });
  assert.ok(lib.total > 40 && lib.linked > 0 && lib.tests > 0, "library added, systems linked, tests re-pointed");
  assert.ok(cfg.clashTests.every((t) => !!t.searchSetAId === !!cfg.searchSets.find((x) => x.systemId === t.systemAId)), "Selection A follows the system's set");
  assert.equal(generateTests(cfg).created, 0, "regenerating keeps the links");
  fillSets(cfg);
  // tolerance hierarchy
  cfg.tolerances.projectDefault = { value: "5", unit: "Millimeters" };
  cfg.clashTests[0].toleranceOverride = { value: "1", unit: "Millimeters" };
  resolveAllTolerances(cfg);
  assert.equal(cfg.clashTests[0].toleranceSource, "test override");
  assert.equal(cfg.clashTests[1].toleranceSource, "project default");
  const d = defaultDialect();
  const issues = validateConfig(cfg, d);
  assert.ok(issues.some((i) => i.code === "DIALECT_UNVERIFIED"));
  const ss = writeSearchSetsXml(cfg, d), ct = writeClashTestsXml(cfg, d);
  assert.equal(ss.skipped.length, 0);
  assert.equal(parseXml(ct.xml).name, "exchange");
  const bt = parseXml(ct.xml).children.find((c) => c.name === "batchtest");
  assert.ok(bt.children.some((c) => c.name === "selectionsets" && c.children.length > 0), "batchtest must contain selectionsets (required by Navisworks)");
  assert.equal(ct.xml.includes('tolerance="0.0032808399"'), true, "1 mm in feet, 10 decimals");
  assert.ok(ct.xml.includes('<locator>lcop_selection_set_tree/'), "locator is folder/name");
  // round trip through fixtures built from our own output: must be clean, and an alien element must be flagged
  const sig = signatureOf([ct.xml]);
  assert.equal(compareWithFixtures(ct.xml, sig).filter((f) => f.severity === "Error").length, 0);
  assert.ok(compareWithFixtures(ct.xml.replace("<rules/>", "<bogus/>"), sig).some((f) => f.code === "UNKNOWN_ELEMENT"));
  // export zip
  const ex = buildExport(cfg, d);
  assert.equal(ex.status, "Unverified");
  const files = await readZip(ex.zip());
  assert.ok(files.has("ClashTests.xml") && files.has("manifest.json"));
  assert.equal(JSON.parse(bytesToText(files.get("manifest.json"))).notVerifiedWithNavisworks, true);
});

test("reimport keeps ids", async () => {
  const cfg = await sample();
  const { carryOverIds } = await import("../js/core/generate.js");
  const other = await sample();
  const ids = cfg.matrix.systems.map((s) => s.id);
  carryOverIds(cfg, other.matrix);
  assert.deepEqual(other.matrix.systems.map((s) => s.id), ids);
});

test("LOD filter: only the chosen level's tests are generated and exported", async () => {
  const cfg = await sample();
  for (const m of cfg.codeMappings) { m.generateTest = true; m.profileId = "profile-hard"; }
  generateTests(cfg);
  const all = cfg.clashTests.length;
  cfg.lodFilter = ["C"];
  generateTests(cfg); fillSets(cfg);
  assert.ok(cfg.clashTests.length > 0 && cfg.clashTests.length < all, `filtered ${cfg.clashTests.length} of ${all}`);
  assert.ok(cfg.clashTests.every((t) => t.sourceCode.toUpperCase().startsWith("C")));
  const dd = defaultDialect(); validateConfig(cfg, dd);
  const ct = writeClashTestsXml(cfg, dd);
  assert.equal(parseXml(ct.xml).children[0].children.find((c) => c.name === "clashtests").children.length, cfg.clashTests.length);
});
