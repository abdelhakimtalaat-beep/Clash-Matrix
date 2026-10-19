import { h, t } from "../ui.js";

export default function render(root) {
  root.append(h("h2", {}, t("الفريق والصلاحيات", "Team & access")),
    h("div", { class: "card" }, h("p", {}, t("لا يوجد خادم ولا حسابات خاصة بالأداة. الصلاحيات هي صلاحيات مستودع GitHub:", "There is no server and no app accounts. Access is GitHub repository access:")),
      h("ul", {}, h("li", {}, t("Read: مراجعة فقط.", "Read: review only.")), h("li", {}, t("Write: تعديل وحفظ (Commit).", "Write: edit and save (commit).")), h("li", {}, t("Admin: إعدادات المستودع والفروع المحمية.", "Admin: repo settings and protected branches."))),
      h("p", {}, t("سجل التدقيق هو سجل commits لملف project.json: من غيّر ماذا ومتى. للموافقات استخدم Pull Request على فرع محمي.", "The audit trail is the commit log of project.json: who changed what and when. For approvals use a Pull Request on a protected branch."))),
    h("div", { class: "card" }, h("b", {}, t("مسار العمل", "Workflow")), h("ol", {},
      ["استيراد Excel", "تعيين الرموز واختيار ملف التعريف", "توليد الاختبارات", "مراجعة مجموعات البحث (استبدل التخمين التلقائي بخصائص النموذج الحقيقية)", "ضبط التفاوتات", "التحقق", "التصدير والاستيراد داخل Navisworks"].map((s, i) => h("li", {}, s)))));
}
