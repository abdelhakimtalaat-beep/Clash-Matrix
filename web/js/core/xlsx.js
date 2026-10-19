// Reads .xlsx (OOXML) with no dependencies: cell values, formulas, merged cells and solid fill colours.
import { readZip, bytesToText } from "./zip.js";
import { parseXml, kid, kids } from "./xml.js";
import { normalizeLabel, key } from "./naming.js";

const colToNum = (s) => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
export const numToCol = (n) => { let s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const parseAddr = (a) => { const m = /^([A-Z]+)(\d+)$/.exec(a); return m ? { c: colToNum(m[1]), r: Number(m[2]) } : null; };

// Excel's first 16 indexed colours. Others are reported as unresolved rather than guessed.
const INDEXED = ["000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF",
  "000000", "FFFFFF", "FF0000", "00FF00", "0000FF", "FFFF00", "FF00FF", "00FFFF"];

function applyTint(hex, tint) {
  const r = parseInt(hex.slice(0, 2), 16) / 255, g = parseInt(hex.slice(2, 4), 16) / 255, b = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const f = (p, q, t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  let R = l, G = l, B = l;
  if (s) { const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; R = f(p, q, h + 1 / 3); G = f(p, q, h); B = f(p, q, h - 1 / 3); }
  return [R, G, B].map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

function textOf(el) {
  // concatenates <t> runs, ignoring phonetic <rPh>
  if (!el) return "";
  if (el.name === "t") return el.text;
  return el.children.filter((c) => c.name !== "rPh").map(textOf).join("");
}

export async function loadWorkbook(buffer) {
  const files = await readZip(buffer);
  const get = (p) => (files.has(p) ? bytesToText(files.get(p)) : null);
  const wbXml = get("xl/workbook.xml");
  if (!wbXml) throw new Error("This file is not an Excel workbook (.xlsx).");
  const wb = parseXml(wbXml);
  const rels = parseXml(get("xl/_rels/workbook.xml.rels"));
  const relTarget = new Map(kids(rels, "Relationship").map((r) => [r.attrs.Id, r.attrs.Target]));

  const shared = [];
  const sst = get("xl/sharedStrings.xml");
  if (sst) for (const si of kids(parseXml(sst), "si")) shared.push(textOf(si));

  // theme colours in Excel's index order: lt1, dk1, lt2, dk2, accent1..6
  let theme = [];
  const thXml = get("xl/theme/theme1.xml");
  if (thXml) {
    const scheme = (function find(e) { if (e.name === "clrScheme") return e; for (const c of e.children) { const f = find(c); if (f) return f; } })(parseXml(thXml));
    const cols = (scheme?.children ?? []).map((c) => { const v = c.children[0]; return (v?.attrs.val && v.name === "srgbClr" ? v.attrs.val : v?.attrs.lastClr) ?? null; });
    theme = [cols[1], cols[0], cols[3], cols[2], ...cols.slice(4)];
  }

  const fills = [], xfFill = [];
  const stXml = get("xl/styles.xml");
  const unresolved = new Set();
  if (stXml) {
    const st = parseXml(stXml);
    for (const f of kids(kid(st, "fills"), "fill")) {
      const p = kid(f, "patternFill");
      if (!p || p.attrs.patternType !== "solid") { fills.push(null); continue; }
      const fg = kid(p, "fgColor");
      let hex = null;
      if (fg?.attrs.rgb) hex = fg.attrs.rgb.slice(-6).toUpperCase(); // alpha ignored, as Excel does
      else if (fg?.attrs.theme !== undefined) hex = theme[Number(fg.attrs.theme)] ?? null;
      else if (fg?.attrs.indexed !== undefined) hex = INDEXED[Number(fg.attrs.indexed)] ?? null;
      if (hex && fg.attrs.tint) hex = applyTint(hex, Number(fg.attrs.tint));
      if (!hex && fg) unresolved.add(JSON.stringify(fg.attrs));
      fills.push(hex ? "#" + hex : null);
    }
    for (const xf of kids(kid(st, "cellXfs"), "xf")) xfFill.push(fills[Number(xf.attrs.fillId ?? 0)] ?? null);
  }

  const sheets = kids(kid(wb, "sheets"), "sheet").map((s) => {
    const target = relTarget.get(s.attrs.id) ?? "";
    return { name: s.attrs.name, path: target.startsWith("/") ? target.slice(1) : "xl/" + target };
  });

  function sheet(name) {
    const info = sheets.find((s) => s.name === name) ?? sheets[0];
    const root = parseXml(get(info.path));
    const cells = new Map();
    let maxRow = 0, maxCol = 0;
    for (const row of kids(kid(root, "sheetData"), "row")) {
      for (const c of kids(row, "c")) {
        const a = parseAddr(c.attrs.r);
        if (!a) continue;
        const t = c.attrs.t;
        const v = kid(c, "v"), f = kid(c, "f");
        let value = "";
        if (t === "s") value = shared[Number(v?.text)] ?? "";
        else if (t === "inlineStr") value = textOf(kid(c, "is"));
        else if (t === "b") value = v?.text === "1" ? "TRUE" : "FALSE";
        else value = v?.text ?? "";
        const fill = xfFill[Number(c.attrs.s ?? 0)] ?? null;
        const cell = { r: a.r, c: a.c, address: c.attrs.r, value, formula: f ? (f.text || "(shared formula)") : null, fill };
        if (cell.formula && (v === undefined || v.text === "")) {
          const lit = /^"(.*)"$/.exec(cell.formula.replace(/^=/, ""));
          if (lit) cell.value = lit[1]; // trivial literal formula: ="C"
          else cell.unevaluated = true; // no cached result in the file
        }
        if (value !== "" || cell.formula || fill) { cells.set(`${a.r},${a.c}`, cell); maxRow = Math.max(maxRow, a.r); maxCol = Math.max(maxCol, a.c); }
      }
    }
    const merges = new Map(); // "r,c" -> anchor "r,c"
    for (const m of kids(kid(root, "mergeCells"), "mergeCell")) {
      const [p, q] = m.attrs.ref.split(":");
      const A = parseAddr(p), B = parseAddr(q ?? p);
      for (let r = A.r; r <= B.r; r++) for (let c = A.c; c <= B.c; c++) merges.set(`${r},${c}`, `${A.r},${A.c}`);
      maxRow = Math.max(maxRow, B.r); maxCol = Math.max(maxCol, B.c);
    }
    return { name: info.name, cells, merges, maxRow, maxCol };
  }

  return { sheetNames: sheets.map((s) => s.name), sheet, unresolvedColors: [...unresolved] };
}

// ---------------------------------------------------------------------------------------------
// Layout detection and matrix import

const isLabel = (s) => s.length > 0 && Number.isNaN(Number(s.replace(",", ".")));

function textAt(sh, r, c) {
  const anchor = sh.merges.get(`${r},${c}`);
  const cell = sh.cells.get(anchor ?? `${r},${c}`);
  return normalizeLabel(cell?.value ?? "");
}
const isAnchor = (sh, r, c) => { const a = sh.merges.get(`${r},${c}`); return !a || a === `${r},${c}`; };

export function detectLayout(sh) {
  const R = sh.maxRow, C = sh.maxCol;
  let header = 1, best = -1;
  for (let r = 1; r <= Math.min(R, 31); r++) {
    let n = 0;
    for (let c = 1; c <= C; c++) if (isAnchor(sh, r, c) && isLabel(textAt(sh, r, c))) n++;
    if (n > best) { best = n; header = r; }
  }
  let label = 1, bestL = -1;
  for (let c = 1; c <= C; c++) {
    let n = 0;
    for (let r = header + 1; r <= R; r++) if (isAnchor(sh, r, c) && isLabel(textAt(sh, r, c))) n++;
    if (n > bestL) { bestL = n; label = c; }
  }
  let firstCol = label + 1;
  while (firstCol <= C && !textAt(sh, header, firstCol)) firstCol++;
  let lastCol = C;
  while (lastCol > firstCol && !textAt(sh, header, lastCol)) lastCol--;
  const firstRow = header + 1;
  let lastRow = firstRow - 1, gap = 0;
  for (let r = firstRow; r <= R; r++) {
    if (textAt(sh, r, label)) { lastRow = r; gap = 0; } else if (++gap >= 2) break;
  }
  let discRow = null;
  if (header > 1) for (let c = firstCol; c <= lastCol; c++) if (textAt(sh, header - 1, c) && sh.merges.has(`${header - 1},${c}`)) { discRow = header - 1; break; }
  let discCol = null;
  if (label > 1) for (let r = firstRow; r <= lastRow; r++) if (textAt(sh, r, label - 1)) { discCol = label - 1; break; }
  return { headerRow: header, labelColumn: label, firstDataColumn: firstCol, lastDataColumn: lastCol, firstDataRow: firstRow, lastDataRow: lastRow, disciplineHeaderRow: discRow, disciplineColumn: discCol };
}

/**
 * Builds the matrix model. Systems that appear both as a row and a column are matched by label + discipline;
 * duplicates inside the same discipline stay separate (matched in order) and are reported.
 */
export function importMatrix(sh, layout, { defaultDiscipline = "", sourceFileName = "" } = {}) {
  const m = { sourceFileName, sheetName: sh.name, systems: [], rowSystemIds: [], columnSystemIds: [], cells: [], importIssues: [] };
  const issue = (severity, code, message, address) => m.importIssues.push({ severity, code, message, address });
  const byKey = new Map(), rowSeen = new Map();
  let order = 0;
  const sysKey = (l, d) => key(l) + "|" + key(d);
  const newSys = (label, discipline) => { const id = `sys-${m.systems.length + 1}`; m.systems.push({ id, label, discipline, order: order++ }); return id; };
  const reg = (label, disc, id) => { const k = sysKey(label, disc); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(id); };
  const disc = (t) => (t ? t : defaultDiscipline);

  for (let c = layout.firstDataColumn; c <= layout.lastDataColumn; c++) {
    const label = textAt(sh, layout.headerRow, c);
    if (!label) { issue("Warning", "EMPTY_COLUMN_HEADER", `Column ${numToCol(c)} has no header and was skipped.`, `${sh.name}!${numToCol(c)}${layout.headerRow}`); m.columnSystemIds.push(""); continue; }
    const d = disc(layout.disciplineHeaderRow ? textAt(sh, layout.disciplineHeaderRow, c) : "");
    const id = newSys(label, d); reg(label, d, id); m.columnSystemIds.push(id);
  }
  for (let r = layout.firstDataRow; r <= layout.lastDataRow; r++) {
    const label = textAt(sh, r, layout.labelColumn);
    if (!label) { m.rowSystemIds.push(""); continue; }
    const d = disc(layout.disciplineColumn ? textAt(sh, r, layout.disciplineColumn) : "");
    const k = sysKey(label, d), idx = rowSeen.get(k) ?? 0;
    rowSeen.set(k, idx + 1);
    let id;
    if (byKey.get(k)?.length > idx) id = byKey.get(k)[idx];
    else { id = newSys(label, d); reg(label, d, id); }
    m.rowSystemIds.push(id);
  }
  for (const [, ids] of byKey) if (ids.length > 1) {
    const s = m.systems.find((x) => x.id === ids[0]);
    issue("Warning", "DUPLICATE_SYSTEM_NAME", `System "${s.label}" (${s.discipline || "no discipline"}) occurs ${ids.length} times in the same discipline. They were kept separate; rename them to tell them apart.`);
  }
  const labelDisc = new Map();
  for (const s of m.systems) { const k = key(s.label); if (!labelDisc.has(k)) labelDisc.set(k, new Set()); labelDisc.get(k).add(key(s.discipline)); }
  for (const [k, set] of labelDisc) if (set.size > 1) issue("Info", "SHARED_LABEL_ACROSS_DISCIPLINES", `The label "${m.systems.find((s) => key(s.label) === k).label}" is used in more than one discipline.`);

  for (let ri = 0; ri < m.rowSystemIds.length; ri++) for (let ci = 0; ci < m.columnSystemIds.length; ci++) {
    const rs = m.rowSystemIds[ri], cs = m.columnSystemIds[ci];
    if (!rs || !cs) continue;
    const r = layout.firstDataRow + ri, c = layout.firstDataColumn + ci;
    const cell = sh.cells.get(sh.merges.get(`${r},${c}`) ?? `${r},${c}`);
    if (!cell) continue;
    const value = normalizeLabel(cell.value);
    if (!value && !cell.fill) continue;
    if (cell.unevaluated) issue("Warning", "FORMULA_NOT_EVALUATED", `${cell.address}: the file has no stored result for formula "${cell.formula}". Set its code in the matrix viewer.`, `${sh.name}!${cell.address}`);
    m.cells.push({ rowSystemId: rs, columnSystemId: cs, rawValue: value, formula: cell.formula, colorHex: cell.fill, sourceAddress: `${sh.name}!${cell.address}` });
  }
  const rows = new Set(m.rowSystemIds.filter(Boolean)), cols = new Set(m.columnSystemIds.filter(Boolean));
  if (rows.size !== cols.size || [...rows].some((x) => !cols.has(x)))
    issue("Info", "ROWS_COLUMNS_DIFFER", `Rows and columns list different systems (${rows.size} rows, ${cols.size} columns).`);

  // One suggestion per distinct code. Deliberately undecided: a person must pick a profile or "no test".
  const seen = new Map();
  for (const c of m.cells) if (c.rawValue) {
    const k = key(c.rawValue);
    if (!seen.has(k)) seen.set(k, { code: c.rawValue, colors: new Map(), n: 0 });
    const e = seen.get(k); e.n++;
    if (c.colorHex) e.colors.set(c.colorHex, (e.colors.get(c.colorHex) ?? 0) + 1);
  }
  const suggested = [...seen.values()].sort((a, b) => a.code.localeCompare(b.code)).map((e) => ({
    id: "map-" + key(e.code), code: e.code,
    colorHex: [...e.colors.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
    generateTest: true, profileId: null, note: `Seen in ${e.n} cell(s).`,
  }));
  return { matrix: m, suggestedMappings: suggested };
}
