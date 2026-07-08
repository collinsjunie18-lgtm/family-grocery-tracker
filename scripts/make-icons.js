/* Generates the PWA icons (green shopping-bag glyph) with no dependencies —
   raw RGBA pixels encoded to PNG via Node's built-in zlib.
   Run: node scripts/make-icons.js */

const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

// ── PNG encoding ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── Drawing (signed distance functions, 1px anti-alias) ──────────────────────

function sdRoundRect(px, py, cx, cy, hw, hh, r) {
  const qx = Math.abs(px - cx) - (hw - r);
  const qy = Math.abs(py - cy) - (hh - r);
  return (
    Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r
  );
}

function coverage(d) {
  return Math.min(1, Math.max(0, 0.5 - d));
}

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const topColor = [34, 197, 94]; // #22c55e
  const botColor = [21, 128, 61]; // #15803d
  const white = [255, 255, 255];

  // Shopping bag glyph in the maskable safe zone (center ~60%)
  const bagCx = size * 0.5;
  const bagCy = size * 0.595;
  const bagHw = size * 0.215;
  const bagHh = size * 0.175;
  const bagR = size * 0.055;
  const handleCy = size * 0.42;
  const handleR = size * 0.125;
  const handleT = size * 0.042;

  for (let y = 0; y < size; y++) {
    const t = y / (size - 1);
    const bg = [
      Math.round(topColor[0] + (botColor[0] - topColor[0]) * t),
      Math.round(topColor[1] + (botColor[1] - topColor[1]) * t),
      Math.round(topColor[2] + (botColor[2] - topColor[2]) * t),
    ];
    for (let x = 0; x < size; x++) {
      let r = bg[0], g = bg[1], b = bg[2];

      // bag body
      let a = coverage(sdRoundRect(x, y, bagCx, bagCy, bagHw, bagHh, bagR));
      // handle: ring above the bag top
      if (y <= handleCy + 1) {
        const dRing = Math.abs(Math.hypot(x - bagCx, y - handleCy) - handleR) - handleT / 2;
        a = Math.max(a, coverage(dRing));
      }

      if (a > 0) {
        r = Math.round(r + (white[0] - r) * a);
        g = Math.round(g + (white[1] - g) * a);
        b = Math.round(b + (white[2] - b) * a);
      }

      const i = (y * size + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = 255;
    }
  }
  return encodePNG(size, size, buf);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
for (const [file, size] of [
  ["icon-512.png", 512],
  ["icon-192.png", 192],
  ["apple-touch-icon.png", 180],
]) {
  fs.writeFileSync(path.join(outDir, file), drawIcon(size));
  console.log("wrote icons/" + file);
}
