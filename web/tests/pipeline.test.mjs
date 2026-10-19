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
  // decisions are forced: nothing generates until a profile is chosen
  let r = generateTests(cfg);
  assert.equal(cfg.clashTests.length, 0);
  // decide: every suggested code generates with the Hard profile, except X (skip)
  for (const m of cfg.codeMappings) { m.generateTest = m.code !== "X"; m.profileId = "profile-hard"; }
  r = generateTests(cfg);
  assert.ok(cfg.clashTests.length > 0);
  const n = cfg.clashTests.length;
  const again = generateTests(cfg);
  assert.equal(cfg.clashTests.length, n, "idempotent");
  assert.equal(again.created, 0);
  // tolerance hierarchy
  cfg.tolerances.projectDefault = { value: "5", unit: "Millimeters" };
  cfg.clashTests[0].toleranceOverride = { value: "1", unit: "Millimeters" };
  resolveAllTolerances(cfg);
  assert.equal(cfg.clashTests[0].toleranceSource, "test override");
  assert.equal(cfg.clashTests[1].toleranceSource, "project default");
  const d = defaultDialect();
  const issues = validateConfig(cfg, d);
  assert.ok(issues.some((i) => i.code === "DIALECT_UNVERIFIED"));
  assert.ok(issues.some((i) => i.code === "PLACEHOLDER_CONDITION"));
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
