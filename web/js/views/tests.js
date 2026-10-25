import { h, t, toast } from "../ui.js";
import { state, changed } from "../store.js";
import { resolveAllTolerances } from "../core/generate.js";
import { UNITS, UNIT_SHORT, parseDecimal } from "../core/units.js";
import { PRIORITIES, resolvePriority, lodActive, lodFilter, filterActive } from "../core/lod.js";
import { RESPONSIBILITY, responsibilityOf, codeText } from "../core/codes.js";

const picked = new Set();
let search = "";
const F = { assigned: new Set(), priority: new Set(), tolerance: new Set(), type: new Set() }; // empty set = no filter
let openMenu = null;
const NONE = "(none)";
const tolKey = (x) => (x.resolvedTolerance ? `${x.resolvedTolerance.value} ${UNIT_SHORT[x.resolvedTolerance.unit] ?? x.resolvedTolerance.unit}` : NONE);

/** Dropdown with checkboxes: pick one or more values; nothing picked = no filter. */
function multi(id, label, options, set, rerender) {
  const d = h("details", { class: "ms", open: openMenu === id },
    h("summary", {}, label, set.size ? ` (${set.size})` : ""),
    h("div", { class: "msl" },
      options.map(([value, text, n]) => h("label", {}, h("input", { type: "checkbox", checked: set.has(value), onchange: (e) => { e.target.checked ? set.add(value) : set.delete(value); openMenu = id; rerender(); } }), text, h("span", { class: "Info" }, ` (${n})`))),
      set.size ? h("button", { onclick: () => { set.clear(); openMenu = id; rerender(); } }, t("مسح", "Clear")) : null));
  d.addEventListener("toggle", () => { if (d.open) openMenu = id; else if (openMenu === id) openMenu = null; });
  return d;
}

