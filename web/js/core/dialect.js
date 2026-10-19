// Everything that is a FACT about Navisworks' XML lives here as data. The default is UNVERIFIED:
// it was written without access to Navisworks Manage 2026. Replace it with a dialect confirmed from genuine exports.
import { parseXml } from "./xml.js";

export function defaultDialect() {
  return {
    version: "2026",
    verified: false,
    verificationNote: "UNVERIFIED default. Not yet compared with genuine Navisworks Manage 2026 exports.",
    testTypes: { Hard: "hard", HardConservative: "hard_conservative", Clearance: "clearance", Duplicates: "duplicate" },
    operators: {
      Equals: { test: "equals", flags: 10, negateFlag: 64, valueType: "string" },
      NotEquals: { test: "equals", flags: 10, negateFlag: 64, valueType: "string" },
      Contains: { test: "contains", flags: 10, negateFlag: 64, valueType: "string" },
      NotContains: { test: "contains", flags: 10, negateFlag: 64, valueType: "string" },
      BeginsWith: { test: "wildcard", flags: 10, negateFlag: 64, valueType: "string" },
      EndsWith: { test: "wildcard", flags: 10, negateFlag: 64, valueType: "string" },
      Defined: { test: "defined", flags: 0, negateFlag: 64, valueType: "none" },
      Undefined: { test: "defined", flags: 0, negateFlag: 64, valueType: "none" },
      // Numeric comparisons are deliberately absent: not representable until confirmed from fixtures.
    },
    maxGroupDepth: 0,
    supportsOrGroups: false,
    exchangeSchemaLocation: "http://download.autodesk.com/us/navisworks/schemas/nw-exchange-12.0.xsd",
    batchName: "BIM Clash Matrix",
    clashSelectionPrimTypes: 1,
    emitSelectionSetGuid: false,
    xmlLengthUnit: "Meters",
    unitNames: { Meters: "m", Millimeters: "mm", Centimeters: "cm", Inches: "in", Feet: "ft" },
    selectionLocatorTemplate: "lcop_selection_set_tree/{name}",
    // Setting -> "Xml" (carried by the XML) | "NativeOnly" (needs the add-in or manual setup)
    settings: {
      name: "Xml", testType: "Xml", tolerance: "Xml", selectionA: "Xml", selectionB: "Xml",
      selfIntersectA: "Xml", selfIntersectB: "Xml", mergeComposites: "Xml",
      enabled: "NativeOnly", description: "NativeOnly", group: "NativeOnly", priority: "NativeOnly",
    },
  };
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
