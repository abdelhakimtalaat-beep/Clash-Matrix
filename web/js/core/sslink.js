// Search sets are added on purpose (Search sets tab -> "Add search sets"), never invented while generating tests.
// This file links the sets to matrix systems by name and points every test's Selection A / B at its systems' sets.
import { key, searchSetName } from "./naming.js";

export const LIBRARIES = {
  "published-views": { file: "data/searchsets-published-views.xml", ar: "ECG-Views", en: "ECG-Views" },
  nwc: { file: "data/searchsets-nwc.xml", ar: "ECG-NWC", en: "ECG-NWC" },
};
const isPlaceholder = (s) => { const all = []; const c = (g) => { all.push(...g.conditions); g.groups.forEach(c); }; c(s.root); return all.length > 0 && all.every((x) => x.isPlaceholder); };

/** Links each matrix system to the set with the same name (trailing spaces and case ignored). A set named after the system wins; the expected discipline folder breaks ties. */
export function linkSearchSets(cfg) {
  let linked = 0;
  for (const sys of cfg.matrix.systems) {
    const names = new Set([key(sys.label), key(searchSetName(sys, cfg.naming))]);
    const cur = cfg.searchSets.find((s) => s.systemId === sys.id);
    if (cur && !isPlaceholder(cur) && names.has(key(cur.name))) continue;
    const hits = cfg.searchSets.filter((s) => names.has(key(s.name)) && !isPlaceholder(s) && (!s.systemId || s.systemId === sys.id));
    if (!hits.length) continue;
    const letter = key(sys.label)[0];
    const pick = hits.find((s) => key(s.folder ?? "")[0] === letter) ?? hits[0];
    for (const s of cfg.searchSets) if (s.systemId === sys.id && s !== pick) s.systemId = null;
    if (pick.systemId !== sys.id) { pick.systemId = sys.id; linked++; }
  }
  // placeholder sets that an earlier version generated automatically are no longer needed once the system has a real set
  cfg.searchSets = cfg.searchSets.filter((s) => !(isPlaceholder(s) && (!s.systemId || cfg.searchSets.some((o) => o !== s && o.systemId === s.systemId && !isPlaceholder(o)))));
  return linked;
}

/** Selection A / B of every test = the set linked to its system A / B (null while a system has no set). */
export function relinkTests(cfg) {
  let n = 0;
  const bySys = new Map(); for (const s of cfg.searchSets) if (s.systemId && !bySys.has(s.systemId)) bySys.set(s.systemId, s.id);
  for (const t of cfg.clashTests) {
    const a = bySys.get(t.systemAId) ?? null, b = bySys.get(t.systemBId) ?? null;
    if (t.searchSetAId !== a || t.searchSetBId !== b) { t.searchSetAId = a; t.searchSetBId = b; n++; }
  }
  return n;
}

/** Loads one bundled library: replaces the sets of a previously loaded other library, adds/updates this one, links systems and tests. */
export async function addLibrary(cfg, dialect, id, { parseBatch, applyBatch, fetchText }) {
  const lib = LIBRARIES[id]; if (!lib) throw new Error("Unknown library " + id);
  const parsed = parseBatch(await fetchText(lib.file), dialect);
  const removed = cfg.searchSets.filter((s) => s.library && s.library !== id).length;
  cfg.searchSets = cfg.searchSets.filter((s) => !(s.library && s.library !== id));
  const res = applyBatch(cfg, dialect, parsed);
  const names = new Set(parsed.searchSets.map((p) => (p.folder ?? "").toLowerCase() + "/" + p.name.toLowerCase()));
  for (const s of cfg.searchSets) if (names.has((s.folder ?? "").toLowerCase() + "/" + s.name.toLowerCase())) s.library = id;
  const linked = res.linked + linkSearchSets(cfg);
  const tests = relinkTests(cfg);
  const unlinked = cfg.matrix.systems.filter((s) => !cfg.searchSets.some((x) => x.systemId === s.id)).map((s) => s.label);
  return { ...res, total: parsed.searchSets.length, removed, linked, tests, unlinked };
}
