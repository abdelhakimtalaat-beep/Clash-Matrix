// Draws the clash matrix onto a canvas (no editing controls) for use in a BIM Execution Plan.
import { key } from "./naming.js";
import { lodRules } from "./lod.js";

const FONT = "system-ui, 'Segoe UI', Arial, sans-serif";

/** @param {{legend?:boolean, hideEmpty?:boolean, scale?:number, title?:string}} o */
export function drawMatrixCanvas(cfg, doc, o = {}) {
  const { legend = true, hideEmpty = false, scale = 2, title = "" } = o;
  const m = cfg.matrix, sys = new Map(m.systems.map((s) => [s.id, s]));
  const cellMap = new Map(m.cells.map((c) => [c.rowSystemId + "|" + c.columnSystemId, c]));
  const map = (code) => cfg.codeMappings.find((x) => key(x.code) === key(code));
  const colourOf = (c) => c?.colorHex ?? (c?.rawValue ? map(c.rawValue)?.colorHex : null);
  let rows = m.rowSystemIds.filter((id) => sys.has(id)), cols = m.columnSystemIds.filter((id) => sys.has(id));
  if (hideEmpty) {
    const rUsed = new Set(m.cells.filter((c) => c.rawValue).map((c) => c.rowSystemId)), cUsed = new Set(m.cells.filter((c) => c.rawValue).map((c) => c.columnSystemId));
    rows = rows.filter((r) => rUsed.has(r)); cols = cols.filter((c) => cUsed.has(c));
  }
  const cell = 40, pad = 16, titleH = title ? 34 : 0;
  const canvas = doc.createElement("canvas"), g = canvas.getContext("2d");
  g.font = `13px ${FONT}`;
  const wRows = Math.ceil(Math.max(60, ...rows.map((r) => g.measureText(sys.get(r).label).width)) + 16);
  const hCols = Math.ceil(Math.max(60, ...cols.map((c) => g.measureText(sys.get(c).label).width)) + 16);
  const used = [...new Map(m.cells.filter((c) => c.rawValue).map((c) => [key(c.rawValue), c.rawValue])).values()].sort();
  const lods = lodRules(cfg), legendRows = legend ? used.length + lods.length + 1 : 0, legendH = legend && used.length ? 30 + legendRows * 22 : 0;
  const gridW = wRows + cols.length * cell, gridH = hCols + rows.length * cell;
  const W = Math.max(pad * 2 + gridW, legend ? 360 : 0), H = pad * 2 + titleH + gridH + legendH;
  canvas.width = W * scale; canvas.height = H * scale;
  g.scale(scale, scale);
  g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
  g.textBaseline = "middle";
  const x0 = pad + wRows, y0 = pad + titleH + hCols;
  if (title) { g.fillStyle = "#000"; g.font = `bold 18px ${FONT}`; g.textAlign = "left"; g.fillText(title, pad, pad + 12); }

  g.font = `13px ${FONT}`; g.fillStyle = "#000";
  cols.forEach((c, i) => { g.save(); g.translate(x0 + i * cell + cell / 2, y0 - 8); g.rotate(-Math.PI / 2); g.textAlign = "left"; g.fillText(sys.get(c).label, 0, 0); g.restore(); });
  g.textAlign = "right";
  rows.forEach((r, j) => g.fillText(sys.get(r).label, x0 - 8, y0 + j * cell + cell / 2));

  rows.forEach((r, j) => cols.forEach((c, i) => {
    const x = cellMap.get(r + "|" + c), col = colourOf(x);
    if (col) { g.fillStyle = col; g.fillRect(x0 + i * cell, y0 + j * cell, cell, cell); }
    if (x?.rawValue) { g.fillStyle = "#000"; g.font = `12px ${FONT}`; g.textAlign = "center"; g.fillText(x.rawValue, x0 + i * cell + cell / 2, y0 + j * cell + cell / 2); }
  }));
  g.strokeStyle = "#444"; g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= cols.length; i++) { g.moveTo(x0 + i * cell + .5, y0); g.lineTo(x0 + i * cell + .5, y0 + rows.length * cell); }
  for (let j = 0; j <= rows.length; j++) { g.moveTo(x0, y0 + j * cell + .5); g.lineTo(x0 + cols.length * cell, y0 + j * cell + .5); }
  g.stroke();

  if (legend && used.length) {
    let y = y0 + rows.length * cell + 30;
    g.textAlign = "left"; g.font = `bold 13px ${FONT}`; g.fillStyle = "#000"; g.fillText("Legend", pad, y - 4);
    g.font = `12px ${FONT}`;
    for (const code of used) {
      const mp = map(code); y += 22;
      g.fillStyle = mp?.colorHex ?? "#fff"; g.fillRect(pad, y - 8, 22, 16); g.strokeStyle = "#444"; g.strokeRect(pad + .5, y - 7.5, 22, 16);
      const prof = mp ? (mp.generateTest ? cfg.profiles.find((p) => p.id === mp.profileId)?.name ?? "profile not set" : "no test") : "";
      g.fillStyle = "#000"; g.fillText(`${code}${prof ? " — " + prof : ""}`, pad + 32, y);
    }
  }
  if (legend && used.length) {
    let y = y0 + rows.length * cell + 30 + (used.length + 1) * 22 + 8;
    g.font = `bold 13px ${FONT}`; g.fillStyle = "#000"; g.textAlign = "left"; g.fillText("LOD / priority (by first letter of the test code)", pad, y);
    g.font = `12px ${FONT}`;
    for (const r of lods) { y += 22; g.fillText(`${r.letter} — ${r.label} — ${r.priority} priority`, pad, y); }
  }
  return canvas;
}
