// Matrix interpretation, test generation and tolerance resolution.
import { key, normalizeLabel, orderPair, searchSetName, testName, disciplinePrefix } from "./naming.js";
import { compareMeasures } from "./units.js";
import { uid, newCondition } from "./model.js";

const sysById = (cfg) => new Map(cfg.matrix.systems.map((s) => [s.id, s]));
const cellKey = (c) => `${c.rowSystemId}|${c.columnSystemId}`;

/** Priority: code+colour, then code only, then colour only (when the cell has no code). */
export function findMapping(cfg, code, color) {
  const k = key(code);
  const sameColor = (m) => !!m.colorHex && !!color && m.colorHex.toLowerCase() === color.toLowerCase();
  if (k) {
    const same = cfg.codeMappings.filter((m) => key(m.code) === k);
    // exact code+colour, then a colourless mapping, then the only mapping for that code (cell has no/other colour)
    return same.find(sameColor) ?? same.find((m) => !m.colorHex) ?? (same.length === 1 ? same[0] : undefined);
  }
  return cfg.codeMappings.find((m) => !key(m.code) && sameColor(m));
}

export function interpret(cfg) {
  const out = { relationships: [], issues: [], skippedByMapping: 0, skippedDiagonal: 0 };
  const systems = sysById(cfg);
  const issue = (severity, code, message, subjectId, subjectKind) => out.issues.push({ severity, code, message, subjectId, subjectKind });
  const resolved = [];

  for (const cell of cfg.matrix.cells) {
    const code = normalizeLabel(cell.rawValue);
    const mapping = findMapping(cfg, code, cell.colorHex);
    if (!code && !mapping) continue;
    const a = systems.get(cell.rowSystemId), b = systems.get(cell.columnSystemId);
    if (!a || !b) { issue("Error", "UNKNOWN_SYSTEM", `Cell ${cell.sourceAddress} refers to a system that does not exist.`, cellKey(cell), "cell"); continue; }
    if (a.id === b.id && cfg.generation.ignoreDiagonal) { out.skippedDiagonal++; continue; }
    if (!mapping) { issue("Error", "UNMAPPED_CODE", `Cell ${cell.sourceAddress}: code "${code}" has no mapping.`, cellKey(cell), "cell"); continue; }
    if (!mapping.generateTest) { out.skippedByMapping++; continue; }
    const profile = cfg.profiles.find((p) => p.id === mapping.profileId);
    if (!profile) { issue("Error", "MAPPING_WITHOUT_PROFILE", `Cell ${cell.sourceAddress}: code "${code}" generates tests but its mapping has no valid profile.`, cellKey(cell), "cell"); continue; }
    resolved.push({ cellKey: cellKey(cell), address: cell.sourceAddress, a, b, code, profile, mirrorAddress: null });
  }

  if (cfg.generation.mode === "Directional") { out.relationships = resolved; return out; }

  // Symmetric: one test per unordered pair, but never merge silently when the two cells disagree.
  const groups = new Map();
  for (const r of resolved) {
    const k = r.a.id < r.b.id ? `${r.a.id}|${r.b.id}` : `${r.b.id}|${r.a.id}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const reorder = (r) => { const [a, b] = orderPair(r.a, r.b, cfg.naming); return { ...r, a, b }; };
  for (const [k, items] of groups) {
    items.sort((x, y) => x.a.order - y.a.order || x.b.order - y.b.order);
    if (items.length === 1) { out.relationships.push(reorder(items[0])); continue; }
    if (items.every((i) => i.profile.id === items[0].profile.id)) {
      out.relationships.push({ ...reorder(items[0]), mirrorAddress: items.slice(1).map((i) => i.address).join(", ") });
    } else {
      issue("Warning", "MIRROR_CONFLICT", `Cells ${items.map((i) => i.address).join(" and ")} describe the same pair with different profiles. Both were kept as separate tests; review them or switch the project to directional mode.`, k, "pair");
      out.relationships.push(...items.map(reorder));
    }
  }
  return out;
}

export function ensureSearchSet(cfg, system) {
  if (cfg.searchSets.some((s) => s.systemId === system.id)) return false;
  cfg.searchSets.push({
    id: uid(), name: searchSetName(system, cfg.naming), systemId: system.id, guid: null,
    folder: system.discipline ? `${disciplinePrefix(system.discipline, cfg.naming)}-${normalizeLabel(system.discipline)}` : null,
    // A guess made from the system label. A person must review it; validation warns until they do.
    root: { mode: "All", conditions: [{ ...newCondition(), category: "Item", property: "Name", operator: "Contains", value: system.label, isPlaceholder: true }], groups: [] },
    status: { syntacticallyValid: false, representable: false, modelVerified: false, modelHitCount: null }, nativeObjectId: null,
  });
  return true;
}

/** Mutates cfg. Keeps user edits (name, enabled, tolerance override); skips locked; removes stale generated; never touches manual tests. */
export function generateTests(cfg, { regenerateNames = false, removeStale = true } = {}) {
  const res = { created: 0, updated: 0, removedStale: 0, keptLocked: 0, searchSetsCreated: 0, interpretation: interpret(cfg) };
  const rels = res.interpretation.relationships;
  const seen = new Set();
  for (const r of rels) for (const s of [r.a, r.b]) if (!seen.has(s.id)) { seen.add(s.id); if (ensureSearchSet(cfg, s)) res.searchSetsCreated++; }

  const live = new Set();
  let counter = cfg.clashTests.length;
  for (const r of rels) {
    live.add(r.cellKey);
    const ssA = cfg.searchSets.find((s) => s.systemId === r.a.id), ssB = cfg.searchSets.find((s) => s.systemId === r.b.id);
    const existing = cfg.clashTests.find((t) => t.sourceCellKey === r.cellKey);
    if (existing?.locked) { res.keptLocked++; continue; }
    if (!existing) {
      counter++;
      cfg.clashTests.push({
        id: uid(), name: testName(ssA.name, ssB.name, r.code, counter, cfg.naming),
        systemAId: r.a.id, systemBId: r.b.id, searchSetAId: ssA.id, searchSetBId: ssB.id,
        testType: r.profile.testType, toleranceOverride: null, resolvedTolerance: null, toleranceSource: null, enabled: true,
        options: { ...r.profile.options }, profileId: r.profile.id, priorityOverride: null,
        sourceCellKey: r.cellKey, sourceAddress: r.address, mirrorAddress: r.mirrorAddress, sourceCode: r.code,
        locked: false, status: "Unvalidated", nativeObjectId: null,
      });
      res.created++;
    } else {
      Object.assign(existing, {
        systemAId: r.a.id, systemBId: r.b.id, searchSetAId: ssA.id, searchSetBId: ssB.id,
        testType: r.profile.testType, profileId: r.profile.id, sourceAddress: r.address, mirrorAddress: r.mirrorAddress, sourceCode: r.code,
      });
      if (regenerateNames) existing.name = testName(ssA.name, ssB.name, r.code, cfg.clashTests.indexOf(existing) + 1, cfg.naming);
      res.updated++;
    }
  }
  if (removeStale) {
    const before = cfg.clashTests.length;
    cfg.clashTests = cfg.clashTests.filter((t) => !(t.sourceCellKey && !t.locked && !live.has(t.sourceCellKey)));
    res.removedStale = before - cfg.clashTests.length;
  }
  resolveAllTolerances(cfg);
  return res;
}

// ---------------- tolerance ----------------
// Precedence: test override > system pair (either direction) > profile > discipline (A then B) > project default.

export function resolveTolerance(cfg, t) {
  if (t.toleranceOverride) return { value: t.toleranceOverride, source: "test override" };
  const pair = cfg.tolerances.pairDefaults.find((p) => (p.systemAId === t.systemAId && p.systemBId === t.systemBId) || (p.systemAId === t.systemBId && p.systemBId === t.systemAId));
  if (pair) return { value: pair.tolerance, source: "system-pair default" };
  const profile = cfg.profiles.find((p) => p.id === t.profileId);
  if (profile?.tolerance) return { value: profile.tolerance, source: `profile '${profile.name}'` };
  const systems = sysById(cfg);
  for (const id of [t.systemAId, t.systemBId]) {
    const s = systems.get(id);
    if (!s) continue;
    for (const [d, m] of Object.entries(cfg.tolerances.disciplineDefaults)) if (key(d) === key(s.discipline)) return { value: m, source: `discipline default '${d}'` };
  }
  return { value: cfg.tolerances.projectDefault, source: "project default" };
}

export function disciplineConflict(cfg, t) {
  const systems = sysById(cfg);
  const a = systems.get(t.systemAId), b = systems.get(t.systemBId);
  if (!a || !b) return false;
  const find = (s) => Object.entries(cfg.tolerances.disciplineDefaults).find(([d]) => key(d) === key(s.discipline))?.[1];
  const ma = find(a), mb = find(b);
  return !!ma && !!mb && compareMeasures(ma, mb) !== 0;
}

export function resolveAllTolerances(cfg) {
  for (const t of cfg.clashTests) { const { value, source } = resolveTolerance(cfg, t); t.resolvedTolerance = value; t.toleranceSource = source; }
}

// ---------------- re-import support ----------------

/** Fresh systems that match an existing one (label + discipline) keep the old id, so edits stay attached. */
export function carryOverIds(existing, fresh) {
  const sk = (s) => key(s.label) + "|" + key(s.discipline);
  const oldByKey = new Map();
  for (const s of [...existing.matrix.systems].sort((a, b) => a.order - b.order)) { const k = sk(s); if (!oldByKey.has(k)) oldByKey.set(k, []); oldByKey.get(k).push(s.id); }
  const used = new Set(existing.matrix.systems.map((s) => s.id));
  const map = new Map();
  for (const s of [...fresh.systems].sort((a, b) => a.order - b.order)) { const q = oldByKey.get(sk(s)); if (q?.length) map.set(s.id, q.shift()); }
  const taken = new Set(map.values());
  for (const s of fresh.systems) {
    if (map.has(s.id)) continue;
    let id; do { id = "sys-" + uid().slice(0, 8); } while (used.has(id) || taken.has(id));
    taken.add(id); map.set(s.id, id);
  }
  const M = (id) => (id ? map.get(id) : id);
  for (const s of fresh.systems) s.id = M(s.id);
  fresh.rowSystemIds = fresh.rowSystemIds.map(M);
  fresh.columnSystemIds = fresh.columnSystemIds.map(M);
  for (const c of fresh.cells) { c.rowSystemId = M(c.rowSystemId); c.columnSystemId = M(c.columnSystemId); }
}

export function addMissingMappings(cfg, suggested) {
  const have = new Set(cfg.codeMappings.filter((m) => m.code).map((m) => key(m.code)));
  let n = 0;
  for (const s of suggested) if (!have.has(key(s.code))) { have.add(key(s.code)); cfg.codeMappings.push(s); n++; }
  return n;
}
