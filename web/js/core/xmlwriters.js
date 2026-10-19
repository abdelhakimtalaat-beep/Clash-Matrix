// Writes SearchSets.xml and ClashTests.xml from the project config, driven ONLY by the dialect.
// Nothing here is guaranteed to match Navisworks until the dialect is verified against genuine exports.
import { x, xmlDocument } from "./xml.js";
import { convert, UNIT_SHORT } from "./units.js";
import { representability } from "./validate.js";

const SCHEMA_NS = "http://www.w3.org/2001/XMLSchema-instance";

function conditionNode(c, dialect) {
  const op = dialect.operators[c.operator];
  const negated = c.exclude || c.operator === "NotEquals" || c.operator === "NotContains" || c.operator === "Undefined";
  const flags = op.flags + (negated ? op.negateFlag : 0);
  let v = c.value;
  if (c.operator === "BeginsWith") v = `${c.value}*`;
  if (c.operator === "EndsWith") v = `*${c.value}`;
  return x("condition", { test: op.test, flags: String(flags) },
    x("category", {}, x("name", {}, c.categoryInternal || c.category)),
    x("property", {}, x("name", {}, c.propertyInternal || c.property)),
    op.valueType === "none" ? null : x("value", {}, x("data", { type: op.valueType }, String(v))));
}

export function searchSetNode(ss, dialect) {
  const conds = ss.root.conditions.map((c) => conditionNode(c, dialect));
  return x("selectionset", { name: ss.name }, x("findspec", { mode: ss.root.mode === "Any" ? "any" : "all", disjoint: "0" }, x("conditions", {}, conds), x("locator", {}, "/")));
}

export function writeSearchSetsXml(cfg, dialect) {
  const skipped = [];
  const nodes = [];
  for (const ss of cfg.searchSets) {
    if (representability(ss, dialect).length) { skipped.push({ id: ss.id, name: ss.name }); continue; }
    nodes.push(searchSetNode(ss, dialect));
  }
  const root = x("exchange", { "xmlns:xsi": SCHEMA_NS, "xsi:noNamespaceSchemaLocation": dialect.exchangeSchemaLocation, units: dialect.unitNames[dialect.xmlLengthUnit] },
    x("selectionsets", {}, nodes));
  return { xml: xmlDocument(root), skipped };
}

export function toleranceInXml(t, dialect) {
  const r = convert(t.value, t.unit, dialect.xmlLengthUnit);
  return r.error ? { error: r.error } : { text: r.value };
}

export function writeClashTestsXml(cfg, dialect) {
  const skipped = [];
  const ssById = new Map(cfg.searchSets.map((s) => [s.id, s]));
  const nodes = [];
  for (const t of cfg.clashTests) {
    const a = ssById.get(t.searchSetAId), b = ssById.get(t.searchSetBId);
    if (t.enabled === false) { skipped.push({ id: t.id, name: t.name, reason: "disabled" }); continue; }
    if (!a || !b || !a.status.representable || !b.status.representable) { skipped.push({ id: t.id, name: t.name, reason: "search set not exportable" }); continue; }
    const type = dialect.testTypes[t.testType];
    const tol = toleranceInXml(t.resolvedTolerance, dialect);
    if (!type || tol.error) { skipped.push({ id: t.id, name: t.name, reason: tol.error ?? "unknown test type" }); continue; }
    const loc = (n) => dialect.selectionLocatorTemplate.replace("{name}", n);
    nodes.push(x("clashtest", { name: t.name, test_type: type, status: "new", tolerance: tol.text, merge_composites: t.options.mergeComposites ? "1" : "0" },
      x("linkage", { mode: "none" }),
      x("left", {}, x("clashselection", { selfintersect: t.options.selfIntersectA ? "1" : "0", primtypes: String(dialect.clashSelectionPrimTypes) }, x("locator", {}, loc(a.name)))),
      x("right", {}, x("clashselection", { selfintersect: t.options.selfIntersectB ? "1" : "0", primtypes: String(dialect.clashSelectionPrimTypes) }, x("locator", {}, loc(b.name)))),
      x("rules", {})));
  }
  const root = x("exchange", { "xmlns:xsi": SCHEMA_NS, "xsi:noNamespaceSchemaLocation": dialect.exchangeSchemaLocation, units: dialect.unitNames[dialect.xmlLengthUnit] },
    x("batchtest", { name: dialect.batchName, internal_name: dialect.batchName }, x("clashtests", {}, nodes)));
  return { xml: xmlDocument(root), skipped };
}

export { UNIT_SHORT };
