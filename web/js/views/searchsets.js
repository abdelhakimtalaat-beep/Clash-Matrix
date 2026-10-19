import { h, t, toast, pickFile } from "../ui.js";
import { state, changed } from "../store.js";
import { newSearchSet, newCondition, OPERATORS } from "../core/model.js";
import { validateConfig } from "../core/validate.js";
import { parseBatch, applyBatch, lookupInternal } from "../core/nwimport.js";
import { UNITS } from "../core/units.js";

let selected = null;
const LINEAR = new Set(["GreaterOrEqual", "LessThan"]);

export default function render(root, rerender) {
  const cfg = state.cfg, dialect = state.dialect;
  validateConfig(cfg, dialect);
  const ss = cfg.searchSets.find((s) => s.id === selected) ?? cfg.searchSets[0];
  if (ss) selected = ss.id;

  const importBtn = h("button", {
    onclick: async () => {
      const f = await pickFile(".xml"); if (!f) return;
      try {
        const p = parseBatch(await f.text(), dialect);
        const r = applyBatch(cfg, dialect, p);
        changed(); toast(`${r.created} new, ${r.updated} updated, ${r.linked} linked to matrix systems`); rerender();
      } catch (e) { toast(e.message); }
    },
  }, t("استيراد من Navisworks XML", "Import from Navisworks XML"));

  const list = h("div", { class: "card", style: { minWidth: "240px" } },
    h("div", { class: "row" }, h("button", { onclick: () => { const n = newSearchSet(); cfg.searchSets.push(n); selected = n.id; changed(); rerender(); } }, "+ " + t("جديد", "New")), importBtn),
    cfg.searchSets.map((s) => h("div", {}, h("a", { href: "#", style: { fontWeight: s.id === selected ? "bold" : "normal" }, onclick: (e) => { e.preventDefault(); selected = s.id; rerender(); } }, (s.folder ? s.folder + " / " : "") + s.name), " ",
      s.status.representable ? h("span", { class: "ok" }, "✓") : h("span", { class: "Warning" }, "!"))));

  const catalog = dialect.catalog?.combos ?? [];
  const dl = h("datalist", { id: "cats" }, [...new Set(catalog.map((c) => c.category))].map((v) => h("option", { value: v })));
  const dp = h("datalist", { id: "props" }, [...new Set(catalog.map((c) => c.property))].map((v) => h("option", { value: v })));

  const condRow = (c, list) => {
    const fill = () => { const m = lookupInternal(dialect, c.category, c.property); if (m) { c.categoryInternal = m.categoryInternal; c.propertyInternal = m.propertyInternal; } };
    return h("div", { class: "cond" },
      h("input", { value: c.category, list: "cats", placeholder: "Category", onchange: (e) => { c.category = e.target.value; c.isPlaceholder = false; fill(); changed(); rerender(); } }),
      h("input", { value: c.property, list: "props", placeholder: "Property", onchange: (e) => { c.property = e.target.value; c.isPlaceholder = false; fill(); changed(); rerender(); } }),
      h("select", { onchange: (e) => { c.operator = e.target.value; changed(); rerender(); } }, [...OPERATORS, ...(c.operator === "Other" ? ["Other"] : [])].map((o) => h("option", { selected: o === c.operator }, o))),
      c.operator === "Undefined" ? null : h("input", { value: c.value, placeholder: "Value", onchange: (e) => { c.value = e.target.value; c.isPlaceholder = false; changed(); rerender(); } }),
      LINEAR.has(c.operator) ? h("select", { onchange: (e) => { c.unit = e.target.value; changed(); } }, UNITS.map((u) => h("option", { selected: u === (c.unit ?? dialect.xmlLengthUnit) }, u))) : null,
      h("input", { value: c.categoryInternal ?? "", placeholder: "internal category", title: t("الاسم الداخلي في Navisworks", "Navisworks internal name"), onchange: (e) => { c.categoryInternal = e.target.value || null; changed(); } }),
      h("input", { value: c.propertyInternal ?? "", placeholder: "internal property", onchange: (e) => { c.propertyInternal = e.target.value || null; changed(); } }),
      h("input", { value: c.flags ?? "", type: "number", style: { width: "5em" }, placeholder: String(dialect.defaultConditionFlags), title: "flags", onchange: (e) => { c.flags = e.target.value === "" ? null : Number(e.target.value); changed(); } }),
      c.isPlaceholder ? h("span", { class: "badge warn" }, t("تخمين تلقائي", "auto-guess")) : null,
      h("button", { onclick: () => { const i = list.indexOf(c); list.splice(i, 1); changed(); rerender(); } }, "×"));
  };

  const editor = h("div", { class: "card", style: { flex: 1 } });
  if (ss) {
    const grp = ss.root;
    editor.append(dl, dp,
      h("div", { class: "row" },
        h("input", { value: ss.folder ?? "", placeholder: t("المجلد (مثل A-Architecture)", "Folder (e.g. A-Architecture)"), onchange: (e) => { ss.folder = e.target.value.trim() || null; changed(); rerender(); } }),
        h("input", { value: ss.name, onchange: (e) => { ss.name = e.target.value; changed(); rerender(); } }),
        h("select", { onchange: (e) => { grp.mode = e.target.value; changed(); rerender(); } },
          h("option", { value: "All", selected: grp.mode === "All" }, t("كل الشروط (AND)", "All (AND)")), h("option", { value: "Any", selected: grp.mode === "Any" }, t("أي شرط / مجموعة (OR)", "Any (OR of conditions / AND groups)"))),
        h("button", { onclick: () => { cfg.searchSets = cfg.searchSets.filter((s) => s !== ss); cfg.clashTests = cfg.clashTests.filter((x) => x.searchSetAId !== ss.id && x.searchSetBId !== ss.id); selected = null; changed(); rerender(); } }, t("حذف", "Delete"))),
      ...grp.conditions.map((c) => condRow(c, grp.conditions)),
      ...grp.groups.map((g, i) => h("fieldset", {}, h("legend", {}, t(`مجموعة AND ${i + 1}`, `AND group ${i + 1}`)),
        ...g.conditions.map((c) => condRow(c, g.conditions)),
        h("button", { onclick: () => { g.conditions.push(newCondition()); changed(); rerender(); } }, "+ " + t("شرط", "Condition")),
        h("button", { onclick: () => { grp.groups.splice(i, 1); changed(); rerender(); } }, t("حذف المجموعة", "Remove group")))),
      h("button", { onclick: () => { grp.conditions.push(newCondition()); changed(); rerender(); } }, "+ " + t("شرط", "Condition")),
      grp.mode === "Any" ? h("button", { onclick: () => { grp.groups.push({ mode: "All", conditions: [newCondition()], groups: [] }); changed(); rerender(); } }, "+ " + t("مجموعة AND", "AND group")) : null,
      h("p", { class: "Info" }, `${t("صالحة نحوياً", "Syntax OK")}: ${ss.status.syntacticallyValid ? "✓" : "✗"} · ${t("قابلة للتمثيل في XML", "Representable")}: ${ss.status.representable ? "✓" : "✗"} · ${t("مُتحقَّق منها على النموذج", "Model verified")}: ✗ (${t("تحتاج الإضافة داخل Navisworks", "needs the add-in inside Navisworks")})`));
  }
  root.append(h("h2", {}, t("مجموعات البحث", "Search sets")), h("div", { class: "row", style: { alignItems: "flex-start" } }, list, editor));
}
