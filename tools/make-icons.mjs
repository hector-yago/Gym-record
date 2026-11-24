// Genera el logo (SVG) y los iconos PNG de la PWA sin dependencias: una mancuerna blanca sobre degradado naranja.
// Uso: node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

const outDir = new URL('../icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });

const C1 = [0xf0, 0x6a, 0x1a];
const C2 = [0xb9, 0x1c, 0x1c];
const WHITE = [255, 255, 255];
// Mancuerna: barra central + dos discos interiores + dos exteriores (x0, y0, x1, y1 en unidades 0..1).
const RECTS = [
  [0.24, 0.47, 0.76, 0.53],
  [0.31, 0.3, 0.38, 0.7],
  [0.62, 0.3, 0.69, 0.7],
  [0.21, 0.37, 0.28, 0.63],
  [0.72, 0.37, 0.79, 0.63],
];
const isWhite = (x, y) => RECTS.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d);

function inRoundRect(x, y, r) {
  if (r <= 0) return true;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
const bg = (u, v) => {
  const t = (u + v) / 2;
  return C1.map((c, i) => c + (C2[i] - c) * t);
};

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};

function png(size, { radius, scale }) {
  const ss = 3;
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) / size;
          const v = (y + (sy + 0.5) / ss) / size;
          if (!inRoundRect(u, v, radius)) continue;
          const bu = (u - 0.5) / scale + 0.5;
          const bv = (v - 0.5) / scale + 0.5;
          const col = isWhite(bu, bv) ? WHITE : bg(u, v);
          r += col[0]; g += col[1]; b += col[2]; a += 255;
        }
      }
      const n = ss * ss;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const cov = a / 255;
      raw[o] = cov ? Math.round(r / cov) : 0;
      raw[o + 1] = cov ? Math.round(g / cov) : 0;
      raw[o + 2] = cov ? Math.round(b / cov) : 0;
      raw[o + 3] = Math.round(a / n);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const files = {
  'icon-192.png': png(192, { radius: 0.2, scale: 1 }),
  'icon-512.png': png(512, { radius: 0.2, scale: 1 }),
  'icon-maskable-512.png': png(512, { radius: 0, scale: 0.72 }),
  'apple-touch-icon.png': png(180, { radius: 0, scale: 0.9 }),
};
for (const [name, buf] of Object.entries(files)) writeFileSync(new URL(name, outDir), buf);
const S = 512;
const px = (n) => (n * S).toFixed(1);
const rects = RECTS.map(([a, b, c, d]) => `<rect x="${px(a)}" y="${px(b)}" width="${px(c - a)}" height="${px(d - b)}" rx="${px(0.012)}" fill="#fff"/>`).join('\n');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f06a1a"/><stop offset="1" stop-color="#b91c1c"/></linearGradient></defs>
<rect width="${S}" height="${S}" rx="${0.2 * S}" fill="url(#g)"/>
${rects}
</svg>
`;
writeFileSync(new URL('icon.svg', outDir), svg);
console.log('Iconos generados:', Object.keys(files).join(', '), 'icon.svg');
