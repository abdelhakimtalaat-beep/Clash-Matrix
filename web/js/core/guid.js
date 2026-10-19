// Deterministic UUID-shaped identifiers (version-4 layout) derived from a string, so exports are stable between runs.
// These are NEW identifiers created by this tool; they are never copied from, or claimed to match, any Navisworks object.
function fnv(str, seed) {
  let h = BigInt(seed);
  for (const ch of str) { h ^= BigInt(ch.codePointAt(0)); h = (h * 0x100000001b3n) & 0xffffffffffffffffn; }
  return h;
}
export function guidFrom(str) {
  const a = fnv(str, "0xcbf29ce484222325"), b = fnv(str + "\u0001", "0x84222325cbf29ce4");
  const hex = (a.toString(16).padStart(16, "0") + b.toString(16).padStart(16, "0")).split("");
  hex[12] = "4"; hex[16] = "89ab"[parseInt(hex[16], 16) % 4];
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
