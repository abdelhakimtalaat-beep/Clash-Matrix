import { h, t, toast } from "../ui.js";
import { state, changed, replaceConfig } from "../store.js";
import { GitHubStore } from "../core/github.js";

let commits = null;
export default function render(root, rerender) {
  const g = state.github;
  const store = () => new GitHubStore(g);
  const inp = (label, key, type = "text") => h("label", { class: "row" }, h("span", { style: { minWidth: "110px" } }, label), h("input", { type, size: 34, value: g[key], onchange: (e) => (g[key] = e.target.value.trim()) }));
  const run = (f) => async () => { try { await f(); } catch (e) { toast(`GitHub: ${e.message}`); } };
  root.append(h("h2", {}, t("المزامنة مع GitHub", "GitHub sync")),
    h("div", { class: "card" }, inp("Owner", "owner"), inp("Repo", "repo"), inp("Branch", "branch"), inp("Path", "path"), inp("Token", "token", "password"),
      h("p", { class: "Info" }, t("الرمز (Fine-grained token بصلاحية Contents على مستودع واحد) يبقى في ذاكرة الصفحة فقط ولا يُحفظ.", "The token (fine-grained, Contents on one repo) stays in page memory only and is never saved.")),
      h("div", { class: "row" },
        h("button", { onclick: run(async () => { const r = await store().load(); if (!r) return toast(t("الملف غير موجود بعد", "File not found yet")); replaceConfig(JSON.parse(r.text)); state.sha = r.sha; toast(t("تم التحميل", "Loaded")); }) }, t("تحميل", "Load")),
        h("button", { class: "pri", onclick: run(async () => { const msg = prompt(t("وصف التعديل", "Commit message"), "Update clash matrix"); if (!msg) return; const r = await store().save(JSON.stringify(state.cfg, null, 2), msg, state.sha ?? undefined); state.sha = r.sha; state.dirty = false; toast(t("تم الحفظ (commit)", "Saved (commit)")); }) }, t("حفظ (Commit)", "Save (commit)")),
        h("button", { onclick: run(async () => { commits = await store().history(); rerender(); }) }, t("السجل", "History")))),
    commits ? h("div", { class: "card" }, h("table", {}, commits.map((c) => h("tr", {}, h("td", {}, new Date(c.date).toLocaleString()), h("td", {}, c.author), h("td", {}, c.message),
      h("td", {}, h("button", { onclick: run(async () => { replaceConfig(JSON.parse(await store().loadAt(c.sha))); toast(t("تم استرجاع النسخة محلياً (احفظ لتثبيتها)", "Restored locally (save to keep)")); }) }, t("استرجاع", "Restore"))))))) : null);
}
