import { h, t } from "../ui.js";
import { state } from "../store.js";
import { validateConfig } from "../core/validate.js";

let sev = "All";
export default function render(root, rerender) {
  const issues = validateConfig(state.cfg, state.dialect);
  const shown = issues.filter((i) => sev === "All" || i.severity === sev);
  const count = (s) => issues.filter((i) => i.severity === s).length;
  root.append(h("h2", {}, t("التحقق", "Validation")),
    h("div", { class: "row" }, ["All", "Error", "Warning", "Info"].map((s) => h("button", { class: s === sev ? "pri" : "", onclick: () => { sev = s; rerender(); } }, `${s}${s === "All" ? ` (${issues.length})` : ` (${count(s)})`}`))),
    h("div", { class: "card" }, shown.length ? h("table", {}, shown.map((i) => h("tr", {}, h("td", { class: i.severity }, i.severity), h("td", {}, i.code), h("td", {}, i.message)))) : t("لا توجد ملاحظات.", "No findings.")));
}
