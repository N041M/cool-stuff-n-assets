/* ==========================================================================
   DEEP SKY GLYPHS // the galaxy, the nebulae and the black hole drawn with
   the glyph renderer
   --------------------------------------------------------------------------
   Each function adds one object's light to a renderer's samples, seen
   through the renderer's camera (its view). It needs deep-sky.js and a
   renderer from glyph-renderer.js.
   ========================================================================== */
(function () {
  'use strict';

  var DS = window.DeepSky;
  if (!DS) return;

  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  /* ------------------------------------------------------------------------
     The galaxy: its stars drawn one by one, and the bulge and bar as
     glowing ellipsoids. frame says where the galaxy sits in the camera's
     space: its axes x, y and z as unit vectors, its centre, the length of a
     kiloparsec (unit), and toScene(x, y, z), which turns galactocentric
     kiloparsecs into a point there. Left out, the camera's space is
     galactocentric kiloparsecs.
     ------------------------------------------------------------------------ */
  var OWN = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1], centre: [0, 0, 0], unit: 1, toScene: function (x, y, z) { return [x, y, z]; } };
  var galBlobs = null, blobsFor = null;
  function galSetup(GAL) {
    if (galBlobs && blobsFor === GAL) return;
    var KPC = GAL.unit;
    function galDir(v) {
      var X = GAL.x, Y = GAL.y, Z = GAL.z;
      return [v[0] * X[0] + v[1] * Y[0] + v[2] * Z[0], v[0] * X[1] + v[1] * Y[1] + v[2] * Z[1], v[0] * X[2] + v[1] * Y[2] + v[2] * Z[2]];
    }
    var G = DS.galaxy, ca = Math.cos(G.barAngle * DEG), sa = Math.sin(G.barAngle * DEG);
    // along the bar (its near end at positive longitude), across it, and up
    var A = galDir([-ca, sa, 0]), Bv = galDir([sa, ca, 0]), Z = GAL.z;
    galBlobs = G.blobs.map(function (o) {
      var s = [o[1] * KPC, o[2] * KPC, o[3] * KPC], S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      [A, Bv, Z].forEach(function (e, k) {
        for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) S[i * 3 + j] += s[k] * s[k] * e[i] * e[j];
      });
      return { c: GAL.toScene(-ca * o[0], sa * o[0], 0), S: S, s3: s[0] * s[1] * s[2], sz: s[2], amp: o[4] };
    });
    blobsFor = GAL;
  }
  // opts.alpha: how much of it shows, 0 to 1. opts.gain and opts.points:
  // the brightness of the bulge and of the stars.
  function drawGalaxy(T, frame, opts) {
    var GAL = frame || OWN, KPC = GAL.unit;
    opts = opts || {};
    var al = opts.alpha == null ? 1 : opts.alpha;
    galSetup(GAL);
    var view = T.view, W = T.W, H = T.H, cw = T.cw, ch = T.ch, cols = T.cols, rows = T.rows, bR = T.red, bG = T.green, bB = T.blue;
    var sampleX = T.sampleX, sampleY = T.sampleY, addBase = T.add;
    var gain = (opts.gain == null ? 2.5 : opts.gain) * al, r, c, k, i;
    // the bulge and bar: a Gaussian ellipsoid seen along any line is a
    // Gaussian on the screen, its spread the ellipsoid's projected onto it
    var R = view.R, U = view.U, kk = view.k, P = [0, 0, 0], col = DS.galaxy.blobColour;
    for (var bi = 0; bi < galBlobs.length; bi++) {
      var G = galBlobs[bi], S = G.S;
      var SR = [S[0] * R[0] + S[1] * R[1] + S[2] * R[2], S[3] * R[0] + S[4] * R[1] + S[5] * R[2], S[6] * R[0] + S[7] * R[1] + S[8] * R[2]];
      var SU = [S[0] * U[0] + S[1] * U[1] + S[2] * U[2], S[3] * U[0] + S[4] * U[1] + S[5] * U[2], S[6] * U[0] + S[7] * U[1] + S[8] * U[2]];
      var rr = dot(R, SR), uu = dot(U, SU), ru = dot(R, SU), det = rr * uu - ru * ru;
      // its peak along the line of sight against its peak seen face-on
      var peak = G.amp * gain * (G.s3 / Math.sqrt(det)) / G.sz;
      var Sxx = rr * kk * kk, Syy = uu * kk * kk, Sxy = -ru * kk * kk, dpx = Sxx * Syy - Sxy * Sxy;
      T.project(G.c, P);
      var hx = 4.3 * Math.sqrt(Sxx), hy = 4.3 * Math.sqrt(Syy);
      var c0 = clamp(Math.floor((P[0] - hx) / cw), 0, cols), c1 = clamp(Math.ceil((P[0] + hx) / cw), 0, cols);
      var r0 = clamp(Math.floor((P[1] - hy) / ch), 0, rows), r1 = clamp(Math.ceil((P[1] + hy) / ch), 0, rows);
      for (r = r0; r < r1; r++) for (c = c0; c < c1; c++) for (k = 0; k < 6; k++) {
        var dx = sampleX(c, k) - P[0], dy = sampleY(r, k) - P[1];
        var q = (Syy * dx * dx - 2 * Sxy * dx * dy + Sxx * dy * dy) / dpx;
        if (q > 18) continue;
        var v = peak * Math.exp(-0.5 * q);
        addBase((r * cols + c) * 6 + k, v * col[0], v * col[1], v * col[2]);
      }
    }
    // The stars kept as points. Their light is scaled to the area a sample
    // covers, so the field keeps its brightness on any screen and as the
    // camera comes closer, until each star is 60 times as bright as it is
    // in the whole view.
    var Pt = DS.galaxy.points();
    if (!Pt) return false;
    var pos = Pt.pos, pc = Pt.col, X = GAL.x, Y = GAL.y, Z = GAL.z, C = GAL.centre, Tv = view.T;
    var dC = [C[0] - Tv[0], C[1] - Tv[1], C[2] - Tv[2]], kp = kk * KPC;
    var ox = view.ax * W + kk * dot(dC, R), oy = view.ay * H - kk * dot(dC, U);
    var xx = kp * dot(X, R), xy = kp * dot(Y, R), xz = kp * dot(Z, R), yx = -kp * dot(X, U), yy = -kp * dot(Y, U), yz = -kp * dot(Z, U);
    // The points are in no particular order, so far out every few of them,
    // that much brighter, stand for all of them.
    var sam = rows * 3 / 200, zoomIn = Math.pow(40 * KPC / view.span, 2), zoom = Math.min(zoomIn, 60);
    var stride = clamp(Math.round(3 / Math.sqrt(zoomIn)), 1, 3);
    var pg = (opts.points == null ? 0.0055 : opts.points) * al * zoom * sam * sam * stride * Pt.colScale;
    // each star goes into the one sample it falls in, so it stays a crisp dot
    var cols2 = cols * 2, rows3 = rows * 3, isx = 2 / cw, isy = 3 / ch;
    for (i = 0; i < Pt.n; i += stride) {
      var o3 = i * 3, gx = pos[o3], gy = pos[o3 + 1], gz = pos[o3 + 2];
      var sx = ((ox + xx * gx + xy * gy + xz * gz) * isx) | 0;
      if (sx < 0 || sx >= cols2) continue;
      var sy = ((oy + yx * gx + yy * gy + yz * gz) * isy) | 0;
      if (sy < 0 || sy >= rows3) continue;
      var si = (((sy / 3) | 0) * cols + (sx >> 1)) * 6 + (sy % 3) * 2 + (sx & 1);
      bR[si] += pc[o3] * pg; bG[si] += pc[o3 + 1] * pg; bB[si] += pc[o3 + 2] * pg;
    }
    return true;
  }

  /* ------------------------------------------------------------------------
     Nebulae and the Pleiades: their gas projected point by point and
     spread over the four nearest samples, and the stars in them each in
     one sample, the bright ones with a small glow round it. The gas keeps
     its brightness per area as the camera comes closer or goes away, so
     from far off a nebula is a faint smudge, and a soft glow the size of
     its dot takes over from it. A nebula's light runs from faint wisps to a
     core thousands of times brighter, so the gas is added up on its own
     first and its brightness compressed, as a photograph of a nebula is.

     n.key names the nebula. n.x and n.y are its centre in device pixels,
     n.radius its radius there and n.dot the radius of its dot from far
     off. n.frame holds u (right), v (up) and w (toward the camera) as unit
     vectors, the nebula's own frame as seen from the Earth with north up.
     n.alpha, n.glow, n.gain, n.max and n.stars set how much shows, the
     glow's colour, the gas's brightness, the brightness it is compressed
     toward and the stars' brightness. It returns false while the nebula's
     points are still to be made (DeepSky.nebula.prepare).
     ------------------------------------------------------------------------ */
  function drawNebula(T, n) {
    var cat = DS.nebula.catalogue[n.key];
    var al = n.alpha == null ? 1 : n.alpha, rp = n.radius, gc = n.glow || cat.colour, rd = n.dot == null ? rp : n.dot;
    var cw = T.cw, ch = T.ch, cols = T.cols, rows = T.rows, view = T.view, bR = T.red, bG = T.green, bB = T.blue;
    var sampleX = T.sampleX, sampleY = T.sampleY, addBase = T.add;
    if (al < 0.02) return true;
    var far = 1 - smoothstep(1.5 * ch, 6 * ch, rp), r, c, k;
    if (far > 0.01) {
      // the glow: a soft spot the size of the dot
      var wg = Math.max(0.45 * rd, 0.5 * ch), reach = 3.5 * wg, amp = 0.45 * far * al;
      var c0 = clamp(Math.floor((n.x - reach) / cw), 0, cols), c1 = clamp(Math.ceil((n.x + reach) / cw), 0, cols);
      var r0 = clamp(Math.floor((n.y - reach) / ch), 0, rows), r1 = clamp(Math.ceil((n.y + reach) / ch), 0, rows);
      for (r = r0; r < r1; r++) for (c = c0; c < c1; c++) for (k = 0; k < 6; k++) {
        var dx = sampleX(c, k) - n.x, dy = sampleY(r, k) - n.y, v = amp * Math.exp(-(dx * dx + dy * dy) / (2 * wg * wg));
        if (v > 0.004) addBase((r * cols + c) * 6 + k, v * gc[0], v * gc[1], v * gc[2]);
      }
    }
    if (far > 0.99) return true;
    var M = DS.nebula.points(n.key);
    if (!M) return false;
    var f = n.frame, R = view.R, U = view.U, i, o;
    var ux = rp * dot(f.u, R), vx = rp * dot(f.v, R), wx = rp * dot(f.w, R), uy = -rp * dot(f.u, U), vy = -rp * dot(f.v, U), wy = -rp * dot(f.w, U);
    // with many points to a sample, every few of them, that much brighter, stand for all of them
    var area = Math.PI * rp * rp * 6 / (cw * ch), stride = clamp(Math.floor(M.n / (area * 6)), 1, 12);
    var a = al * (1 - far), G = a * (n.gain == null ? 0.2 : n.gain) * M.gain * area * stride;
    var pos = M.pos, col = M.col, cx = n.x, cy = n.y, isx = 2 / cw, isy = 3 / ch, c2 = cols * 2, r3 = rows * 3;
    T.cloudStart();
    for (i = 0; i < M.n; i += stride) {
      o = i * 3;
      var pu = pos[o], pv = pos[o + 1], pw = pos[o + 2];
      T.cloudAdd(cx + ux * pu + vx * pv + wx * pw, cy + uy * pu + vy * pv + wy * pw, col[o] * G, col[o + 1] * G, col[o + 2] * G);
    }
    T.cloudEnd(M.n / stride / area, n.max == null ? 0.9 : n.max);
    var sg = a * (n.stars == null ? 1.4 : n.stars), st = M.stars, gw = 0.5 * ch;
    for (i = 0; i < st.length; i++) {
      var S = st[i], px = cx + ux * S[0] + vx * S[1] + wx * S[2], py = cy + uy * S[0] + vy * S[1] + wy * S[2], sx = (px * isx) | 0, sy = (py * isy) | 0;
      if (sx < 0 || sy < 0 || sx >= c2 || sy >= r3) continue;
      var sj = (((sy / 3) | 0) * cols + (sx >> 1)) * 6 + (sy % 3) * 2 + (sx & 1), sv = S[4] * sg;
      bR[sj] += S[3][0] * sv; bG[sj] += S[3][1] * sv; bB[sj] += S[3][2] * sv;
      // a bright star glows a little round its point, so it reads as a star
      if (S[4] < 0.25) continue;
      var ga = Math.min(0.8, 0.5 * sv), gc0 = clamp(Math.floor((px - 2 * gw) / cw), 0, cols), gc1 = clamp(Math.ceil((px + 2 * gw) / cw), 0, cols);
      var gr0 = clamp(Math.floor((py - 2 * gw) / ch), 0, rows), gr1 = clamp(Math.ceil((py + 2 * gw) / ch), 0, rows);
      for (r = gr0; r < gr1; r++) for (c = gc0; c < gc1; c++) for (k = 0; k < 6; k++) {
        var gx = sampleX(c, k) - px, gy = sampleY(r, k) - py, gv = ga * Math.exp(-(gx * gx + gy * gy) / (2 * gw * gw));
        if (gv > 0.004) addBase((r * cols + c) * 6 + k, gv * S[3][0], gv * S[3][1], gv * S[3][2]);
      }
    }
    return true;
  }

  /* ------------------------------------------------------------------------
     The black hole and its disc. Far off it is a soft glow. Closer in, each
     sample's ray is bent round it (DeepSky.hole.at), the shadow hides what
     lies behind it, and the disc's light is added.

     h.x and h.y are its middle in device pixels, h.radius the radius of its
     ring there and h.dot the radius of its dot from far off. h.frame holds
     the disc's pole N, prime meridian Q and east E as unit vectors in the
     camera's space. h.alpha and h.glow set how much shows and the glow's
     colour. With h.coarse, which suits a moving camera, a hole more than a
     dozen rows tall is sampled down the middle of each cell only. h.map,
     when given, is called before the disc is drawn and returns the id of
     the disc's map with the renderer's sampler (see setSampler). The clumps
     are then shaded from the map as it turns. Without it they take the
     disc's mean colour, h.mean.
     ------------------------------------------------------------------------ */
  var HO = { r: 0, g: 0, b: 0, u: 0, v: 0, f: 0 };
  function drawHole(T, h) {
    var HOLE = DS.hole, REACH = HOLE.reach;
    var al = h.alpha == null ? 1 : h.alpha, rp = h.radius, gc = h.glow || HOLE.glow, rd = h.dot == null ? rp : h.dot, r, c, k;
    var cw = T.cw, ch = T.ch, cols = T.cols, rows = T.rows;
    var bR = T.red, bG = T.green, bB = T.blue, dK = T.tex, dU = T.texU, dV = T.texV, dF = T.texF, cOcc = T.cover;
    var sampleX = T.sampleX, sampleY = T.sampleY, addBase = T.add, holeAt = HOLE.at, o = HO;
    if (al < 0.02) return;
    var far = 1 - smoothstep(1.5 * ch, 5 * ch, rp);
    if (far > 0.01) {
      // the glow: a soft spot the size of the dot
      var wg = Math.max(0.4 * rd, 0.45 * ch), reach = 3.5 * wg, amp = 0.55 * far * al;
      var g0 = clamp(Math.floor((h.x - reach) / cw), 0, cols), g1 = clamp(Math.ceil((h.x + reach) / cw), 0, cols);
      var h0 = clamp(Math.floor((h.y - reach) / ch), 0, rows), h1 = clamp(Math.ceil((h.y + reach) / ch), 0, rows);
      for (r = h0; r < h1; r++) for (c = g0; c < g1; c++) for (k = 0; k < 6; k++) {
        var dx = sampleX(c, k) - h.x, dy = sampleY(r, k) - h.y, v = amp * Math.exp(-(dx * dx + dy * dy) / (2 * wg * wg));
        if (v > 0.004) addBase((r * cols + c) * 6 + k, v * gc[0], v * gc[1], v * gc[2]);
      }
    }
    if (far > 0.99) return;
    var id = h.map ? h.map() : 0;
    // While the camera moves or the clock runs fast, a hole more than a
    // dozen rows tall is sampled down the middle of each cell only, as a
    // large body is, and drawn in full once both stop.
    var coarse = !!h.coarse, kStep = coarse ? 2 : 1;
    if (coarse) T.coarse = true;
    var A = al * (1 - far), inv = 1 / rp, Hs = HOLE.setup(h.frame, T.view, ch / 3 * inv, h.mean), ext = REACH * rp + Math.max(cw, ch), mean = Hs.mean;
    var c0 = clamp(Math.floor((h.x - ext) / cw), 0, cols), c1 = clamp(Math.ceil((h.x + ext) / cw), 0, cols);
    var r0 = clamp(Math.floor((h.y - ext) / ch), 0, rows), r1 = clamp(Math.ceil((h.y + ext) / ch), 0, rows);
    for (r = r0; r < r1; r++) for (c = c0; c < c1; c++) {
      var cell = r * cols + c, occ = cOcc[cell], wrote = 0;
      for (k = 0; k < 6; k += kStep) {
        var i = cell * 6 + k, x = ((coarse ? (c + 0.5) * cw : sampleX(c, k)) - h.x) * inv, y = (h.y - sampleY(r, k)) * inv;
        if (x * x + y * y > REACH * REACH) continue;
        var sh = holeAt(Hs, x, y, o) * A;
        var f = o.f * A;
        if (sh < 0.002 && f === 0 && o.r + o.g + o.b < 0.003) continue;
        // what lies behind keeps its texture unless the shadow hides it
        if (dK[i] && (sh > 0 || f > 0)) { if (sh > 0.999) dK[i] = 0; else T.freeze(i); }
        bR[i] = bR[i] * (1 - sh) + o.r * A; bG[i] = bG[i] * (1 - sh) + o.g * A; bB[i] = bB[i] * (1 - sh) + o.b * A;
        if (f > 0) {
          if (id) { dK[i] = id; dU[i] = o.u; dV[i] = o.v; dF[i] = f; }
          else { bR[i] += mean[0] * f; bG[i] += mean[1] * f; bB[i] += mean[2] * f; }
        }
        if (sh > occ) occ = sh;
        wrote |= 1 << k;
      }
      if (coarse && wrote) for (k = 0; k < 6; k += 2) if (wrote & (1 << k)) {
        i = cell * 6 + k;
        bR[i + 1] = bR[i]; bG[i + 1] = bG[i]; bB[i + 1] = bB[i];
        dK[i + 1] = dK[i]; dU[i + 1] = dU[i]; dV[i + 1] = dV[i]; dF[i + 1] = dF[i];
      }
      cOcc[cell] = occ;
    }
  }

  DS.drawGalaxy = drawGalaxy;
  DS.drawNebula = drawNebula;
  DS.drawHole = drawHole;
})();
