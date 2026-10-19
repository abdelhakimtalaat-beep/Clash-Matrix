import { h, t, lang, setLang } from "./ui.js";
import { restore, state, onChange } from "./store.js";

const PAGES = [
  ["dashboard", "الرئيسية", "Dashboard"], ["import", "استيراد", "Import"], ["matrix", "المصفوفة", "Matrix"], ["mappings", "الرموز", "Codes"],
  ["searchsets", "مجموعات البحث", "Search sets"], ["tests", "الاختبارات", "Tests"], ["tolerances", "التفاوتات", "Tolerances"], ["naming", "التسمية", "Naming"],
  ["validation", "التحقق", "Validation"], ["export", "التصدير", "Export"], ["github", "GitHub", "GitHub"], ["settings", "الإعدادات", "Settings"], ["help", "الفريق", "Team"],
];
const cache = {};
async function draw() {
  const page = location.hash.slice(1) || "dashboard";
  const top = document.getElementById("top"), nav = document.getElementById("nav"), view = document.getElementById("view");
  top.replaceChildren(h("b", {}, "BIM Clash Matrix"), h("span", { class: "sp" }), state.dirty ? h("span", { class: "badge warn" }, t("غير محفوظ على GitHub", "not saved to GitHub")) : null,
    h("button", { onclick: () => { setLang(lang.current === "ar" ? "en" : "ar"); draw(); } }, lang.current === "ar" ? "English" : "العربية"));
  nav.replaceChildren(...PAGES.map(([id, ar, en]) => h("a", { class: id === page ? "on" : "", onclick: () => (location.hash = id) }, t(ar, en))));
  view.replaceChildren();
  view.append = (...n) => Element.prototype.append.call(view, ...n.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  try {
    const mod = cache[page] ??= await import(`./views/${PAGES.some((p) => p[0] === page) ? page : "dashboard"}.js`);
    mod.default(view, draw);
  } catch (e) { view.append(h("pre", { class: "Error" }, String(e.stack || e))); }
}
setLang(lang.current);
await restore();
onChange(() => {});
window.addEventListener("hashchange", draw);
draw();
window.__bcm = { state };
