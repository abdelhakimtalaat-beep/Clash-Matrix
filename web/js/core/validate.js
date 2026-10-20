// Validation. Three search-set levels: syntactically valid -> representable in the dialect -> model verified (add-in only).
import { key } from "./naming.js";
import { validateName } from "./naming.js";
import { interpret, disciplineConflict, resolveAllTolerances } from "./generate.js";
import { parseDecimal, isNegative } from "./units.js";
import { toDnf } from "./dnf.js";
import { resolvePriority, PRIORITIES } from "./lod.js";

const walkConds = (g, f) => { g.conditions.forEach(f); g.groups.forEach((s) => walkConds(s, f)); };

/** Returns the reasons a search set cannot be written in the dialect (empty = representable). */
export function representability(ss, dialect) {
  const why = [];
  const dnf = toDnf(ss.root);
  if (dnf.error) why.push(dnf.error);
  else if (dnf.terms.length > 1 && !dialect.supportsOrOfAndGroups) why.push("OR groups are not confirmed by the dialect");
  walkConds(ss.root, (c) => {
    const at = `${c.category}/${c.property}`;
    if (c.exclude) why.push(`"exclude" on ${at} is not supported (use the "not equals" operator)`);
    if (c.operator === "Other") { if (!c.rawTest) why.push(`unknown operator on ${at}`); }
    else if (!dialect.operators[c.operator]) why.push(`operator ${c.operator} on ${at} was never seen in a genuine export`);
  });
  return why;
}

export function syntaxIssues(ss) {
  const out = [];
  let n = 0;
  walkConds(ss.root, (c) => {
    n++;
    if (!c.category?.trim() || !c.property?.trim()) out.push("a condition has no category or property");
    const needsValue = !["Defined", "Undefined"].includes(c.operator) && c.valueKind !== "none";
    if (needsValue && String(c.value ?? "").trim() === "") out.push(`condition ${c.category}/${c.property} has an empty value`);
    if (["GreaterThan", "GreaterOrEqual", "LessThan", "LessOrEqual"].includes(c.operator) && parseDecimal(c.value) === null) out.push(`condition ${c.category}/${c.property}: "${c.value}" is not a number`);
  });
  if (n === 0) out.push("the search set has no conditions");
  return out;
}

