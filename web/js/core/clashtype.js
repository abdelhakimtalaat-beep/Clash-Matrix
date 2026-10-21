// Clash type is derived from the LAST letter of the test code: H = Hard, C = Clearance, D = Duplicates (e.g. "A1-AH" -> Hard).
import { defaultOptions } from "./model.js";
import { codeOf } from "./lod.js";

export const TYPE_BY_LAST_LETTER = { H: "Hard", C: "Clearance", D: "Duplicates" };
export const typeOfCode = (code) => TYPE_BY_LAST_LETTER[String(code ?? "").trim().slice(-1).toUpperCase()] ?? null;
const virtual = (type) => ({ id: "profile-" + type.toLowerCase(), name: type, testType: type, tolerance: null, options: defaultOptions() });
/** The project's profile for a clash type; a not-yet-stored one when none exists. */
export const profileForType = (cfg, type) => cfg.profiles.find((p) => p.testType === type) ?? virtual(type);

/** Applies the rule to code mappings and to existing unlocked tests. Mutates cfg; returns how many things changed. */
export function syncClashTypes(cfg) {
  let n = 0;
  for (const m of cfg.codeMappings) {
    const type = typeOfCode(m.code);
    if (!type) continue;
    let p = profileForType(cfg, type);
    if (!cfg.profiles.includes(p)) { cfg.profiles.push(p); n++; }
    if (m.profileId !== p.id) { m.profileId = p.id; n++; }
  }
  for (const t of cfg.clashTests) {
    const type = typeOfCode(t.sourceCode ?? codeOf(t));
    if (!type || t.locked) continue;
    const p = cfg.profiles.find((x) => x.testType === type);
    if (p && (t.testType !== type || t.profileId !== p.id)) { t.testType = type; t.profileId = p.id; n++; }
  }
  return n;
}
