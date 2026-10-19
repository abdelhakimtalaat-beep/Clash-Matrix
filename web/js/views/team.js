import { h, t, toast } from "../ui.js";
import { state } from "../store.js";

export default function render(root, rerender) {
  const { backend, project } = state;
  const admin = project.role === "admin";
  const box = h("div", { class: "card" }, "...");
  const load = async () => {
    const ms = await backend.members(project.id);
    const email = h("input", { placeholder: "email@company.com", size: 28 }), role = h("select", {}, ["editor", "viewer", "admin"].map((r) => h("option", {}, r)));
    box.replaceChildren(h("table", {}, h("tr", {}, ["Email", t("الصلاحية", "Role"), ""].map((x) => h("th", {}, x))),
      ms.map((m) => h("tr", {}, h("td", {}, m.email), h("td", {}, admin ? h("select", { onchange: async (e) => { try { await backend.setRole(project.id, m.userId, e.target.value); toast("OK"); } catch (x) { toast(x.message); } load(); } }, ["viewer", "editor", "admin"].map((r) => h("option", { selected: r === m.role }, r))) : m.role),
        h("td", {}, admin ? h("button", { onclick: async () => { try { await backend.removeMember(project.id, m.userId); } catch (x) { toast(x.message); } load(); } }, t("إزالة", "Remove")) : null)))),
      admin ? h("div", { class: "row", style: { marginTop: "10px" } }, email, role, h("button", { class: "pri", onclick: async () => {
        try { await backend.addMember(project.id, email.value, role.value); toast("OK"); load(); }
        catch (x) { toast(x.code === "P0002" || /user_not_found/.test(x.message) ? t("لا يوجد مستخدم بهذا البريد. يجب أن ينشئ حساباً أولاً.", "No user with this email. They must sign up first.") : x.message); }
      } }, t("إضافة", "Add"))) : h("p", { class: "Info" }, t("المدير فقط يغيّر الصلاحيات.", "Only admins change roles.")));
  };
  load().catch((e) => box.replaceChildren(h("p", { class: "Error" }, e.message)));
  root.append(h("h2", {}, t("الفريق والصلاحيات", "Team & roles")),
    h("p", { class: "Info" }, t("viewer: قراءة فقط · editor: تعديل · admin: تعديل وإدارة الأعضاء. تُفرض الصلاحيات في قاعدة البيانات نفسها (RLS) وليس في الواجهة فقط.", "viewer: read only · editor: edit · admin: edit + manage members. Enforced in the database (RLS), not only in the UI.")), box);
}
