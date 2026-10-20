// Writes SearchSets.xml and ClashTests.xml from the project config, driven by the dialect.
// The structure follows one genuine Navisworks Manage 2026 batch export; it has NOT been confirmed by importing our output.
import { x, xmlDocument } from "./xml.js";
import { convert, convertRounded, parseDecimal, UNIT_SHORT } from "./units.js";
import { representability } from "./validate.js";
import { toDnf } from "./dnf.js";
import { guidFrom } from "./guid.js";
import { priorityXml, lodActive } from "./lod.js";

const SCHEMA_NS = "http://www.w3.org/2001/XMLSchema-instance";
const fileUnit = (d) => d.unitNames[d.xmlLengthUnit];
const seed = (cfg) => cfg.projectId ?? cfg.name ?? "project";

const exchange = (dialect, ...children) =>
  x("exchange", { "xmlns:xsi": SCHEMA_NS, "xsi:noNamespaceSchemaLocation": dialect.exchangeSchemaLocation, units: fileUnit(dialect), filename: "", filepath: "" }, ...children);

function conditionNode(c, flags, dialect) {
  const op = c.operator === "Other" ? { test: c.rawTest, valueType: c.valueKind === "none" ? "none" : c.valueKind || "wstring" } : dialect.operators[c.operator];
  let v = String(c.value ?? "");
  if (op.valueType === "linear" && c.unit && c.unit !== dialect.xmlLengthUnit) { const r = convertRounded(v, c.unit, dialect.xmlLengthUnit, 6); if (!r.error) v = r.value; }
  return x("condition", { test: op.test, flags: String(flags) },
    x("category", {}, x("name", { internal: c.categoryInternal || c.category }, c.category || c.categoryInternal)),
    x("property", {}, x("name", { internal: c.propertyInternal || c.property }, c.property || c.propertyInternal)),
    // "no_prop" has no value, but the genuine file still writes an empty <value><data/></value> (3 of 3 cases)
    x("value", {}, op.valueType === "none" ? x("data", {}) : x("data", { type: op.valueType }, v)));
}

export function searchSetNode(ss, dialect, cfg) {
  const { terms } = toDnf(ss.root);
  const nodes = [];
  terms.forEach((term, ti) => term.forEach((c, ci) => {
    const base = (c.flags ?? dialect.defaultConditionFlags) & ~dialect.orFlag;
    nodes.push(conditionNode(c, base | (ti > 0 && ci === 0 ? dialect.orFlag : 0), dialect));
  }));
  return x("selectionset", { name: ss.name, guid: ss.guid || guidFrom(`${seed(cfg)}|set|${ss.folder ?? ""}|${ss.name}`) },
    x("findspec", { mode: "all", disjoint: "0" }, x("conditions", {}, nodes), x("locator", {}, "/")));
}

/** Folders may be nested ("A/B"); each level becomes a viewfolder. */
export function selectionSetsNode(sets, dialect, cfg) {
  const tree = { sets: [], kids: new Map() };
  for (const s of sets) {
    let n = tree;
    for (const part of (s.folder ?? "").split("/").filter(Boolean)) { if (!n.kids.has(part)) n.kids.set(part, { sets: [], kids: new Map() }); n = n.kids.get(part); }
    n.sets.push(s);
  }
  const build = (n, path) => [
    ...[...n.kids].map(([name, k]) => x("viewfolder", { name, guid: guidFrom(`${seed(cfg)}|folder|${[...path, name].join("/")}`) }, build(k, [...path, name]))),
    ...n.sets.map((s) => searchSetNode(s, dialect, cfg)),
  ];
  return x("selectionsets", {}, build(tree, []));
}

export function writeSearchSetsXml(cfg, dialect) {
  const skipped = [], ok = [];
  for (const ss of cfg.searchSets) (representability(ss, dialect).length ? skipped.push({ id: ss.id, name: ss.name }) : ok.push(ss));
  return { xml: xmlDocument(exchange(dialect, selectionSetsNode(ok, dialect, cfg))), skipped };
}

export function toleranceInXml(t, dialect) {
  const r = convertRounded(t.value, t.unit, dialect.xmlLengthUnit, dialect.toleranceMaxDecimals);
  return r.error ? { error: r.error } : { text: r.value, rounded: r.rounded };
}

export const locatorOf = (ss, dialect) => dialect.selectionLocatorTemplate.replace("{path}", ss.folder ? `${ss.folder}/${ss.name}` : ss.name);

export function writeClashTestsXml(cfg, dialect) {
  const skipped = [];
  const ssById = new Map(cfg.searchSets.map((s) => [s.id, s]));
  const nodes = [];
  for (const t of cfg.clashTests) {
    const a = ssById.get(t.searchSetAId), b = ssById.get(t.searchSetBId);
    if (!lodActive(cfg, t)) { skipped.push({ id: t.id, name: t.name, reason: "outside the active LOD filter" }); continue; }
    if (t.enabled === false) { skipped.push({ id: t.id, name: t.name, reason: "disabled" }); continue; }
    if (!a || !b || !a.status.representable || !b.status.representable) { skipped.push({ id: t.id, name: t.name, reason: "search set not exportable" }); continue; }
    const type = dialect.testTypes[t.testType];
    const tol = t.resolvedTolerance ? toleranceInXml(t.resolvedTolerance, dialect) : { error: "no tolerance" };
    if (!type || tol.error) { skipped.push({ id: t.id, name: t.name, reason: tol.error ?? "unknown test type" }); continue; }
    nodes.push(x("clashtest", { name: t.name, test_type: type, status: "new", tolerance: tol.text, merge_composites: t.options.mergeComposites ? "1" : "0", priority: priorityXml(cfg, t, dialect) },
      x("default_assignee", { display_name: "" }),
      x("linkage", { mode: "none" }),
      x("left", {}, x("clashselection", { selfintersect: t.options.selfIntersectA ? "1" : "0", primtypes: String(dialect.clashSelectionPrimTypes) }, x("locator", {}, locatorOf(a, dialect)))),
      x("right", {}, x("clashselection", { selfintersect: t.options.selfIntersectB ? "1" : "0", primtypes: String(dialect.clashSelectionPrimTypes) }, x("locator", {}, locatorOf(b, dialect)))),
      x("rules", {})));
  }
  // Navisworks requires "selectionsets" in the batch (confirmed by its own error message); it carries the sets the tests use.
  const usedIds = new Set(cfg.clashTests.filter((t) => !skipped.some((k) => k.id === t.id)).flatMap((t) => [t.searchSetAId, t.searchSetBId]));
  const sets = cfg.searchSets.filter((s) => usedIds.has(s.id) && s.status.representable);
  const root = exchange(dialect, x("batchtest", { name: dialect.batchName, internal_name: dialect.batchName, units: fileUnit(dialect) }, x("clashtests", {}, nodes), selectionSetsNode(sets, dialect, cfg)));
  return { xml: xmlDocument(root), skipped };
}

export { UNIT_SHORT, convert, parseDecimal };
