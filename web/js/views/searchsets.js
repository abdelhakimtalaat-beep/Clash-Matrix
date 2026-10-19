import { h, t } from "../ui.js";
import { state, changed } from "../store.js";
import { newSearchSet, newCondition, OPERATORS } from "../core/model.js";
import { validateConfig } from "../core/validate.js";

let selected = null;

export default function render(root, rerender) {
  const cfg = state.cfg;
  validateConfig(cfg, state.dialect);
  const ss = cfg.searchSets.find((s) => s.id === selected) ?? cfg.searchSets[0];
  if (ss) selected = ss.id;
  const list = h("div", { class: "card", style: { minWidth: "220px" } },
    h("button", { onclick: () => { const n = newSearchSet(); cfg.searchSets.push(n); selected = n.id; changed(); rerender(); } }, "+ " + t("جديد", "New")),
    cfg.searchSets.map((s) => h("div", {}, h("a", { href: "#", style: { fontWeight: s.id === selected ? "bold" : "normal" }, onclick: (e) => { e.preventDefault(); selected = s.id; rerender(); } }, s.name), " ",
      s.status.representable ? h("span", { class: "ok" }, "✓") : h("span", { class: "Warning" }, "!"))));
  const editor = h("div", { class: "card", style: { flex: 1 } });
  if (ss) {
    const grp = ss.root;
    editor.append(
      h("div", { class: "row" }, h("input", { value: ss.name, onchange: (e) => { ss.name = e.target.value; changed(); rerender(); } }),
        h("select", { onchange: (e) => { grp.mode = e.target.value; changed(); rerender(); } },
          h("option", { value: "All", selected: grp.mode === "All" }, t("كل الشروط (AND)", "All (AND)")), h("option", { value: "Any", selected: grp.mode === "Any" }, t("أي شرط (OR)", "Any (OR)"))),
        h("button", { onclick: () => { cfg.searchSets = cfg.searchSets.filter((s) => s !== ss); cfg.clashTests = cfg.clashTests.filter((x) => x.searchSetAId !== ss.id && x.searchSetBId !== ss.id); selected = null; changed(); rerender(); } }, t("حذف", "Delete"))),
      ...grp.conditions.map((c) => h("div", { class: "cond" },
        h("input", { value: c.category, placeholder: "Category", onchange: (e) => { c.category = e.target.value; c.isPlaceholder = false; changed(); } }),
        h("input", { value: c.property, placeholder: "Property", onchange: (e) => { c.property = e.target.value; c.isPlaceholder = false; changed(); } }),
        h("select", { onchange: (e) => { c.operator = e.target.value; changed(); rerender(); } }, OPERATORS.map((o) => h("option", { selected: o === c.operator }, o))),
        h("input", { value: c.value, placeholder: "Value", onchange: (e) => { c.value = e.target.value; c.isPlaceholder = false; changed(); rerender(); } }),
        h("label", {}, h("input", { type: "checkbox", checked: c.exclude, onchange: (e) => { c.exclude = e.target.checked; changed(); } }), t(" استثناء", " NOT")),
        c.isPlaceholder ? h("span", { class: "badge warn" }, t("تخمين تلقائي", "auto-guess")) : null,
        h("button", { onclick: () => { grp.conditions = grp.conditions.filter((x) => x !== c); changed(); rerender(); } }, "×"))),
      h("button", { onclick: () => { grp.conditions.push(newCondition()); changed(); rerender(); } }, "+ " + t("شرط", "Condition")),
      h("p", { class: "Info" }, `${t("صالحة نحوياً", "Syntax OK")}: ${ss.status.syntacticallyValid ? "✓" : "✗"} · ${t("قابلة للتمثيل في XML", "Representable")}: ${ss.status.representable ? "✓" : "✗"} · ${t("مُتحقَّق منها على النموذج", "Model verified")}: ✗ (${t("تحتاج الإضافة داخل Navisworks", "needs the add-in inside Navisworks")})`));
  }
  root.append(h("h2", {}, t("مجموعات البحث", "Search sets")), h("div", { class: "row", style: { alignItems: "flex-start" } }, list, editor));
}
