// Reads a genuine Navisworks "batch" XML (as exported by Clash Detective) into our model: search sets (with folders and
// conditions), tests, and a catalog of (display name -> internal name) pairs. Reading it back is also how we learn the dialect.
import { parseXml, kid, kids } from "./xml.js";
import { uid, newSearchSet } from "./model.js";
import { key, searchSetName } from "./naming.js";

const unitOf = (dialect, short) => Object.entries(dialect.unitNames).find(([, v]) => v === short)?.[0] ?? null;

function parseCondition(c, dialect, fileUnit) {
  const testToOp = Object.fromEntries(Object.entries(dialect.operators).map(([op, d]) => [d.test, op]));
  const flags = Number(c.attrs.flags ?? 0);
  const cat = kid(kid(c, "category"), "name"), prop = kid(kid(c, "property"), "name"), data = kid(kid(c, "value"), "data");
  const op = testToOp[c.attrs.test];
  return {
    id: uid(), category: cat?.text ?? "", categoryInternal: cat?.attrs.internal ?? null,
    property: prop?.text ?? "", propertyInternal: prop?.attrs.internal ?? null,
    operator: op ?? "Other", rawTest: op ? null : c.attrs.test,
    value: data?.text ?? "", valueKind: data?.attrs.type ?? "none",
    unit: data?.attrs.type === "linear" ? fileUnit : null,
    flags: flags & ~dialect.orFlag, exclude: false, isPlaceholder: false, _orStart: (flags & dialect.orFlag) !== 0,
  };
}

function parseSet(ss, folder, dialect, fileUnit) {
  const spec = kid(ss, "findspec");
  const conds = kids(kid(spec, "conditions"), "condition").map((c) => parseCondition(c, dialect, fileUnit));
  const groups = [];
  for (const c of conds) { if (!groups.length || (c._orStart && groups[groups.length - 1].length)) groups.push([]); groups[groups.length - 1].push(c); }
  for (const c of conds) delete c._orStart;
  const s = newSearchSet(ss.attrs.name);
  s.folder = folder; s.guid = ss.attrs.guid ?? null;
  if (groups.length <= 1) s.root = { mode: "All", conditions: groups[0] ?? [], groups: [] };
  else if (groups.every((g) => g.length === 1)) s.root = { mode: "Any", conditions: groups.map((g) => g[0]), groups: [] };
  else s.root = { mode: "Any", conditions: [], groups: groups.map((g) => ({ mode: "All", conditions: g, groups: [] })) };
  return s;
}

/** @returns {{units, searchSets, tests, combos, issues}} */
export function parseBatch(xmlText, dialect) {
  const root = parseXml(xmlText);
  const issues = [];
  if (root.name !== "exchange") throw new Error(`Not a Navisworks exchange file (root element is "${root.name}")`);
  const batch = kid(root, "batchtest");
  const unitShort = (batch ?? root).attrs.units ?? root.attrs.units;
  const fileUnit = unitOf(dialect, unitShort);
  if (!fileUnit) issues.push({ severity: "Warning", code: "UNKNOWN_UNITS", message: `Unit "${unitShort}" is not known; tolerances were not converted.` });
  const container = kid(batch ?? root, "selectionsets");
  const searchSets = [];
  const walk = (el, folder) => {
    for (const c of el.children) {
      if (c.name === "viewfolder") walk(c, folder ? `${folder}/${c.attrs.name}` : c.attrs.name);
      else if (c.name === "selectionset") searchSets.push(parseSet(c, folder, dialect, fileUnit));
    }
  };
  if (container) walk(container, null);
  const tests = kids(kid(batch, "clashtests"), "clashtest").map((t) => ({
    name: t.attrs.name, type: t.attrs.test_type, tolerance: t.attrs.tolerance, unit: fileUnit, priority: Number(t.attrs.priority ?? 0),
    mergeComposites: t.attrs.merge_composites !== "0",
    left: kid(kid(kid(t, "left"), "clashselection"), "locator")?.text, right: kid(kid(kid(t, "right"), "clashselection"), "locator")?.text,
  }));
  // (category display, category internal, property display, property internal) with counts
  const combos = new Map();
  for (const s of searchSets) {
    const all = [];
    const collect = (g) => { all.push(...g.conditions); g.groups.forEach(collect); };
    collect(s.root);
    for (const c of all) {
      if (!c.categoryInternal && !c.propertyInternal) continue;
      const k = [c.category, c.categoryInternal, c.property, c.propertyInternal].join("\u0001");
      combos.set(k, (combos.get(k) ?? 0) + 1);
    }
  }
  return { units: fileUnit, searchSets, tests, combos: [...combos].map(([k, n]) => { const [category, categoryInternal, property, propertyInternal] = k.split("\u0001"); return { category, categoryInternal, property, propertyInternal, n }; }).sort((a, b) => b.n - a.n), issues };
}

/** Applies parsed search sets to a project config. Existing sets with the same name keep their id (and their tests). */
export function applyBatch(cfg, dialect, parsed) {
  const res = { created: 0, updated: 0, linked: 0 };
  const byName = new Map(cfg.searchSets.map((s) => [key(s.name), s]));
  const systemByName = new Map(cfg.matrix.systems.map((sys) => [key(searchSetName(sys, cfg.naming)), sys]));
  for (const p of parsed.searchSets) {
    const existing = byName.get(key(p.name));
    const sys = systemByName.get(key(p.name));
    if (existing) { Object.assign(existing, { folder: p.folder, guid: p.guid, root: p.root, status: { ...existing.status, syntacticallyValid: false, representable: false } }); if (sys && !existing.systemId) { existing.systemId = sys.id; res.linked++; } res.updated++; }
    else { if (sys) { p.systemId = sys.id; res.linked++; } cfg.searchSets.push(p); byName.set(key(p.name), p); res.created++; }
  }
  // merge the catalog
  const have = new Map(dialect.catalog.combos?.map((c) => [[c.category, c.categoryInternal, c.property, c.propertyInternal].join("\u0001"), c]) ?? []);
  for (const c of parsed.combos) { const k = [c.category, c.categoryInternal, c.property, c.propertyInternal].join("\u0001"); if (have.has(k)) have.get(k).n += c.n; else have.set(k, { ...c }); }
  dialect.catalog = { combos: [...have.values()].sort((a, b) => b.n - a.n) };
  return res;
}

/** Best known internal names for a (category, property) display pair. */
export function lookupInternal(dialect, category, property) {
  const combos = dialect.catalog?.combos ?? [];
  return combos.find((c) => key(c.category) === key(category) && key(c.property) === key(property)) ?? null;
}
