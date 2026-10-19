// Navisworks search-set conditions form an OR of AND-groups (a flat list; a flag bit starts each new OR-group).
// This converts our nested group model to that shape, or says why it cannot be done.
const MAX_TERMS = 200;

/** @returns {{terms: any[][]}|{error: string}} terms = list of AND-lists of conditions */
export function toDnf(root) {
  const conds = (g) => g.conditions ?? [], subs = (g) => g.groups ?? [];
  if (root.mode !== "Any") {
    // AND: conditions plus nested AND-groups, flattened. A nested OR with more than one member would be an AND-of-ORs.
    const flat = [];
    const walk = (g) => {
      if (g.mode === "Any" && conds(g).length + subs(g).length > 1) return false;
      flat.push(...conds(g));
      return subs(g).every(walk);
    };
    if (!walk(root)) return { error: "an OR group nested inside an AND group (AND of ORs) cannot be written; restructure it as OR of AND groups" };
    return { terms: [flat] };
  }
  const terms = conds(root).map((c) => [c]);
  for (const g of subs(root)) {
    const r = toDnf({ ...g, mode: "All" });
    if (r.error) return { error: r.error };
    terms.push(...r.terms);
  }
  if (terms.length > MAX_TERMS) return { error: `too many OR groups (${terms.length})` };
  return { terms };
}
