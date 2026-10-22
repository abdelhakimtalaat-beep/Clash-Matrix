// Cell colour by code: first letter (LOD) + first digit (sub priority). A1..A6, B1..B2, C1..C2 come from the user's reference table;
// the remaining shades continue the same hue family (lighter = lower sub priority) and are marked as extended.
export const PALETTE = {
  A1: "#548235", A2: "#89BF65", A3: "#ACD292", A4: "#C4DEB4", A5: "#D5E8CA", A6: "#EAF4E4",
  B1: "#2E75B6", B2: "#9DC3E6",
  C1: "#C55A11", C2: "#F4B183",
};
export const EXTENDED = {
  B3: "#BDD7EE", B4: "#DEEBF7", B5: "#EAF2FA", B6: "#F3F8FC",
  C3: "#F8CBAD", C4: "#FBE5D6", C5: "#FDF0E7", C6: "#FEF7F2",
  D1: "#7F7F7F", D2: "#A6A6A6", D3: "#BFBFBF", D4: "#D9D9D9", D5: "#E7E7E7", D6: "#F2F2F2",
};
const all = { ...EXTENDED, ...PALETTE };
/** Colour for a code such as "A3-PH": letter + first digit; null when the code does not start with letter+digit. */
export const paletteColour = (code) => {
  const m = /^\s*([A-Za-z])\s*(\d)/.exec(String(code ?? ""));
  if (!m) return null;
  return all[m[1].toUpperCase() + m[2]] ?? null;
};
/** Readable text colour for a background. */
export const textOn = (hex) => {
  const n = parseInt(String(hex ?? "").replace("#", ""), 16);
  if (!Number.isFinite(n)) return "";
  const y = ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000;
  return y < 140 ? "#fff" : "";
};
