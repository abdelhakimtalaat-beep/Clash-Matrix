// Exact decimal arithmetic for tolerances. Values are kept as decimal STRINGS ("0.0015") and converted with BigInt,
// so nothing is ever rounded. A conversion that cannot be written exactly is refused instead of rounded.

export const UNITS = ["Millimeters", "Centimeters", "Meters", "Inches", "Feet"];
export const UNIT_SHORT = { Millimeters: "mm", Centimeters: "cm", Meters: "m", Inches: "in", Feet: "ft" };
// Metres per unit (exact definitions).
const M_PER = { Millimeters: "0.001", Centimeters: "0.01", Meters: "1", Inches: "0.0254", Feet: "0.3048" };

const DEC = /^(-?)(\d*)(?:\.(\d*))?$/;

/** "12.50" -> { n: 1250n, s: 2 }. Returns null for anything that is not a plain decimal number. */
export function parseDecimal(text) {
  const t = String(text).trim().replace(",", ".");
  const m = DEC.exec(t);
  if (!m || (m[2] === "" && (m[3] ?? "") === "")) return null;
  const frac = m[3] ?? "";
  const n = BigInt((m[2] || "0") + frac) * (m[1] ? -1n : 1n);
  return { n, s: frac.length };
}

export function decimalToString({ n, s }) {
  const neg = n < 0n;
  let digits = (neg ? -n : n).toString().padStart(s + 1, "0");
  let out = s ? `${digits.slice(0, -s)}.${digits.slice(-s)}` : digits;
  if (s) out = out.replace(/0+$/, "").replace(/\.$/, "");
  return (neg ? "-" : "") + out;
}

const gcd = (a, b) => { a = a < 0n ? -a : a; while (b) [a, b] = [b, a % b]; return a; };

/** Converts a decimal string between units exactly. Returns { value } or { error }. */
export function convert(valueText, from, to) {
  const v = parseDecimal(valueText);
  if (!v) return { error: `"${valueText}" is not a number` };
  if (from === to) return { value: String(valueText).trim().replace(",", ".") }; // exactly as entered
  const f = parseDecimal(M_PER[from]), t = parseDecimal(M_PER[to]);
  // value * f / t  =  (vn * fn * 10^ts) / (tn * 10^(vs+fs))
  let N = v.n * f.n * 10n ** BigInt(t.s);
  let D = t.n * 10n ** BigInt(v.s + f.s);
  const g = gcd(N, D) || 1n;
  N /= g; D /= g;
  let a = 0, b = 0;
  while (D % 2n === 0n) { D /= 2n; a++; }
  while (D % 5n === 0n) { D /= 5n; b++; }
  if (D !== 1n) return { error: `${valueText} ${UNIT_SHORT[from]} cannot be written exactly in ${UNIT_SHORT[to]}` };
  const k = Math.max(a, b);
  N *= 2n ** BigInt(k - a) * 5n ** BigInt(k - b);
  return { value: decimalToString({ n: N, s: k }) };
}

/** Like convert(), but when the result cannot be written exactly it is rounded (half away from zero) to `decimals` places.
 *  Returns { value, rounded } or { error }. Use only where the target format itself limits precision. */
export function convertRounded(valueText, from, to, decimals) {
  const exact = convert(valueText, from, to);
  if (!exact.error) return { value: exact.value, rounded: false };
  const v = parseDecimal(valueText);
  if (!v) return { error: exact.error };
  const f = parseDecimal(M_PER[from]), t = parseDecimal(M_PER[to]);
  const N = v.n * f.n * 10n ** BigInt(t.s), D = t.n * 10n ** BigInt(v.s + f.s);
  const sign = N < 0n ? -1n : 1n, A = N < 0n ? -N : N, scale = 10n ** BigInt(decimals);
  const q = (A * scale * 2n + D) / (2n * D);
  return { value: decimalToString({ n: sign * q, s: decimals }), rounded: true };
}

/** Compare two measures exactly (-1, 0, 1), via metres expressed as a common-scale integer. */
export function compareMeasures(a, b) {
  const toScaled = (m) => {
    const v = parseDecimal(m.value), f = parseDecimal(M_PER[m.unit]);
    return { n: v.n * f.n, s: v.s + f.s };
  };
  const x = toScaled(a), y = toScaled(b);
  const s = Math.max(x.s, y.s);
  const xn = x.n * 10n ** BigInt(s - x.s), yn = y.n * 10n ** BigInt(s - y.s);
  return xn < yn ? -1 : xn > yn ? 1 : 0;
}

export const isNegative = (valueText) => { const v = parseDecimal(valueText); return !!v && v.n < 0n; };
