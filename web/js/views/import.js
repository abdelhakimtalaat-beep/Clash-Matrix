import { h, t, toast, pickFile } from "../ui.js";
import { state, changed } from "../store.js";
import { loadWorkbook, detectLayout, importMatrix } from "../core/xlsx.js";
import { carryOverIds, addMissingMappings } from "../core/generate.js";

const DEFAULT_FILE = "data/ECG-BIM-Clash_Matrix.xlsx", DEFAULT_NAME = "ECG-BIM-Clash_Matrix.xlsx";
let wb = null, fileName = "", sheetName = "";

export default function render(root, rerender) {
  const cfg = state.cfg;
  const info = h("div");
  const doImport = (disc) => {
    const sh = wb.sheet(sheetName);
    const layout = detectLayout(sh);
    const { matrix, suggestedMappings } = importMatrix(sh, layout, { defaultDiscipline: disc, sourceFileName: fileName });
    if (cfg.matrix.systems.length) carryOverIds(cfg, matrix);
    cfg.matrix = matrix;
    const added = addMissingMappings(cfg, suggestedMappings);
    changed();
    toast(t(`تم الاستيراد: ${matrix.systems.length} نظام، ${matrix.cells.length} خلية، ${added} رمز جديد`, `Imported ${matrix.systems.length} systems, ${matrix.cells.length} cells, ${added} new codes`));
    rerender();
  };
  const sel = h("select", { onchange: () => (sheetName = sel.value) });
  const go = h("button", { class: "pri", disabled: true, onclick: () => doImport("") }, t("استيراد", "Import"));
  const load = async (buf, name) => {
    try {
      wb = await loadWorkbook(buf); fileName = name;
      sel.replaceChildren(...wb.sheetNames.map((n) => h("option", {}, n))); sheetName = wb.sheetNames[0];
      go.disabled = false;
      info.replaceChildren(...[h("p", {}, `${name}: ${wb.sheetNames.length} ${t("ورقة", "sheets")}`),
        wb.unresolvedColors.length ? h("p", { class: "Warning" }, t("ألوان لم يمكن حلّها: ", "Unresolved colours: ") + wb.unresolvedColors.join(", ")) : null].filter(Boolean));
    } catch (e) { toast(t("تعذر قراءة الملف: ", "Could not read file: ") + e.message); }
  };
  const useDefault = h("button", { class: "pri", id: "use-default", onclick: async () => {
    try { const r = await fetch(DEFAULT_FILE, { cache: "no-store" }); if (!r.ok) throw new Error(`${DEFAULT_FILE}: HTTP ${r.status}`); await load(await r.arrayBuffer(), DEFAULT_NAME); }
    catch (e) { toast(e.message); }
  } }, t("استخدام الملف الافتراضي (ECG)", "Use default file (ECG)"));
  const pick = h("button", { onclick: async () => { const f = await pickFile(".xlsx,.xlsm"); if (f) await load(await f.arrayBuffer(), f.name); } }, t("اختر ملف آخر", "Choose another file"));
  root.append(h("h2", {}, t("استيراد المصفوفة", "Import matrix")),
    h("div", { class: "card" }, h("div", { class: "row" }, useDefault, pick, sel, go), info,
      h("p", { class: "Info" }, t("تتم القراءة بالكامل داخل المتصفح ولا يُرفع الملف لأي مكان. إعادة الاستيراد تحافظ على التعديلات للأنظمة المتطابقة.", "Parsing happens entirely in your browser; the file is not uploaded. Re-import keeps your edits for matching systems."))),
    cfg.matrix.systems.length ? h("div", { class: "card" }, `${t("الحالي", "Current")}: ${cfg.matrix.sourceFileName} — ${cfg.matrix.systems.length} ${t("نظام", "systems")}, ${cfg.matrix.cells.length} ${t("خلية", "cells")}`,
      cfg.matrix.importIssues.length ? h("ul", {}, cfg.matrix.importIssues.map((i) => h("li", { class: i.severity }, `${i.code}: ${i.message}`))) : null) : null);
}