export function validateConfig(cfg, dialect) {
  resolveAllTolerances(cfg); // derived values are not stored, so always recompute before judging
  const issues = [];
  const add = (severity, code, message, subjectId = null, subjectKind = null) => issues.push({ severity, code, message, subjectId, subjectKind });
  const systems = new Map(cfg.matrix.systems.map((s) => [s.id, s]));

  // matrix import problems carried along
  for (const i of cfg.matrix.importIssues ?? []) issues.push(i);

  // interpretation issues (unmapped codes, mirror conflicts, ...)
  issues.push(...interpret(cfg).issues);

  // names
  const seenSS = new Map();
  for (const ss of cfg.searchSets) {
    { const p = validateName(ss.name, cfg.naming); if (p) add("Error", "BAD_NAME", `Search set "${ss.name}": ${p}`, ss.id, "searchSet"); }
    const k = key(ss.name);
    if (seenSS.has(k)) add("Error", "DUPLICATE_SEARCHSET_NAME", `Two search sets are named "${ss.name}".`, ss.id, "searchSet");
    seenSS.set(k, ss.id);
    const syn = syntaxIssues(ss);
    for (const s of syn) add("Error", "SEARCHSET_SYNTAX", `Search set "${ss.name}": ${s}.`, ss.id, "searchSet");
    const rep = representability(ss, dialect);
    for (const r of rep) add("Warning", "NOT_REPRESENTABLE", `Search set "${ss.name}": ${r}. It will be skipped in the XML.`, ss.id, "searchSet");
    let placeholder = false;
    walkConds(ss.root, (c) => { if (c.isPlaceholder) placeholder = true; });
    if (placeholder) add("Warning", "PLACEHOLDER_CONDITION", `Search set "${ss.name}" still uses the automatic guess built from the system label. Replace it with the real model property.`, ss.id, "searchSet");
    if (!ss.folder) add("Warning", "NO_FOLDER", `Search set "${ss.name}" has no folder. Genuine Navisworks tests refer to sets as folder/name, so set a folder (e.g. the discipline).`, ss.id, "searchSet");
    let noInternal = false;
    walkConds(ss.root, (c) => { if (!c.isPlaceholder && (!c.categoryInternal || !c.propertyInternal)) noInternal = true; });
    if (noInternal) add("Warning", "NO_INTERNAL_NAMES", `Search set "${ss.name}": some conditions have no Navisworks internal name; the display name is written instead and may not match. Import a Navisworks XML to learn internal names.`, ss.id, "searchSet");
    ss.status = { ...ss.status, syntacticallyValid: syn.length === 0, representable: syn.length === 0 && rep.length === 0 };
  }

  // tests
  const seenT = new Map();
  for (const t of cfg.clashTests) {
    { const p = validateName(t.name, cfg.naming); if (p) add("Error", "BAD_NAME", `Test "${t.name}": ${p}`, t.id, "test"); }
    const k = key(t.name);
    if (seenT.has(k)) add("Error", "DUPLICATE_TEST_NAME", `Two tests are named "${t.name}".`, t.id, "test");
    seenT.set(k, t.id);
    const a = cfg.searchSets.find((s) => s.id === t.searchSetAId), b = cfg.searchSets.find((s) => s.id === t.searchSetBId);
    if (!a || !b) add("Error", "TEST_WITHOUT_SEARCHSET", `Test "${t.name}" refers to a search set that does not exist.`, t.id, "test");
    else {
      if (a.id === b.id) add("Warning", "SELF_CLASH", `Test "${t.name}" compares a search set with itself.`, t.id, "test");
      if (!a.status.representable || !b.status.representable) add("Warning", "TEST_SELECTION_NOT_EXPORTABLE", `Test "${t.name}" uses a search set that cannot be written in the XML; the test will be skipped.`, t.id, "test");
    }
    if (!dialect.testTypes[t.testType]) add("Error", "TEST_TYPE_UNKNOWN", `Test "${t.name}": test type ${t.testType} is not in the dialect.`, t.id, "test");
    if (dialect.testTypes[t.testType] && !(dialect.verifiedTestTypes ?? []).includes(t.testType)) add("Warning", "TEST_TYPE_UNCONFIRMED", `Test "${t.name}": test type ${t.testType} was never seen in a genuine export; its XML value is a guess.`, t.id, "test");
    const tol = t.resolvedTolerance;
    if (!tol) add("Error", "NO_TOLERANCE", `Test "${t.name}" has no tolerance.`, t.id, "test");
    else {
      if (parseDecimal(tol.value) === null) add("Error", "TOLERANCE_NOT_NUMBER", `Test "${t.name}": tolerance "${tol.value}" is not a number.`, t.id, "test");
      else if (isNegative(tol.value) && t.testType !== "Hard" && t.testType !== "HardConservative") add("Error", "NEGATIVE_TOLERANCE", `Test "${t.name}": negative tolerance only makes sense for hard clash tests.`, t.id, "test");
      if (t.testType === "Clearance" && parseDecimal(tol.value)?.n === 0n) add("Warning", "ZERO_CLEARANCE", `Test "${t.name}" is a clearance test with zero tolerance.`, t.id, "test");
    }
    if (disciplineConflict(cfg, t)) add("Info", "DISCIPLINE_TOLERANCE_CONFLICT", `Test "${t.name}": the two disciplines have different default tolerances; the first (${t.toleranceSource}) was used.`, t.id, "test");
    const dsys = [systems.get(t.systemAId), systems.get(t.systemBId)];
    if (dsys.some((s) => !s)) add("Error", "TEST_SYSTEM_MISSING", `Test "${t.name}" refers to a system that no longer exists.`, t.id, "test");
  }

  // search sets nobody uses
  const used = new Set(cfg.clashTests.flatMap((t) => [t.searchSetAId, t.searchSetBId]));
  for (const ss of cfg.searchSets) if (!used.has(ss.id)) add("Info", "UNUSED_SEARCHSET", `Search set "${ss.name}" is not used by any test.`, ss.id, "searchSet");

  const noPrio = new Set(cfg.clashTests.filter((t) => t.enabled !== false).map((t) => resolvePriority(cfg, t).priority).filter((p) => p && (dialect.priorityValues?.[p] ?? null) === null));
  if (noPrio.size) add("Warning", "PRIORITY_ENCODING_UNKNOWN", `Priority ${[...noPrio].join(", ")} is set in the tool, but its numeric value in the XML is not known (the genuine export only has priority="0"), so the XML writes ${dialect.priorityDefault ?? 0}. Enter the values on the Tests page once you know them.`);
  const noRule = cfg.clashTests.filter((t) => !resolvePriority(cfg, t).priority).length;
  if (noRule) add("Info", "TEST_WITHOUT_PRIORITY", `${noRule} test(s) have no priority: their code does not start with a letter that has a LOD rule.`);
  void PRIORITIES;
  if (!dialect.verified) add("Warning", "DIALECT_UNVERIFIED", dialect.verificationNote || "The XML dialect has not been verified against genuine Navisworks exports.");
  for (const t of cfg.clashTests) t.status = issues.some((i) => i.subjectId === t.id && i.severity === "Error") ? "Invalid" : "Valid";
  return issues;
}

export const hasErrors = (issues) => issues.some((i) => i.severity === "Error");

/** What the XML carries versus what needs the add-in or manual setup. */
export function compatibilityReport(cfg, dialect) {
  const rows = [];
  const used = (name, pred) => cfg.clashTests.some(pred) ? name : null;
  const checks = [
    ["enabled", cfg.clashTests.some((t) => t.enabled === false)],
    ["description", cfg.clashTests.some((t) => t.options.description)],
    ["group", cfg.clashTests.some((t) => t.options.group)],
  ];
  void used;
  for (const [setting, inUse] of checks) {
    const support = dialect.settings[setting] ?? "Unknown";
    if (inUse && support !== "Xml") rows.push({ setting, support, message: `"${setting}" is used by some tests but is ${support === "NativeOnly" ? "not carried by the XML (use the add-in or set it manually)" : "unknown to the dialect"}.` });
  }
  return rows;
}
