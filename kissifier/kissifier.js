/* Kissifier turns a shape into a lipstick print. It is a port of `add` and `render`
   from tools/kiss_texture.py. Its random numbers differ from the Python tool's, so
   one recipe gives a different print in each.

   Kissifier.shape(alpha, width, height) wraps a mask (0 to 1 per pixel) and finds
   its bounding box. Kissifier.addFeatures(shape, recipe, counts, seed) adds ridges,
   lines and weak spots to a recipe, and Kissifier.render(shape, recipe, color)
   returns the print as RGBA pixels in one ink colour. */
(function (root) {
  "use strict";

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function random(seed) {
    let s = seed >>> 0;
    let spare = null;
    function next() {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    function normal() {
      if (spare !== null) {
        const v = spare;
        spare = null;
        return v;
      }
      const r = Math.sqrt(-2 * Math.log(1 - next()));
      const a = 2 * Math.PI * next();
      spare = r * Math.sin(a);
      return r * Math.cos(a);
    }
    return {
      normal,
      uniform: (lo, hi) => lo + (hi - lo) * next(),
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo)),
      pick: (list) => list[Math.floor(next() * list.length)],
    };
  }

  function shape(alpha, W, H) {
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (alpha[y * W + x] > 0.5) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          y1 = y;
        }
      }
    }
    return x1 < 0 ? null : { A: alpha, W, H, box: { x0, y0, w: x1 + 1 - x0, h: y1 + 1 - y0 } };
  }

  // Crease direction at a point: across each lip, fanning toward the corners, pointing away
  // from the mouth.
  function across(x, y, b, out) {
    const vx = (x - b.x0 - b.w / 2) / (b.w / 2) ** 2;
    const vy = (y - b.y0 - b.h / 2) / (0.3 * b.h) ** 2;
    const n = Math.hypot(vx, vy) + 1e-9;
    out[0] = vx / n;
    out[1] = vy / n;
    return out;
  }

  // Walks 1 px at a time along the crease direction (or a fixed heading) until `steps` or the
  // shape ends.
  function trace(s, x, y, steps, wobble, r, sign = 1, heading = null) {
    const pts = [];
    const d = [0, 0];
    let turn = 0;
    for (let i = 0; i < steps; i++) {
      if (!(x >= 0 && x < s.W && y >= 0 && y < s.H) || s.A[Math.floor(y) * s.W + Math.floor(x)] < 0.5) break;
      pts.push([x, y]);
      const [dx, dy] = heading || across(x, y, s.box, d);
      turn = 0.9 * turn + wobble * r.normal();
      const c = Math.cos(turn), sn = Math.sin(turn);
      x += sign * (c * dx - sn * dy);
      y += sign * (sn * dx + c * dy);
    }
    return pts;
  }

  // ---------- filters, matching scipy.ndimage ----------

  // scipy's "reflect" mode: d c b a | a b c d | d c b a
  function reflect(i, n) {
    const p = 2 * n;
    i %= p;
    if (i < 0) i += p;
    return i < n ? i : p - 1 - i;
  }

  // Box widths whose three passes approximate a Gaussian (Kovesi, "Fast almost-Gaussian filtering").
  function boxWidths(sigma) {
    let lo = Math.floor(Math.sqrt(4 * sigma * sigma + 1));
    if (lo % 2 === 0) lo--;
    const m = Math.round((12 * sigma * sigma - 3 * lo * lo - 12 * lo - 9) / (-4 * lo - 4));
    return [0, 1, 2].map((i) => (i < m ? lo : lo + 2));
  }

  // Wide Gaussians run as three box blurs, which cost the same at any width and stay within a few
  // percent of the true curve.
  function blur1d(src, sigma, nearest = false) {
    const n = src.length;
    const widths = sigma > 3 ? boxWidths(sigma) : null;
    const r = widths ? widths.reduce((a, b) => a + (b - 1) / 2, 0) : Math.floor(4 * sigma + 0.5);
    let pad = new Float64Array(n + 2 * r);
    for (let i = 0; i < pad.length; i++) pad[i] = src[nearest ? clamp(i - r, 0, n - 1) : reflect(i - r, n)];
    const out = new Float64Array(n);
    if (!widths) {
      const k = new Float64Array(2 * r + 1);
      let sum = 0;
      for (let i = -r; i <= r; i++) sum += k[i + r] = Math.exp(-0.5 * (i / sigma) ** 2);
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let j = 0; j <= 2 * r; j++) v += k[j] * pad[i + j];
        out[i] = v / sum;
      }
      return out;
    }
    for (const width of widths) {
      const b = (width - 1) / 2;
      const next = new Float64Array(pad.length);
      let acc = 0;
      for (let i = 0; i < width && i < pad.length; i++) acc += pad[i];
      for (let i = b; i < pad.length - b; i++) {
        next[i] = acc / width;
        if (i + b + 1 < pad.length) acc += pad[i + b + 1] - pad[i - b];
      }
      pad = next;
    }
    for (let i = 0; i < n; i++) out[i] = pad[i + r];
    return out;
  }

  function blur(a, W, H, sigma) {
    const out = new Float32Array(a.length);
    for (let y = 0; y < H; y++) out.set(blur1d(a.subarray(y * W, y * W + W), sigma), y * W);
    const col = new Float32Array(H);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) col[y] = out[y * W + x];
      const b = blur1d(col, sigma);
      for (let y = 0; y < H; y++) out[y * W + x] = b[y];
    }
    return out;
  }

  function std(a, mask) {
    let n = 0, sum = 0, sq = 0;
    for (let i = 0; i < a.length; i++) {
      if (mask && !mask[i]) continue;
      n++;
      sum += a[i];
      sq += a[i] * a[i];
    }
    return Math.sqrt(Math.max(sq / n - (sum / n) ** 2, 1e-12));
  }

  function noise(r, W, H, sigma) {
    const a = new Float32Array(W * H);
    for (let i = 0; i < a.length; i++) a[i] = r.normal();
    const b = blur(a, W, H, sigma);
    const k = 1 / std(b);
    for (let i = 0; i < b.length; i++) b[i] *= k;
    return b;
  }

  // Squared distance along one line to the nearest zero of f (Felzenszwalb and Huttenlocher).
  function lowerEnvelope(f, n, d, arg, v, z) {
    let k = 0;
    v[0] = 0;
    z[0] = -Infinity;
    z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) ** 2 + f[v[k]];
      arg[q] = v[k];
    }
  }

  // Distance from every pixel to the nearest feature pixel, and that pixel's row. Without any
  // feature pixel every distance is infinite.
  function distance(feature, W, H) {
    const dist = new Float32Array(W * H);
    const row = new Int32Array(W * H);
    if (!feature.includes(1)) {
      dist.fill(Infinity);
      row.fill(-1);
      return { dist, row };
    }
    const n = Math.max(W, H);
    const f = new Float64Array(n), d = new Float64Array(n), arg = new Int32Array(n);
    const v = new Int32Array(n), z = new Float64Array(n + 1);
    const col = new Float64Array(W * H), colRow = new Int32Array(W * H);
    for (let x = 0; x < W; x++) {
      for (let y = 0; y < H; y++) f[y] = feature[y * W + x] ? 0 : 1e20;
      lowerEnvelope(f, H, d, arg, v, z);
      for (let y = 0; y < H; y++) {
        col[y * W + x] = d[y];
        colRow[y * W + x] = arg[y];
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) f[x] = col[y * W + x];
      lowerEnvelope(f, W, d, arg, v, z);
      for (let x = 0; x < W; x++) {
        dist[y * W + x] = Math.sqrt(d[x]);
        row[y * W + x] = colRow[y * W + arg[x]];
      }
    }
    return { dist, row };
  }

  // scipy's map_coordinates with order 1 and mode "reflect".
  function sample(a, W, H, x, y) {
    const mx = mirror(x, W), my = mirror(y, H);
    const x0 = Math.floor(mx), y0 = Math.floor(my);
    const x1 = Math.min(x0 + 1, W - 1), y1 = Math.min(y0 + 1, H - 1);
    const fx = mx - x0, fy = my - y0;
    return (a[y0 * W + x0] * (1 - fx) + a[y0 * W + x1] * fx) * (1 - fy)
      + (a[y1 * W + x0] * (1 - fx) + a[y1 * W + x1] * fx) * fy;
  }

  function mirror(c, n) {
    const p = 2 * n;
    c = (c + 0.5) % p;
    if (c < 0) c += p;
    if (c >= n) c = p - c;
    return clamp(c - 0.5, 0, n - 1);
  }

  // The standard normal distribution function, from Abramowitz and Stegun 7.1.26.
  function ndtr(x) {
    const z = Math.abs(x) / Math.SQRT2;
    const t = 1 / (1 + 0.3275911 * z);
    const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))))
      * Math.exp(-z * z);
    return x >= 0 ? 1 - erfc / 2 : erfc / 2;
  }

  function gradient(A, W, H) {
    const gx = new Float32Array(W * H), gy = new Float32Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        gx[i] = x === 0 ? A[i + 1] - A[i] : x === W - 1 ? A[i] - A[i - 1] : (A[i + 1] - A[i - 1]) / 2;
        gy[i] = y === 0 ? A[i + W] - A[i] : y === H - 1 ? A[i] - A[i - W] : (A[i + W] - A[i - W]) / 2;
      }
    }
    return { gx, gy };
  }

  function grow(mask, W, H) {
    const out = Uint8Array.from(mask);
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      const x = i % W;
      if (x > 0) out[i - 1] = 1;
      if (x < W - 1) out[i + 1] = 1;
      if (i >= W) out[i - W] = 1;
      if (i < W * (H - 1)) out[i + W] = 1;
    }
    return out;
  }

  function label(mask, W, H) {
    const lab = new Int32Array(mask.length);
    const stack = [];
    let n = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || lab[i]) continue;
      lab[i] = ++n;
      stack.push(i);
      while (stack.length) {
        const j = stack.pop(), x = j % W;
        for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j < W * (H - 1) ? j + W : -1]) {
          if (k >= 0 && mask[k] && !lab[k]) {
            lab[k] = n;
            stack.push(k);
          }
        }
      }
    }
    return { lab, n };
  }

  // Smears noise along a direction field, so it reads as fine wrinkles. Each step keeps the
  // heading of the step before, so the field only has to give the line, not which way along it.
  // Only pixels in `mask` are smeared.
  function streaks(n, W, H, steps, direction, mask) {
    const acc = Float32Array.from(n);
    const d = [0, 0];
    for (let i = 0; i < acc.length; i++) {
      if (!mask[i]) continue;
      const sx = i % W, sy = (i - sx) / W;
      for (let sign = 1; sign >= -1; sign -= 2) {
        let x = sx, y = sy, px = 0, py = 0;
        for (let k = 0; k < steps; k++) {
          direction(x, y, d);
          let dx = d[0], dy = d[1];
          if (k > 0 && dx * px + dy * py < 0) {
            dx = -dx;
            dy = -dy;
          }
          px = dx;
          py = dy;
          x += sign * dx;
          y += sign * dy;
          acc[i] += sample(n, W, H, x, y);
        }
      }
    }
    const k = 1 / std(acc, mask);
    for (let i = 0; i < acc.length; i++) acc[i] *= k;
    return acc;
  }

  // ---------- features ----------

  function ridgeStroke(s, f) {
    const r = random(f.seed), b = s.box;
    const pts = trace(s, b.x0 + f.at[0] * b.w, b.y0 + f.at[1] * b.h, b.w, 0.04, r).reverse(); // outline first
    const n = pts.length;
    const jitter = blur1d(Float64Array.from({ length: n + 8 }, () => r.normal()), 3);
    return pts.map(([x, y], i) => [x, y, f.width * b.w / 2 * (1 - i / n) ** 0.6 * clamp(1 + 0.9 * jitter[i + 4], 0.4, 1.6)]);
  }

  function lineStrokes(s, f) {
    const r = random(f.seed), b = s.box;
    const x = b.x0 + f.at[0] * b.w, y = b.y0 + f.at[1] * b.h, half = Math.floor(f.length * b.w / 2);
    const main = trace(s, x, y, half, 0.08, r, -1).reverse().concat(trace(s, x, y, half, 0.08, r).slice(1));
    const taper = (pts, rad) => pts.map(([px, py], i) => [px, py, rad * Math.sqrt(Math.sin(Math.PI * (i + 0.5) / pts.length))]);
    const strokes = [taper(main, f.width * b.w / 2)];
    for (let k = 0; k < (main.length > 8 ? f.branches : 0); k++) {
      const i = r.int(2, main.length - 2);
      const dx = main[i + 2][0] - main[i - 2][0], dy = main[i + 2][1] - main[i - 2][1];
      const a = Math.atan2(dy, dx) + r.pick([-1, 1]) * r.uniform(0.4, 1) + r.pick([0, Math.PI]);
      const branch = trace(s, main[i][0], main[i][1], Math.floor(r.uniform(0.3, 0.6) * main.length), 0.08, r, 1, [Math.cos(a), Math.sin(a)]);
      if (branch.length) strokes.push(taper(branch, 0.7 * f.width * b.w / 2));
    }
    return strokes;
  }

  function disc(a, W, H, x, y, r) {
    a[clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1)] = 1;
    for (let py = Math.max(0, Math.ceil(y - r)); py <= Math.min(H - 1, Math.floor(y + r)); py++) {
      for (let px = Math.max(0, Math.ceil(x - r)); px <= Math.min(W - 1, Math.floor(x + r)); px++) {
        if ((px - x) ** 2 + (py - y) ** 2 <= r * r) a[py * W + px] = 1;
      }
    }
  }

  // Height of a curve through the middle of the mouth for every column. It has one height per
  // column and is heavily smoothed, so it never turns back on itself. Short pieces of mouth edge,
  // such as a notch where the lips meet at a corner, are left out.
  function mouthGuide(mouth, W, H, w) {
    const guide = new Float64Array(W);
    if (!mouth.includes(1)) return guide;
    const { lab, n } = label(grow(grow(mouth, W, H), W, H), W, H);
    const size = new Float64Array(n + 1);
    for (let i = 0; i < mouth.length; i++) if (mouth[i]) size[lab[i]]++;
    const big = 0.3 * size.reduce((a, b) => Math.max(a, b), 0);
    const count = new Float64Array(W), sum = new Float64Array(W);
    for (let i = 0; i < mouth.length; i++) {
      if (!mouth[i] || size[lab[i]] < big) continue;
      const x = i % W;
      count[x]++;
      sum[x] += (i - x) / W;
    }
    let prev = -1;
    for (let x = 0; x < W; x++) {
      if (!count[x]) continue;
      const y = sum[x] / count[x];
      if (prev < 0) guide.fill(y, 0, x);
      for (let i = prev + 1; prev >= 0 && i < x; i++) guide[i] = guide[prev] + (y - guide[prev]) * (i - prev) / (x - prev);
      guide[x] = y;
      prev = x;
    }
    guide.fill(guide[prev], prev + 1);
    return blur1d(guide, 0.08 * w, true);
  }

  // ---------- recipes ----------

  function newRecipe(seed) {
    return { seed, pressure: 1.1, ridges: [], lines: [], weak: [] };
  }

  function addFeatures(s, rec, counts, seed) {
    const { A, W, box: b } = s;
    const r = random(seed);
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    const spot = () => {
      for (let k = 0; k < 10000; k++) {
        const u = r.uniform(0, 1), v = r.uniform(0, 1);
        if (A[Math.floor(b.y0 + v * b.h) * W + Math.floor(b.x0 + u * b.w)] > 0.5) return [u, v];
      }
      return null;
    };
    for (let k = 0; k < (counts.ridges || 0); k++) {
      const p = spot();
      if (!p) break;
      // Walk out to the outline, then back in to the mouth. On the photo, lower-lip ridges reach
      // up to about two thirds of the way from the outline to the mouth.
      const out = trace(s, b.x0 + p[0] * b.w, b.y0 + p[1] * b.h, b.w, 0, r);
      const [ox, oy] = out[out.length - 1];
      const inward = trace(s, ox, oy, b.w, 0, r, -1);
      const [px, py] = inward[Math.floor(r.uniform(0.15, 0.65) * (inward.length - 1))];
      rec.ridges.push({ at: [r4((px - b.x0) / b.w), r4((py - b.y0) / b.h)], width: r4(r.uniform(0.0025, 0.006)), seed: r.int(0, 1e9) });
    }
    for (let k = 0; k < (counts.lines || 0); k++) {
      const p = spot();
      if (!p) break;
      rec.lines.push({ at: p.map(r4), width: r4(r.uniform(0.0025, 0.005)), length: r4(r.uniform(0.06, 0.16)),
        branches: r.int(1, 5), seed: r.int(0, 1e9) });
    }
    for (let k = 0; k < (counts.weak || 0); k++) {
      const p = spot();
      if (!p) break;
      rec.weak.push({ at: p.map(r4), radius: r4(r.uniform(0.03, 0.08)), strength: r4(r.uniform(0.3, 0.7)) });
    }
    return rec;
  }

  // ---------- render ----------

  function render(s, rec, color) {
    const { A, W, H, box } = s;
    const { x0, y0, w, h } = box;
    const N = W * H;
    const r = random(rec.seed);
    // The band along the mouth takes its variation from its own generator, so changing how the
    // band varies never changes the rest of the print.
    const vary = random(rec.seed + 0x9e3779b9);
    const xOf = (i) => i % W, yOf = (i) => (i - (i % W)) / W;

    // Pressure varies slowly. Ink thins out toward the outer outline, which is the edge the
    // crease direction points out of. The other edges face the mouth. The test is averaged over
    // 3% of the print width of outline, so a small dent in the outer outline stays outer.
    const P = noise(r, W, H, 0.05 * w);
    for (let i = 0; i < N; i++) P[i] = rec.pressure * Math.max(0, 1 + 0.25 * P[i]);
    const { gx, gy } = gradient(A, W, H);
    const edge = new Uint8Array(N), facing = new Float32Array(N), d = [0, 0];
    for (let i = 0; i < N; i++) {
      if (Math.hypot(gx[i], gy[i]) <= 0.1) continue;
      edge[i] = 1;
      across(xOf(i), yOf(i), box, d);
      facing[i] = gx[i] * d[0] + gy[i] * d[1];
    }
    const facingMean = blur(facing, W, H, 0.03 * w), edgeMean = blur(Float32Array.from(edge), W, H, 0.03 * w);
    const outer = new Uint8Array(N), mouth = new Uint8Array(N);
    for (let i = 0; i < N; i++) {
      if (!edge[i]) continue;
      if (facingMean[i] / (edgeMean[i] + 1e-9) < 0) outer[i] = 1;
      else mouth[i] = 1;
    }
    const toOuter = distance(outer, W, H).dist;
    const { dist: toMouth, row: nearestY } = distance(mouth, W, H);
    for (let i = 0; i < N; i++) {
      P[i] *= (0.7 + 0.3 * clamp(toOuter[i] / (0.1 * w), 0, 1)) * clamp(toOuter[i] / (0.02 * w), 0, 1) ** 0.7;
    }

    // Along the mouth each lip prints a band without cracks.
    const ragged = noise(r, W, H, 0.01 * w);
    const depth = noise(vary, W, H, 0.04 * w);
    const band = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      depth[i] = 0.06 * w * Math.exp(0.2 * depth[i]);
      band[i] = clamp((depth[i] - toMouth[i] + 0.01 * w * ragged[i]) / (0.015 * w), 0, 1);
    }

    for (const f of rec.weak) {
      const cx = x0 + f.at[0] * w, cy = y0 + f.at[1] * h, rad = f.radius * w;
      for (let y = Math.max(0, Math.floor(cy - 2 * rad)); y < Math.min(H, cy + 2 * rad); y++) {
        for (let x = Math.max(0, Math.floor(cx - 2 * rad)); x < Math.min(W, cx + 2 * rad); x++) {
          const i = y * W + x, dd = Math.hypot(x - cx, y - cy) / rad;
          P[i] *= 1 - f.strength * clamp(1.5 * (1 - dd) + 0.3 * ragged[i], 0, 1);
        }
      }
    }

    const gap = new Float32Array(N);
    for (const f of rec.ridges) for (const [x, y, rad] of ridgeStroke(s, f)) disc(gap, W, H, x, y, rad);
    for (const f of rec.lines) for (const stroke of lineStrokes(s, f)) for (const [x, y, rad] of stroke) disc(gap, W, H, x, y, rad);
    const gapSoft = blur(gap, W, H, 0.5 + 0.001 * w);
    for (let i = 0; i < N; i++) P[i] *= 1 - (1 - band[i]) * gapSoft[i];

    // Ink reaches the high points of the paper first, so low pressure prints as dots and streaks.
    // The ink film is thinner where the lips pressed lightly.
    const inShape = new Uint8Array(N);
    for (let i = 0; i < N; i++) inShape[i] = A[i] > 0 ? 1 : 0;
    const wrinkles = streaks(noise(r, W, H, 0.0015 * w), W, H, Math.floor(0.008 * w), (x, y, o) => across(x, y, box, o), inShape);
    const paper = noise(r, W, H, 0.001 * w);
    for (let i = 0; i < N; i++) paper[i] = wrinkles[i] + 0.3 * paper[i];
    const paperStd = std(paper, inShape);

    // The band is a continuous ink film whose grain mixes round mottling with short striations.
    // On the photo the upper lip's band has ink from about 0.27 to 0.87 (median 0.51) and the
    // lower lip's from about 0.38 to 0.99 (median 0.75). The upper lip's band is palest next to
    // the mouth and fades raggedly into it. The lower lip keeps a crisp edge, which keeps the
    // corners of the mouth sharp.
    // Striations take their direction from the guide curve, never steeper than 45 degrees, so
    // they run straight past the corners of the mouth instead of wrapping around them.
    const guide = mouthGuide(mouth, W, H, w);
    const slope = new Float64Array(W);
    for (let x = 0; x < W; x++) {
      const g = x === 0 ? guide[1] - guide[0] : x === W - 1 ? guide[x] - guide[x - 1] : (guide[x + 1] - guide[x - 1]) / 2;
      slope[x] = clamp(Math.atan(g), -Math.PI / 4, Math.PI / 4);
    }
    const tx = noise(vary, W, H, 0.008 * w), ty = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const heading = slope[xOf(i)] + 0.2 * tx[i];
      tx[i] = Math.cos(heading);
      ty[i] = Math.sin(heading);
    }
    const inBand = new Uint8Array(N);
    for (let i = 0; i < N; i++) inBand[i] = A[i] > 0 && band[i] > 0 ? 1 : 0;
    const mottle = noise(vary, W, H, 0.002 * w);
    const striae = streaks(noise(vary, W, H, 0.0015 * w), W, H, Math.floor(0.007 * w),
      (x, y, o) => { o[0] = sample(tx, W, H, x, y); o[1] = sample(ty, W, H, x, y); return o; }, inBand);
    const speck = noise(vary, W, H, 0.0006 * w);
    const texture = new Float32Array(N);
    for (let i = 0; i < N; i++) texture[i] = 0.6 * mottle[i] + striae[i] + 0.4 * speck[i];
    const textureStd = inBand.includes(1) ? std(texture, inBand) : 1;
    // The upper lip is where the nearest point of the mouth lies below.
    const upper = new Float32Array(N);
    for (let i = 0; i < N; i++) upper[i] = clamp((nearestY[i] - yOf(i)) / (0.01 * w) + 0.5, 0, 1);
    const upperSoft = blur(upper, W, H, 0.01 * w);
    const toneNoise = noise(vary, W, H, 0.02 * w);

    const [cr, cg, cb] = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
    const out = new Uint8ClampedArray(N * 4);
    for (let i = 0; i < N; i++) {
      out[4 * i] = cr;
      out[4 * i + 1] = cg;
      out[4 * i + 2] = cb;
      if (!A[i]) continue;
      const outside = clamp((P[i] - ndtr(paper[i] / paperStd)) / 0.25, 0, 1) * clamp(0.5 + 0.4 * P[i] + 0.12 * wrinkles[i], 0.25, 1);
      let film = 0;
      if (band[i] > 0) {
        const u = upperSoft[i];
        let tone = (1 - u) * 0.66 + u * (0.5 + 0.15 * Math.min(1, toMouth[i] / depth[i]));
        tone *= clamp(P[i] / rec.pressure, 0, 1.2) * Math.exp(0.08 * toneNoise[i]);
        const fade = 0.45 + 0.55 * clamp(toMouth[i] / (0.012 * w * Math.exp(0.5 * ragged[i])), 0, 1) ** 0.6;
        film = clamp(tone + 0.2 * texture[i] / textureStd, 0, 1) * (1 - u * (1 - fade));
      }
      out[4 * i + 3] = Math.floor(255 * A[i] * ((1 - band[i]) * outside + band[i] * film));
    }
    return { width: W, height: H, data: out };
  }

  root.Kissifier = { shape, newRecipe, addFeatures, render };
})(globalThis);
