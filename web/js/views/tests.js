import { h, t, toast } from "../ui.js";
import { state, changed } from "../store.js";
import { TEST_TYPES } from "../core/model.js";
import { resolveAllTolerances } from "../core/generate.js";
import { UNITS } from "../core/units.js";

const picked = new Set();
let filter = "";

export default function render(root, rerender) {
  const cfg = state.cfg;
  resolveAllTolerances(cfg);
  const ss = new Map(cfg.searchSets.map((s) => [s.id, s.name]));
  const rows = cfg.clashTests.filter((x) => !filter || x.name.toLowerCase().includes(filter.toLowerCase()));
  const bulkType = h("select", {}, TEST_TYPES.map((x) => h("option", {}, x)));
  const bulkTol = h("input", { size: 6, placeholder: t("تفاوت", "tol") }), bulkUnit = h("select", {}, UNITS.map((u) => h("option", {}, u)));
  const each = (f) => { cfg.clashTests.filter((x) => picked.has(x.id)).forEach(f); changed(); rerender(); };
  root.append(h("h2", {}, t("اختبارات التصادم", "Clash tests")),
    h("div", { class: "row" }, h("input", { placeholder: t("بحث", "Filter"), value: filter, onchange: (e) => { filter = e.target.value; rerender(); } }),
      h("span", {}, `${picked.size} ${t("محدد", "selected")}`),
      h("button", { onclick: () => each((x) => (x.enabled = true)) }, t("تفعيل", "Enable")), h("button", { onclick: () => each((x) => (x.enabled = false)) }, t("تعطيل", "Disable")),
      h("button", { onclick: () => each((x) => (x.locked = true)) }, t("قفل", "Lock")),
      bulkType, h("button", { onclick: () => each((x) => (x.testType = bulkType.value)) }, t("تطبيق النوع", "Set type")),
      bulkTol, bulkUnit, h("button", { onclick: () => { if (!bulkTol.value.trim()) return toast(t("أدخل قيمة", "Enter a value")); each((x) => (x.toleranceOverride = { value: bulkTol.value.trim(), unit: bulkUnit.value })); } }, t("تطبيق التفاوت", "Set tolerance")),
      h("button", { onclick: () => each((x) => (x.toleranceOverride = null)) }, t("إزالة التجاوز", "Clear override"))),
    h("div", { class: "card", style: { overflow: "auto" } }, h("table", {},
      h("tr", {}, h("th", {}, h("input", { type: "checkbox", onchange: (e) => { rows.forEach((x) => (e.target.checked ? picked.add(x.id) : picked.delete(x.id))); rerender(); } })),
        ["Name", "A", "B", "Type", t("التفاوت", "Tolerance"), t("المصدر", "Source"), t("خلية", "Cell"), t("مفعّل", "On")].map((x) => h("th", {}, x))),
      rows.map((x) => h("tr", {},
        h("td", {}, h("input", { type: "checkbox", checked: picked.has(x.id), onchange: (e) => (e.target.checked ? picked.add(x.id) : picked.delete(x.id)) })),
        h("td", {}, h("input", { value: x.name, size: 36, onchange: (e) => { x.name = e.target.value; changed(); } }), x.locked ? " 🔒" : ""),
        h("td", {}, ss.get(x.searchSetAId)), h("td", {}, ss.get(x.searchSetBId)),
        h("td", {}, h("select", { onchange: (e) => { x.testType = e.target.value; changed(); } }, TEST_TYPES.map((o) => h("option", { selected: o === x.testType }, o)))),
        h("td", {}, x.resolvedTolerance ? `${x.resolvedTolerance.value} ${x.resolvedTolerance.unit}` : "—"), h("td", { class: "Info" }, x.toleranceSource),
        h("td", {}, x.sourceAddress, x.mirrorAddress ? ` (+${x.mirrorAddress})` : ""),
        h("td", {}, h("input", { type: "checkbox", checked: x.enabled, onchange: (e) => { x.enabled = e.target.checked; changed(); } })))))));
}
