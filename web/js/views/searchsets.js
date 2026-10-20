// Search-set editor modelled on Navisworks "Find Items": rows of Category | Property | Condition | Value,
// with OR between blocks of AND rows. Dropdowns come from the catalog (learned by importing a Navisworks XML).
import { h, t, toast, pickFile } from "../ui.js";
import { state, changed } from "../store.js";
import { newSearchSet, newCondition, OPERATORS } from "../core/model.js";
import { validateConfig } from "../core/validate.js";
import { parseBatch, applyBatch, catalogChoices } from "../core/nwimport.js";
import { toDnf } from "../core/dnf.js";
import { UNITS } from "../core/units.js";

let selected = null;
const collapsed = new Set();
const LINEAR = new Set(["GreaterOrEqual", "LessThan"]);
const OP_LABEL = { Equals: "Equals", NotEquals: "Not equals", Contains: "Contains", GreaterOrEqual: "Greater than or equal", LessThan: "Less than", Undefined: "Undefined" };
const CUSTOM = "__custom__";

/** A dropdown with a "Custom…" entry that reveals a text box. */
function pick(options, value, custom, onChange, placeholder) {
  const known = options.includes(value);
  const typing = custom || (value && !known);
  const sel = h("select", { onchange: (e) => (e.target.value === CUSTOM ? onChange(value, true) : onChange(e.target.value, false)) },
    h("option", { value: "", selected: !value && !typing }, placeholder),
    options.map((o) => h("option", { value: o, selected: o === value && !typing }, o)),
    h("option", { value: CUSTOM, selected: typing }, t("مخصص…", "Custom…")));
  return h("div", { class: "pick" }, sel, typing ? h("input", { value: value ?? "", placeholder, onchange: (e) => onChange(e.target.value, true) }) : null);
}

function blocksOf(ss) {
  const r = toDnf(ss.root);
  return r.error ? { error: r.error } : { blocks: r.terms };
}
function storeBlocks(ss, blocks) {
  blocks = blocks.filter((b) => b.length);
  ss.root = blocks.length <= 1 ? { mode: "All", conditions: blocks[0] ?? [], groups: [] } : { mode: "Any", conditions: [], groups: blocks.map((b) => ({ mode: "All", conditions: b, groups: [] })) };
}

