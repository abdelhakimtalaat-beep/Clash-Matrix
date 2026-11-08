import { h, t, toast } from "../ui.js";
import { state } from "../store.js";

// Any signed-in user: choose a new password. Shown automatically after the first sign-in with an admin-set default password.
export default function render(root, rerender) {
  const must = !!state.user?.mustChange;
  const p1 = h("input", { type: "password", id: "pw-new", placeholder: t("كلمة المرور الجديدة (8 أحرف على الأقل)", "New password (min 8 chars)"), autocomplete: "new-password" });
  const p2 = h("input", { type: "password", id: "pw-new2", placeholder: t("أعد كتابتها", "Repeat it"), autocomplete: "new-password" });
  const go = async () => {
    if (p1.value.length < 8) return toast(t("8 أحرف على الأقل", "At least 8 characters"));
    if (p1.value !== p2.value) return toast(t("كلمتا المرور غير متطابقتين", "The two passwords do not match"));
    try {
      const u = await state.backend.changePassword(p1.value);
      state.user = { ...state.user, ...(u ?? {}), mustChange: false };
      toast(t("تم تغيير كلمة المرور", "Password changed")); location.hash = state.project ? "dashboard" : "projects"; rerender();
    } catch (e) { toast(e.message); }
  };
  root.append(h("div", { class: "card auth" }, h("h2", {}, t("تغيير كلمة المرور", "Change password")),
    must ? h("div", { class: "banner" }, t("أنشأ المدير حسابك بكلمة مرور افتراضية. اختر كلمة مرور خاصة بك للمتابعة.", "An admin created your account with a default password. Choose your own password to continue.")) : null,
    h("p", { class: "Info" }, state.user?.email), p1, p2,
    h("div", { class: "row" }, h("button", { class: "pri", id: "pw-save", onclick: go }, t("حفظ", "Save")))));
}
