/* ==========================================================================
   NIGHT SKY GLYPHS // the night sky drawn with the glyph renderer
   --------------------------------------------------------------------------
   The stars take the empty cells of the grid, one star a cell, the
   brightest where several fall in one, and twinkle there. The other
   galaxies are drawn into the samples like anything else. Both are seen
   through the renderer's camera with a field of view of about 55 degrees
   across the height of the screen, centred on the screen, so they
   turn as the camera turns and hold still as it moves.

   It needs night-sky.js and a renderer from glyph-renderer.js.
   ========================================================================== */
(function () {
  'use strict';

  var NS = window.NightSky;
  if (!NS) return;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  var GAL_Z = NS.frame.z;

  /* ------------------------------------------------------------------------
     The stars as the renderer's background: each cell holds the star that
     falls in it, if any, and twinkles. A layer is made once for a renderer
     and placed again whenever the camera moves.
     ------------------------------------------------------------------------ */
  function layer(T) {
    var STARS = null, GSTARS = null, gStar = null, rStar = null, gGal = null, rGal = null;
    var starAt = null, starCells = [], starFade = 1, gStarFade = 0, rows = [0, 0, 0];
    var L = { cells: starCells, time: 0, still: false };

    // each star's glyph and palette row on this renderer
    function looks(list, gArr, rArr) {
      for (var i = 0; i < list.length; i++) { gArr[i] = T.glyph(list[i].glyph); rArr[i] = rows[list[i].tint]; }
    }
    function placeStars(list, base, offDisc, disc) {
      var W = T.W, H = T.H, cw = T.cw, ch = T.ch, cols = T.cols, view = T.view;
      var f = 0.95 * H, R = view.R, U = view.U, B = view.B, mask = offDisc && !!disc && Math.abs(dot(B, GAL_Z)) > 0.05;
      for (var i = 0; i < list.length; i++) {
        var d = list[i].d, zc = -(d[0] * B[0] + d[1] * B[1] + d[2] * B[2]);
        if (zc < 0.1) continue;
        var x = W / 2 + f * (d[0] * R[0] + d[1] * R[1] + d[2] * R[2]) / zc;
        var y = H / 2 - f * (d[0] * U[0] + d[1] * U[1] + d[2] * U[2]) / zc;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (mask) { var gp = disc(x, y); if (smoothstep(4, 19, Math.sqrt(gp[0] * gp[0] + gp[1] * gp[1])) < list[i].cut) continue; }
        var cell = ((y / ch) | 0) * cols + ((x / cw) | 0);
        var cur = starAt[cell];
        if (cur && starOf(cur).a >= list[i].a) continue;
        if (!cur) starCells.push(cell);
        starAt[cell] = base + i + 1;
      }
    }
    function starOf(k) { return k <= STARS.length ? STARS[k - 1] : GSTARS[k - 1 - STARS.length]; }

    // opts.stars and opts.galaxyStars: how much of each sky shows, 0 to 1.
    // opts.disc(x, y), when given, is where the line of sight through the
    // device pixel (x, y) meets the galaxy's plane, as galactocentric
    // [x, y] in kiloparsecs, and the galaxy's own stars thin out over its disc.
    L.place = function (opts) {
      opts = opts || {};
      if (!STARS) {
        STARS = NS.stars();
        rows[0] = 0; rows[1] = T.colourRow(190, 210, 255); rows[2] = T.colourRow(255, 236, 214);
        gStar = new Int32Array(STARS.length); rStar = new Int32Array(STARS.length);
        looks(STARS, gStar, rStar);
      }
      var n = T.cols * T.rows;
      if (!starAt || starAt.length !== n) starAt = new Int32Array(n); else starAt.fill(0);
      starCells = L.cells = [];
      starFade = opts.stars == null ? 1 : opts.stars;
      gStarFade = opts.galaxyStars || 0;
      if (starFade >= 0.01) placeStars(STARS, 0, false, null);
      if (gStarFade >= 0.01) {
        if (!GSTARS) { GSTARS = NS.galaxyStars(); gGal = new Int32Array(GSTARS.length); rGal = new Int32Array(GSTARS.length); looks(GSTARS, gGal, rGal); }
        placeStars(GSTARS, STARS.length, true, opts.disc || null);
      }
    };
    // the packed state of a cell, for the renderer: 0 where there is no
    // star, else its glyph, colour and opacity as it twinkles at L.time
    // seconds, or held at its brightest while L.still is set
    L.state = function (cell) {
      var si = starAt ? starAt[cell] : 0;
      if (!si) return 0;
      var sky = si <= STARS.length, j = sky ? si - 1 : si - 1 - STARS.length, st = sky ? STARS[j] : GSTARS[j], fade = sky ? starFade : gStarFade;
      var a = st.a * fade * (1 - st.amp + (L.still ? st.amp : st.amp * Math.sin(L.time * st.tw + st.ph)));
      var aq = Math.round(clamp(a, 0, 1) * 63);
      return aq ? T.pack(sky ? gStar[j] : gGal[j], sky ? rStar[j] : rGal[j], aq) : 0;
    };
    return L;
  }

  /* ------------------------------------------------------------------------
     The other galaxies, into the renderer's samples, alpha 0 to 1. Behind
     the Milky Way's disc they are hidden, as by the disc's own light and
     dust, when disc is given (see layer's place).
     ------------------------------------------------------------------------ */
  var FAR_KNOT = NS.KNOT, TY = NS.TYPES;
  function drawGalaxies(T, al, disc) {
    var FAR = NS.galaxies();
    var W = T.W, H = T.H, cw = T.cw, ch = T.ch, cols = T.cols, rows = T.rows, view = T.view, bR = T.red, bG = T.green, bB = T.blue;
    var f = 0.95 * H, R = view.R, U = view.U, B = view.B, bz = Math.abs(dot(B, GAL_Z)), n = NS.IMAGE_N, sc = n / 2.2;
    var ELLIPTICAL = TY.elliptical, SPIRAL = TY.spiral, BARRED = TY.barred, PATCHY = TY.patchy, LENTICULAR = TY.lenticular, IRREGULAR = TY.irregular, RING = TY.ring;
    for (var gi = 0; gi < FAR.length; gi++) {
      var G = FAR[gi], d = G.d, zc = -dot(d, B);
      if (zc < 0.2) continue;
      var cx = W / 2 + f * dot(d, R) / zc, cy = H / 2 - f * dot(d, U) / zc, rp = f * G.size / zc;
      if (rp < 2.5 || cx + rp < 0 || cx - rp > W || cy + rp < 0 || cy - rp > H) continue;
      // behind the Milky Way's disc it is hidden, as by the disc's own light and dust
      var hide = 1;
      if (bz > 0.05 && disc) { var gp = disc(cx, cy); hide = smoothstep(12, 17, Math.sqrt(gp[0] * gp[0] + gp[1] * gp[1])); }
      var a = al * hide * G.bright;
      if (a < 0.01) continue;
      var img = NS.galaxyImage(G);
      var ty = G.type, round = ty === ELLIPTICAL, disk = ty === SPIRAL || ty === BARRED || ty === PATCHY || ty === LENTICULAR;
      // The disc's axis seen from the camera sets how flat it looks and which
      // way it lies. Its picture is laid on the disc's own axes, so its arms
      // stay put on it as the camera turns, rather than turning with the
      // long axis of the ellipse, which swings round fast on a disc seen
      // nearly face on.
      var nz = Math.abs(dot(G.n, B)), Ax = NS.discAxes(G.n, R, U);
      var q = round ? G.q : ty === IRREGULAR ? Math.max(nz, 0.45) : Math.max(nz, 0.1);
      var pa = Ax.pa, ca = Math.cos(pa) / rp, sa = Math.sin(pa) / rp, iq = 1 / q;
      var l1 = dot(Ax.L, G.e1), l2 = dot(Ax.L, G.e2), m1 = dot(Ax.M, G.e1), m2 = dot(Ax.M, G.e2);
      // seen nearly edge-on, a disc's dust shows as a dark lane along it
      var lane = disk && q < 0.45 ? 0.85 * (1 - q / 0.45) : 0, bulge = ty === LENTICULAR ? 1.7 : ty === RING ? 0.7 : disk ? 1.4 : 0;
      var ext = rp * 1.15, I = img.I, K = img.K, core = G.core, arm = G.arm;
      // a small one shows little of its arms or patches, only a soft disc round a bright middle
      var soft = round ? 0 : 1 - smoothstep(30, 90, rp), smooth = ty === LENTICULAR ? 0 : 0.85;
      var c0 = clamp(Math.floor((cx - ext) / cw), 0, cols), c1 = clamp(Math.ceil((cx + ext) / cw), 0, cols);
      var r0 = clamp(Math.floor((cy - ext) / ch), 0, rows), r1 = clamp(Math.ceil((cy + ext) / ch), 0, rows);
      for (var r = r0; r < r1; r++) for (var ky = 0; ky < 3; ky++) {
        var dy = (r + (ky + 0.5) / 3) * ch - cy;
        for (var c = c0; c < c1; c++) for (var kx = 0; kx < 2; kx++) {
          var dx = (c + (kx + 0.5) * 0.5) * cw - cx;
          var u = dx * ca + dy * sa, vs = dy * ca - dx * sa, v = vs * iq, uu = u * u + v * v;
          if (uu > 1.2) continue;
          var fx = (u * l1 + v * m1 + 1.1) * sc - 0.5, fy = (u * l2 + v * m2 + 1.1) * sc - 0.5, x0 = fx | 0, y0 = fy | 0;
          if (x0 < 0 || y0 < 0 || x0 >= n - 1 || y0 >= n - 1) continue;
          var tx = fx - x0, tyy = fy - y0, o = y0 * n + x0;
          var w00 = (1 - tx) * (1 - tyy), w10 = tx * (1 - tyy), w01 = (1 - tx) * tyy, w11 = tx * tyy;
          var L = I[o] * w00 + I[o + 1] * w10 + I[o + n] * w01 + I[o + n + 1] * w11;
          var kn = K[o] * w00 + K[o + 1] * w10 + K[o + n] * w01 + K[o + n + 1] * w11;
          if (soft > 0) {
            var rr = Math.sqrt(uu);
            L += soft * (smooth * Math.exp(-rr / 0.3) * (1 - smoothstep(0.85, 1.1, rr)) - 0.5 * L);
            kn *= 1 - 0.6 * soft;
          }
          if (bulge) {
            var bd = (dx * dx + dy * dy) / (rp * rp);
            if (bd < 0.06) L += bulge * Math.exp(-bd / 0.008);
          }
          if (lane) L *= 1 - lane * Math.exp(-vs * vs / 0.0005) * (1 - smoothstep(0.4, 0.95, Math.abs(u)));
          var w = L * a, wk = kn * a * 0.9;
          if (w + wk < 0.003) continue;
          var mix = round ? 0 : smoothstep(0.0025, 0.16, uu), i = (r * cols + c) * 6 + ky * 2 + kx;
          bR[i] += (core[0] + (arm[0] - core[0]) * mix) * w + FAR_KNOT[0] * wk;
          bG[i] += (core[1] + (arm[1] - core[1]) * mix) * w + FAR_KNOT[1] * wk;
          bB[i] += (core[2] + (arm[2] - core[2]) * mix) * w + FAR_KNOT[2] * wk;
        }
      }
    }
  }

  NS.layer = layer;
  NS.drawGalaxies = drawGalaxies;
})();
