import { h, t, toast } from "../ui.js";
import { app, state } from "../store.js";

export default function render(root, rerender, ctx) {
  const email = h("input", { type: "email", placeholder: "Email", autocomplete: "username" });
  const pass = h("input", { type: "password", placeholder: t("كلمة المرور (6 أحرف على الأقل)", "Password (min 6 chars)"), autocomplete: "current-password" });
  const go = (fn) => async () => {
    try { await fn(email.value.trim(), pass.value); location.hash = "projects"; }
    catch (e) { toast(e.message); }
  };
  root.append(h("div", { class: "card auth" }, h("h2", {}, t("تسجيل الدخول", "Sign in")), email, pass,
    h("div", { class: "row" }, h("button", { class: "pri", onclick: go((e, p) => ctx.signIn(e, p)) }, t("دخول", "Sign in")),
      // Self-registration exists only in the local dev/test backend. On Supabase, accounts are created by a project admin (Team tab).
      state.backend?.kind === "dev" ? h("button", { onclick: go((e, p) => ctx.signUp(e, p)) }, t("إنشاء حساب", "Create account")) : null),
    state.backend?.kind === "dev" ? null : h("p", { class: "Info" }, t("لا يوجد تسجيل ذاتي. اطلب من مدير المشروع إنشاء حساب لك.", "There is no self sign-up. Ask a project admin to create an account for you."))));
}
