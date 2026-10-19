// Project config <-> entities. Each entity is one small JSON document with its own version on the server,
// so two people editing different things never touch the same row.
// Derived fields are recomputed by every client (tolerance resolution, validation), so they are never stored or synced:
// otherwise merely opening a page would look like an edit by that person.
export function strip(kind, data) {
  if (kind === "clashTest") { const { resolvedTolerance, toleranceSource, status, ...rest } = data; return rest; }
  if (kind === "searchSet") { const { status, ...rest } = data; return { ...rest, status: { modelVerified: !!status?.modelVerified, modelHitCount: status?.modelHitCount ?? null } }; }
  return data;
}
export function hydrate(kind, data) {
  if (kind === "clashTest") return { resolvedTolerance: null, toleranceSource: null, status: "Unvalidated", ...data };
  if (kind === "searchSet") return { ...data, status: { syntacticallyValid: false, representable: false, modelVerified: false, modelHitCount: null, ...(data.status ?? {}) } };
  return data;
}
export const keyOf = (kind, id) => `${kind}/${id}`;

export function cfgToEntities(cfg) {
  const out = [];
  const { naming, tolerances, matrix, profiles, codeMappings, searchSets, clashTests, ...meta } = cfg;
  out.push({ kind: "meta", id: "meta", data: meta });
  out.push({ kind: "naming", id: "naming", data: naming });
  out.push({ kind: "tolerances", id: "tolerances", data: tolerances });
  out.push({ kind: "matrix", id: "matrix", data: matrix });
  for (const p of profiles) out.push({ kind: "profile", id: p.id, data: p });
  for (const m of codeMappings) out.push({ kind: "codeMapping", id: m.id, data: m });
  for (const s of searchSets) out.push({ kind: "searchSet", id: s.id, data: strip("searchSet", s) });
  for (const t of clashTests) out.push({ kind: "clashTest", id: t.id, data: strip("clashTest", t) });
  return out;
}

/** Rebuilds a config from entities (deleted ones must already be filtered out). Missing singletons fall back to `fallback`. */
export function entitiesToCfg(entities, fallback) {
  const cfg = structuredClone(fallback);
  cfg.profiles = []; cfg.codeMappings = []; cfg.searchSets = []; cfg.clashTests = [];
  const dialect = null;
  for (const e of entities) {
    switch (e.kind) {
      case "meta": Object.assign(cfg, e.data); break;
      case "naming": cfg.naming = e.data; break;
      case "tolerances": cfg.tolerances = e.data; break;
      case "matrix": cfg.matrix = e.data; break;
      case "profile": cfg.profiles.push(e.data); break;
      case "codeMapping": cfg.codeMappings.push(e.data); break;
      case "searchSet": cfg.searchSets.push(hydrate("searchSet", e.data)); break;
      case "clashTest": cfg.clashTests.push(hydrate("clashTest", e.data)); break;
    }
  }
  void dialect;
  return cfg;
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Which entities changed between two lists: {upserts:[{kind,id,data}], deletes:[{kind,id}]} */
export function diffEntities(before, after) {
  const B = new Map(before.map((e) => [keyOf(e.kind, e.id), e])), A = new Map(after.map((e) => [keyOf(e.kind, e.id), e]));
  const upserts = [], deletes = [];
  for (const [k, e] of A) if (!B.has(k) || !same(B.get(k).data, e.data)) upserts.push(e);
  for (const [k, e] of B) if (!A.has(k)) deletes.push({ kind: e.kind, id: e.id, data: e.data });
  return { upserts, deletes };
}
