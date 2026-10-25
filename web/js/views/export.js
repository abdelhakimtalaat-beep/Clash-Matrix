import { h, t, download, pickFile, toast, badge } from "../ui.js";
import { state, changed } from "../store.js";
import { buildExport } from "../core/exporter.js";
import { signatureOf } from "../core/dialect.js";

export default function render(root, rerender) {
  const fx = state.fixtures.searchSets || state.fixtures.clashTests ? { searchSets: state.fixtures.searchSets ? signatureOf([state.fixtures.searchSets]) : null, clashTests: state.fixtures.clashTests ? signatureOf([state.fixtures.clashTests]) : null } : null;
  const target = state.cfg.exportTarget === "2026" ? "2026" : "2027";
  const ex = buildExport(state.cfg, state.dialect, { fixtures: fx, target });
  const kind = { Blocked: "bad", Unverified: "warn", StructurallyChecked: "good" }[ex.status];
  root.append(h("h2", {}, t("التصدير", "Export")),
    !state.dialect.verified ? h("div", { class: "banner" }, t("صيغة XML غير مُتحقَّق منها بملفات Navisworks حقيقية. لم يُستورد أي شيء إلى Navisworks بواسطة هذه الأداة.", "The XML dialect is NOT verified against genuine Navisworks files. Nothing was imported into Navisworks by this tool.")) : null,
    h("div", { class: "card" }, h("b", {}, t("إصدار Navisworks المستهدف", "Target Navisworks version")),
      ["2027", "2026"].map((v) => h("label", { class: "row", style: { display: "flex", gap: "6px", margin: "4px 0" } },
        h("input", { type: "radio", name: "nwtarget", checked: target === v, disabled: state.readOnly, onchange: () => { state.cfg.exportTarget = v; changed(); rerender(); } }),
        v === "2027" ? h("span", {}, h("b", {}, "Navisworks 2027 or later"), t(" (نفس الإعدادات: الأولوية  و Default Assignee تُكتب)", " (keep the same settings: priority and default assignee are written)"))
          : h("span", {}, h("b", {}, "Navisworks 2026 or older"), t(" (تُحذف الأولوية  و Default Assignee من الـ XML)", " (priority and default assignee are removed from the XML)")))),
      target === "2026" ? h("p", { class: "Info" }, t("في هذا الوضع لا يحتوي الملف على priority ولا على default_assignee.", "In this mode the file has no priority attribute and no default_assignee element.")) : null),
    h("div", { class: "card" }, h("p", {}, t("الحالة: ", "Status: "), badge(ex.status, kind)),
      h("p", { class: "Info" }, t("ملف ClashTests.xml يحتوي مجموعات البحث التي تستخدمها الاختبارات، ويكفي وحده للاستيراد في Navisworks (Clash Detective ← Import).", "ClashTests.xml already contains the search sets the tests use; it is enough on its own to import in Navisworks (Clash Detective → Import).")),
      h("p", {}, `${ex.manifest.counts.searchSetsExported}/${ex.manifest.counts.searchSets} ${t("مجموعة بحث", "search sets")} · ${ex.manifest.counts.testsExported}/${ex.manifest.counts.tests} ${t("اختبار", "tests")}`),
      ex.blocked ? h("p", { class: "Error" }, t("يوجد أخطاء؛ صحّحها من صفحة التحقق قبل تصدير XML.", "Errors exist; fix them on the Validation page before XML is produced.")) : null,
      ex.structural.length ? h("ul", {}, ex.structural.slice(0, 20).map((f) => h("li", { class: f.severity }, f.message))) : null,
      h("div", { class: "row" }, h("button", { class: "pri", disabled: ex.blocked, id: "dl-xml", onclick: () => download(`${(state.cfg.name || "project").replace(/[^\w.-]+/g, "_")}-ClashTests-NW${target}.xml`, ex.files["ClashTests.xml"], "application/xml") }, t("تنزيل ClashTests.xml", "Download ClashTests.xml")),
        h("button", { disabled: ex.blocked, onclick: () => download(`${(state.cfg.name || "project").replace(/[^\w.-]+/g, "_")}-SearchSets.xml`, ex.files["SearchSets.xml"], "application/xml") }, t("تنزيل SearchSets.xml (اختياري)", "Download SearchSets.xml (optional)")),
        h("button", { onclick: () => download("project.json", JSON.stringify(state.cfg, null, 2), "application/json") }, t("تنزيل project.json (للإضافة)", "Download project.json (for add-in)")))),
    h("div", { class: "card" }, h("b", {}, t("ملفات Navisworks الحقيقية للمقارنة البنيوية", "Genuine Navisworks files for structural comparison")),
      h("p", { class: "Info" }, t("صدّر مجموعة بحث واختباراً من Navisworks نفسه وحمّلهما هنا لتُقارَن بنية ملفاتنا بهما. هذا لا يغني عن الاستيراد الفعلي.", "Export a search set and a clash test from Navisworks itself and load them here to compare our structure. This does not replace a real import.")),
      h("div", { class: "row" },
        h("button", { onclick: async () => { const f = await pickFile(".xml"); if (f) { state.fixtures.searchSets = await f.text(); toast("OK"); rerender(); } } }, `Search sets XML ${state.fixtures.searchSets ? "✓" : ""}`),
        h("button", { onclick: async () => { const f = await pickFile(".xml"); if (f) { state.fixtures.clashTests = await f.text(); toast("OK"); rerender(); } } }, `Clash tests (batch) XML ${state.fixtures.clashTests ? "✓" : ""}`))));
}
