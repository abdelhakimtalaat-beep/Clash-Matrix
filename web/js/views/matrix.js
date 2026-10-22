// Editable matrix, Excel-style: type in cells, paste blocks from Excel, add / insert / delete rows and columns, rename systems.
import { h, t, toast, download } from "../ui.js";
import { drawMatrixCanvas } from "../core/matriximage.js";
import { lodRules, letterOf, lodFilter, codeActive, filterActive, systemActive } from "../core/lod.js";
import { DISCIPLINE_GROUPS, groupOfSystemLabel, discFilter } from "../core/codes.js";
import { state, changed } from "../store.js";
import { uid } from "../core/model.js";
import { key, normalizeLabel } from "../core/naming.js";

export default function render(root, rerender) {
  const cfg = state.cfg, m = cfg.matrix;
  const rows = m.rowSystemIds, cols = m.columnSystemIds;
  let shown = 100;
  let cellMap;
  const rebuild = () => { cellMap = new Map(m.cells.map((c) => [c.rowSystemId + "|" + c.columnSystemId, c])); };
  const sysOf = (id) => m.systems.find((s) => s.id === id);
  const mappingOf = (code) => cfg.codeMappings.find((x) => key(x.code) === key(code));

  const newSystem = (label = "New system") => {
    const id = "sys-" + uid().slice(0, 8);
    m.systems.push({ id, label, discipline: m.systems.at(-1)?.discipline ?? "", order: Math.max(-1, ...m.systems.map((s) => s.order)) + 1 });
    return id;
  };
  const setCell = (rid, cid, raw) => {
    const value = normalizeLabel(raw), k = rid + "|" + cid, ex = cellMap.get(k);
    if (!value && !ex?.colorHex) { if (ex) m.cells = m.cells.filter((c) => c !== ex); }
    else if (ex) ex.rawValue = value;
    else m.cells.push({ rowSystemId: rid, columnSystemId: cid, rawValue: value, formula: null, colorHex: null, sourceAddress: "manual" });
    if (value && !mappingOf(value)) cfg.codeMappings.push({ id: "map-" + key(value), code: value, colorHex: null, generateTest: true, profileId: null, note: "Added from the matrix editor." });
    rebuild();
  };
  const tidy = (id) => { // drop a system nobody refers to any more
    if (rows.includes(id) || cols.includes(id)) return;
    m.systems = m.systems.filter((s) => s.id !== id);
  };
  const hasValues = (pred) => m.cells.some((c) => c.rawValue && pred(c));
  const delRow = (i) => {
    const id = rows[i];
    if (id && hasValues((c) => c.rowSystemId === id) && !confirm(t("هذا الصف يحتوي رموزاً. حذفه؟", "This row contains codes. Delete it?"))) return;
    rows.splice(i, 1);
    if (id && !rows.includes(id)) m.cells = m.cells.filter((c) => c.rowSystemId !== id);
    if (id) tidy(id);
    after();
  };
  const delCol = (i) => {
    const id = cols[i];
    if (id && hasValues((c) => c.columnSystemId === id) && !confirm(t("هذا العمود يحتوي رموزاً. حذفه؟", "This column contains codes. Delete it?"))) return;
    cols.splice(i, 1);
    if (id && !cols.includes(id)) m.cells = m.cells.filter((c) => c.columnSystemId !== id);
    if (id) tidy(id);
    after();
  };
  const after = () => { changed(); rebuild(); draw(); };

  const holder = h("div", { class: "mx editable" });
  const rowId = (i) => rows[i], colId = (i) => cols[i];

  const headerInputs = (id, onDelete, onBefore, onAfter, vertical) => {
    const s = sysOf(id);
    if (!s) return h("div", {}, h("span", { class: "Info" }, "—"), h("button", { onclick: onDelete }, "×"));
    return h("div", { class: "hdr" },
      h("input", { class: "hl", value: s.label, title: t("اسم النظام", "System name"), onchange: (e) => { s.label = normalizeLabel(e.target.value) || s.label; changed(); draw(); } }),
      h("input", { class: "hd", value: s.discipline ?? "", placeholder: t("التخصص", "discipline"), title: t("التخصص", "Discipline"), onchange: (e) => { s.discipline = normalizeLabel(e.target.value); changed(); } }),
      h("span", { class: "tools" },
        h("button", { title: vertical ? t("إدراج فوق", "Insert above") : t("إدراج قبل", "Insert before"), onclick: onBefore }, vertical ? "↑+" : "←+"),
        h("button", { title: vertical ? t("إدراج تحت", "Insert below") : t("إدراج بعد", "Insert after"), onclick: onAfter }, vertical ? "↓+" : "+→"),
        h("button", { title: t("حذف", "Delete"), onclick: onDelete }, "×")));
  };

  function focusCell(r, c) { const el = holder.querySelector(`input[data-r="${r}"][data-c="${c}"]`); if (el) { el.focus(); el.select(); } }
  function paste(e, r0, c0) {
    const text = e.clipboardData?.getData("text") ?? "";
    if (!/[\t\n]/.test(text.replace(/\r?\n$/, ""))) return; // a single value: normal paste
    e.preventDefault();
    const grid = text.replace(/\r?\n$/, "").split(/\r?\n/).map((l) => l.split("\t"));
    let n = 0;
    grid.forEach((line, dr) => line.forEach((v, dc) => {
      const r = rows[r0 + dr], c = cols[c0 + dc];
      if (r && c) { setCell(r, c, v); n++; }
    }));
    toast(t(`لُصقت ${n} خلية`, `Pasted ${n} cells`)); after();
  }

  function draw() {
    const vis = (x) => !x || !x.rawValue || codeActive(cfg, x.rawValue); // cells outside the LOD filter are hidden
    const filtered = filterActive(cfg);
    const coded = (a, b) => { const x = cellMap.get(a + "|" + b) ?? cellMap.get(b + "|" + a); return !!x?.rawValue; };
    // while filtering, hide rows/columns whose codes are all outside the filter (rows/columns with no codes stay, so new ones remain editable)
    const shownRow = (rid) => (!rid || systemActive(cfg, sysOf(rid)?.label)) && (!filtered || !rid || !cols.some((cid) => cellMap.get(rid + "|" + cid)?.rawValue) || cols.some((cid) => { const x = cellMap.get(rid + "|" + cid); return x?.rawValue && vis(x); }));
    const shownCol = (cid) => (!cid || systemActive(cfg, sysOf(cid)?.label)) && (!filtered || !cid || !rows.some((rid) => cellMap.get(rid + "|" + cid)?.rawValue) || rows.some((rid) => { const x = cellMap.get(rid + "|" + cid); return x?.rawValue && vis(x); }));
    void coded;
    holder.replaceChildren(h("table", {},
      h("tr", {}, h("th", { class: "sticky" }, ""), cols.map((cid, ci) => !shownCol(cid) ? null : h("th", {}, headerInputs(cid, () => delCol(ci), () => { cols.splice(ci, 0, newSystem()); after(); }, () => { cols.splice(ci + 1, 0, newSystem()); after(); }, false)))),
      rows.slice(0, shown).map((rid, ri) => !shownRow(rid) ? null : h("tr", {},
        h("th", { class: "sticky" }, headerInputs(rid, () => delRow(ri), () => { rows.splice(ri, 0, newSystem()); after(); }, () => { rows.splice(ri + 1, 0, newSystem()); after(); }, true)),
        cols.map((cid, ci) => {
          if (!shownCol(cid)) return null;
          const x0 = rid && cid ? cellMap.get(rid + "|" + cid) : null, x = x0 && !vis(x0) ? null : x0;
          const colour = x?.colorHex ?? (x?.rawValue ? mappingOf(x.rawValue)?.colorHex : null);
          return h("td", { style: colour ? { background: colour } : {}, class: !rid || !cid ? "dead" : "" },
            rid && cid ? h("input", {
              class: "mcell", value: x?.rawValue ?? "", "data-r": ri, "data-c": ci, title: x?.sourceAddress ?? "",
              onchange: (e) => { setCell(rid, cid, e.target.value); changed(); const cell = cellMap.get(rid + "|" + cid); e.target.parentElement.style.background = (cell?.colorHex ?? (cell?.rawValue ? mappingOf(cell.rawValue)?.colorHex : null)) ?? ""; },
              onpaste: (e) => paste(e, ri, ci),
              onkeydown: (e) => {
                if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); focusCell(ri + 1, ci); }
                else if (e.key === "ArrowUp") { e.preventDefault(); focusCell(ri - 1, ci); }
                else if (e.key === "ArrowRight" && e.target.selectionStart === e.target.value.length) { e.preventDefault(); focusCell(ri, ci + 1); }
                else if (e.key === "ArrowLeft" && e.target.selectionStart === 0) { e.preventDefault(); focusCell(ri, ci - 1); }
              },
            }) : null);
        })))));
  }

  rebuild();
  const addBoth = () => { const id = newSystem(); rows.push(id); cols.push(id); after(); };
  let legend = true, hideEmpty = false;
  const exportPng = () => {
    const canvas = drawMatrixCanvas(cfg, document, { legend, hideEmpty, title: state.project?.name ?? cfg.name ?? "" });
    canvas.toBlob((b) => { if (b) download(`${(cfg.name || "clash-matrix").replace(/[^\w.-]+/g, "_")}-matrix.png`, b, "image/png"); else toast("PNG failed"); }, "image/png");
  };
  const bar = h("div", { class: "row" },
    h("button", { onclick: addBoth }, "+ " + t("نظام (صف وعمود)", "System (row + column)")),
    h("button", { onclick: () => { rows.push(newSystem()); after(); } }, "+ " + t("صف", "Row")),
    h("button", { onclick: () => { cols.push(newSystem()); after(); } }, "+ " + t("عمود", "Column")),
    h("button", { class: "pri", id: "export-png", onclick: exportPng }, t("تصدير كصورة PNG", "Export as PNG image")),
    h("label", {}, h("input", { type: "checkbox", checked: true, onchange: (e) => (legend = e.target.checked) }), t(" مع مفتاح الرموز", " legend")),
    h("label", {}, h("input", { type: "checkbox", onchange: (e) => (hideEmpty = e.target.checked) }), t(" إخفاء الفارغ", " hide empty rows/columns")),
    h("a", { href: "#mappings" }, t("← تعيين الرموز وتوليد الاختبارات", "→ Codes & generate tests")));
  const lod = lodRules(cfg), active = lodFilter(cfg), dActive = discFilter(cfg);
  const toggleDisc = (id) => { const cur = new Set(discFilter(cfg)); cur.has(id) ? cur.delete(id) : cur.add(id); cfg.discFilter = [...cur]; changed(); rerender(); };
  const toggleLod = (L) => { const cur = new Set(lodFilter(cfg)); cur.has(L) ? cur.delete(L) : cur.add(L); cfg.lodFilter = [...cur]; changed(); rerender(); };
  const lodBoxes = h("div", {},
    h("div", { class: "lods" }, lod.map((r) => {
      const L = r.letter.toUpperCase(), on = active.includes(L);
      const tests = cfg.clashTests.filter((x) => letterOf(x) === L).length, cells = m.cells.filter((c) => (c.rawValue ?? "").trim().toUpperCase().startsWith(L)).length;
      return h("div", { class: `lod p-${r.priority}${on ? " on" : ""}${active.length && !on ? " off" : ""}`, role: "button", tabindex: 0, title: t("اضغط لعرض اختبارات هذا المستوى فقط", "Click to show only this level's tests"),
        onclick: () => toggleLod(L), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleLod(L); } } },
        h("b", {}, r.label), on ? h("span", { class: "badge good" }, "✓") : null,
        h("div", {}, t("الأكواد التي تبدأ بالحرف: ", "Codes starting with: "), h("b", {}, L)),
        h("div", {}, "Priority: ", h("b", {}, r.priority)),
        h("span", { class: "Info" }, `${cells} ${t("خلية", "cells")} · ${tests} ${t("اختبار", "tests")}`));
    })),
    h("div", { class: "lbl2" }, t("التخصص (الحرف الأول من اسم الصف/العمود)", "Discipline (first letter of the row / column name)")),
    h("div", { class: "discs" }, DISCIPLINE_GROUPS.map((g) => {
      const on = dActive.includes(g.id);
      const inG = (id) => groupOfSystemLabel(sysOf(id)?.label) === g.id;
      const systems = m.systems.filter((x) => groupOfSystemLabel(x.label) === g.id).length, cells = m.cells.filter((c) => c.rawValue && inG(c.rowSystemId) && inG(c.columnSystemId)).length;
      const tests = cfg.clashTests.filter((x) => inG(x.systemAId) && inG(x.systemBId)).length;
      return h("div", { class: `lod disc${on ? " on" : ""}${dActive.length && !on ? " off" : ""}`, role: "button", tabindex: 0, title: t("اضغط لإبقاء صفوف وأعمدة هذا التخصص فقط", "Click to keep only this discipline's rows and columns"),
        onclick: () => toggleDisc(g.id), onkeydown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDisc(g.id); } } },
        h("b", {}, g.id), on ? h("span", { class: "badge good" }, "✓") : null,
        h("div", {}, t("الحرف الأول: ", "First letter: "), h("b", {}, g.letters.join(", "))),
        h("span", { class: "Info" }, `${systems} ${t("نظام", "systems")} · ${cells} ${t("خلية", "cells")} · ${tests} ${t("اختبار", "tests")}`));
    })),
    h("div", { class: "row" }, active.length || dActive.length
      ? [h("span", { class: "badge warn" }, t(`مفلتر: ${[...active, ...dActive].join(", ")} — بقية الاختبارات لا تُولَّد ولا تُعرض ولا تُصدَّر`, `Filter: ${[...active, ...dActive].join(", ")} — other tests are not generated, shown or exported`)),
        h("button", { onclick: () => { cfg.lodFilter = []; cfg.discFilter = []; changed(); rerender(); } }, t("عرض الكل", "Show all"))]
      : h("span", { class: "Info" }, t("اضغط على مربع (LOD و/أو تخصص) لتقييد المصفوفة والتوليد. الفلاتر تعمل معاً.", "Click a box (LOD and/or discipline) to restrict the matrix and generation. Filters combine."))));
  const seg = (txt, cls, label) => h("div", { class: `seg ${cls}` }, h("div", { class: "ch" }, txt), h("div", { class: "lb" }, label));
  const convention = h("details", { class: "card conv", open: true }, h("summary", {}, h("b", {}, t("نظام تسمية كود الاختبار (Naming convention)", "Clash test code naming convention"))),
    h("div", { class: "codedemo" },
      seg("A", "c1", "LOD code"), seg("4", "c2", "Sub priority"), seg("-", "c3", ""), seg("A", "c4", "Responsibility"), seg("H", "c5", "Clash type")));
  root.append(h("h2", {}, t("المصفوفة", "Matrix")), convention, lodBoxes,
    h("p", { class: "Info" }, t("اكتب الرمز في أي خلية، أو الصق كتلة من Excel، أو أضف/أدرج/احذف صفوفاً وأعمدة. الرموز الجديدة تُضاف إلى صفحة «الرموز» لتختار لها ملفاً. بعد التعديل اضغط «توليد الاختبارات» هناك.", "Type a code in any cell, paste a block from Excel, or add / insert / delete rows and columns. New codes are added to the Codes page so you can pick a profile. After editing, press Generate tests there.")),
    bar);
  if (!rows.length && !cols.length) root.append(h("p", {}, t("لا توجد مصفوفة بعد. ابدأ بإضافة نظام أو استورد ملف Excel.", "No matrix yet. Add a system or import an Excel file.")));
  else { draw(); root.append(holder); if (rows.length > shown) root.append(h("button", { onclick: () => { shown += 200; draw(); } }, t("عرض المزيد", "Show more"))); }
}