export default function render(root, rerender) {
  const cfg = state.cfg, dialect = state.dialect;
  validateConfig(cfg, dialect);
  const choices = catalogChoices(dialect);
  const ss = cfg.searchSets.find((s) => s.id === selected) ?? cfg.searchSets[0];
  if (ss) selected = ss.id;
  const go = () => { changed(); rerender(); };

  const importBtn = h("button", {
    onclick: async () => {
      const f = await pickFile(".xml"); if (!f) return;
      try {
        const r = applyBatch(cfg, dialect, parseBatch(await f.text(), dialect));
        changed(); toast(`${r.created} new, ${r.updated} updated, ${r.linked} linked to matrix systems`); rerender();
      } catch (e) { toast(e.message); }
    },
  }, t("استيراد من Navisworks XML", "Import from Navisworks XML"));

  // ---- folder tree (folders are the "/"-separated parts of each set's folder, like Navisworks) ----
  const tree = { sets: [], kids: new Map() };
  for (const x of cfg.searchSets) {
    let n = tree;
    for (const part of (x.folder ?? "").split("/").filter(Boolean)) { if (!n.kids.has(part)) n.kids.set(part, { sets: [], kids: new Map() }); n = n.kids.get(part); }
    n.sets.push(x);
  }
  const count = (n) => n.sets.length + [...n.kids.values()].reduce((a, k) => a + count(k), 0);
  const addSet = (folder) => { const n = newSearchSet(); n.folder = folder || null; cfg.searchSets.push(n); selected = n.id; go(); };
  const renameFolder = (path) => {
    const to = (prompt(t("الاسم الجديد للمجلد", "New folder name"), path.split("/").pop()) ?? "").trim().replaceAll("/", "-");
    if (!to) return;
    const parent = path.split("/").slice(0, -1), np = [...parent, to].join("/");
    for (const x of cfg.searchSets) if (x.folder === path || x.folder?.startsWith(path + "/")) x.folder = np + x.folder.slice(path.length);
    go();
  };
  const link = (x) => h("div", { class: "leaf" }, h("a", { href: "#", style: { fontWeight: x.id === selected ? "bold" : "normal" }, onclick: (e) => { e.preventDefault(); selected = x.id; rerender(); } }, x.name), " ",
    x.status.representable ? h("span", { class: "ok" }, "✓") : h("span", { class: "Warning" }, "!"));
  const draw = (n, path) => [
    ...[...n.kids].sort((p, q) => p[0].localeCompare(q[0])).map(([name, k]) => {
      const fp = path ? `${path}/${name}` : name;
      const d = h("details", { class: "fold", open: !collapsed.has(fp) },
        h("summary", {}, "📁 ", name, h("span", { class: "Info" }, ` (${count(k)}) `),
          h("button", { title: t("مجموعة جديدة هنا", "New search set here"), onclick: (e) => { e.preventDefault(); addSet(fp); } }, "+"),
          h("button", { title: t("مجلد فرعي جديد", "New subfolder"), onclick: (e) => { e.preventDefault(); const sub = (prompt(t("اسم المجلد الفرعي", "Subfolder name")) ?? "").trim().replaceAll("/", "-"); if (sub) addSet(`${fp}/${sub}`); } }, "📁+"),
          h("button", { title: t("إعادة تسمية المجلد", "Rename folder"), onclick: (e) => { e.preventDefault(); renameFolder(fp); } }, "✎")),
        draw(k, fp));
      d.addEventListener("toggle", () => (d.open ? collapsed.delete(fp) : collapsed.add(fp)));
      return d;
    }),
    ...n.sets.sort((p, q) => p.name.localeCompare(q.name)).map(link),
  ];
  const list = h("div", { class: "card", style: { minWidth: "280px" } },
    h("div", { class: "row" }, h("button", { onclick: () => addSet(ss?.folder) }, "+ " + t("جديد", "New")),
      h("button", { onclick: () => { const f = (prompt(t("اسم المجلد الجديد (استخدم / للمجلدات الفرعية)", "New folder name (use / for subfolders)")) ?? "").trim(); if (f) addSet(f); } }, "📁+ " + t("مجلد", "Folder")), importBtn),
    draw(tree, ""));

  const editor = h("div", { class: "card", style: { flex: 1 } });
  editor.append = (...n) => Element.prototype.append.call(editor, ...n.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
  if (ss) {
    const { blocks, error } = blocksOf(ss);
    const row = (c, block, bi) => {
      const props = choices.get(c.category) ?? new Map();
      const combo = props.get(c.property);
      const values = combo?.values ?? [];
      const setCombo = (m) => { c.categoryInternal = m?.categoryInternal ?? null; c.propertyInternal = m?.propertyInternal ?? null; };
      return h("tr", {},
        h("td", {}, pick([...choices.keys()], c.category, false, (v, typing) => {
          c.category = v; c.isPlaceholder = false;
          const m = choices.get(v)?.get(c.property); setCombo(m);
          if (!m && choices.get(v)) c.property = "";
          if (typing && !choices.get(v)) { c.categoryInternal = null; c.propertyInternal = null; }
          go();
        }, t("الفئة", "Category"))),
        h("td", {}, pick([...props.keys()], c.property, false, (v) => { c.property = v; c.isPlaceholder = false; setCombo(props.get(v)); go(); }, t("الخاصية", "Property"))),
        h("td", {}, h("select", { onchange: (e) => { c.operator = e.target.value; go(); } }, OPERATORS.map((o) => h("option", { value: o, selected: o === c.operator }, OP_LABEL[o])), c.operator === "Other" ? h("option", { value: "Other", selected: true }, c.rawTest ?? "Other") : null)),
        h("td", {}, c.operator === "Undefined" ? null
          : LINEAR.has(c.operator) ? h("div", { class: "pick" }, h("input", { value: c.value, placeholder: "0", onchange: (e) => { c.value = e.target.value; c.isPlaceholder = false; changed(); } }),
            h("select", { onchange: (e) => { c.unit = e.target.value; changed(); } }, UNITS.map((u) => h("option", { selected: u === (c.unit ?? dialect.xmlLengthUnit) }, u))))
          : pick(values, c.value, false, (v) => { c.value = v; c.isPlaceholder = false; go(); }, t("القيمة", "Value"))),
        h("td", {}, h("details", {}, h("summary", {}, "⚙"),
          h("label", {}, "internal category ", h("input", { value: c.categoryInternal ?? "", onchange: (e) => { c.categoryInternal = e.target.value || null; changed(); } })),
          h("label", {}, "internal property ", h("input", { value: c.propertyInternal ?? "", onchange: (e) => { c.propertyInternal = e.target.value || null; changed(); } })),
          h("label", {}, "flags ", h("input", { type: "number", style: { width: "5em" }, value: c.flags ?? "", placeholder: String(dialect.defaultConditionFlags), onchange: (e) => { c.flags = e.target.value === "" ? null : Number(e.target.value); changed(); } })))),
        h("td", {}, c.isPlaceholder ? h("span", { class: "badge warn" }, t("تخمين تلقائي", "auto-guess")) : null,
          h("button", { title: t("حذف الصف", "Delete row"), onclick: () => { block.splice(block.indexOf(c), 1); storeBlocks(ss, blocks); go(); } }, "×")));
    };

    editor.append(
      h("datalist", { id: "folders" }, [...new Set(cfg.searchSets.flatMap((x) => { const p = (x.folder ?? "").split("/").filter(Boolean); return p.map((_, i) => p.slice(0, i + 1).join("/")); }))].map((f) => h("option", { value: f }))),
      h("div", { class: "row" },
        h("input", { list: "folders", value: ss.folder ?? "", placeholder: t("المجلد (مثل A-Architecture)", "Folder (e.g. A-Architecture)"), onchange: (e) => { ss.folder = e.target.value.trim() || null; go(); } }),
        h("input", { value: ss.name, onchange: (e) => { ss.name = e.target.value; go(); } }),
        h("button", { onclick: () => { cfg.searchSets = cfg.searchSets.filter((s) => s !== ss); cfg.clashTests = cfg.clashTests.filter((x) => x.searchSetAId !== ss.id && x.searchSetBId !== ss.id); selected = null; go(); } }, t("حذف", "Delete"))),
      choices.size && [...choices.values()].every((m) => [...m.values()].every((p) => !p.values.length))
        ? h("p", { class: "Info" }, t("قوائم القيم فارغة: استورد ملف Navisworks XML لتعبئتها من نموذجك، أو اختر «مخصص…» واكتب القيمة.", "Value lists are empty: import a Navisworks XML to fill them from your model, or choose Custom… and type the value.")) : null,
      error ? h("div", { class: "banner" }, error, " ", h("button", { onclick: () => { const all = []; const w = (g) => { all.push(...g.conditions); g.groups.forEach(w); }; w(ss.root); ss.root = { mode: "All", conditions: all, groups: [] }; go(); } }, t("تسطيح إلى AND", "Flatten to AND"))) : null,
      ...(blocks ?? []).flatMap((block, bi) => [
        bi > 0 ? h("div", { class: "or-sep" }, h("b", {}, "OR")) : null,
        h("table", { class: "find" }, h("thead", {}, h("tr", {}, ["Category", "Property", "Condition", "Value", "", ""].map((x) => h("th", {}, x)))),
          h("tbody", {}, block.map((c) => row(c, block, bi)))),
        h("button", { onclick: () => { block.push(newCondition()); storeBlocks(ss, blocks); go(); } }, "+ " + t("صف (AND)", "Row (AND)")),
        blocks.length > 1 ? h("button", { onclick: () => { blocks.splice(bi, 1); storeBlocks(ss, blocks); go(); } }, t("حذف هذه المجموعة", "Remove this block")) : null,
      ]),
      blocks ? h("div", {}, h("button", { onclick: () => { const nb = blocks.length ? blocks : []; nb.push([newCondition()]); storeBlocks(ss, nb); go(); } }, "+ " + (blocks.length ? t("مجموعة OR جديدة", "New OR block") : t("شرط", "Condition")))) : null,
      h("p", { class: "Info" }, `${t("صالحة نحوياً", "Syntax OK")}: ${ss.status.syntacticallyValid ? "✓" : "✗"} · ${t("قابلة للتمثيل في XML", "Representable")}: ${ss.status.representable ? "✓" : "✗"} · ${t("مُتحقَّق منها على النموذج", "Model verified")}: ✗ (${t("تحتاج الإضافة داخل Navisworks", "needs the add-in inside Navisworks")})`));
  }
  root.append(h("h2", {}, t("مجموعات البحث", "Search sets")), h("div", { class: "row", style: { alignItems: "flex-start" } }, list, editor));
}
