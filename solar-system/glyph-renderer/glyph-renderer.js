/* ==========================================================================
   GLYPH RENDERER // a picture drawn in characters
   --------------------------------------------------------------------------
   The screen is a grid of character cells, and every cell is sampled at
   six points (2 x 3). A caller fills the samples with light. Each cell
   then takes the glyph whose shape best matches its six samples (an edge)
   or a glyph from a density ramp (a smooth area), tinted from a hue /
   saturation palette. The grid is drawn on the GPU with WebGL where the
   browser has it, and on a 2D canvas where it does not.

   With the glyphs turned off, the same samples are drawn as a picture
   instead, one pixel of colour a sample, smoothed between samples. The
   cells are then half the size, so the picture has four times as many
   samples.

   A sample can also hold a place on a map instead of a colour, with the
   light that falls on it. Those samples are shaded again each frame from
   the caller's sampler, so a body can turn under a still camera at the
   cost of one texture lookup per sample.

   Clouds of points, such as a nebula's gas or a comet's tails, are added
   up on their own first and their brightness compressed before they join
   the picture.
   ========================================================================== */
(function () {
  'use strict';

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }

  /* ------------------------------------------------------------------------
     Glyphs: an atlas of every glyph in every palette colour, built lazily,
     plus the shape vectors used to match edges
     ------------------------------------------------------------------------ */
  var SHAPE_SET = " .'`^\",:;-_~=+*/\\|()<>";
  var RAMP_SET = " .:-=+*#%@";
  var Q7 = 7;
  // the glyphs: the ones the background stars use, then the shapes and the ramp
  var GLYPHS = (function () {
    var all = " .'`,+*" + SHAPE_SET + RAMP_SET, uniq = '';
    for (var gi = 0; gi < all.length; gi++) if (uniq.indexOf(all[gi]) < 0) uniq += all[gi];
    return uniq;
  })();
  var NG = GLYPHS.length;

  // palette rows: 0 white, then hue x saturation
  var HUE_N = 36, SAT_LV = [0.07, 0.15, 0.25, 0.37, 0.51, 0.67, 0.85], SAT_N = SAT_LV.length;

  function rgbStr(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }

  function rowRGB(row) {
    if (row <= 0 || row > HUE_N * SAT_N) return [255, 255, 255];
    var h = (((row - 1) / SAT_N) | 0) / HUE_N * 6, s = SAT_LV[(row - 1) % SAT_N];
    var i = Math.floor(h), f = h - i, p = 1 - s, q = 1 - s * f, t = 1 - s * (1 - f), c;
    switch (i % 6) {
      case 0: c = [1, t, p]; break; case 1: c = [q, 1, p]; break; case 2: c = [p, 1, t]; break;
      case 3: c = [p, q, 1]; break; case 4: c = [t, p, 1]; break; default: c = [1, p, q];
    }
    return [c[0] * 255, c[1] * 255, c[2] * 255];
  }

  // every palette row's colour, 0 to 1, three to a row
  var PAL = (function () {
    var a = new Float32Array(256 * 3);
    for (var row = 0; row < 256; row++) { var c = rowRGB(row); a[row * 3] = c[0] / 255; a[row * 3 + 1] = c[1] / 255; a[row * 3 + 2] = c[2] / 255; }
    return a;
  })();

  var TONE_N = 2048, TONE_MAX = 2;
  // The tone curve, light to brightness from 0 to 1: a filmic shoulder of
  // strength k, then gamma, read from a table of TONE_N steps up to a light
  // of TONE_MAX.
  function toneTable(k, gamma) {
    var lut = new Float32Array(TONE_N + 1), nrm = k > 0 ? 1 - Math.exp(-k) : 1;
    for (var i = 0; i <= TONE_N; i++) {
      var x = i / TONE_N * TONE_MAX;
      var y = k > 0 ? (1 - Math.exp(-k * x)) / nrm : x;
      lut[i] = Math.pow(Math.min(y, 1.2), gamma);
    }
    return lut;
  }
  var defaultTone = toneTable(2.2, 1.0);
  // A cloud of points whose neighbours lie far apart is spread over a stack
  // of PYR_N coarser grids (see cloudSpread)
  var PYR_N = 6;

  var GL_VS = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  var GL_FS = [
    'precision highp float;',
    'uniform sampler2D uState, uGlyphs, uPal;',
    'uniform vec2 uCell, uGrid; uniform float uH, uNG;',
    'void main() {',
    '  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y), cell = floor(p / uCell);',
    '  vec4 s = texture2D(uState, (cell + 0.5) / uGrid);',
    '  if (s.b == 0.0) { gl_FragColor = vec4(0.0); return; }',
    '  vec2 local = p - cell * uCell;',
    '  float glyph = floor(s.r * 255.0 + 0.5);',
    '  float m = texture2D(uGlyphs, vec2((glyph * uCell.x + local.x) / (uNG * uCell.x), local.y / uCell.y)).a;',
    '  vec3 col = texture2D(uPal, vec2((floor(s.g * 255.0 + 0.5) + 0.5) / 256.0, 0.5)).rgb;',
    '  float a = m * s.b * (255.0 / 252.0);',
    '  gl_FragColor = vec4(col * a, a);',
    '}'].join('\n');

  // without glyphs: the samples as a picture, smoothed between them
  var GL_FS_PIX = [
    'precision highp float;',
    'uniform sampler2D uPix;',
    'uniform vec2 uSpan; uniform float uH;',
    'void main() { gl_FragColor = texture2D(uPix, vec2(gl_FragCoord.x, uH - gl_FragCoord.y) / uSpan); }'].join('\n');
  // Without glyphs the cells are half the size, up to PIX_CELLS of them
  var PIX_CELLS = 120000;

  function create(canvas, opts) {
    opts = opts || {};
    var tune = {
      gamma: 1.0, filmic: 2.2, rampGamma: 2.0, alphaGain: 1.0, alphaPow: 0.6,
      edge: 0.25, edgeRel: 0.55, contrast: 2.0, saturation: 0.92
    };
    if (opts.tune) for (var tk in opts.tune) if (tk in tune) tune[tk] = opts.tune[tk];
    var fontFamily = opts.font || 'monospace', fontWeight = String(opts.weight || '400');
    var glyphsOn = opts.glyphs !== false;

    var ctx = null, mctx = null, dpr = 1;
    var cw = 0, ch = 0, cols = 0, rows = 0, fontPx = 10;
    // the size of a character, which is also the size of a cell while the
    // glyphs are on
    var fcw = 0, fch = 0;
    var W = 0, H = 0;
    // the camera: the point it looks at (T), its right, up and backward
    // directions (R, U, B), the pixels per unit of length (k), and where T
    // sits on the screen as shares of its width and height (ax, ay)
    var view = opts.view || { T: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], B: [0, 0, 1], span: 1, k: 1, ax: 0.5, ay: 0.5 };

    var shapeIdx = [], rampLUT = new Uint8Array(256);
    // how much of a cell each glyph covers, 0 to 1
    var ink = new Float32Array(NG);
    var SHAPE = null;
    var LUT = new Int16Array(1 << 18);
    var pages = [], rowReady = new Uint8Array(256);

    // the palette row for a colour, remembered by its proportions to 1 part in 64
    var rowCache = new Uint8Array(1 << 18).fill(255);
    function rowFor(r, g, b) {
      var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
      if (mx <= 1e-9) return 0;
      var kq = 63.99 / mx, key = (((r * kq) | 0) << 12) | (((g * kq) | 0) << 6) | ((b * kq) | 0), v = rowCache[key];
      if (v === 255) v = rowCache[key] = rowOf(r, g, b, mx);
      return v;
    }
    function rowOf(r, g, b, mx) {
      var mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
      var s = (mx - mn) / mx * tune.saturation;
      if (s < 0.035) return 0;
      var d = mx - mn, h;
      if (mx === r) h = ((g - b) / d) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
      if (h < 0) h += 1;
      var hi = Math.round(h * HUE_N) % HUE_N, si = 0;
      while (si < SAT_N - 1 && s > (SAT_LV[si] + SAT_LV[si + 1]) * 0.5) si++;
      return 1 + hi * SAT_N + si;
    }

    var toneLUT = null;
    function buildTone() { toneLUT = toneTable(tune.filmic, tune.gamma); }
    function tone(x) { return x <= 0 ? 0 : toneLUT[x >= TONE_MAX ? TONE_N : (x * (TONE_N / TONE_MAX)) | 0]; }

    /* ----------------------------------------------------------------------
       Per-sample cache
       ---------------------------------------------------------------------- */
    var nS = 0, nC = 0;
    var bR, bG, bB, dK, dU, dV, dF, cOcc, cHas, dynList, nDyn = 0, cloudR = null, cloudG = null, cloudB = null;
    function allocCache() {
      nC = cols * rows; nS = nC * 6;
      bR = new Float32Array(nS); bG = new Float32Array(nS); bB = new Float32Array(nS);
      dK = new Uint8Array(nS); dU = new Float32Array(nS); dV = new Float32Array(nS); dF = new Float32Array(nS);
      cOcc = new Float32Array(nC); cHas = new Uint8Array(nC); dynList = new Int32Array(nC);
    }
    function clear() { bR.fill(0); bG.fill(0); bB.fill(0); dK.fill(0); cOcc.fill(0); }

    // the caller's sampler for samples that hold a place on a map, and the
    // colour it gives back
    var sampler = null, so = [0, 0, 0];

    // sample centre, in device pixels
    function sampleX(c, k) { return (c + ((k & 1) + 0.5) * 0.5) * cw; }
    function sampleY(r, k) { return (r + ((k >> 1) + 0.5) / 3) * ch; }

    function project(P, out) {
      var dx = P[0] - view.T[0], dy = P[1] - view.T[1], dz = P[2] - view.T[2];
      out[0] = view.ax * W + (dx * view.R[0] + dy * view.R[1] + dz * view.R[2]) * view.k;
      out[1] = view.ay * H - (dx * view.U[0] + dy * view.U[1] + dz * view.U[2]) * view.k;
      out[2] = dx * view.B[0] + dy * view.B[1] + dz * view.B[2];
      return out;
    }

    function addBase(i, r, g, b) { bR[i] += r; bG[i] += g; bB[i] += b; }

    // splat a point into the four nearest samples
    var SX = 1, SY = 1;
    function splat(x, y, r, g, b) {
      var fx = x / SX - 0.5, fy = y / SY - 0.5;
      var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      for (var k = 0; k < 4; k++) {
        var xx = x0 + (k & 1), yy = y0 + (k >> 1);
        if (xx < 0 || yy < 0 || xx >= cols * 2 || yy >= rows * 3) continue;
        var w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty);
        var i = (((yy / 3) | 0) * cols + (xx >> 1)) * 6 + (yy % 3) * 2 + (xx & 1);
        bR[i] += r * w; bG[i] += g * w; bB[i] += b * w;
      }
    }
    // a line from a to b (device px), constant brightness per length
    function line(ax, ay, bx, by, r, g, b) {
      var x0 = -SX, y0 = -SY, x1 = W + SX, y1 = H + SY;
      // clip to the screen (Liang-Barsky)
      var dx = bx - ax, dy = by - ay, t0 = 0, t1 = 1;
      var p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
      for (var i = 0; i < 4; i++) {
        if (p[i] === 0) { if (q[i] < 0) return; continue; }
        var tt = q[i] / p[i];
        if (p[i] < 0) { if (tt > t1) return; if (tt > t0) t0 = tt; }
        else { if (tt < t0) return; if (tt < t1) t1 = tt; }
      }
      var len = Math.sqrt(dx * dx + dy * dy) * (t1 - t0);
      var step = Math.min(SX, SY) * 0.5, n = Math.max(1, Math.ceil(len / step));
      var wgt = len / n / Math.min(SX, SY);
      r *= wgt; g *= wgt; b *= wgt;
      for (var j = 0; j < n; j++) {
        var u = t0 + (t1 - t0) * (j + 0.5) / n;
        splat(ax + dx * u, ay + dy * u, r, g, b);
      }
    }

    /* ----------------------------------------------------------------------
       A cloud of points of light, such as a nebula's gas or a comet's tails,
       is added up on its own first. Each point is spread over the four
       nearest samples. Where a nebula has fewer points than samples its sums
       are blurred by about the distance between points. A comet's points are
       each spread by cloudSpread instead. The brightness is then compressed
       toward a maximum before the cloud joins the picture.
       ---------------------------------------------------------------------- */
    var cloudLo = 0, cloudHi = -1, cloudN = 0;
    function cloudStart() {
      if (!cloudR || cloudR.length !== bR.length) { cloudR = new Float32Array(bR.length); cloudG = new Float32Array(bR.length); cloudB = new Float32Array(bR.length); }
      cloudLo = rows * 3; cloudHi = -1; cloudN = 0;
      sampleMaps();
    }
    // where sample (x, y) of the grid of 2 by 3 samples a cell sits in the
    // per-sample buffers: idxY[y] + idxX[x]
    var idxX = null, idxY = null;
    function sampleMaps() {
      var c2 = cols * 2, r3 = rows * 3, x, y;
      if (idxX && idxX.length === c2 && idxY.length === r3) return;
      idxX = new Int32Array(c2); idxY = new Int32Array(r3);
      for (x = 0; x < c2; x++) idxX[x] = (x >> 1) * 6 + (x & 1);
      for (y = 0; y < r3; y++) idxY[y] = ((y / 3) | 0) * cols * 6 + (y % 3) * 2;
    }
    // a point of light at (x, y) in device pixels
    function cloudAdd(x, y, r, g, b) {
      var c2 = cols * 2, r3 = rows * 3, fx = x * 2 / cw - 0.5, fy = y * 3 / ch - 0.5;
      if (fx < -1 || fy < -1 || fx >= c2 || fy >= r3) return;
      var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
      cloudN++;
      if (y0 < cloudLo) cloudLo = y0;
      if (y0 > cloudHi) cloudHi = y0;
      for (var k = 0; k < 4; k++) {
        var xx = x0 + (k & 1), yy = y0 + (k >> 1);
        if (xx < 0 || yy < 0 || xx >= c2 || yy >= r3) continue;
        var w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty), i = (((yy / 3) | 0) * cols + (xx >> 1)) * 6 + (yy % 3) * 2 + (xx & 1);
        cloudR[i] += r * w; cloudG[i] += g * w; cloudB[i] += b * w;
      }
    }
    // A point whose neighbours lie further apart than a sample, such as a
    // grain far down a comet's tail, is spread over about that distance, f
    // samples. It goes into one of a stack of grids, each with half as many
    // samples across as the one before, the one whose spacing is nearest f.
    // A point between two spacings is shared between both grids. At the end
    // the grids are added up from the coarsest down, each spread smoothly
    // over the next finer one. This keeps the cloud smooth where its points
    // are sparse.
    var pyr = { c2: 0, r3: 0, L: [], used: false }, pyrT = null;
    function cloudSpread(x, y, r, g, b, f) {
      if (!(f > 1)) { cloudAdd(x, y, r, g, b); return; }
      var lv = Math.log2(f), l0 = lv | 0, t = lv - l0;
      if (l0 >= PYR_N) { l0 = PYR_N; t = 0; }
      if (pyr.c2 !== cols * 2 || pyr.r3 !== rows * 3) pyrSetup();
      var fx = x * 2 / cw, fy = y * 3 / ch, u = 1 - t;
      if (l0 === 0) cloudAdd(x, y, r * u, g * u, b * u);
      else pyrSplat(pyr.L[l0], l0, fx, fy, r * u, g * u, b * u);
      if (t > 0) pyrSplat(pyr.L[l0 + 1], l0 + 1, fx, fy, r * t, g * t, b * t);
    }
    function pyrSetup() {
      var c2 = cols * 2, r3 = rows * 3, n = 0;
      pyr = { c2: c2, r3: r3, L: [], used: false };
      for (var l = 1; l <= PYR_N; l++) {
        var w = Math.ceil(c2 / (1 << l)), h = Math.ceil(r3 / (1 << l));
        pyr.L[l] = { w: w, h: h, R: new Float32Array(w * h), G: new Float32Array(w * h), B: new Float32Array(w * h), lo: h, hi: -1 };
        n = Math.max(n, w * h);
      }
      pyrT = [new Float32Array(Math.max(c2 * r3, n)), new Float32Array(Math.max(c2 * r3, n)), new Float32Array(Math.max(c2 * r3, n))];
    }
    // a point into grid L, whose samples are 2^l of the finest across;
    // (fx, fy) is where it falls in finest samples
    function pyrSplat(L, l, fx, fy, r, g, b) {
      var s = 1 / (1 << l), px = fx * s - 0.5, py = fy * s - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), tx = px - x0, ty = py - y0;
      if (x0 < -1 || y0 < -1 || x0 >= L.w || y0 >= L.h) return;
      pyr.used = true;
      if (y0 < L.lo) L.lo = y0;
      if (y0 + 1 > L.hi) L.hi = y0 + 1;
      for (var k = 0; k < 4; k++) {
        var xx = x0 + (k & 1), yy = y0 + (k >> 1);
        if (xx < 0 || yy < 0 || xx >= L.w || yy >= L.h) continue;
        var w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty), i = yy * L.w + xx;
        L.R[i] += r * w; L.G[i] += g * w; L.B[i] += b * w;
      }
    }
    // Each grid spread over the next finer one, from the coarsest down to
    // the one with half as many samples across as the screen. Along each
    // axis a coarse sample gives 3/8 of its light to each of the two fine
    // samples it covers and 1/8 to each of their outer neighbours.
    function pyrEnd() {
      if (!pyr.used) return;
      pyr.used = false;
      for (var l = PYR_N; l >= 2; l--) {
        var L = pyr.L[l], lo = Math.max(L.lo, 0), hi = Math.min(L.hi, L.h - 1);
        L.lo = L.h; L.hi = -1;
        if (hi < lo) continue;
        var F = pyr.L[l - 1], w2 = F.w, w = L.w, src = [L.R, L.G, L.B], dst = [F.R, F.G, F.B];
        var j0 = Math.max(0, 2 * lo - 1), j1 = Math.min(F.h - 1, 2 * hi + 2), x, y, j;
        for (var p = 0; p < 3; p++) {
          var S = src[p], T = pyrT[p], D = dst[p];
          // across, into rows lo to hi of T at the fine width
          for (y = lo; y <= hi; y++) {
            var so2 = y * w, to = (y - lo) * w2;
            for (x = 0; x < w2; x++) {
              var m = x >> 1, n = (x & 1) ? m + 1 : m - 1;
              T[to + x] = 0.375 * S[so2 + m] + (n >= 0 && n < w ? 0.125 * S[so2 + n] : 0);
            }
            for (x = 0; x < w; x++) S[so2 + x] = 0;
          }
          // down, into the fine rows
          for (j = j0; j <= j1; j++) {
            var ma = j >> 1, na = (j & 1) ? ma + 1 : ma - 1, ka = ma >= lo && ma <= hi ? 0.375 : 0, kb = na >= lo && na <= hi ? 0.125 : 0;
            var ta = (ma - lo) * w2, tb = (na - lo) * w2, fo = j * w2;
            for (x = 0; x < w2; x++) D[fo + x] += (ka ? ka * T[ta + x] : 0) + (kb ? kb * T[tb + x] : 0);
          }
        }
        F.lo = Math.min(F.lo, j0); F.hi = Math.max(F.hi, j1);
      }
    }
    // per: how many points fall in a sample over the whole cloud; max: the
    // brightness it is compressed toward. The blur goes by how closely the
    // points that reached the screen lie. Closer in than the blur reaches,
    // each point would stand alone as a bright blot, so the cloud dims to the
    // brightness it has spread out and then fades away.
    function cloudEnd(per, max) {
      var r3 = rows * 3, y0 = clamp(cloudLo, 0, r3 - 1), y1 = clamp(cloudHi + 1, 0, r3 - 1), i;
      var e0 = clamp(Math.floor(cloudLo / 3), 0, rows) * cols * 6, e1 = clamp(Math.floor((cloudHi + 1) / 3) + 1, 0, rows) * cols * 6, lit = 0;
      for (i = e0; i < e1; i++) if (cloudR[i] + cloudG[i] + cloudB[i] > 0) lit++;
      var near = lit ? cloudN / lit : 0;
      if (near < 12 && y1 >= y0) cloudBlur(Math.min(6, Math.round(Math.sqrt(12 / Math.max(near, 0.01)))), y0, y1);
      var fill = clamp(per * 169 / 12, 0, 1), keep = fill * smoothstep(0.04, 0.3, fill), iM = 1 / max;
      // the rows of cells the cloud reached, into the picture and cleared
      for (i = e0; i < e1; i++) {
        var L = (cloudR[i] + cloudG[i] + cloudB[i]) * keep / 3;
        if (L <= 0) { cloudR[i] = cloudG[i] = cloudB[i] = 0; continue; }
        var q = keep / (1 + L * iM);
        bR[i] += cloudR[i] * q; bG[i] += cloudG[i] * q; bB[i] += cloudB[i] * q;
        cloudR[i] = cloudG[i] = cloudB[i] = 0;
      }
    }
    // A cloud whose points were spread by cloudSpread, such as a comet's,
    // into the picture. Its light runs over a far wider range than a
    // nebula's: it is millions of times brighter by a comet's nucleus than
    // at the ends of the tails. The finest of the grids is spread over the
    // samples together with the points added to them directly, the cube
    // root of the brightness is compressed toward max, and gain scales the
    // result. The faintest light, just at the edge of what a character can
    // show, fades out, so it does not scatter single characters over the sky.
    function cometEnd(max, gain) {
      pyrEnd();
      var L = pyr.L[1], has = !!L && L.hi >= L.lo, lo = has ? Math.max(L.lo, 0) : 0, hi = has ? Math.min(L.hi, L.h - 1) : -1;
      var r3 = rows * 3, c2 = cols * 2, y0 = cloudLo, y1 = cloudHi + 1, iM = 1 / max, x, y;
      if (has) { y0 = Math.min(y0, 2 * lo - 1); y1 = Math.max(y1, 2 * hi + 2); }
      y0 = Math.max(y0, 0); y1 = Math.min(y1, r3 - 1);
      var w = has ? L.w : 0, LR = has ? L.R : null, LG = has ? L.G : null, LB = has ? L.B : null;
      for (y = y0; y <= y1; y++) {
        var m = y >> 1, n = (y & 1) ? m + 1 : m - 1, ka = has && m >= lo && m <= hi ? 0.375 : 0, kb = has && n >= lo && n <= hi ? 0.125 : 0;
        var oa = m * w, ob = n * w, by = idxY[y];
        for (x = 0; x < c2; x++) {
          var i = by + idxX[x], r = cloudR[i], g = cloudG[i], b = cloudB[i];
          if (ka + kb > 0) {
            var mx = x >> 1, nx = (x & 1) ? mx + 1 : mx - 1, kn = nx >= 0 && nx < w ? 0.125 : 0;
            if (nx < 0 || nx >= w) nx = mx;
            var a0 = ka * 0.375, a1 = ka * kn, b0 = kb * 0.375, b1 = kb * kn;
            var p00 = oa + mx, p01 = oa + nx, p10 = ob + mx, p11 = ob + nx;
            r += a0 * LR[p00] + a1 * LR[p01] + (kb ? b0 * LR[p10] + b1 * LR[p11] : 0);
            g += a0 * LG[p00] + a1 * LG[p01] + (kb ? b0 * LG[p10] + b1 * LG[p11] : 0);
            b += a0 * LB[p00] + a1 * LB[p01] + (kb ? b0 * LB[p10] + b1 * LB[p11] : 0);
          }
          var Ls = (r + g + b) / 3;
          if (Ls > 0) {
            var L1 = Math.cbrt(Ls), o = gain * L1 / (1 + L1 * iM), q = o / Ls * smoothstep(0.015, 0.05, o);
            bR[i] += r * q; bG[i] += g * q; bB[i] += b * q;
          }
          cloudR[i] = cloudG[i] = cloudB[i] = 0;
        }
      }
      if (has) {
        for (y = lo; y <= hi; y++) for (x = 0; x < w; x++) LR[y * w + x] = LG[y * w + x] = LB[y * w + x] = 0;
        L.lo = L.h; L.hi = -1;
      }
    }
    // two passes of a box blur of radius rad samples, across and down, over
    // the sample rows y0 to y1 of the cloud's sums
    var blurLine = null;
    function cloudBlur(rad, y0, y1) {
      var c2 = cols * 2, r3 = rows * 3, n = Math.max(c2, r3), bufs = [cloudR, cloudG, cloudB], blurX = idxX, blurY = idxY, x, y, k, p;
      if (!blurLine || blurLine.length < n * 2) blurLine = new Float32Array(n * 2);
      var src = blurLine, tmp = blurLine.subarray(n), inv = 1 / (2 * rad + 1);
      // two box passes over len values in src, through tmp and back
      function box(len) {
        for (var pass = 0; pass < 2; pass++) {
          var a = pass ? tmp : src, o = pass ? src : tmp, sum = 0, i;
          for (i = -rad; i <= rad; i++) sum += a[i < 0 ? 0 : i >= len ? len - 1 : i];
          for (i = 0; i < len; i++) {
            o[i] = sum * inv;
            sum += a[i + rad + 1 < len ? i + rad + 1 : len - 1] - a[i - rad > 0 ? i - rad : 0];
          }
        }
      }
      for (p = 0; p < 3; p++) {
        var B = bufs[p], len = y1 - y0 + 1;
        for (y = y0; y <= y1; y++) {
          var by = blurY[y];
          for (x = 0; x < c2; x++) src[x] = B[by + blurX[x]];
          box(c2);
          for (x = 0; x < c2; x++) B[by + blurX[x]] = src[x];
        }
        for (x = 0; x < c2; x++) {
          var bx = blurX[x];
          for (k = 0; k < len; k++) src[k] = B[blurY[y0 + k] + bx];
          box(len);
          for (k = 0; k < len; k++) B[blurY[y0 + k] + bx] = src[k];
        }
      }
    }

    // move a sample's live texture term into its static part
    function freeze(i) {
      sampler(dK[i], dU[i], dV[i], so);
      var f = dF[i];
      bR[i] += so[0] * f; bG[i] += so[1] * f; bB[i] += so[2] * f;
      dK[i] = 0;
    }

    /* ----------------------------------------------------------------------
       Glyph analysis
       ---------------------------------------------------------------------- */
    function glyphFont() { return fontWeight + ' ' + (fontPx * dpr) + 'px ' + fontFamily; }

    function analyseGlyphs() {
      var c = document.createElement('canvas');
      c.width = fcw; c.height = fch;
      var g = c.getContext('2d', { willReadFrequently: true });
      g.font = glyphFont();
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      var raw = new Float32Array(NG * 6), cov = new Float32Array(NG);
      var max = 0, i, k;
      for (i = 0; i < NG; i++) {
        g.clearRect(0, 0, fcw, fch);
        g.fillStyle = '#fff';
        g.fillText(GLYPHS[i], fcw / 2, fch / 2 + fch * 0.04);
        var d = g.getImageData(0, 0, fcw, fch).data;
        for (k = 0; k < 6; k++) {
          var gx = k & 1, gy = k >> 1;
          var xa = Math.floor(gx * fcw / 2), xb = Math.floor((gx + 1) * fcw / 2);
          var ya = Math.floor(gy * fch / 3), yb = Math.floor((gy + 1) * fch / 3);
          var sum = 0, n = 0;
          for (var yy = ya; yy < yb; yy++) for (var xx = xa; xx < xb; xx++) { sum += d[(yy * fcw + xx) * 4 + 3]; n++; }
          var v = n ? sum / n / 255 : 0;
          raw[i * 6 + k] = v; cov[i] += v / 6;
        }
        ink[i] = cov[i];
      }
      shapeIdx = [];
      for (i = 0; i < NG; i++) if (SHAPE_SET.indexOf(GLYPHS[i]) >= 0) shapeIdx.push(i);
      SHAPE = new Float32Array(shapeIdx.length * 6);
      for (i = 0; i < shapeIdx.length; i++) for (k = 0; k < 6; k++) {
        var sv = raw[shapeIdx[i] * 6 + k]; SHAPE[i * 6 + k] = sv; if (sv > max) max = sv;
      }
      for (i = 0; i < SHAPE.length; i++) SHAPE[i] /= max;
      var ramp = [];
      for (i = 0; i < NG; i++) if (RAMP_SET.indexOf(GLYPHS[i]) >= 0) ramp.push(i);
      var maxCov = 0;
      for (i = 0; i < ramp.length; i++) if (cov[ramp[i]] > maxCov) maxCov = cov[ramp[i]];
      for (var m = 0; m < 256; m++) {
        var target = Math.pow(m / 255, tune.rampGamma), best = 0, bd = 1e9;
        for (i = 0; i < ramp.length; i++) {
          var dd = Math.abs(cov[ramp[i]] / maxCov - target);
          if (dd < bd) { bd = dd; best = ramp[i]; }
        }
        rampLUT[m] = best;
      }
      LUT.fill(-1);
    }

    function matchGlyph(key) {
      var cached = LUT[key];
      if (cached >= 0) return cached;
      var v0 = (key & 7) / Q7, v1 = ((key >> 3) & 7) / Q7, v2 = ((key >> 6) & 7) / Q7;
      var v3 = ((key >> 9) & 7) / Q7, v4 = ((key >> 12) & 7) / Q7, v5 = ((key >> 15) & 7) / Q7;
      var best = 0, bd = 1e9;
      for (var i = 0; i < shapeIdx.length; i++) {
        var o = i * 6;
        var e0 = SHAPE[o] - v0, e1 = SHAPE[o + 1] - v1, e2 = SHAPE[o + 2] - v2;
        var e3 = SHAPE[o + 3] - v3, e4 = SHAPE[o + 4] - v4, e5 = SHAPE[o + 5] - v5;
        var d = e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3 + e4 * e4 + e5 * e5;
        if (d < bd) { bd = d; best = shapeIdx[i]; }
      }
      LUT[key] = best;
      return best;
    }

    function resetAtlas() {
      pages = [];
      rowReady.fill(0);
    }
    function ensureRow(row) {
      if (rowReady[row]) return;
      var p = row >> 5, pg = pages[p];
      if (!pg) { pg = pages[p] = document.createElement('canvas'); pg.width = cw * NG; pg.height = ch * 32; }
      var g = pg.getContext('2d');
      g.font = glyphFont();
      g.textBaseline = 'middle';
      g.textAlign = 'center';
      g.fillStyle = rgbStr(rowRGB(row));
      var y = (row & 31) * ch;
      for (var i = 0; i < NG; i++) {
        g.save();
        g.beginPath(); g.rect(i * cw, y, cw, ch); g.clip();
        g.fillText(GLYPHS[i], i * cw + cw / 2, y + ch / 2 + ch * 0.04);
        g.restore();
      }
      rowReady[row] = 1;
    }

    /* ----------------------------------------------------------------------
       Drawing the grid on the GPU. Each cell's glyph, colour row and opacity
       are kept in a texture one texel per cell, and one pass of a fragment
       shader draws every character from a texture of the glyphs and one of
       the palette. That costs the same however many characters change. A
       browser without WebGL gets the 2D canvas, which draws changed cells one
       at a time from an atlas of glyph images.

       Without glyphs, the picture is kept in a texture one texel per sample,
       which the GPU stretches over the canvas and smooths. The 2D canvas
       keeps it in an image of its own and stretches that.
       ---------------------------------------------------------------------- */
    var gl = null, glProg = null, glPixProg = null, glTex = null, glBytes = null, glDirty = false, glLoc = null, glPixLoc = null;
    function glStart() {
      var g = null;
      try { g = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch (e) { g = null; }
      if (!g) return false;
      var hp = g.getShaderPrecisionFormat(g.FRAGMENT_SHADER, g.HIGH_FLOAT);
      if (!hp || hp.precision < 20) return false;
      function sh(type, src) { var o = g.createShader(type); g.shaderSource(o, src); g.compileShader(o); return g.getShaderParameter(o, g.COMPILE_STATUS) ? o : null; }
      function program(fsSrc) {
        var vs = sh(g.VERTEX_SHADER, GL_VS), fs = sh(g.FRAGMENT_SHADER, fsSrc);
        if (!vs || !fs) return null;
        var pr = g.createProgram();
        g.attachShader(pr, vs); g.attachShader(pr, fs);
        g.bindAttribLocation(pr, 0, 'aPos');
        g.linkProgram(pr);
        return g.getProgramParameter(pr, g.LINK_STATUS) ? pr : null;
      }
      var pr = program(GL_FS), pp = program(GL_FS_PIX);
      if (!pr || !pp) return false;
      var buf = g.createBuffer();
      g.bindBuffer(g.ARRAY_BUFFER, buf);
      g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
      g.enableVertexAttribArray(0); g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
      // the cells' states, the glyphs, the palette, and the picture drawn without glyphs
      glTex = [0, 1, 2, 3].map(function (unit) {
        var t = g.createTexture(), filter = unit === 3 ? g.LINEAR : g.NEAREST;
        g.activeTexture(g.TEXTURE0 + unit); g.bindTexture(g.TEXTURE_2D, t);
        [g.TEXTURE_MIN_FILTER, g.TEXTURE_MAG_FILTER].forEach(function (k) { g.texParameteri(g.TEXTURE_2D, k, filter); });
        [g.TEXTURE_WRAP_S, g.TEXTURE_WRAP_T].forEach(function (k) { g.texParameteri(g.TEXTURE_2D, k, g.CLAMP_TO_EDGE); });
        return t;
      });
      glLoc = {};
      ['uState', 'uGlyphs', 'uPal', 'uCell', 'uGrid', 'uH', 'uNG'].forEach(function (n) { glLoc[n] = g.getUniformLocation(pr, n); });
      g.useProgram(pr);
      g.uniform1i(glLoc.uState, 0); g.uniform1i(glLoc.uGlyphs, 1); g.uniform1i(glLoc.uPal, 2);
      glPixLoc = {};
      ['uPix', 'uSpan', 'uH'].forEach(function (n) { glPixLoc[n] = g.getUniformLocation(pp, n); });
      g.useProgram(pp);
      g.uniform1i(glPixLoc.uPix, 3);
      g.disable(g.BLEND);
      gl = g; glProg = pr; glPixProg = pp;
      return true;
    }
    // the palette's colours, one texel a row
    function glPalette() {
      var d = new Uint8Array(256 * 4);
      for (var r = 0; r < 256; r++) {
        var c = rowRGB(r);
        d[r * 4] = Math.round(c[0]); d[r * 4 + 1] = Math.round(c[1]); d[r * 4 + 2] = Math.round(c[2]); d[r * 4 + 3] = 255;
      }
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, glTex[2]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
      glDirty = true;
    }
    // a new grid: the glyphs drawn white at its size, and an empty state
    // texture, or without glyphs an empty picture
    function glGrid() {
      if (!glyphsOn) {
        gl.useProgram(glPixProg);
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, glTex[3]);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, PW, PH, 0, gl.RGBA, gl.UNSIGNED_BYTE, pxBytes);
        gl.uniform2f(glPixLoc.uSpan, cols * cw, rows * ch); gl.uniform1f(glPixLoc.uH, H);
        glDirty = true;
        return;
      }
      gl.useProgram(glProg);
      var c = document.createElement('canvas');
      c.width = cw * NG; c.height = ch;
      var g = c.getContext('2d');
      g.font = glyphFont(); g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#fff';
      for (var i = 0; i < NG; i++) {
        g.save(); g.beginPath(); g.rect(i * cw, 0, cw, ch); g.clip();
        g.fillText(GLYPHS[i], i * cw + cw / 2, ch / 2 + ch * 0.04);
        g.restore();
      }
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, glTex[1]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
      glBytes = new Uint8Array(cols * rows * 4);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, glTex[0]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, glBytes);
      gl.uniform2f(glLoc.uCell, cw, ch); gl.uniform2f(glLoc.uGrid, cols, rows); gl.uniform1f(glLoc.uH, H); gl.uniform1f(glLoc.uNG, NG);
      glPalette();
    }
    function glPresent() {
      glDirty = false;
      gl.viewport(0, 0, W, H);
      if (glyphsOn) {
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, glTex[0]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, glBytes);
      } else {
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, glTex[3]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PW, PH, gl.RGBA, gl.UNSIGNED_BYTE, pxBytes);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* ----------------------------------------------------------------------
       Drawing cells
       ---------------------------------------------------------------------- */
    var cellState = null, drawn = 0, bg = null;
    var v6 = new Float32Array(6);

    // A cell's state packs its glyph in bits 0-6, its palette row in bits 7-14
    // and its opacity in bits 15-20. On the 2D canvas, while the camera moves,
    // most cells that change keep their glyph and colour and move one step of
    // opacity out of 63. Those are left as they are, which saves most of the
    // canvas calls, and the picture drawn once the camera stops puts them
    // right. On the GPU a changed cell costs nothing extra, so all are drawn.
    function putCell(cell, state) {
      var old = cellState[cell];
      if (old === state) return;
      if (!gl && api.moving && old && state && ((old ^ state) & 0x7fff) === 0 && Math.abs((old >> 15) - (state >> 15)) === 1) { api.coarse = true; return; }
      cellState[cell] = state;
      if (gl) {
        var o = cell * 4;
        glBytes[o] = state & 127; glBytes[o + 1] = (state >> 7) & 255; glBytes[o + 2] = ((state >> 15) & 63) * 4;
        glDirty = true;
        if (state) drawn++;
        return;
      }
      var c = cell % cols, r = (cell / cols) | 0, x = c * cw, y = r * ch;
      ctx.clearRect(x, y, cw, ch);
      if (state) {
        var row = (state >> 7) & 255;
        ensureRow(row);
        ctx.globalAlpha = ((state >> 15) & 63) / 63;
        ctx.drawImage(pages[row >> 5], (state & 127) * cw, (row & 31) * ch, cw, ch, x, y, cw, ch);
        drawn++;
      }
    }

    // A cell's opacity, in 64 levels, is round(alphaGain * mean ^ alphaPow * 63)
    // of its mean brightness. The brightness at which each level starts is
    // worked out once, so a cell finds its level by bisection with no Math.pow.
    var aStart = new Float64Array(65), aGain = NaN, aPow = NaN;
    function alphaLevel(mean) {
      if (tune.alphaGain !== aGain || tune.alphaPow !== aPow) {
        aGain = tune.alphaGain; aPow = tune.alphaPow;
        for (var j = 1; j < 64; j++) aStart[j] = Math.pow((j - 0.5) / 63 / aGain, 1 / aPow);
        aStart[64] = Infinity;
      }
      var lo = 0, hi = 64;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (mean >= aStart[mid]) lo = mid; else hi = mid; }
      return lo;
    }

    function drawCell(cell) {
      if (!cHas[cell]) {
        putCell(cell, cOcc[cell] < 0.35 && bg ? bg.state(cell) : 0);
        return;
      }
      var o = cell * 6, sumL = 0, maxL = 0, minL = 9, ar = 0, ag = 0, ab = 0;
      for (var k = 0; k < 6; k++) {
        var i = o + k, r = bR[i], g = bG[i], b = bB[i];
        var kk = dK[i];
        if (kk) {
          // a sample that stands in for the one before it has its colour already
          if (!(k & 1) || dK[i - 1] !== kk || dU[i] !== dU[i - 1] || dV[i] !== dV[i - 1]) sampler(kk, dU[i], dV[i], so);
          var f = dF[i];
          r += so[0] * f; g += so[1] * f; b += so[2] * f;
        }
        var l = tone(0.2126 * r + 0.7152 * g + 0.0722 * b);
        v6[k] = l; sumL += l;
        if (l > maxL) maxL = l;
        if (l < minL) minL = l;
        ar += r; ag += g; ab += b;
      }
      var state = 0;
      if (maxL >= 0.035) {
        var gi, mean = sumL / 6, spread = maxL - minL;
        if (spread > tune.edge && spread > tune.edgeRel * maxL) {
          var key = 0;
          for (k = 0; k < 6; k++) {
            var vr = v6[k] / maxL, q = maxL * (tune.contrast === 2 ? vr * vr : Math.pow(vr, tune.contrast));
            key |= Math.round(clamp(q, 0, 1) * Q7) << (k * 3);
          }
          gi = matchGlyph(key);
        } else {
          gi = rampLUT[clamp(Math.round(mean * 255), 0, 255)];
        }
        if (gi) {
          var aq = alphaLevel(mean);
          if (aq) state = gi | (rowFor(ar, ag, ab) << 7) | (aq << 15);
        }
      }
      if (!state && cOcc[cell] < 0.35 && bg) state = bg.state(cell);
      putCell(cell, state);
    }

    /* ----------------------------------------------------------------------
       Drawing cells without glyphs. Each sample becomes one pixel of the
       picture, its brightest channel put through the tone curve and the
       others scaled with it, so a colour keeps its hue. Where the background
       shows, its character becomes a point of light in the middle of the
       cell, as bright as the character's ink and opacity, so a star keeps
       its colour and its twinkle.
       ---------------------------------------------------------------------- */
    var PW = 0, PH = 0, pxBytes = null, pxCanvas = null, pxCtx = null, pxImg = null;
    // a point of light from a background character: its ink, times STAR_INK, up to 1
    var STAR_INK = 8;
    function pixAlloc() {
      PW = cols * 2; PH = rows * 3;
      if (glyphsOn) { pxBytes = pxImg = null; return; }
      if (gl) { pxBytes = new Uint8Array(PW * PH * 4); return; }
      if (!pxCanvas) { pxCanvas = document.createElement('canvas'); pxCtx = pxCanvas.getContext('2d'); }
      pxCanvas.width = PW; pxCanvas.height = PH;
      pxImg = pxCtx.createImageData(PW, PH); pxBytes = pxImg.data;
    }
    function drawPix(cell) {
      var o = cell * 6, c = cell % cols, r = (cell / cols) | 0, has = cHas[cell], lit = 0;
      var st = cOcc[cell] < 0.35 && bg ? bg.state(cell) : 0, pr = 0, pg = 0, pb = 0;
      if (st) {
        var row = (st >> 7) & 255, v = ((st >> 15) & 63) / 63 * Math.min(1, ink[st & 127] * STAR_INK);
        pr = PAL[row * 3] * v; pg = PAL[row * 3 + 1] * v; pb = PAL[row * 3 + 2] * v;
      }
      for (var k = 0; k < 6; k++) {
        var i = o + k, rr = 0, gg = 0, bb = 0;
        if (has) {
          rr = bR[i]; gg = bG[i]; bb = bB[i];
          var kk = dK[i];
          if (kk) {
            if (!(k & 1) || dK[i - 1] !== kk || dU[i] !== dU[i - 1] || dV[i] !== dV[i - 1]) sampler(kk, dU[i], dV[i], so);
            var f = dF[i];
            rr += so[0] * f; gg += so[1] * f; bb += so[2] * f;
          }
          if (rr < 0) rr = 0;
          if (gg < 0) gg = 0;
          if (bb < 0) bb = 0;
          // the brightest channel through the tone curve, the others in proportion
          var hi = rr > gg ? (rr > bb ? rr : bb) : (gg > bb ? gg : bb);
          if (hi > 1e-6) { var t = tone(hi) / hi; rr *= t; gg *= t; bb *= t; }
        }
        if (st && (k === 2 || k === 3)) { rr += pr; gg += pg; bb += pb; }
        var mx = rr > gg ? (rr > bb ? rr : bb) : (gg > bb ? gg : bb);
        if (mx > 1) { rr /= mx; gg /= mx; bb /= mx; mx = 1; }
        if (mx > 0.01) lit = 1;
        // the GPU's texture holds the colour times its opacity, the 2D canvas's image the colour alone
        var q = ((r * 3 + (k >> 1)) * PW + c * 2 + (k & 1)) * 4, m = gl ? 255 : mx > 0 ? 255 / mx : 0;
        pxBytes[q] = rr * m + 0.5; pxBytes[q + 1] = gg * m + 0.5; pxBytes[q + 2] = bb * m + 0.5; pxBytes[q + 3] = mx * 255 + 0.5;
      }
      if (lit) drawn++;
      glDirty = true;
    }
    // the picture onto the 2D canvas, stretched to the grid and smoothed
    function pixPresent() {
      glDirty = false;
      pxCtx.putImageData(pxImg, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(pxCanvas, 0, 0, PW, PH, 0, 0, cols * cw, rows * ch);
    }

    // the whole screen once, finding on the way which cells hold anything
    // and which need shading again each frame
    function compose(background) {
      bg = background || null;
      if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawn = 0; nDyn = 0;
      for (var c = 0; c < nC; c++) {
        var has = 0, dyn = 0, o = c * 6;
        for (var k = 0; k < 6; k++) {
          if (dK[o + k]) dyn = 1;
          if (bR[o + k] + bG[o + k] + bB[o + k] > 0.003) has = 1;
        }
        cHas[c] = has || dyn;
        if (dyn) dynList[nDyn++] = c;
        if (glyphsOn) drawCell(c); else drawPix(c);
      }
      api.drawn = drawn;
    }
    // the cells that show a map shaded again, and the background's cells
    // when it twinkles
    function update(background, twinkle) {
      bg = background || null;
      drawn = 0;
      if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);
      for (var d = 0; d < nDyn; d++) { if (glyphsOn) drawCell(dynList[d]); else drawPix(dynList[d]); }
      if (twinkle && bg) {
        var cells = bg.cells;
        for (var s = 0; s < cells.length; s++) {
          var cell = cells[s];
          if (!cHas[cell] && cOcc[cell] < 0.35) { if (glyphsOn) putCell(cell, bg.state(cell)); else drawPix(cell); }
        }
      }
      if (ctx) ctx.globalAlpha = 1;
      api.drawn = drawn;
    }
    // The grid onto the GPU's canvas, or the picture drawn without glyphs
    // onto either canvas, if anything changed. True if it was drawn.
    function present() {
      if (!glDirty) return false;
      if (gl) glPresent();
      else if (!glyphsOn) pixPresent();
      else return false;
      return true;
    }

    /* ----------------------------------------------------------------------
       Size and font
       ---------------------------------------------------------------------- */
    // the font and cell the glyphs were last analysed for, which a new
    // canvas size alone does not change
    var analysedFor = '';
    function setFont(px, force) {
      if (force === true) analysedFor = '';
      fontPx = px;
      mctx.font = glyphFont();
      fcw = Math.max(2, Math.round(mctx.measureText('M').width));
      fch = Math.round(fontPx * dpr * 1.22);
      cw = fcw; ch = fch;
      if (!glyphsOn) {
        // half the size, or larger where that would make more than PIX_CELLS cells
        var f = Math.min(1, Math.max(0.5, Math.sqrt(W * H / (fcw * fch * PIX_CELLS))));
        cw = Math.max(2, Math.round(fcw * f)); ch = Math.max(3, Math.round(fch * f));
      }
      SX = cw / 2; SY = ch / 3;
      cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
      cellState = new Int32Array(cols * rows);
      allocCache();
      pixAlloc();
      var glyphKey = glyphFont() + ' ' + fcw + 'x' + fch;
      if (glyphKey !== analysedFor) { analysedFor = glyphKey; analyseGlyphs(); }
      glDirty = false;
      if (gl) glGrid();
      else { resetAtlas(); ctx.clearRect(0, 0, W, H); }
      publish();
    }
    function resize(cssW, cssH, ratio, px, force) {
      if (force === true) analysedFor = '';
      dpr = ratio || 1;
      W = Math.round(cssW * dpr); H = Math.round(cssH * dpr);
      canvas.width = W; canvas.height = H;
      canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
      setFont(px || fontPx);
    }
    // Turns the glyphs off or on. The grid's cells change size, so the
    // caller fills the samples and draws again, as after setFont.
    function setGlyphs(on) {
      on = on !== false;
      if (on === glyphsOn) return;
      glyphsOn = on; api.glyphs = on;
      if (W && H) setFont(fontPx);
    }
    // the size of a character for a font size in CSS pixels, in device
    // pixels, which is the size of a cell while the glyphs are on
    function cellSize(px) {
      mctx.font = fontWeight + ' ' + (px * dpr) + 'px ' + fontFamily;
      return [Math.max(2, Math.round(mctx.measureText('M').width)), Math.round(px * dpr * 1.22)];
    }

    // Fill every sample from scene(x, y, out) and draw the grid: the
    // simplest way to use the renderer. x and y are CSS pixels from the
    // canvas's top left, and scene writes the light there into out.
    function draw(scene) {
      clear();
      var out = [0, 0, 0], i = 0;
      for (var r = 0; r < rows; r++) for (var c = 0; c < cols; c++) for (var k = 0; k < 6; k++, i++) {
        out[0] = out[1] = out[2] = 0;
        scene(sampleX(c, k) / dpr, sampleY(r, k) / dpr, out);
        bR[i] = out[0]; bG[i] = out[1]; bB[i] = out[2];
      }
      compose(null);
      present();
    }

    var api = {
      canvas: canvas, view: view, tune: tune, gl: false, glyphs: glyphsOn,
      W: 0, H: 0, dpr: 1, cw: 0, ch: 0, cols: 0, rows: 0, fontPx: fontPx,
      red: null, green: null, blue: null, tex: null, texU: null, texV: null, texF: null, cover: null,
      drawn: 0, moving: false, coarse: false, spreadLevels: PYR_N,
      resize: resize, setFont: setFont, setGlyphs: setGlyphs, cellSize: cellSize,
      font: function (px) { return fontWeight + ' ' + ((px == null ? fontPx : px) * dpr) + 'px ' + fontFamily; },
      draw: draw, clear: clear, compose: compose, update: update, present: present,
      sampleX: sampleX, sampleY: sampleY, add: addBase, splat: splat, line: line, project: project,
      cloudStart: cloudStart, cloudAdd: cloudAdd, cloudSpread: cloudSpread, cloudEnd: cloudEnd, cometEnd: cometEnd,
      setSampler: function (fn) { sampler = fn; },
      freeze: freeze,
      glyph: function (chr) { return GLYPHS.indexOf(chr); },
      colourRow: rowFor,
      pack: function (glyph, row, alpha) { return glyph | (row << 7) | (alpha << 15); },
      tone: tone
    };
    function publish() {
      api.W = W; api.H = H; api.dpr = dpr; api.cw = cw; api.ch = ch; api.cols = cols; api.rows = rows; api.fontPx = fontPx;
      api.red = bR; api.green = bG; api.blue = bB; api.tex = dK; api.texU = dU; api.texV = dV; api.texF = dF; api.cover = cOcc;
    }
    Object.defineProperty(api, 'view', { get: function () { return view; }, set: function (v) { view = v; }, enumerable: true });

    mctx = document.createElement('canvas').getContext('2d');
    if (!glStart()) {
      gl = null;
      ctx = canvas.getContext('2d');
      // A canvas that has handed out a WebGL context cannot give a 2D one,
      // so when WebGL failed after that point a fresh copy takes its place.
      if (!ctx) {
        var fresh = canvas.cloneNode(false);
        canvas.replaceWith(fresh);
        canvas = fresh;
        ctx = canvas.getContext('2d');
      }
    }
    api.canvas = canvas;
    api.gl = !!gl;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
    canvas.addEventListener('webglcontextrestored', function () { if (glStart()) { setFont(fontPx); } });
    buildTone();
    allocCache();
    publish();
    return api;
  }

  window.GlyphRenderer = {
    create: create,
    // the tone curve with the default settings, for pictures drawn without a renderer
    tone: function (x) { return x <= 0 ? 0 : defaultTone[x >= TONE_MAX ? TONE_N : (x * (TONE_N / TONE_MAX)) | 0]; }
  };
})();
