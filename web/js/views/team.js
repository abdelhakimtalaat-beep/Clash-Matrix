import { h, t, toast } from "../ui.js";
import { state } from "../store.js";

export default function render(root, rerender) {
  const { backend, project } = state;
  const admin = project.role === "admin";
  const box = h("div", { class: "card" }, "...");
  const suggest = () => { const a = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = crypto.getRandomValues(new Uint32Array(10)); return [...r].map((n) => a[n % a.length]).join(""); };
  const addBox = () => {
    const email = h("input", { placeholder: "email@company.com", size: 28, type: "email" }), role = h("select", {}, ["editor", "viewer", "admin"].map((r) => h("option", {}, r)));
    const pw = h("input", { id: "new-pw", value: suggest(), size: 14, title: t("كلمة المرور الافتراضية — سيغيّرها المستخدم عند أول دخول", "Default password — the user changes it at first sign-in") });
    const out = h("p", { class: "Info", id: "created-note" });
    return h("div", { style: { marginTop: "10px" } }, h("h3", {}, t("إضافة مستخدم جديد", "Add a new user")),
      h("div", { class: "row" }, email, role, pw, h("button", { onclick: () => { pw.value = suggest(); } }, t("توليد", "Generate")),
        h("button", { class: "pri", id: "create-user", onclick: async () => {
          try {
            const r = await backend.createUser(project.id, email.value, pw.value, role.value);
            out.textContent = r.created
              ? t(`تم إنشاء الحساب. أعطِ المستخدم: ${email.value.trim()} / ${pw.value} — سيُطلب منه تغيير كلمة المرور عند أول دخول.`, `Account created. Give the user: ${email.value.trim()} / ${pw.value} — they will be asked to change the password at first sign-in.`)
              : t("الحساب موجود مسبقاً؛ أُضيف إلى المشروع (كلمة مروره لم تتغير).", "That account already existed; it was added to the project (its password is unchanged).");
            email.value = ""; pw.value = suggest(); load();
          } catch (x) { toast(x.message); }
        } }, t("إنشاء وإضافة", "Create & add"))),
      out, h("p", { class: "Info" }, t("كلمة المرور الافتراضية 8 أحرف على الأقل. يمكن للمستخدم تغييرها لاحقاً بالضغط على بريده في أعلى الصفحة.", "Default password: min 8 characters. The user can change it any time by clicking their email at the top of the page.")));
  };
  const load = async () => {
    const ms = await backend.members(project.id);
    box.replaceChildren(h("table", {}, h("tr", {}, ["Email", t("الصلاحية", "Role"), ""].map((x) => h("th", {}, x))),
      ms.map((m) => h("tr", {}, h("td", {}, m.email), h("td", {}, admin ? h("select", { onchange: async (e) => { try { await backend.setRole(project.id, m.userId, e.target.value); toast("OK"); } catch (x) { toast(x.message); } load(); } }, ["viewer", "editor", "admin"].map((r) => h("option", { selected: r === m.role }, r))) : m.role),
        h("td", {}, admin ? h("button", { onclick: async () => { try { await backend.removeMember(project.id, m.userId); } catch (x) { toast(x.message); } load(); } }, t("إزالة", "Remove")) : null)))),
      admin ? null : h("p", { class: "Info" }, t("المدير فقط يغيّر الصلاحيات.", "Only admins change roles.")));
  };
  load().catch((e) => box.replaceChildren(h("p", { class: "Error" }, e.message)));
  root.append(h("h2", {}, t("الفريق والصلاحيات", "Team & roles")),
    h("p", { class: "Info" }, t("viewer: قراءة فقط · editor: تعديل · admin: تعديل وإدارة الأعضاء. تُفرض الصلاحيات في قاعدة البيانات نفسها (RLS) وليس في الواجهة فقط.", "viewer: read only · editor: edit · admin: edit + manage members. Enforced in the database (RLS), not only in the UI.")), box, admin ? addBox() : null);
}
