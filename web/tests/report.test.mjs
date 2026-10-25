import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseReport, totalsByDiscipline, seriesOf, disciplineOfTest } from "../js/core/report.js";
const xml = readFileSync(new URL("./fixtures/mini-report.xml", import.meta.url), "utf8");

test("a Navisworks report is read into per-test counts and the date of its clashes", () => {
  const r = parseReport(xml);
  assert.equal(r.tests.length, 4);
  assert.equal(r.latestResultDate, "2026-10-25");
  const big = r.tests.find((x) => x.total === 111);
  assert.deepEqual([big.new, big.active, big.approved, big.resolved], [111, 0, 0, 0]);
  assert.equal(big.code, "A5-FH");
  assert.equal(disciplineOfTest(big), "F-Fire Protection");
  assert.throws(() => parseReport("<exchange><batchtest/></exchange>"), /no clash tests/);
  assert.throws(() => parseReport("<foo/>"), /not a Navisworks clash report/);
});

test("totals per discipline and a series over several reports", () => {
  const a = { ...parseReport(xml), id: "1", date: "2026-10-01", name: "r1" };
  const b = { ...parseReport(xml), id: "2", date: "2026-10-15", name: "r2" };
  b.tests = b.tests.map((x) => (x.total === 111 ? { ...x, new: 11, resolved: 90, approved: 10 } : x));
  const tot = totalsByDiscipline(b);
  assert.equal(tot.All.total, b.tests.reduce((s, x) => s + x.total, 0));
  assert.equal(tot["F-Fire Protection"].resolved, 90 + (b.tests.filter((x) => x.code.startsWith("A5-FH") && x.total !== 111).reduce((s, x) => s + x.resolved, 0)));
  const s = seriesOf([b, a]);
  assert.deepEqual(s.dates, ["2026-10-01", "2026-10-15"], "oldest report first, whatever the order added");
  assert.ok(s.series["F-Fire Protection"].resolved[1] > s.series["F-Fire Protection"].resolved[0]);
  assert.equal(s.series.All.total.length, 2);
});
