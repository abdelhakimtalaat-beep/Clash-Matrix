import { h, t } from "../ui.js";
import { state } from "../store.js";
import { validateConfig } from "../core/validate.js";

export default function render(root) {
  const c = state.cfg, issues = validateConfig(c, state.dialect);
  const stat = (n, label) => h("div", { class: "card", style: { minWidth: "130px" } }, h("div", { style: { fontSize: "28px" } }, n), label);
  root.append(h("h2", {}, c.name),
    h("div", { class: "row" }, stat(c.matrix.systems.length, t("أنظمة", "Systems")), stat(c.matrix.cells.length, t("خلايا", "Cells")), stat(c.searchSets.length, t("مجموعات بحث", "Search sets")), stat(c.clashTests.length, t("اختبارات", "Tests")),
      stat(issues.filter((i) => i.severity === "Error").length, t("أخطاء", "Errors")), stat(issues.filter((i) => i.severity === "Warning").length, t("تحذيرات", "Warnings"))),
    state.dialect.verified ? null : h("div", { class: "banner" }, t("صيغة XML غير مُتحقَّق منها.", "XML dialect is unverified.")));
}
