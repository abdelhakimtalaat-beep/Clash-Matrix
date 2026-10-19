import { h, t, toast } from "../ui.js";

export default function render(root, rerender, ctx) {
  const name = h("input", { placeholder: t("اسم مشروع جديد", "New project name") });
  const list = h("div", {}, t("جارٍ التحميل...", "Loading..."));
  ctx.listProjects().then((ps) => {
    list.replaceChildren(...(ps.length ? ps.map((p) => h("div", { class: "proj" }, h("span", {}, p.name, " ", h("span", { class: "badge" }, p.role)),
      h("button", { class: "pri", onclick: async () => { try { await ctx.open(p); location.hash = "dashboard"; } catch (e) { toast(e.message); } } }, t("فتح", "Open")))) : [h("p", {}, t("لا توجد مشاريع بعد. أنشئ مشروعاً أو اطلب من مدير مشروع إضافتك.", "No projects yet. Create one or ask a project admin to add you."))]));
  }).catch((e) => list.replaceChildren(h("p", { class: "Error" }, e.message)));
  root.append(h("div", { class: "row" }, h("h2", {}, t("المشاريع", "Projects")), h("button", { onclick: rerender }, t("تحديث", "Refresh"))), h("div", { class: "card" }, list),
    h("div", { class: "card row" }, name, h("button", { class: "pri", onclick: async () => {
      if (!name.value.trim()) return;
      try { const id = await ctx.createProject(name.value.trim()); await ctx.open({ id, name: name.value.trim(), role: "admin" }); location.hash = "import"; } catch (e) { toast(e.message); }
    } }, t("إنشاء", "Create"))));
}
