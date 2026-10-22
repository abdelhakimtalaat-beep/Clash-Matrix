import test from "node:test";
import assert from "node:assert/strict";
import { paletteColour, textOn } from "../js/core/palette.js";
test("cell colour follows letter + first digit of the code", () => {
  assert.equal(paletteColour("A1-AH"), "#548235");
  assert.equal(paletteColour("a2-sh"), "#89BF65");
  assert.equal(paletteColour("A6-TH"), "#EAF4E4");
  assert.equal(paletteColour("B1-CH"), "#2E75B6");
  assert.equal(paletteColour("C2-IH"), "#F4B183");
  assert.equal(paletteColour("Z9"), null);
  assert.equal(paletteColour(""), null);
  assert.equal(textOn("#548235"), "#fff");
  assert.equal(textOn("#EAF4E4"), "");
});
