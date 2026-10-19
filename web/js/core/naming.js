// Names, labels and pair ordering. Arabic and English text is preserved as-is.

const BIDI = /[‎‏‪-‮⁦-⁩]/g;

export function normalizeLabel(s) {
  if (s === null || s === undefined) return "";
  return String(s).replace(BIDI, "").normalize("NFC").replace(/\s+/g, " ").trim();
}
export const key = (s) => normalizeLabel(s).toLowerCase();

export function disciplinePrefix(discipline, rules) {
  if (!discipline) return "";
  for (const [k, v] of Object.entries(rules.disciplinePrefixes ?? {})) if (key(k) === key(discipline)) return v;
  const d = normalizeLabel(discipline);
  return d ? [...d][0].toUpperCase() : "";
}

function tidy(s, sep) {
  s = normalizeLabel(s);
  if (!sep) return s;
  while (s.includes(sep + sep)) s = s.replaceAll(sep + sep, sep);
  while (s.startsWith(sep)) s = s.slice(sep.length);
  while (s.endsWith(sep)) s = s.slice(0, -sep.length);
  return s.trim();
}

export function searchSetName(system, rules) {
  return tidy(
    rules.searchSetPattern
      .replaceAll("{project}", rules.projectCode ?? "")
      .replaceAll("{disc}", disciplinePrefix(system.discipline, rules))
      .replaceAll("{system}", system.label)
      .replaceAll("{sep}", rules.separator ?? ""),
    rules.separator);
}

export function testName(aName, bName, code, n, rules) {
  return tidy(
    rules.testPattern
      .replaceAll("{project}", rules.projectCode ?? "")
      .replaceAll("{A}", aName).replaceAll("{B}", bName)
      .replaceAll("{code}", code ?? "").replaceAll("{zone}", rules.zone ?? "")
      .replaceAll("{n}", String(n)).replaceAll("{sep}", rules.separator ?? ""),
    rules.separator);
}

/** Returns a problem description or null. */
export function validateName(name, rules) {
  if (!name || !name.trim()) return "name is empty";
  if (name.length > rules.maxNameLength) return `name is longer than ${rules.maxNameLength} characters`;
  for (const ch of name) {
    if (ch.charCodeAt(0) < 32) return "name contains a control character";
    if ((rules.forbiddenCharacters ?? "").includes(ch)) return `name contains the forbidden character "${ch}"`;
  }
  return null;
}

/** Orders two systems by discipline order, then sheet order. */
export function orderPair(x, y, rules) {
  const rank = (s) => {
    const i = (rules.disciplineOrder ?? []).findIndex((d) => key(d) === key(s.discipline));
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
  };
  const rx = rank(x), ry = rank(y);
  if (rx !== ry) return rx < ry ? [x, y] : [y, x];
  return x.order <= y.order ? [x, y] : [y, x];
}
