import { h, t, toast } from "../ui.js";
import { state, replaceConfig } from "../store.js";

const summary = (a) => {
  if (a.kind === "clashTest" || a.kind === "searchSet" || a.kind === "codeMapping" || a.kind === "profile") return `${a.kind}: ${a.new_data?.name ?? a.new_data?.code ?? a.entity_id}`;
  return a.kind;
};
export default function render(root, rerender) {
  const { backend, project } = state, canEdit = project.role !== "viewer";
  const log = h("div", { class: "card" }, "..."), snaps = h("div", { class: "card" }, "...");
  backend.audit(project.id, 150).then((rows) => log.replaceChildren(h("table", {}, h("tr", {}, [t("الوقت", "When"), t("من", "Who"), t("الإجراء", "Action"), t("العنصر", "Item")].map((x) => h("th", {}, x))),
    rows.map((a) => h("tr", {}, h("td", {}, new Date(a.at).toLocaleString()), h("td", {}, a.by ?? a.by_user ?? ""), h("td", {}, a.action), h("td", {}, summary(a))))))).catch((e) => log.replaceChildren(e.message));
  const label = h("input", { placeholder: t("اسم النسخة (مثلاً: قبل التسليم)", "Version label") });
  const put = (el, ...c) => el.replaceChildren(...c.flat(Infinity).filter(Boolean));
  const load = () => backend.snapshots(project.id).then((rows) => put(snaps,
    canEdit ? h("div", { class: "row" }, label, h("button", { class: "pri", onclick: async () => { if (!label.value.trim()) return; try { await backend.createSnapshot(project.id, label.value.trim(), { cfg: state.cfg, dialect: state.dialect }); toast("OK"); load(); } catch (e) { toast(e.message); } } }, t("حفظ نسخة مسمّاة", "Save named version"))) : null,
    ...rows.map((s) => h("div", { class: "proj" }, h("span", {}, s.label, " ", h("span", { class: "Info" }, new Date(s.created_at).toLocaleString())),
      canEdit ? h("button", { onclick: async () => { if (!confirm(t("استرجاع هذه النسخة؟ ستُحفظ كتعديلات عادية ويراها الجميع.", "Restore this version? It is saved as normal edits that everyone sees."))) return; try { const d = await backend.loadSnapshot(s.id); replaceConfig(d.cfg, d.dialect); toast(t("تم الاسترجاع", "Restored")); rerender(); } catch (e) { toast(e.message); } } }, t("استرجاع", "Restore")) : null)))).catch((e) => snaps.replaceChildren(e.message));
  load();
  root.append(h("h2", {}, t("النشاط والنسخ", "Activity & versions")), h("h3", {}, t("نسخ مسمّاة", "Named versions")), snaps, h("h3", {}, t("سجل التدقيق", "Audit log")), log);
}
