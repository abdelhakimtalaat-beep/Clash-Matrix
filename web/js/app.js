import { h, t, lang, setLang, toast } from "./ui.js";
import { app, state } from "./store.js";
import { loadBackend } from "./backend/index.js";

const PAGES = [
  ["dashboard", "الرئيسية", "Dashboard"], ["import", "استيراد", "Import"], ["matrix", "المصفوفة", "Matrix"], ["mappings", "الرموز", "Codes"],
  ["searchsets", "مجموعات البحث", "Search sets"], ["tests", "الاختبارات", "Tests"], ["naming", "التسمية", "Naming"],
  ["validation", "التحقق", "Validation"], ["export", "التصدير", "Export"], ["team", "الفريق", "Team"], ["activity", "النشاط", "Activity"],
  ["settings", "الإعدادات", "Settings"], ["help", "المساعدة", "Help"],
];
const OUTSIDE = ["login", "projects"];
const WRITE_PAGES = new Set(["import", "matrix", "mappings", "searchsets", "tests", "naming", "settings"]);
const cache = {};
const save = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };
const load = (k) => { try { return localStorage.getItem(k); } catch { return null; } };

const ctx = {
  async signIn(e, p) { state.user = await state.backend.signIn(e, p); },
  async signUp(e, p) { state.user = await state.backend.signUp(e, p); },
  listProjects: () => state.backend.listProjects(),
  createProject: (n) => state.backend.createProject(n),
  deleteProject: (id) => state.backend.deleteProject(id),
  async open(p) { await app.openProject(p); save("bcm-project", p.id); },
};

function syncBadge() {
  const s = state.sync;
  const map = { saved: ["good", t("محفوظ", "saved")], saving: ["warn", t("جارٍ الحفظ", "saving")], dirty: ["warn", t("تعديلات غير محفوظة", "unsaved")], error: ["bad", t("تعذر الحفظ", "save failed")] };
  const [cls, text] = s.paused ? ["bad", t("الحفظ التلقائي متوقف — أغلق التبويبات الأخرى وأعد التحميل", "Auto-save paused — close other tabs and reload")] : (map[s.status] ?? ["", ""]);
  return text ? h("span", { class: `badge ${cls}`, title: s.error ?? "" }, text) : null;
}

function drawHeader() {
  const bits = [h("b", {}, "BIM Clash Matrix")];
  if (state.project) {
    bits.push(h("span", {}, "· ", state.project.name), h("span", { class: "badge" }, state.project.role));
    if (state.readOnly) bits.push(h("span", { class: "badge warn" }, t("قراءة فقط", "read-only")));
  }
  bits.push(h("span", { class: "sp" }));
  if (state.project) {
    bits.push(h("span", { class: "who", title: state.presence.map((p) => `${p.name}${p.page ? " · " + p.page : ""}`).join("\n") }, state.presence.slice(0, 6).map((p) => h("span", { class: "dot" }, (p.name || "?")[0].toUpperCase())), state.presence.length ? ` ${state.presence.length}` : ""),
      syncBadge(), state.sync.conflicts.length ? h("span", { class: "badge warn", title: state.sync.conflicts.map((c) => c.key).join("\n") }, `${state.sync.conflicts.length} ${t("تعارض دُمج", "merged conflicts")}`) : null,
      h("button", { onclick: async () => { await app.closeProject(); save("bcm-project", null); location.hash = "projects"; } }, t("المشاريع", "Projects")));
  }
  if (state.user) bits.push(h("span", { class: "Info" }, state.user.email), h("button", { onclick: async () => { await app.closeProject(); await state.backend.signOut(); state.user = null; save("bcm-project", null); location.hash = "login"; draw(); } }, t("خروج", "Sign out")));
  bits.push(h("button", { onclick: () => { setLang(lang.current === "ar" ? "en" : "ar"); draw(); } }, lang.current === "ar" ? "English" : "العربية"));
  document.getElementById("top").replaceChildren(...bits.filter((b) => b));
}

let drawId = 0;
async function draw() {
  { const ae = document.activeElement, v = document.getElementById("view"); if (ae && v && v.contains(ae)) ae.blur(); } // commit a pending edit (its change handler may redraw) before the view is torn down
  const mine = ++drawId; // a newer draw supersedes this one (avoids duplicated content when two redraws overlap)
  let page = location.hash.slice(1) || "dashboard";
  if (!state.user) page = "login";
  else if (!state.project && page !== "projects") page = "projects";
  else if (state.project && !PAGES.some((p) => p[0] === page) && !OUTSIDE.includes(page)) page = "dashboard";
  if (state.user && page === "login") page = "projects";
  const nav = document.getElementById("nav"), view = document.getElementById("view");
  drawHeader();
  nav.replaceChildren(...(state.project ? PAGES.map(([id, ar, en]) => h("a", { class: id === page ? "on" : "", onclick: () => (location.hash = id) }, t(ar, en))) : []));
  nav.style.display = state.project ? "" : "none";
  view.replaceChildren();
  view.append = (...n) => Element.prototype.append.call(view, ...n.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  view.dataset.page = page;
  app.setPage(page);
  try {
    const mod = (cache[page] ??= await import(`./views/${page}.js`));
    if (mine !== drawId) return;
    if (state.readOnly && WRITE_PAGES.has(page)) view.append(h("div", { class: "banner" }, t("لديك صلاحية قراءة فقط في هذا المشروع.", "You have read-only access to this project.")));
    mod.default(view, draw, ctx);
    if (state.readOnly && WRITE_PAGES.has(page)) view.querySelectorAll("input,select,textarea,button").forEach((e) => (e.disabled = true));
  } catch (e) { view.append(h("pre", { class: "Error" }, String(e.stack || e))); }
}

async function boot() {
  setLang(lang.current);
  window.addEventListener("hashchange", draw);
  try {
    app.setBackend(await loadBackend());
    state.backend.onAuth?.((u) => { if (!u && state.user) { state.user = null; draw(); } });
    state.user = await state.backend.getSession();
    if (state.user) {
      const last = load("bcm-project");
      if (last) { const p = (await state.backend.listProjects()).find((x) => x.id === last); if (p) await ctx.open(p); }
    }
  } catch (e) { toast(e.message); }
  // Remote changes redraw the page unless the user is typing in it (then only the header refreshes).
  state.onRemote = () => { const a = document.activeElement; if (!a || a === document.body || !document.getElementById("view").contains(a)) draw(); else drawHeader(); };
  state.onStatus = drawHeader;
  draw();
}
boot();
window.__bcm = { app, state };
