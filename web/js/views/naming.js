import { h, t } from "../ui.js";
import { state, changed } from "../store.js";
import { searchSetName } from "../core/naming.js";

export default function render(root, rerender) {
  const cfg = state.cfg, n = cfg.naming;
  const field = (label, key, size = 24) => h("label", { class: "row" }, h("span", { style: { minWidth: "160px" } }, label), h("input", { size, value: n[key] ?? "", onchange: (e) => { n[key] = e.target.value || (key === "zone" ? null : ""); changed(); rerender(); } }));
  const map = (label, key, ph) => h("label", { class: "row" }, h("span", { style: { minWidth: "160px" } }, label),
    h("input", { size: 40, placeholder: ph, value: Array.isArray(n[key]) ? n[key].join(", ") : Object.entries(n[key]).map(([k, v]) => `${k}=${v}`).join(", "),
      onchange: (e) => { const parts = e.target.value.split(",").map((s) => s.trim()).filter(Boolean); n[key] = key === "disciplineOrder" ? parts : Object.fromEntries(parts.map((p) => p.split("=").map((s) => s.trim()))); changed(); rerender(); } }));
  const sample = cfg.matrix.systems[0];
  root.append(h("h2", {}, t("قواعد التسمية", "Naming rules")),
    h("div", { class: "card" }, field(t("رمز المشروع", "Project code"), "projectCode"), field(t("الفاصل", "Separator"), "separator", 4),
      field(t("نمط مجموعة البحث", "Search-set pattern"), "searchSetPattern"), field(t("نمط الاختبار", "Test pattern"), "testPattern"),
      field(t("المنطقة", "Zone"), "zone"), field(t("أقصى طول", "Max length"), "maxNameLength", 5), field(t("أحرف ممنوعة", "Forbidden chars"), "forbiddenCharacters", 8),
      map(t("بادئات التخصص", "Discipline prefixes"), "disciplinePrefixes", "Architecture=A, Electrical=E"),
      map(t("ترتيب التخصصات", "Discipline order"), "disciplineOrder", "Architecture, Structure, MEP"),
      h("p", { class: "Info" }, t("المتغيرات: {project} {disc} {system} {sep} {A} {B} {code} {zone} {n}. التغيير لا يعيد تسمية العناصر الموجودة إلا بزر إعادة التوليد.", "Placeholders: {project} {disc} {system} {sep} {A} {B} {code} {zone} {n}. Existing items are only renamed when you regenerate names.")),
      sample ? h("p", {}, t("معاينة: ", "Preview: "), h("code", {}, searchSetName(sample, n))) : null,
      h("div", { class: "row" },
        h("select", { onchange: (e) => { cfg.generation.mode = e.target.value; changed(); } }, ["Symmetric", "Directional"].map((m) => h("option", { selected: m === cfg.generation.mode }, m))),
        h("span", { class: "Info" }, t("متماثلة: اختبار واحد لكل زوج. اتجاهية: اختبار لكل خلية.", "Symmetric: one test per pair. Directional: one test per cell.")))));
}
