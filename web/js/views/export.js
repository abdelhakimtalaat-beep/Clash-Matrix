import { h, t, download, pickFile, toast, badge } from "../ui.js";
import { state } from "../store.js";
import { buildExport } from "../core/exporter.js";
import { signatureOf } from "../core/dialect.js";

export default function render(root, rerender) {
  const fx = state.fixtures.searchSets && state.fixtures.clashTests ? { searchSets: signatureOf([state.fixtures.searchSets]), clashTests: signatureOf([state.fixtures.clashTests]) } : null;
  const ex = buildExport(state.cfg, state.dialect, { fixtures: fx });
  const kind = { Blocked: "bad", Unverified: "warn", StructurallyChecked: "good" }[ex.status];
  root.append(h("h2", {}, t("التصدير", "Export")),
    !state.dialect.verified ? h("div", { class: "banner" }, t("صيغة XML غير مُتحقَّق منها بملفات Navisworks حقيقية. لم يُستورد أي شيء إلى Navisworks بواسطة هذه الأداة.", "The XML dialect is NOT verified against genuine Navisworks files. Nothing was imported into Navisworks by this tool.")) : null,
    h("div", { class: "card" }, h("p", {}, t("الحالة: ", "Status: "), badge(ex.status, kind)),
      h("p", {}, `${ex.manifest.counts.searchSetsExported}/${ex.manifest.counts.searchSets} ${t("مجموعة بحث", "search sets")} · ${ex.manifest.counts.testsExported}/${ex.manifest.counts.tests} ${t("اختبار", "tests")}`),
      ex.blocked ? h("p", { class: "Error" }, t("يوجد أخطاء؛ صحّحها من صفحة التحقق قبل تصدير XML.", "Errors exist; fix them on the Validation page before XML is produced.")) : null,
      ex.structural.length ? h("ul", {}, ex.structural.slice(0, 20).map((f) => h("li", { class: f.severity }, f.message))) : null,
      h("div", { class: "row" }, h("button", { class: "pri", onclick: () => download(`${state.cfg.name || "project"}-export.zip`, ex.zip(), "application/zip") }, t("تنزيل الحزمة (ZIP)", "Download package (ZIP)")),
        h("button", { onclick: () => download("project.json", JSON.stringify(state.cfg, null, 2), "application/json") }, t("تنزيل project.json (للإضافة)", "Download project.json (for add-in)")))),
    h("div", { class: "card" }, h("b", {}, t("ملفات Navisworks الحقيقية للمقارنة البنيوية", "Genuine Navisworks files for structural comparison")),
      h("p", { class: "Info" }, t("صدّر مجموعة بحث واختباراً من Navisworks نفسه وحمّلهما هنا لتُقارَن بنية ملفاتنا بهما. هذا لا يغني عن الاستيراد الفعلي.", "Export a search set and a clash test from Navisworks itself and load them here to compare our structure. This does not replace a real import.")),
      h("div", { class: "row" },
        h("button", { onclick: async () => { const f = await pickFile(".xml"); if (f) { state.fixtures.searchSets = await f.text(); toast("OK"); rerender(); } } }, `Search sets XML ${state.fixtures.searchSets ? "✓" : ""}`),
        h("button", { onclick: async () => { const f = await pickFile(".xml"); if (f) { state.fixtures.clashTests = await f.text(); toast("OK"); rerender(); } } }, `Clash tests XML ${state.fixtures.clashTests ? "✓" : ""}`))));
}
