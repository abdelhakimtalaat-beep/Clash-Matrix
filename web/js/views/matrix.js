import { h, t } from "../ui.js";
import { state } from "../store.js";

export default function render(root) {
  const m = state.cfg.matrix;
  root.append(h("h2", {}, t("المصفوفة", "Matrix")));
  if (!m.systems.length) return root.append(h("p", {}, t("لا توجد مصفوفة بعد.", "No matrix yet.")));
  const sys = new Map(m.systems.map((s) => [s.id, s]));
  const cell = new Map(m.cells.map((c) => [c.rowSystemId + "|" + c.columnSystemId, c]));
  const cols = m.columnSystemIds.map((id) => sys.get(id)), rows = m.rowSystemIds.map((id) => sys.get(id));
  let shown = 100;
  const holder = h("div", { class: "mx" });
  const draw = () => {
    holder.replaceChildren(h("table", {},
      h("tr", {}, h("th", { class: "sticky" }), cols.map((c) => h("th", { title: c.discipline }, c.label))),
      rows.slice(0, shown).map((r) => h("tr", {}, h("th", { class: "sticky", title: r.discipline }, r.label),
        cols.map((c) => { const x = cell.get(r.id + "|" + c.id); return h("td", { style: x?.colorHex ? { background: x.colorHex, color: "#000" } : {}, title: x?.sourceAddress ?? "" }, x ? x.rawValue : ""); })))));
  };
  draw();
  root.append(holder);
  if (rows.length > shown) root.append(h("button", { onclick: () => { shown += 200; draw(); } }, t("عرض المزيد", "Show more")));
}
