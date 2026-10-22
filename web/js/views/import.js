import { h, t, toast, pickFile } from "../ui.js";
import { state, changed } from "../store.js";
import { loadWorkbook, detectLayout, importMatrix } from "../core/xlsx.js";
import { carryOverIds, addMissingMappings } from "../core/generate.js";

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
  const disc = h("input", { placeholder: t("تخصص افتراضي (اختياري)", "Default discipline (optional)") });
  const sel = h("select", { onchange: () => (sheetName = sel.value) });
  const go = h("button", { class: "pri", disabled: true, onclick: () => doImport(disc.value) }, t("استيراد", "Import"));
  const pick = h("button", { onclick: async () => {
    const f = await pickFile(".xlsx,.xlsm"); if (!f) return;
    try {
      wb = await loadWorkbook(await f.arrayBuffer()); fileName = f.name;
      sel.replaceChildren(...wb.sheetNames.map((n) => h("option", {}, n))); sheetName = wb.sheetNames[0];
      go.disabled = false;
      info.replaceChildren(...[h("p", {}, `${f.name}: ${wb.sheetNames.length} ${t("ورقة", "sheets")}`),
        wb.unresolvedColors.length ? h("p", { class: "Warning" }, t("ألوان لم يمكن حلّها: ", "Unresolved colours: ") + wb.unresolvedColors.join(", ")) : null].filter(Boolean));
    } catch (e) { toast(t("تعذر قراءة الملف: ", "Could not read file: ") + e.message); }
  } }, t("اختر ملف Excel", "Choose Excel file"));
  root.append(h("h2", {}, t("استيراد المصفوفة", "Import matrix")),
    h("div", { class: "card" }, h("div", { class: "row" }, pick, sel, disc, go), info,
      h("p", { class: "Info" }, t("تتم القراءة بالكامل داخل المتصفح ولا يُرفع الملف لأي مكان. إعادة الاستيراد تحافظ على التعديلات للأنظمة المتطابقة.", "Parsing happens entirely in your browser; the file is not uploaded. Re-import keeps your edits for matching systems."))),
    cfg.matrix.systems.length ? h("div", { class: "card" }, `${t("الحالي", "Current")}: ${cfg.matrix.sourceFileName} — ${cfg.matrix.systems.length} ${t("نظام", "systems")}, ${cfg.matrix.cells.length} ${t("خلية", "cells")}`,
      cfg.matrix.importIssues.length ? h("ul", {}, cfg.matrix.importIssues.map((i) => h("li", { class: i.severity }, `${i.code}: ${i.message}`))) : null) : null);
}
