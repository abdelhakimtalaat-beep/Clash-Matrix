// Builds the export package (a ZIP) and reports. Pure functions: returns bytes, the caller saves them.
import { writeZip } from "./zip.js";
import { escapeXml } from "./xml.js";
import { writeSearchSetsXml, writeClashTestsXml } from "./xmlwriters.js";
import { validateConfig, hasErrors, compatibilityReport } from "./validate.js";
import { compareWithFixtures } from "./dialect.js";

const csvCell = (v) => { const s = String(v ?? ""); return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; };
const csv = (rows) => "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

export function exportStatus(dialect, issues, structural) {
  if (hasErrors(issues)) return "Blocked";
  if (!dialect.verified) return "Unverified";
  if (structural.some((f) => f.severity === "Error")) return "Unverified";
  return "StructurallyChecked"; // "Verified" additionally needs import + reopen evidence from a real Navisworks run.
}

export function buildExport(cfg, dialect, { fixtures = null, allowWithErrors = false, target = "2027" } = {}) {
  const issues = validateConfig(cfg, dialect);
  const blocked = hasErrors(issues) && !allowWithErrors;
  const ss = writeSearchSetsXml(cfg, dialect);
  const ct = writeClashTestsXml(cfg, dialect, { target });
  const structural = fixtures ? [...(fixtures.searchSets ? compareWithFixtures(ss.xml, fixtures.searchSets) : []), ...(fixtures.clashTests ? compareWithFixtures(ct.xml, fixtures.clashTests) : [])] : [];
  const status = exportStatus(dialect, issues, structural);
  const compat = compatibilityReport(cfg, dialect);
  const manifest = {
    generatedAt: new Date().toISOString(), project: cfg.name, projectId: cfg.projectId, targetNavisworks: cfg.targetNavisworksVersion,
    status, navisworksTarget: target === "2026" ? "Navisworks 2026 or older (priority and assigned-to omitted)" : "Navisworks 2027 or later", dialect: { version: dialect.version, verified: dialect.verified, note: dialect.verificationNote },
    counts: { searchSets: cfg.searchSets.length, searchSetsExported: cfg.searchSets.length - ss.skipped.length, tests: cfg.clashTests.length, testsExported: cfg.clashTests.length - ct.skipped.length },
    skipped: { searchSets: ss.skipped, tests: ct.skipped },
    issueCounts: { error: issues.filter((i) => i.severity === "Error").length, warning: issues.filter((i) => i.severity === "Warning").length, info: issues.filter((i) => i.severity === "Info").length },
    notVerifiedWithNavisworks: true,
  };
  const mapping = csv([["test", "type", "searchSetA", "searchSetB", "tolerance", "toleranceSource", "sourceCell", "enabled"],
    ...cfg.clashTests.map((t) => {
      const a = cfg.searchSets.find((s) => s.id === t.searchSetAId), b = cfg.searchSets.find((s) => s.id === t.searchSetBId);
      const r = t.resolvedTolerance;
      return [t.name, t.testType, a?.name, b?.name, r ? `${r.value} ${r.unit}` : "", t.toleranceSource, t.sourceAddress, t.enabled];
    })]);
  const html = reportHtml(cfg, manifest, issues, structural, compat);
  const steps = importSteps(manifest);
  const files = { "manifest.json": JSON.stringify(manifest, null, 2), "report.html": html, "mapping.csv": mapping, "IMPORT-STEPS.txt": steps, "project.json": JSON.stringify(cfg, null, 2) };
  if (!blocked) { files["SearchSets.xml"] = ss.xml; files["ClashTests.xml"] = ct.xml; }
  return { blocked, status, issues, structural, manifest, files, zip: () => writeZip(files) };
}

function importSteps(m) {
  return [
    "IMPORT STEPS (Navisworks Manage)",
    "1. Open the federated model.",
    "2. Clash Detective > Import... choose ClashTests.xml. (It already carries the search sets it uses; SearchSets.xml is optional and its format is unconfirmed.)",
    "3. Start with a small test file first.",
    "4. Run each test and check the search sets select the expected objects.",
    "5. Save the file, close it, reopen it and confirm sets and tests are still there.",
    "",
    `STATUS: ${m.status}`,
    m.dialect.verified ? "" : "WARNING: the XML structure follows one genuine Navisworks 2026 export but our output has not been imported into Navisworks by this tool. Importing may still fail or behave differently.",
    "Nothing in this package has been imported into Navisworks by this tool.",
  ].join("\r\n");
}

function reportHtml(cfg, m, issues, structural, compat) {
  const li = (arr) => arr.map((i) => `<li class="${i.severity}"><b>${escapeXml(i.severity)}</b> ${escapeXml(i.code ?? "")}: ${escapeXml(i.message)}</li>`).join("");
  return `<!doctype html><meta charset="utf-8"><title>${escapeXml(cfg.name)} export report</title>
<style>body{font:14px system-ui;margin:2em;max-width:60em}.Error{color:#b00020}.Warning{color:#8a5a00}.Info{color:#555}</style>
<h1>${escapeXml(cfg.name)}</h1><p>Status: <b>${escapeXml(m.status)}</b> — generated ${escapeXml(m.generatedAt)}</p>
<p>Search sets: ${m.counts.searchSetsExported}/${m.counts.searchSets} exported. Tests: ${m.counts.testsExported}/${m.counts.tests} exported.</p>
<p>Dialect ${escapeXml(m.dialect.version)}: ${m.dialect.verified ? "verified" : "<b>UNVERIFIED</b>"}. Never imported into Navisworks by this tool.</p>
<h2>Issues (${issues.length})</h2><ul>${li(issues)}</ul>
<h2>Structure vs genuine fixtures</h2><ul>${structural.length ? li(structural) : "<li>No fixtures supplied.</li>"}</ul>
<h2>Not carried by the XML</h2><ul>${compat.length ? compat.map((c) => `<li>${escapeXml(c.message)}</li>`).join("") : "<li>None detected.</li>"}</ul>`;
}
