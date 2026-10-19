import { h, t } from "../ui.js";
import { state, changed } from "../store.js";
import { generateTests } from "../core/generate.js";
import { toast } from "../ui.js";

export default function render(root, rerender) {
  const cfg = state.cfg;
  const used = (code) => cfg.matrix.cells.filter((c) => c.rawValue === code).length;
  root.append(h("h2", {}, t("تعيين الرموز", "Code mapping")),
    h("p", { class: "Info" }, t("اختر لكل رمز هل يولّد اختباراً وبأي ملف تعريف. لا توجد قيم افتراضية مخمّنة.", "Choose for each code whether it generates a test and which profile. No guessed defaults.")),
    h("div", { class: "card" }, h("table", {},
      h("tr", {}, ["Code", t("لون", "Colour"), t("الاستخدام", "Used"), t("يولّد؟", "Generate?"), t("الملف", "Profile")].map((x) => h("th", {}, x))),
      cfg.codeMappings.map((m) => h("tr", {},
        h("td", {}, m.code || "—"), h("td", { style: m.colorHex ? { background: m.colorHex } : {} }, m.colorHex ?? ""), h("td", {}, used(m.code)),
        h("td", {}, h("input", { type: "checkbox", checked: m.generateTest, onchange: (e) => { m.generateTest = e.target.checked; changed(); } })),
        h("td", {}, h("select", { onchange: (e) => { m.profileId = e.target.value || null; changed(); } },
          h("option", { value: "" }, "—"), cfg.profiles.map((p) => h("option", { value: p.id, selected: p.id === m.profileId }, p.name)))))))),
    h("button", { class: "pri", onclick: () => {
      const r = generateTests(cfg); changed();
      toast(t(`أُنشئ ${r.created} اختبار، حُدّث ${r.updated}، حُذف ${r.removedStale}، ${r.searchSetsCreated} مجموعة بحث جديدة`, `Created ${r.created}, updated ${r.updated}, removed ${r.removedStale}, ${r.searchSetsCreated} new search sets`));
      rerender();
    } }, t("توليد الاختبارات", "Generate tests")));
}
