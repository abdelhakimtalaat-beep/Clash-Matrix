import { h, t } from "../ui.js";
import { state, changed } from "../store.js";
import { UNITS, parseDecimal } from "../core/units.js";

export default function render(root, rerender) {
  const cfg = state.cfg, tol = cfg.tolerances;
  const measure = (m, set) => {
    const v = h("input", { size: 8, value: m.value, onchange: (e) => { if (!parseDecimal(e.target.value)) { e.target.value = m.value; return; } set({ ...m, value: e.target.value.trim() }); } });
    const u = h("select", { onchange: (e) => set({ ...m, unit: e.target.value }) }, UNITS.map((x) => h("option", { selected: x === m.unit }, x)));
    return h("span", {}, v, " ", u);
  };
  const discs = [...new Set(cfg.matrix.systems.map((s) => s.discipline).filter(Boolean))];
  root.append(h("h2", {}, t("التفاوتات", "Tolerances")),
    h("p", { class: "Info" }, t("الأولوية: تجاوز الاختبار ← زوج الأنظمة ← الملف ← التخصص ← افتراضي المشروع. القيم تُخزَّن كنص عشري وتُحوَّل بدقة تامة.", "Precedence: test override → system pair → profile → discipline → project default. Values are stored as decimal text and converted exactly.")),
    h("div", { class: "card" }, h("b", {}, t("افتراضي المشروع", "Project default")), " ", measure(tol.projectDefault, (m) => { tol.projectDefault = m; changed(); rerender(); })),
    h("div", { class: "card" }, h("b", {}, t("حسب التخصص", "Per discipline")),
      discs.map((d) => h("div", { class: "row" }, h("span", { style: { minWidth: "140px" } }, d),
        tol.disciplineDefaults[d] ? [measure(tol.disciplineDefaults[d], (m) => { tol.disciplineDefaults[d] = m; changed(); rerender(); }), h("button", { onclick: () => { delete tol.disciplineDefaults[d]; changed(); rerender(); } }, "×")]
          : h("button", { onclick: () => { tol.disciplineDefaults[d] = { ...tol.projectDefault }; changed(); rerender(); } }, t("تعيين", "Set"))))),
    h("div", { class: "card" }, h("b", {}, t("أنواع التصادم", "Clash types")),
      cfg.profiles.map((p) => h("div", { class: "row" }, h("span", { style: { minWidth: "140px" } }, `${p.name} (${p.testType})`),
        p.tolerance ? [measure(p.tolerance, (m) => { p.tolerance = m; changed(); rerender(); }), h("button", { onclick: () => { p.tolerance = null; changed(); rerender(); } }, "×")]
          : h("button", { onclick: () => { p.tolerance = { ...tol.projectDefault }; changed(); rerender(); } }, t("تعيين", "Set"))))));
}
