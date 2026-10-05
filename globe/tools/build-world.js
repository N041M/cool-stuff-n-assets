// Builds data/world.png and world.json for the globe in globe.js from
// Natural Earth's 1:50m admin-0 countries (public domain):
//   https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson
//
// world.png is an equirectangular map, one grey byte per pixel: 0 is sea and
// 1–255 is the country, an index into the table in world.json. The last row
// is a ramp from 0 to 255 so the page can undo any colour correction the
// browser applies when it decodes the image.
//
// Usage: node tools/build-world.js ne_50m_admin_0_countries.geojson data [width]
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const SRC = process.argv[2];
const OUT = process.argv[3] || ".";
const W = +(process.argv[4] || 3600);
const H = W / 2;
const SS = 4;
const SW = W * SS, SH = H * SS;

const src = JSON.parse(fs.readFileSync(SRC, "utf8"));

// Countries that share an ISO code (Australia and its island territories) get
// one index. The three without a code keep their own names.
const NO_CODE = {
  "Somaliland": ["Somaliland", "Somaliland"],
  "N. Cyprus": ["Northern Cyprus", "Severní Kypr"],
  "Siachen Glacier": ["Siachen Glacier", "Ledovec Siačen"],
};
const table = [];
const byKey = new Map();
const featIdx = src.features.map(function (f) {
  const p = f.properties;
  const code = /^[A-Z]{2}$/.test(p.ISO_A2_EH) ? p.ISO_A2_EH : "";
  const key = code || p.NAME;
  if (!byKey.has(key)) {
    byKey.set(key, table.length + 1);
    const names = code ? ["", ""] : NO_CODE[p.NAME];
    table.push({ code: code, en: names[0], cs: names[1], lon: p.LABEL_X, lat: p.LABEL_Y, area: 0 });
  }
  return byKey.get(key);
});
if (table.length > 255) throw new Error("too many countries");

const sub = new Uint8Array(SW * SH);

function fillPolygon(rings, k) {
  let ymin = Infinity, ymax = -Infinity;
  const edges = [];
  rings.forEach(function (ring) {
    for (let i = 0; i < ring.length - 1; i++) {
      const x0 = ((ring[i][0] + 180) / 360) * SW, y0 = ((90 - ring[i][1]) / 180) * SH;
      const x1 = ((ring[i + 1][0] + 180) / 360) * SW, y1 = ((90 - ring[i + 1][1]) / 180) * SH;
      if (y0 === y1) continue;
      edges.push([x0, y0, x1, y1]);
      ymin = Math.min(ymin, y0, y1);
      ymax = Math.max(ymax, y0, y1);
    }
  });
  const r0 = Math.max(0, Math.floor(ymin - 0.5)), r1 = Math.min(SH - 1, Math.ceil(ymax - 0.5));
  const rows = [];
  for (let r = r0; r <= r1; r++) rows.push([]);
  edges.forEach(function (e) {
    const [x0, y0, x1, y1] = e;
    const ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    const ra = Math.max(r0, Math.ceil(ya - 0.5)), rb = Math.min(r1, Math.ceil(yb - 0.5) - 1);
    for (let r = ra; r <= rb; r++) {
      const y = r + 0.5;
      rows[r - r0].push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
    }
  });
  for (let r = r0; r <= r1; r++) {
    const xs = rows[r - r0].sort(function (a, b) { return a - b; });
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const ca = Math.max(0, Math.ceil(xs[i] - 0.5)), cb = Math.min(SW - 1, Math.ceil(xs[i + 1] - 0.5) - 1);
      for (let c = ca; c <= cb; c++) sub[r * SW + c] = k;
    }
  }
}

src.features.forEach(function (f, i) {
  const g = f.geometry;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  polys.forEach(function (p) { fillPolygon(p, featIdx[i]); });
});

// Downsample. A pixel is land when most of its subpixels are, and then takes
// the most common country among them.
const grey = Buffer.alloc(W * (H + 1));
const counts = new Uint16Array(256);
const KM_PX = (6371 * Math.PI) / H; // km per pixel along a meridian
for (let y = 0; y < H; y++) {
  const coslat = Math.cos(((90 - (y + 0.5) * (180 / H)) * Math.PI) / 180);
  for (let x = 0; x < W; x++) {
    let land = 0, best = 0, bestN = 0;
    const seen = [];
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const k = sub[(y * SS + sy) * SW + x * SS + sx];
        if (!k) continue;
        land++;
        if (!counts[k]) seen.push(k);
        if (++counts[k] > bestN) { bestN = counts[k]; best = k; }
      }
    }
    seen.forEach(function (k) {
      table[k - 1].area += (counts[k] / (SS * SS)) * KM_PX * KM_PX * coslat;
      counts[k] = 0;
    });
    grey[y * W + x] = land * 2 >= SS * SS ? best : 0;
  }
}
for (let x = 0; x < W; x++) grey[H * W + x] = Math.min(255, Math.floor((x * 256) / W));

// ------------------------------------------------------------------ PNG ---

const CRC = new Int32Array(256).map(function (_, n) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, px) {
  const stride = w;
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = [0, 1, 2, 3, 4].map(function () { return Buffer.alloc(stride); });
  for (let y = 0; y < h; y++) {
    const cur = px.subarray(y * stride, (y + 1) * stride);
    const up = y ? px.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    let bestF = 0, bestS = Infinity;
    for (let f = 0; f < 5; f++) {
      const out = cand[f];
      let s = 0;
      for (let i = 0; i < stride; i++) {
        const a = i ? cur[i - 1] : 0, b = up[i], c = i ? up[i - 1] : 0;
        let pr = 0;
        if (f === 1) pr = a;
        else if (f === 2) pr = b;
        else if (f === 3) pr = (a + b) >> 1;
        else if (f === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        const v = (cur[i] - pr) & 255;
        out[i] = v;
        s += v < 128 ? v : 256 - v;
      }
      if (s < bestS) { bestS = s; bestF = f; }
    }
    raw[y * (stride + 1)] = bestF;
    cand[bestF].copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("sRGB", Buffer.from([0])),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9, memLevel: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const pngBuf = png(W, H + 1, grey);
fs.writeFileSync(path.join(OUT, "world.png"), pngBuf);

// Country table: [code, English name, Czech name, label lon, label lat, size].
// Size is the square root of the area in km², which decides when a country is
// big enough on screen to carry a label. Names are stored only for the places
// without an ISO code. The page gets every other name from the browser in the
// reader's language.
const rowsOut = table.map(function (t) {
  return [t.code, t.en, t.cs, +t.lon.toFixed(2), +t.lat.toFixed(2), Math.round(Math.sqrt(t.area))];
});
fs.writeFileSync(path.join(OUT, "world.json"), JSON.stringify({ w: W, h: H, countries: rowsOut }));
console.log(W + "×" + H + ", " + (pngBuf.length / 1024).toFixed(1) + " KB, " + table.length + " countries");
