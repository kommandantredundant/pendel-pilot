import qrcode from "qrcode-generator";

/**
 * A QR code as one SVG path: `size` modules square, each dark module a 1×1 square at its position.
 * Drawn as a path rather than an image so it stays sharp at any size and needs no innerHTML.
 */
export function qrPath(text: string): { size: number; path: string } {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  let path = "";
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (qr.isDark(row, col)) path += `M${col} ${row}h1v1h-1z`;
    }
  }
  return { size, path };
}
