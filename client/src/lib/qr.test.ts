import test from "node:test";
import assert from "node:assert/strict";
import { qrPath } from "./qr";

test("qrPath draws a square code with its three finder patterns", () => {
  const { size, path } = qrPath("https://pendel-pilot.pages.dev/join/abcdefgh.0123456789abcdefghijkl");
  assert.ok(size >= 21 && (size - 17) % 4 === 0, `QR sizes are 17 + 4n modules, got ${size}`);
  // The corners of the finder patterns are dark: top left, top right, bottom left.
  for (const [col, row] of [[0, 0], [size - 1, 0], [0, size - 1]]) {
    assert.ok(path.includes(`M${col} ${row}h1v1h-1z`), `module ${col},${row} should be dark`);
  }
});
