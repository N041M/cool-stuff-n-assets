#!/usr/bin/env node
/* Builds js/earth-map.js, the land, sea and ice mask the Earth is drawn
   from, out of a Natural Earth country raster. Run it from the solar-system
   folder:

     node tools/earth-mask.js path/to/world.png

   The input is an 8-bit grey PNG in plate carrée (x = longitude from -180,
   y = latitude from +90), where 0 is sea and any other value is a country.
   The values 182 (Greenland) and 238 (Antarctica) are ice sheets. A last
   row that is a calibration ramp is ignored. Natural Earth is in the public
   domain. */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const src = process.argv[2];
if (!src) { console.error('usage: node tools/earth-mask.js world.png'); process.exit(1); }
const OW = 1024, OH = 512, ICE = new Set([182, 238]);

const buf = fs.readFileSync(src);
let i = 8, W = 0, H = 0;
const idat = [];
while (i < buf.length) {
  const n = buf.readUInt32BE(i), t = buf.toString('ascii', i + 4, i + 8);
  if (t === 'IHDR') { W = buf.readUInt32BE(i + 8); H = buf.readUInt32BE(i + 12); }
  if (t === 'IDAT') idat.push(buf.subarray(i + 8, i + 8 + n));
  i += 12 + n;
}
const raw = zlib.inflateSync(Buffer.concat(idat));
const px = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  const f = raw[y * (W + 1)], row = raw.subarray(y * (W + 1) + 1, (y + 1) * (W + 1));
  for (let x = 0; x < W; x++) {
    const a = x ? px[y * W + x - 1] : 0, b = y ? px[(y - 1) * W + x] : 0, c = x && y ? px[(y - 1) * W + x - 1] : 0;
    let p = 0;
    if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
    else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
    px[y * W + x] = (row[x] + p) & 255;
  }
}
const MH = H % 2 ? H - 1 : H;

// majority vote over each output cell: 0 sea, 1 land, 2 ice
const out = new Uint8Array(OW * OH);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  let land = 0, ice = 0, n = 0;
  // at least one source pixel per cell, so a small source is sampled rather than left empty
  const y0 = Math.floor(y * MH / OH), y1 = Math.max(y0 + 1, Math.floor((y + 1) * MH / OH));
  const x0 = Math.floor(x * W / OW), x1 = Math.max(x0 + 1, Math.floor((x + 1) * W / OW));
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
    const k = px[yy * W + xx]; n++;
    if (k) { land++; if (ICE.has(k)) ice++; }
  }
  out[y * OW + x] = land * 2 < n ? 0 : ice * 2 >= land ? 2 : 1;
}

// run lengths: per row, "value + length in base 36", comma separated
const rows = [];
for (let y = 0; y < OH; y++) {
  let s = '', v = out[y * OW], len = 0;
  for (let x = 0; x <= OW; x++) {
    const c = x < OW ? out[y * OW + x] : -1;
    if (c === v) { len++; continue; }
    s += v + len.toString(36) + ',';
    v = c; len = 1;
  }
  rows.push(s.slice(0, -1));
}

const js = '/* Land, sea and ice of the Earth, 1024 x 512 in plate carree, built from\n' +
  '   Natural Earth (public domain) by tools/earth-mask.js. Each row is a list\n' +
  '   of runs: the value (0 sea, 1 land, 2 ice) then the run length in base 36. */\n' +
  'window.EARTH_MASK = { w: ' + OW + ', h: ' + OH + ', rle: \'' + rows.join('|') + '\' };\n';
const dest = path.join(__dirname, '..', 'js', 'earth-map.js');
fs.writeFileSync(dest, js);
console.log('wrote', dest, js.length, 'bytes');
