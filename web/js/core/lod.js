// LOD levels and clash-test priority, derived from the first letter of the test code (e.g. "A1-AH" -> A -> LOD200 / High).
export const PRIORITIES = ["High", "Medium", "Low"];
export const defaultLod = () => [
  { letter: "A", label: "LOD200", priority: "High" },
  { letter: "B", label: "LOD300", priority: "Medium" },
  { letter: "C", label: "LOD350", priority: "Low" },
  { letter: "D", label: "LOD400", priority: "Low" },
];
export const lodRules = (cfg) => (cfg.lod?.length ? cfg.lod : defaultLod());
export const codeOf = (t) => String(t.sourceCode || t.name || "").trim();
export const letterOf = (t) => (codeOf(t)[0] ?? "").toUpperCase();
export const lodOf = (cfg, t) => lodRules(cfg).find((r) => (r.letter ?? "").trim().toUpperCase() === letterOf(t)) ?? null;

/** @returns {{priority: string|null, lod: string|null, source: string}} manual override wins over the code rule */
export function resolvePriority(cfg, t) {
  const rule = lodOf(cfg, t);
  if (t.priorityOverride) return { priority: t.priorityOverride, lod: rule?.label ?? null, source: "manual" };
  return rule ? { priority: rule.priority, lod: rule.label, source: `code starts with ${rule.letter}` } : { priority: null, lod: null, source: "no LOD rule for this letter" };
}

/** Numeric value written to the XML `priority` attribute. The encoding of High/Medium/Low is NOT confirmed: null mapping -> default. */
export function priorityXml(cfg, t, dialect) {
  const p = resolvePriority(cfg, t).priority;
  const v = p ? dialect.priorityValues?.[p] : null;
  return String(v !== null && v !== undefined && v !== "" ? v : dialect.priorityDefault ?? 0);
}

/** Active LOD letters chosen on the Matrix page; empty = no filter (everything is active). */
export const lodFilter = (cfg) => (cfg.lodFilter ?? []).map((l) => String(l).toUpperCase());
export const codeActive = (cfg, code) => { const f = lodFilter(cfg); return !f.length || f.includes(String(code ?? "").trim()[0]?.toUpperCase() ?? ""); };
/** A test outside the active LOD filter is not generated, not listed and not exported. */
export const lodActive = (cfg, t) => codeActive(cfg, codeOf(t));
