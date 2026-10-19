// Three-way merge of project configs (base = last synced, local = mine, remote = latest on GitHub).
// Objects merge per key; arrays of {id} objects merge per id; everything else is atomic.
// Same field changed differently on both sides = conflict: LOCAL wins and the path is reported.

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const idArray = (a) => Array.isArray(a) && a.length > 0 && a.every((x) => isObj(x) && typeof x.id === "string");

function merge(base, local, remote, path, conflicts) {
  if (eq(local, remote)) return local;
  if (eq(base, local)) return remote;
  if (eq(base, remote)) return local;
  if (isObj(local) && isObj(remote)) {
    const b = isObj(base) ? base : {}, out = {};
    for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
      const v = merge(b[k], local[k], remote[k], `${path}/${k}`, conflicts);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  if ((idArray(local) || local === undefined || (Array.isArray(local) && !local.length)) && (idArray(remote) || (Array.isArray(remote) && !remote.length)) && (base === undefined || Array.isArray(base))) {
    const L = new Map((local ?? []).map((x) => [x.id, x])), R = new Map((remote ?? []).map((x) => [x.id, x])), B = new Map((base ?? []).map((x) => [x.id, x]));
    const order = [...(remote ?? []).map((x) => x.id), ...(local ?? []).map((x) => x.id).filter((i) => !R.has(i))];
    const out = [];
    for (const id of order) {
      const m = merge(B.get(id), L.get(id), R.get(id), `${path}/${id}`, conflicts);
      if (m !== undefined) out.push(m);
    }
    return out;
  }
  conflicts.push(path || "/");
  return local;
}

export function mergeConfigs(base, local, remote) {
  const conflicts = [];
  const merged = merge(base, local, remote, "", conflicts);
  return { merged, conflicts, changedRemotely: !eq(merged, local) };
}
