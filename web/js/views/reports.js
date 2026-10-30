// Reports: import Navisworks clash reports (XML) with their date, then chart the clash numbers over time, one chart per discipline.
import { h, t, toast, pickFile } from "../ui.js";
import { state, changed } from "../store.js";
import { uid } from "../core/model.js";
import { parseReport, seriesOf, totalsByDiscipline } from "../core/report.js";

const METRICS = [
  ["total", "الإجمالي", "Total clashes", "#2b7be0"],
  ["open", "مفتوحة (جديدة + نشطة + مراجَعة)", "Open (new + active + reviewed)", "#f08a24"],
  ["resolved", "محلولة", "Resolved", "#6db6f2"],
  ["approved", "معتمدة", "Approved", "#b4510a"],
];
let staged = [];
const load = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const saveLocal = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const showVals = () => load("bcm-report-values", "0") === "1";
let style = load("bcm-report-style", "line"), donutReport = null; // line | columns | donut
const shown = new Set(METRICS.map((m) => m[0]));
const today = () => new Date().toISOString().slice(0, 10);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** Hand-drawn SVG line chart (no libraries). dates are ISO strings placed on a time axis. */
export function lineChart(dates, lines, labels = false) {
  const W = 380, H = 220, L = 38, R = 14, T = 12, B = 34;
  const ms = dates.map((d) => Date.parse(d + "T00:00:00Z"));
  const lo = Math.min(...ms), hi = Math.max(...ms), span = hi - lo || 1;
  const maxV = Math.max(1, ...lines.flatMap((l) => l.values));
  const step = Math.pow(10, Math.floor(Math.log10(maxV))); const nice = [1, 2, 5, 10].map((k) => k * step).find((s) => maxV / s <= 5) ?? step * 10;
  const top = Math.ceil(maxV / nice) * nice;
  const X = (i) => (ms.length === 1 ? L + (W - L - R) / 2 : L + ((ms[i] - lo) / span) * (W - L - R));
  const Y = (v) => T + (1 - v / top) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="max-width:${W}px;font:11px system-ui">`;
  for (let v = 0; v <= top; v += nice) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" stroke-opacity=".14"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" fill="currentColor" fill-opacity=".7">${v}</text>`;
  dates.forEach((d, i) => { s += `<text x="${X(i)}" y="${H - 14}" text-anchor="middle" fill="currentColor" fill-opacity=".7">${esc(d.slice(5))}</text>`; });
  s += `<text x="${(L + W - R) / 2}" y="${H - 1}" text-anchor="middle" fill="currentColor" fill-opacity=".55">${esc(dates.length ? dates[0].slice(0, 4) + (dates.at(-1).slice(0, 4) !== dates[0].slice(0, 4) ? "–" + dates.at(-1).slice(0, 4) : "") : "")}</text>`;
  for (const l of lines) {
    s += `<polyline fill="none" stroke="${l.color}" stroke-width="2.2" points="${l.values.map((v, i) => `${X(i)},${Y(v)}`).join(" ")}"/>`;
    l.values.forEach((v, i) => { s += `<circle cx="${X(i)}" cy="${Y(v)}" r="3.4" fill="${l.color}"><title>${esc(l.label)} · ${esc(dates[i])}: ${v}</title></circle>`; });
    if (labels) l.values.forEach((v, i) => { s += `<text class="val" x="${X(i)}" y="${Y(v) - 7}" text-anchor="middle" font-size="10" font-weight="600" fill="${l.color}">${v}</text>`; });
  }
  return s + "</svg>";
}

/** Grouped columns: one cluster per report date, one column per metric. */
export function columnChart(dates, lines, labels = false) {
  const W = 380, H = 220, L = 38, R = 10, T = 12, B = 34;
  const maxV = Math.max(1, ...lines.flatMap((l) => l.values));
  const step = Math.pow(10, Math.floor(Math.log10(maxV))); const nice = [1, 2, 5, 10].map((k) => k * step).find((s) => maxV / s <= 5) ?? step * 10;
  const top = Math.ceil(maxV / nice) * nice, Y = (v) => T + (1 - v / top) * (H - T - B);
  const cw = (W - L - R) / Math.max(1, dates.length), bw = Math.max(3, Math.min(22, (cw * 0.8) / Math.max(1, lines.length)));
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" style="max-width:${W}px;font:11px system-ui;direction:ltr">`;
  for (let v = 0; v <= top; v += nice) s += `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="currentColor" stroke-opacity=".14"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" fill="currentColor" fill-opacity=".7">${v}</text>`;
  dates.forEach((d, i) => {
    const x0 = L + i * cw + (cw - bw * lines.length) / 2;
    s += `<text x="${L + i * cw + cw / 2}" y="${H - 14}" text-anchor="middle" fill="currentColor" fill-opacity=".7">${esc(d.slice(5))}</text>`;
    lines.forEach((l, j) => { const v = l.values[i], y = Y(v); s += `<rect x="${x0 + j * bw}" y="${y}" width="${bw - 1}" height="${Math.max(0, H - B - y)}" fill="${l.color}" rx="1.5"><title>${esc(l.label)} · ${esc(d)}: ${v}</title></rect>`; if (labels) s += `<text class="val" x="${x0 + j * bw + (bw - 1) / 2}" y="${y - 3}" text-anchor="middle" font-size="${bw < 9 ? 8 : 10}" fill="currentColor">${v}</text>`; });
  });
  return s + "</svg>";
}

