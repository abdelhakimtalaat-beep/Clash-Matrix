// Clash test code convention, e.g. "A4-AH":
//   1st char  A  = LOD code        (A = LOD200, B = LOD300, C = LOD350, D = LOD400)
//   2nd char  4  = sub priority
//   3rd char  -  = separator
//   4th char  A  = responsibility  (who must fix the clash: A-Architecture ...)
//   last char H  = clash type      (H = Hard, C = Clearance, D = Duplicates)
export const RESPONSIBILITY = [
  ["A", "A-Architecture"], ["C", "C-Infrastructure"], ["E", "E-Electrical"], ["F", "F-Fire Protection"], ["H", "H-HVAC"], ["I", "I-Interior Design"],
  ["L", "L-Landscape"], ["P", "P-Plumbing"], ["R", "R-Roads"], ["S", "S-Structure"], ["T", "T-Telecommunication"],
];
export const codeText = (t) => String(t.sourceCode || t.name || "").trim();
export const subPriorityOf = (code) => { const c = String(code ?? "").trim()[1]; return c && /\d/.test(c) ? c : null; };
/** Responsibility from the 4th character of the code (e.g. "A4-AH" -> A-Architecture), or null. */
export function responsibilityOf(code) {
  const c = String(code ?? "").trim()[3]?.toUpperCase();
  return RESPONSIBILITY.find(([l]) => l === c)?.[1] ?? null;
}

/** Discipline filter groups on the Matrix page. A system belongs to a group by the FIRST letter of its name (e.g. "A-Openings" -> A -> Architecture). */
export const DISCIPLINE_GROUPS = [
  { id: "Architecture", letters: ["A"] }, { id: "Interior Design", letters: ["I"] }, { id: "Structure", letters: ["S"] },
  { id: "MEP", letters: ["H", "E", "F", "P", "T"] }, { id: "Landscape", letters: ["L"] }, { id: "Infrastructure", letters: ["C"] }, { id: "Roads", letters: ["R"] },
];
export const groupOfCode = (code) => { const c = String(code ?? "").trim()[3]?.toUpperCase(); return DISCIPLINE_GROUPS.find((g) => g.letters.includes(c))?.id ?? null; };
export const discFilter = (cfg) => cfg.discFilter ?? [];
/** Exception: any system whose name contains "Utilities" or "External" belongs to Infrastructure, whatever its first letter. */
export const INFRA_KEYWORDS = /utilities|external/i;
export const groupOfSystemLabel = (label) => { if (INFRA_KEYWORDS.test(String(label ?? ""))) return "Infrastructure"; const c = String(label ?? "").trim()[0]?.toUpperCase(); return DISCIPLINE_GROUPS.find((g) => g.letters.includes(c))?.id ?? null; };
