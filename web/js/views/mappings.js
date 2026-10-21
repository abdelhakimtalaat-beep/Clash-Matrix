import { h, t } from "../ui.js";
import { state, changed } from "../store.js";
import { generateTests } from "../core/generate.js";
import { toast } from "../ui.js";
import { typeOfCode, syncClashTypes } from "../core/clashtype.js";

export default function render(root, rerender) {
  const cfg = state.cfg;
  if (!state.readOnly && syncClashTypes(cfg)) changed(); // last letter of the code decides the clash type
  const used = (code) => cfg.matrix.cells.filter((c) => c.rawValue === code).length;
  root.append(h("h2", {}, t("تعيين الرموز", "Code mapping")),
    h("p", { class: "Info" }, t("نوع التصادم يُحدَّد تلقائياً من آخر حرف في الكود: H = Hard، C = Clearance، D = Duplicates. لا يمكن تعديله يدوياً؛ الرمز الذي لا ينتهي بأحد هذه الحروف لا يولّد اختباراً حتى تغيّر الكود.", "The Clash Type comes from the last letter of the code: H = Hard, C = Clearance, D = Duplicates. It cannot be set by hand; a code that does not end in one of these letters generates no test until you rename the code.")),
    h("div", { class: "card" }, h("table", {},
      h("tr", {}, ["Code", t("لون", "Colour"), t("الاستخدام", "Used"), t("يولّد؟", "Generate?"), "Clash Type"].map((x) => h("th", {}, x))),
      cfg.codeMappings.map((m) => h("tr", {},
        h("td", {}, m.code || "—"), h("td", { style: m.colorHex ? { background: m.colorHex } : {} }, m.colorHex ?? ""), h("td", {}, used(m.code)),
        h("td", {}, h("input", { type: "checkbox", checked: m.generateTest, onchange: (e) => { m.generateTest = e.target.checked; changed(); } })),
        h("td", {}, typeOfCode(m.code)
          ? [h("b", {}, typeOfCode(m.code)), " ", h("span", { class: "Info" }, t("(من آخر حرف)", "(from last letter)"))]
          : h("span", { class: "Warning" }, t("— آخر حرف ليس H أو C أو D", "— last letter is not H, C or D"))))))),
    h("button", { class: "pri", onclick: () => {
      const r = generateTests(cfg); changed();
      toast(t(`أُنشئ ${r.created} اختبار، حُدّث ${r.updated}، حُذف ${r.removedStale}، ${r.searchSetsCreated} مجموعة بحث جديدة`, `Created ${r.created}, updated ${r.updated}, removed ${r.removedStale}, ${r.searchSetsCreated} new search sets`));
      rerender();
    } }, t("توليد الاختبارات", "Generate tests")));
}
