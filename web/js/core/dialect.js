// Everything that is a FACT about Navisworks' XML lives here as data. The default is UNVERIFIED:
// it was written without access to Navisworks Manage 2026. Replace it with a dialect confirmed from genuine exports.
import { parseXml } from "./xml.js";
import { CATALOG_SEED } from "./catalog-seed.js";

export function defaultDialect() {
  return {
    version: "2026",
    verified: false, // becomes true only after a real import + reopen in Navisworks (set by a person)
    verificationNote: "Structure matches one genuine Navisworks Manage 2026 Clash Detective batch export (674 tests, 65 search sets). NOT yet confirmed by importing our output into Navisworks.",
    // Only types seen in a genuine file are trusted; the others are remembered from documentation and flagged by validation.
    testTypes: { Hard: "hard", HardConservative: "hard_conservative", Clearance: "clearance", Duplicates: "duplicate" },
    verifiedTestTypes: ["Hard"],
    // Condition tests seen in the genuine file. valueType: element <data type="...">, or "none" = empty <value><data/></value> (as in the genuine no_prop conditions).
    operators: {
      Equals: { test: "equals", valueType: "wstring" },
      NotEquals: { test: "not_equals", valueType: "wstring" },
      Contains: { test: "contains", valueType: "wstring" },
      GreaterOrEqual: { test: "greater_equal", valueType: "linear" },
      LessThan: { test: "less_than", valueType: "linear" },
      Undefined: { test: "no_prop", valueType: "none" },
    },
    // "flags" is a per-condition bit field. Observed values: 0, 16, 64, 80, 400, 464.
    // Bit 64 marks the START OF A NEW OR-GROUP (conditions are an OR of AND-groups); the other bits (16, 128, 256) are copied as found.
    orFlag: 64,
    defaultConditionFlags: 400, // the most common value in the genuine file; editable per condition
    supportsOrOfAndGroups: true, // root "Any" containing AND-groups; no deeper nesting, no AND-of-ORs
    exchangeSchemaLocation: "http://download.autodesk.com/us/navisworks/schemas/nw-exchange-12.0.xsd",
    batchName: "BIM Clash Matrix",
    clashSelectionPrimTypes: 1,
    xmlLengthUnit: "Feet", // the genuine file uses units="ft" and writes the tolerance in feet
    toleranceMaxDecimals: 10, // Navisworks wrote 0.0820209974 for 25 mm: 10 decimals
    unitNames: { Meters: "m", Millimeters: "mm", Centimeters: "cm", Inches: "in", Feet: "ft" },
    selectionLocatorTemplate: "lcop_selection_set_tree/{path}", // {path} = folder/set name
    // Known (display name -> internal name) pairs, used to fill the internal names Navisworks writes. Extend by importing a Navisworks XML.
    catalog: { combos: structuredClone(CATALOG_SEED) },
    settings: {
      name: "Xml", testType: "Xml", tolerance: "Xml", selectionA: "Xml", selectionB: "Xml",
      selfIntersectA: "Xml", selfIntersectB: "Xml", mergeComposites: "Xml", priority: "Xml",
      enabled: "NativeOnly", description: "NativeOnly", group: "NativeOnly",
    },
  };
}

/** Dialects stored by older versions lack the genuine-format fields; replace them with the current default, keeping any learned catalog. */
export function upgradeDialect(d) {
  if (d && d.orFlag !== undefined && d.catalog?.combos?.length) return d;
  const fresh = defaultDialect();
  if (d?.catalog?.combos?.length) fresh.catalog = d.catalog;
  return fresh;
}

export const supportFor = (d, setting) => d.settings?.[setting] ?? "Unknown";

// ---- structural comparison with genuine fixtures ----

export function signatureOf(xmlTexts) {
  const sig = { elements: new Set(), attributes: new Set(), values: new Map() };
  const walk = (el, parent) => {
    const path = parent ? `${parent}/${el.name}` : el.name;
    sig.elements.add(path);
    for (const [k, v] of Object.entries(el.attrs)) {
      if (k === "xsi" || k === "xmlns") continue;
      const ak = `${path}@${k}`;
      sig.attributes.add(ak);
      if (!sig.values.has(ak)) sig.values.set(ak, new Set());
      if (sig.values.get(ak).size < 50) sig.values.get(ak).add(v);
    }
    for (const c of el.children) walk(c, path);
  };
  for (const t of xmlTexts) walk(parseXml(t), "");
  return sig;
}

const FREE_TEXT = new Set(["name", "internal_name", "filename", "filepath", "guid", "tolerance", "status", "noNamespaceSchemaLocation"]);

/** Findings: {severity, code, message}. Structural only: passing does NOT prove Navisworks will import the file. */
export function compareWithFixtures(xmlText, genuine) {
  const out = [];
  if (!genuine || genuine.elements.size === 0) {
    out.push({ severity: "Warning", code: "NO_FIXTURES", message: "No genuine fixtures were supplied. Structure could not be checked." });
    return out;
  }
  const gen = signatureOf([xmlText]);
  for (const e of gen.elements) if (!genuine.elements.has(e)) out.push({ severity: "Error", code: "UNKNOWN_ELEMENT", message: `Element "${e}" never appears in the genuine fixtures.` });
  for (const a of gen.attributes) if (!genuine.attributes.has(a)) out.push({ severity: "Error", code: "UNKNOWN_ATTRIBUTE", message: `Attribute "${a}" never appears in the genuine fixtures.` });
  for (const [k, vals] of gen.values) {
    if (FREE_TEXT.has(k.slice(k.indexOf("@") + 1))) continue;
    const seen = genuine.values.get(k);
    if (seen) for (const v of vals) if (!seen.has(v)) out.push({ severity: "Warning", code: "UNSEEN_VALUE", message: `Value "${v}" of "${k}" was not seen in the genuine fixtures (seen: ${[...seen].slice(0, 10).join(", ")}).` });
  }
  for (const e of genuine.elements) {
    const parent = e.includes("/") ? e.slice(0, e.lastIndexOf("/")) : "";
    if (!gen.elements.has(e) && (!parent || gen.elements.has(parent))) out.push({ severity: "Info", code: "ELEMENT_NOT_GENERATED", message: `Genuine fixtures contain "${e}", which the generated file does not.` });
  }
  return out;
}
