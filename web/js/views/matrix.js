// Editable matrix, Excel-style: type in cells, paste blocks from Excel, add / insert / delete rows and columns, rename systems.
import { h, t, toast, download } from "../ui.js";
import { drawMatrixCanvas } from "../core/matriximage.js";
import { lodRules, PRIORITIES, letterOf } from "../core/lod.js";
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
    holder.replaceChildren(h("table", {},
      h("tr", {}, h("th", { class: "sticky" }, ""), cols.map((cid, ci) => h("th", {}, headerInputs(cid, () => delCol(ci), () => { cols.splice(ci, 0, newSystem()); after(); }, () => { cols.splice(ci + 1, 0, newSystem()); after(); }, false)))),
      rows.slice(0, shown).map((rid, ri) => h("tr", {},
        h("th", { class: "sticky" }, headerInputs(rid, () => delRow(ri), () => { rows.splice(ri, 0, newSystem()); after(); }, () => { rows.splice(ri + 1, 0, newSystem()); after(); }, true)),
        cols.map((cid, ci) => {
          const x = rid && cid ? cellMap.get(rid + "|" + cid) : null;
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
  const lod = lodRules(cfg);
  const setLod = () => { cfg.lod = lod.map((r) => ({ ...r })); changed(); };
  const lodBoxes = h("div", { class: "lods" }, lod.map((r, i) => {
    const L = (r.letter ?? "").trim().toUpperCase();
    const tests = cfg.clashTests.filter((x) => letterOf(x) === L).length, cells = m.cells.filter((c) => (c.rawValue ?? "").trim().toUpperCase().startsWith(L) && L).length;
    return h("div", { class: `lod p-${r.priority}` },
      h("b", {}, r.label),
      h("div", { class: "row" }, t("أكواد تبدأ بـ ", "Codes starting with "),
        h("input", { value: r.letter, size: 1, maxlength: 1, onchange: (e) => { lod[i].letter = e.target.value.trim().toUpperCase().slice(0, 1); setLod(); rerender(); } })),
      h("div", { class: "row" }, "Priority ", h("select", { onchange: (e) => { lod[i].priority = e.target.value; setLod(); rerender(); } }, PRIORITIES.map((p) => h("option", { selected: p === r.priority }, p)))),
      h("span", { class: "Info" }, `${cells} ${t("خلية", "cells")} · ${tests} ${t("اختبار", "tests")}`));
  }));
  root.append(h("h2", {}, t("المصفوفة", "Matrix")), lodBoxes,
    h("p", { class: "Info" }, t("اكتب الرمز في أي خلية، أو الصق كتلة من Excel، أو أضف/أدرج/احذف صفوفاً وأعمدة. الرموز الجديدة تُضاف إلى صفحة «الرموز» لتختار لها ملفاً. بعد التعديل اضغط «توليد الاختبارات» هناك.", "Type a code in any cell, paste a block from Excel, or add / insert / delete rows and columns. New codes are added to the Codes page so you can pick a profile. After editing, press Generate tests there.")),
    bar);
  if (!rows.length && !cols.length) root.append(h("p", {}, t("لا توجد مصفوفة بعد. ابدأ بإضافة نظام أو استورد ملف Excel.", "No matrix yet. Add a system or import an Excel file.")));
  else { draw(); root.append(holder); if (rows.length > shown) root.append(h("button", { onclick: () => { shown += 200; draw(); } }, t("عرض المزيد", "Show more"))); }
}
