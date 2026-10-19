import { h, t, toast } from "../ui.js";
import { state, changed } from "../store.js";
import { defaultDialect } from "../core/dialect.js";

export default function render(root, rerender) {
  const d = state.dialect;
  const ta = h("textarea", { rows: 18, style: { width: "100%", fontFamily: "monospace" } }, JSON.stringify(d, null, 2));
  root.append(h("h2", {}, t("الإعدادات والصيغة (Dialect)", "Settings & dialect")),
    h("div", { class: "card" }, h("label", { class: "row" }, t("اسم المشروع", "Project name"), h("input", { value: state.cfg.name, onchange: (e) => { state.cfg.name = e.target.value; changed(); } }))),
    h("div", { class: "card" }, h("p", {}, t("حالة الصيغة: ", "Dialect status: "), d.verified ? h("b", { class: "ok" }, "verified") : h("b", { class: "Warning" }, "UNVERIFIED")),
      h("p", { class: "Info" }, t("كل ما يخص بنية XML الخاصة بـ Navisworks موجود هنا كبيانات. لا تضع verified=true إلا بعد استيراد فعلي ناجح وإعادة فتح الملف.", "Everything about Navisworks' XML structure is data here. Set verified=true only after a real successful import and reopen.")),
      ta, h("div", { class: "row" },
        h("button", { class: "pri", onclick: () => { try { state.dialect = JSON.parse(ta.value); changed(); toast("OK"); rerender(); } catch (e) { toast(e.message); } } }, t("تطبيق", "Apply")),
        h("button", { onclick: () => { state.dialect = defaultDialect(); changed(); rerender(); } }, t("استعادة الافتراضي", "Reset to default")))));
}
