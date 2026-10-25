// Navisworks clash-report XML (Clash Detective > Report > XML) -> compact per-test counts stored in the project.
// Only what the charts need is kept (the clash results themselves, images and object ids are dropped).
import { parseXml, kids, kid } from "./xml.js";
import { RESPONSIBILITY, responsibilityOf } from "./codes.js";

const num = (v) => { const n = parseInt(v ?? "0", 10); return Number.isFinite(n) ? n : 0; };
const pad = (n) => String(n).padStart(2, "0");

/** @returns {{batchName, units, tests:[{name,code,type,total,new,active,reviewed,approved,resolved}], latestResultDate:string|null}} */
export function parseReport(xmlText) {
  const root = parseXml(xmlText);
  const batch = root?.name === "exchange" ? kid(root, "batchtest") : null;
  if (!batch) throw new Error("This is not a Navisworks clash report (no <batchtest> found).");
  const tests = []; let latest = null;
  for (const ct of kids(kid(batch, "clashtests"), "clashtest")) {
    const s = kid(ct, "summary");
    if (!s) continue; // a test without a summary is not a report entry
    const name = ct.attrs.name ?? "";
    const code = /^([^_\s]+)_/.exec(name)?.[1] ?? name.split(" ")[0] ?? "";
    tests.push({
      name, code, type: ct.attrs.test_type ?? "",
      total: num(s.attrs.total), new: num(s.attrs.new), active: num(s.attrs.active), reviewed: num(s.attrs.reviewed), approved: num(s.attrs.approved), resolved: num(s.attrs.resolved),
    });
    for (const r of kids(kid(ct, "clashresults"), "clashresult")) {
      const d = kid(kid(r, "createddate"), "date")?.attrs; if (!d) continue;
      const iso = `${d.year}-${pad(d.month)}-${pad(d.day)}`;
      if (!latest || iso > latest) latest = iso;
    }
  }
  if (!tests.length) throw new Error("The report has no clash tests.");
  return { batchName: batch.attrs.name ?? "", units: batch.attrs.units ?? "", tests, latestResultDate: latest };
}

export const NO_DISCIPLINE = "Unassigned";
export const DISCIPLINES = RESPONSIBILITY.map(([, n]) => n);
/** Discipline = Default Assignee = responsible discipline from the 4th character of the test code (A4-AH -> A-Architecture). */
export const disciplineOfTest = (t) => responsibilityOf(t.code) ?? NO_DISCIPLINE;

const ZERO = () => ({ total: 0, new: 0, active: 0, reviewed: 0, approved: 0, resolved: 0, open: 0, tests: 0 });
/** Counts for one report, per discipline and overall. open = new + active + reviewed (not yet approved or resolved). */
export function totalsByDiscipline(report) {
  const out = { All: ZERO() };
  for (const t of report.tests) {
    const d = disciplineOfTest(t); out[d] ??= ZERO();
    for (const k of [d, "All"]) { const o = out[k]; o.tests++; for (const f of ["total", "new", "active", "reviewed", "approved", "resolved"]) o[f] += t[f]; o.open = o.new + o.active + o.reviewed; }
  }
  return out;
}

/** Time series per discipline, oldest report first: {dates:[...], series:{discipline:{total:[],open:[],resolved:[],approved:[]}}}. */
export function seriesOf(reports) {
  const sorted = [...reports].sort((a, b) => a.date.localeCompare(b.date) || (a.addedAt ?? 0) - (b.addedAt ?? 0));
  const per = sorted.map(totalsByDiscipline);
  const names = ["All", ...DISCIPLINES.filter((d) => per.some((p) => p[d])), ...(per.some((p) => p[NO_DISCIPLINE]) ? [NO_DISCIPLINE] : [])];
  const series = {};
  for (const n of names) series[n] = Object.fromEntries(["total", "open", "resolved", "approved"].map((f) => [f, per.map((p) => p[n]?.[f] ?? 0)]));
  return { dates: sorted.map((r) => r.date), labels: sorted.map((r) => r.name), series };
}