export default function render(root, rerender) {
  const cfg = state.cfg, dialect = state.dialect;
  resolveAllTolerances(cfg);
  const ss = new Map(cfg.searchSets.map((s) => [s.id, s.name]));
  const base = cfg.clashTests.filter((x) => lodActive(cfg, x));
  const meta = (x) => ({ assigned: responsibilityOf(codeText(x)) ?? NONE, priority: resolvePriority(cfg, x).priority ?? NONE, tolerance: tolKey(x), type: x.testType });
  const pass = (x, skip) => { const m = meta(x); return Object.keys(F).every((k) => k === skip || !F[k].size || F[k].has(m[k])); };
  const rows = base.filter((x) => pass(x) && (!search || x.name.toLowerCase().includes(search.toLowerCase())));
  const count = (k, v) => base.filter((x) => pass(x, k) && meta(x)[k] === v).length; // counts reflect the other filters
  const tolValues = [...new Set(base.map(tolKey))].sort((a, b) => (parseDecimal(a.split(" ")[0]) && parseDecimal(b.split(" ")[0]) ? Number(a.split(" ")[0]) - Number(b.split(" ")[0]) : a.localeCompare(b)));
  const types = [...new Set(["Hard", "Clearance", "Duplicates", ...base.map((x) => x.testType)])];
  const visiblePicked = () => rows.filter((x) => picked.has(x.id));
  const each = (f) => { const sel = visiblePicked(); if (!sel.length) return toast(t("حدّد اختباراً واحداً على الأقل", "Select at least one test")); sel.forEach(f); changed(); rerender(); };

  const bulkPrio = h("select", {}, h("option", { value: "" }, t("تلقائي (من الكود)", "Auto (from code)")), PRIORITIES.map((x) => h("option", {}, x)));
  const bulkTol = h("input", { size: 6, placeholder: t("قيمة", "value") }), bulkUnit = h("select", {}, UNITS.map((u) => h("option", {}, u)));
  const defTol = h("input", { size: 6, value: cfg.tolerances.projectDefault.value }), defUnit = h("select", {}, UNITS.map((u) => h("option", { selected: u === cfg.tolerances.projectDefault.unit }, u)));
  const anyFilter = Object.values(F).some((s) => s.size) || search;

  root.append(h("h2", {}, t("اختبارات التصادم", "Clash tests")),
    filterActive(cfg) ? h("div", { class: "banner" }, t(`مفلتر حسب LOD/التخصص: ${[...lodFilter(cfg), ...(cfg.discFilter ?? [])].join(", ")} — بقية الاختبارات مخفية ولا تُصدَّر. ألغِ التصفية من صفحة المصفوفة.`, `LOD / discipline filter active: ${[...lodFilter(cfg), ...(cfg.discFilter ?? [])].join(", ")} — other tests are hidden and not exported. Clear it on the Matrix page.`)) : null,
    // ---- row 1: filters ----
    h("div", { class: "filters" }, h("span", { class: "lbl" }, t("تصفية:", "Filter:")),
      h("input", { placeholder: t("بحث بالاسم", "Search name"), value: search, onchange: (e) => { search = e.target.value; rerender(); } }),
      multi("assigned", "Assigned To", [...RESPONSIBILITY.map(([, n]) => [n, n]), [NONE, NONE]].map(([v, n]) => [v, n, count("assigned", v)]), F.assigned, rerender),
      multi("priority", "Priority", [...PRIORITIES, NONE].map((v) => [v, v, count("priority", v)]), F.priority, rerender),
      multi("tolerance", "Tolerance", tolValues.map((v) => [v, v, count("tolerance", v)]), F.tolerance, rerender),
      multi("type", "Clash Type", types.map((v) => [v, v, count("type", v)]), F.type, rerender),
      anyFilter ? h("button", { onclick: () => { Object.values(F).forEach((s) => s.clear()); search = ""; rerender(); } }, t("إلغاء كل الفلاتر", "Reset filters")) : null,
      h("span", { class: "Info" }, `${rows.length} / ${base.length}`)),
    // ---- row 2: edit the selected tests ----
    h("div", { class: "filters card" }, h("span", { class: "lbl" }, t("تعديل المحدد:", "Edit selected:")), h("span", {}, `${visiblePicked().length} ${t("محدد", "selected")}`),
      h("span", { class: "lbl" }, "Tolerance"), bulkTol, bulkUnit,
      h("button", { class: "pri", onclick: () => { if (!parseDecimal(bulkTol.value.trim())) return toast(t("أدخل رقماً صحيحاً", "Enter a valid number")); each((x) => (x.toleranceOverride = { value: bulkTol.value.trim(), unit: bulkUnit.value })); } }, t("تطبيق", "Apply")),
      h("button", { onclick: () => each((x) => (x.toleranceOverride = null)) }, t("إزالة التجاوز", "Clear override")),
      h("span", { class: "lbl" }, "Priority"), bulkPrio, h("button", { onclick: () => each((x) => (x.priorityOverride = bulkPrio.value || null)) }, t("تطبيق", "Apply")),
      h("button", { onclick: () => each((x) => (x.enabled = true)) }, t("تفعيل", "Enable")), h("button", { onclick: () => each((x) => (x.enabled = false)) }, t("تعطيل", "Disable"))),
    h("details", { class: "card" }, h("summary", {}, t("تفاوت افتراضي لكل الاختبارات التي بلا تجاوز", "Default tolerance for every test without an override")),
      h("div", { class: "row" }, defTol, defUnit, h("button", { onclick: () => { if (!parseDecimal(defTol.value.trim())) return toast(t("أدخل رقماً صحيحاً", "Enter a valid number")); cfg.tolerances.projectDefault = { value: defTol.value.trim(), unit: defUnit.value }; changed(); rerender(); } }, t("حفظ", "Save")))),
    h("details", { class: "card" }, h("summary", {}, t("قيمة الأولوية في ملف XML", "Priority value written to the XML")),
      h("div", { class: "row" }, PRIORITIES.map((p) => h("label", {}, `${p} = `, h("input", { type: "number", style: { width: "5em" }, value: dialect.priorityValues?.[p] ?? "", placeholder: String(dialect.priorityDefault ?? 0), onchange: (e) => { dialect.priorityValues = { ...(dialect.priorityValues ?? {}), [p]: e.target.value === "" ? null : Number(e.target.value) }; changed(); } }))))),
    h("div", { class: "card", style: { overflow: "auto" } }, h("table", {},
      h("tr", {}, h("th", {}, h("input", { type: "checkbox", checked: rows.length > 0 && rows.every((x) => picked.has(x.id)), onchange: (e) => { rows.forEach((x) => (e.target.checked ? picked.add(x.id) : picked.delete(x.id))); rerender(); } })),
        ["Name", "A", "B", "Clash Type", "Assigned To", "LOD", "Priority", t("التفاوت", "Tolerance"), t("المصدر", "Source"), t("خلية", "Cell"), t("مفعّل", "On")].map((x) => h("th", {}, x))),
      rows.map((x) => { const r = resolvePriority(cfg, x); return h("tr", {},
        h("td", {}, h("input", { type: "checkbox", checked: picked.has(x.id), onchange: (e) => (e.target.checked ? picked.add(x.id) : picked.delete(x.id)) })),
        h("td", {}, h("input", { value: x.name, size: 36, onchange: (e) => { x.name = e.target.value; changed(); } })),
        h("td", {}, ss.get(x.searchSetAId) ?? h("span", { class: "Warning" }, t("— بلا مجموعة", "— none"))), h("td", {}, ss.get(x.searchSetBId) ?? h("span", { class: "Warning" }, t("— بلا مجموعة", "— none"))),
        h("td", {}, x.testType), // fixed: comes from the last letter of the code
        h("td", {}, responsibilityOf(codeText(x)) ?? "—"),
        h("td", {}, r.lod ?? "—"),
        h("td", {}, h("select", { title: r.source, onchange: (e) => { x.priorityOverride = e.target.value || null; changed(); rerender(); } },
          h("option", { value: "", selected: !x.priorityOverride }, `${t("تلقائي", "Auto")}${!x.priorityOverride && r.priority ? ": " + r.priority : ""}`), PRIORITIES.map((o) => h("option", { selected: o === x.priorityOverride }, o)))),
        h("td", {}, x.resolvedTolerance ? `${x.resolvedTolerance.value} ${UNIT_SHORT[x.resolvedTolerance.unit] ?? x.resolvedTolerance.unit}` : "—", x.toleranceSource === "test override" ? h("span", { class: "Info" }, " ✎") : null),
        h("td", { class: "Info" }, x.sourceAddress, x.mirrorAddress ? ` (+${x.mirrorAddress})` : ""),
        h("td", {}, h("input", { type: "checkbox", checked: x.enabled, onchange: (e) => { x.enabled = e.target.checked; changed(); } }))); }))));
}
