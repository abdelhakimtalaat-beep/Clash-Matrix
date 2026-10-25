// Find & replace over the Value cells of search-set conditions (text values only; numeric/length values and "Undefined" rows are left alone).
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function conditionsOf(ss) { const all = []; const w = (g) => { all.push(...g.conditions); g.groups.forEach(w); }; w(ss.root); return all; }

/** scope: "all" | "set" (setId) | "folder" (folder path, includes subfolders). Returns {values, sets:[{id,name,count}]}; with apply=true the values are changed. */
export function findReplace(cfg, { find, replace = "", scope = "all", setId = null, folder = null, matchCase = false, wholeValue = false, apply = false }) {
  const res = { values: 0, sets: [] };
  if (!find) return res;
  const re = new RegExp(wholeValue ? `^${esc(find)}$` : esc(find), matchCase ? "g" : "gi");
  for (const ss of cfg.searchSets) {
    if (scope === "set" && ss.id !== setId) continue;
    if (scope === "folder" && !((ss.folder ?? "") === folder || (ss.folder ?? "").startsWith(folder + "/"))) continue;
    let n = 0;
    for (const c of conditionsOf(ss)) {
      if (c.operator === "Undefined" || c.operator === "GreaterOrEqual" || c.operator === "LessThan") continue;
      const v = String(c.value ?? ""); re.lastIndex = 0;
      if (!re.test(v)) continue;
      n++;
      if (apply) { re.lastIndex = 0; c.value = wholeValue ? replace : v.replace(re, () => replace); c.isPlaceholder = false; }
    }
    if (n) { res.values += n; res.sets.push({ id: ss.id, name: ss.name, count: n }); }
  }
  return res;
}