/** Donut of one report's clashes: segments are the shown metrics among open / resolved / approved; the centre shows the total. */
export function donutChart(parts, total, labels = false) {
  const S = 220, c = S / 2, R = 78, r = 50;
  const sum = parts.reduce((a, p) => a + p.value, 0);
  let s = `<svg viewBox="0 0 ${S} ${S}" width="100%" role="img" style="max-width:${S}px;font:11px system-ui;direction:ltr;display:block;margin:auto">`;
  if (!sum) s += `<circle cx="${c}" cy="${c}" r="${(R + r) / 2}" fill="none" stroke="currentColor" stroke-opacity=".12" stroke-width="${R - r}"/>`;
  else {
    let a0 = -Math.PI / 2;
    for (const p of parts) {
      if (!p.value) continue;
      const a1 = a0 + (p.value / sum) * Math.PI * 2 - (parts.filter((q) => q.value).length > 1 ? 0.012 : 0), big = a1 - a0 > Math.PI ? 1 : 0;
      const pt = (rad, a) => `${(c + rad * Math.cos(a)).toFixed(2)} ${(c + rad * Math.sin(a)).toFixed(2)}`;
      s += p.value === sum
        ? `<circle cx="${c}" cy="${c}" r="${(R + r) / 2}" fill="none" stroke="${p.color}" stroke-width="${R - r}"><title>${esc(p.label)}: ${p.value}</title></circle>`
        : `<path d="M ${pt(R, a0)} A ${R} ${R} 0 ${big} 1 ${pt(R, a1)} L ${pt(r, a1)} A ${r} ${r} 0 ${big} 0 ${pt(r, a0)} Z" fill="${p.color}"><title>${esc(p.label)}: ${p.value} (${Math.round((p.value / sum) * 100)}%)</title></path>`;
      if (labels && p.value / sum > 0.06) { const am = (a0 + a1) / 2, rm = (R + r) / 2; s += `<text class="val" x="${(c + rm * Math.cos(am)).toFixed(1)}" y="${(c + rm * Math.sin(am) + 4).toFixed(1)}" text-anchor="middle" font-size="11" font-weight="600" fill="#fff">${p.value}</text>`; }
      a0 = a1 + (parts.filter((q) => q.value).length > 1 ? 0.012 : 0);
    }
  }
  return s + `<text x="${c}" y="${c + 4}" text-anchor="middle" font-size="22" font-weight="600" fill="currentColor">${total}</text><text x="${c}" y="${c + 20}" text-anchor="middle" fill="currentColor" fill-opacity=".55">total</text></svg>`;
}

export default function render(root, rerender) {
  const cfg = state.cfg; cfg.reports ??= [];
  const sorted = [...cfg.reports].sort((a, b) => a.date.localeCompare(b.date) || (a.addedAt ?? 0) - (b.addedAt ?? 0));
  // which reports are compared in the charts: a per-viewer choice kept in this browser (new reports start ticked)
  const offKey = "bcm-report-off-" + (state.project?.id ?? "");
  const off = new Set(JSON.parse(load(offKey, "[]") || "[]"));
  const saveOff = () => saveLocal(offKey, JSON.stringify([...off]));
  const chosen = sorted.filter((r) => !off.has(r.id));

  const pick = h("button", { class: "pri", id: "rep-pick", onclick: async () => {
    const files = await pickFile(".xml", true); if (!files?.length) return;
    for (const f of files) {
      try {
        const p = parseReport(await f.text());
        staged.push({ key: uid(), file: f.name, parsed: p, date: p.latestResultDate ?? today(), detected: !!p.latestResultDate, name: f.name.replace(/\.xml$/i, "") });
      } catch (e) { toast(`${f.name}: ${e.message}`); }
    }
    rerender();
  } }, t("اختر تقرير (XML) من Navisworks", "Choose Navisworks report (XML)"));

  const stagedBox = staged.length ? h("div", { class: "card" }, h("b", {}, t("جاهزة للإضافة — راجع التاريخ", "Ready to add — check the date")),
    h("table", {}, h("tr", {}, ["", t("الاسم", "Name"), t("تاريخ التقرير", "Report date"), t("اختبارات", "Tests"), t("إجمالي التصادمات", "Total clashes"), ""].map((x) => h("th", {}, x))),
      staged.map((s) => h("tr", {},
        h("td", {}, "📄"),
        h("td", {}, h("input", { size: 28, value: s.name, onchange: (e) => (s.name = e.target.value) })),
        h("td", {}, h("input", { type: "date", class: "rep-date", value: s.date, onchange: (e) => (s.date = e.target.value) }), " ",
          h("span", { class: "Info" }, s.detected ? t("(من تاريخ إنشاء التصادمات)", "(from the clashes' created date)") : t("(لم يُعثر على تاريخ؛ أدخله)", "(no date in file; enter it)"))),
        h("td", {}, String(s.parsed.tests.length)), h("td", {}, String(s.parsed.tests.reduce((a, x) => a + x.total, 0))),
        h("td", {}, h("button", { onclick: () => { staged = staged.filter((x) => x !== s); rerender(); } }, "×"))))),
    h("div", { class: "row" }, h("button", { class: "pri", id: "rep-add", onclick: () => {
      if (staged.some((s) => !s.date)) return toast(t("أدخل تاريخ كل تقرير", "Enter a date for every report"));
      for (const s of staged) cfg.reports.push({ id: uid(), name: s.name || s.file, date: s.date, fileName: s.file, units: s.parsed.units, addedAt: Date.now(), tests: s.parsed.tests });
      toast(t(`أُضيف ${staged.length} تقرير`, `Added ${staged.length} report(s)`)); staged = []; changed(); rerender();
    } }, t("إضافة التقارير", "Add reports")), h("button", { onclick: () => { staged = []; rerender(); } }, t("إلغاء", "Cancel")))) : null;

  const list = sorted.length ? h("div", { class: "card", style: { overflow: "auto" } }, h("table", {},
    h("tr", {}, h("th", {}, h("input", { type: "checkbox", id: "rep-all", title: t("تحديد الكل", "Select all"), checked: chosen.length === sorted.length, onchange: (e) => { off.clear(); if (!e.target.checked) sorted.forEach((r) => off.add(r.id)); saveOff(); rerender(); } })),
      [t("التاريخ", "Date"), t("الاسم", "Name"), t("اختبارات", "Tests"), t("الإجمالي", "Total"), t("مفتوحة", "Open"), t("محلولة", "Resolved"), t("معتمدة", "Approved"), ""].map((x) => h("th", {}, x))),
    sorted.map((r) => { const a = totalsByDiscipline(r).All; return h("tr", { class: off.has(r.id) ? "off" : "" },
      h("td", {}, h("input", { type: "checkbox", class: "rep-pick", checked: !off.has(r.id), title: t("إظهار في المخططات", "Show in charts"), onchange: (e) => { e.target.checked ? off.delete(r.id) : off.add(r.id); saveOff(); rerender(); } })),
      h("td", {}, h("input", { type: "date", value: r.date, onchange: (e) => { if (e.target.value) { r.date = e.target.value; changed(); rerender(); } } })),
      h("td", {}, h("input", { size: 26, value: r.name, onchange: (e) => { r.name = e.target.value; changed(); } })),
      h("td", {}, String(a.tests)), h("td", {}, String(a.total)), h("td", {}, String(a.open)), h("td", {}, String(a.resolved)), h("td", {}, String(a.approved)),
      h("td", {}, h("button", { title: t("حذف التقرير", "Delete report"), onclick: () => { if (confirm(t(`حذف التقرير "${r.name}"؟`, `Delete report "${r.name}"?`))) { cfg.reports = cfg.reports.filter((x) => x !== r); changed(); rerender(); } } }, "×"))); }))) : null;

  // ---- charts ----
  let charts = null;
  if (sorted.length && !chosen.length) charts = h("p", { class: "Info" }, t("حدّد تقريراً واحداً على الأقل لعرض المخططات.", "Tick at least one report to show the charts."));
  else if (sorted.length) {
    const S = seriesOf(chosen);
    const S_ = S; const pickedIdx = Math.max(0, donutReport ? chosen.findIndex((r) => r.id === donutReport) : S_.dates.length - 1);
    const chartCard = (name) => {
      const sr = S.series[name], last = (k) => sr[k].at(-1), prev = (k) => (sr[k].length > 1 ? sr[k].at(-2) : null);
      const delta = (k) => { const p = prev(k); if (p === null) return ""; const d = last(k) - p; return d ? ` (${d > 0 ? "+" : ""}${d})` : " (0)"; };
      const lines = METRICS.filter((m) => shown.has(m[0])).map((m) => ({ label: t(m[1], m[2]), color: m[3], values: sr[m[0]] }));
      const box = h("div", { class: "card chart", "data-discipline": name, "data-style": style },
        h("b", {}, name === "All" ? t("كل التخصصات", "All disciplines") : name),
        h("div", { class: "Info" }, style === "donut"
          ? METRICS.slice(1).map((m) => `${t(m[1], m[2]).split(" (")[0]}: ${sr[m[0]][pickedIdx]}`).join(" · ")
          : METRICS.map((m) => `${t(m[1], m[2]).split(" (")[0]}: ${last(m[0])}${delta(m[0])}`).join(" · ")));
      const svg = h("div", {});
      svg.innerHTML = style === "columns" ? columnChart(S.dates, lines, showVals())
        : style === "donut" ? donutChart(METRICS.slice(1).filter((m) => shown.has(m[0])).map((m) => ({ label: t(m[1], m[2]), color: m[3], value: sr[m[0]][pickedIdx] })), sr.total[pickedIdx], showVals())
        : lineChart(S.dates, lines, showVals());
      box.append(svg);
      return box;
    };
    const legend = h("div", { class: "row" }, METRICS.map(([k, ar, en, color]) => h("label", {}, h("input", { type: "checkbox", checked: shown.has(k), onchange: (e) => { e.target.checked ? shown.add(k) : shown.delete(k); rerender(); } }),
      " ", h("span", { style: { display: "inline-block", width: "12px", height: "12px", background: color, verticalAlign: "middle", borderRadius: "2px" } }), " ", t(ar, en))));
    const styleSel = h("div", { class: "row", id: "chart-style" }, h("b", {}, t("نمط المخطط:", "Chart style:")),
      [["line", "خطي", "Line"], ["columns", "أعمدة", "Columns"], ["donut", "دائري (Donut)", "Donut"]].map(([k, ar, en]) => h("label", {}, h("input", { type: "radio", name: "chart-style", value: k, checked: style === k, onchange: () => { style = k; saveLocal("bcm-report-style", k); rerender(); } }), " ", t(ar, en))),
      h("label", {}, h("input", { type: "checkbox", id: "show-values", checked: showVals(), onchange: (e) => { saveLocal("bcm-report-values", e.target.checked ? "1" : "0"); rerender(); } }), " ", t("إظهار عدد التصادمات على المخطط", "Show clash numbers on the chart")),
      style === "donut" ? h("span", {}, t("التقرير:", "Report:"), " ", h("select", { id: "donut-report", onchange: (e) => { donutReport = e.target.value; rerender(); } }, chosen.map((r, i) => h("option", { value: r.id, selected: i === pickedIdx }, `${r.date} — ${r.name}`)))) : null);
    charts = h("div", {}, h("h3", {}, t("المخططات حسب التخصص", "Charts by discipline")), styleSel, legend,
      h("p", { class: "Info" }, t("التخصص = المسؤول عن الحل (الحرف الرابع من كود الاختبار). الأرقام بين الأقواس هي الفرق عن التقرير السابق.", "Discipline = Default Assignee (4th character of the test code). Numbers in brackets are the change since the previous report.")),
      h("div", { class: "charts" }, Object.keys(S.series).map(chartCard)));
  }

  root.append(h("h2", {}, t("التقارير", "Reports")),
    h("div", { class: "card" }, h("div", { class: "row" }, pick), h("p", { class: "Info" }, t(
      "من Navisworks: Clash Detective ← Report ← اختر Current Test أو All Tests ← Format: XML ← Write Report. ثم أضف الملف هنا وراجع التاريخ. أضف تقريراً جديداً بعد كل تشغيل لرسم تطور التصادمات.",
      "In Navisworks: Clash Detective > Report > Contents (All tests) > Format: XML > Write Report. Add the file here and check its date. Add a new report after each run to chart progress over time."))),
    stagedBox, list, charts ?? h("p", { class: "Info" }, t("لا توجد تقارير بعد.", "No reports yet.")));
}
