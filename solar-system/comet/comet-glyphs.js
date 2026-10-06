/* ==========================================================================
   COMET GLYPHS // a comet drawn with the glyph renderer
   --------------------------------------------------------------------------
   The coma, the dust tail and the ion tail are drawn at their real size,
   seen through the renderer's camera. Where the tails would be shorter
   than a few characters they are drawn longer, so they show. It needs
   comet.js and a renderer from glyph-renderer.js.
   ========================================================================== */
(function () {
  'use strict';

  var CM = window.Comet;
  if (!CM) return;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }

  var DUST_COL = CM.colours.dust, ION_COL = CM.colours.ion, COMA_COL = CM.colours.coma;

  // Spread a comet's points into the cloud, their light scaled to add up
  // to g. Each point is spread over about the distance to its neighbours.
  // That comes from how many points share its square on a few coarse
  // grids, 2, 4, 8 ... samples across, from the finest up to the first
  // square that holds two dozen of them. The widest spacing any of those
  // squares gives is taken, so a lone grain next to the crowded head is
  // spread as widely as its own neighbourhood needs.
  var cnt = null;
  function cometSplat(T, out, n, g, col) {
    var sum = 0, i, l, o, cols = T.cols, rows = T.rows, cw = T.cw, ch = T.ch, PYR_N = T.spreadLevels;
    for (i = 0; i < n; i++) sum += out[i * 3 + 2];
    if (!(sum > 0)) return;
    var c2 = cols * 2, r3 = rows * 3;
    if (!cnt || cnt.c2 !== c2 || cnt.r3 !== r3) {
      cnt = { c2: c2, r3: r3, L: [] };
      for (l = 1; l <= PYR_N; l++) { var w = Math.ceil(c2 / (1 << l)) + 2, h = Math.ceil(r3 / (1 << l)) + 2; cnt.L[l] = { w: w, h: h, n: new Uint16Array(w * h) }; }
    }
    for (l = 1; l <= PYR_N; l++) cnt.L[l].n.fill(0);
    var ix = 2 / cw, iy = 3 / ch;
    for (i = 0; i < n; i++) {
      o = i * 3;
      if (!(out[o + 2] > 0)) continue;
      for (l = 1; l <= PYR_N; l++) {
        var C = cnt.L[l], s = 1 / (1 << l), x = Math.floor(out[o] * ix * s) + 1, y = Math.floor(out[o + 1] * iy * s) + 1;
        if (x >= 0 && y >= 0 && x < C.w && y < C.h && C.n[y * C.w + x] < 65535) C.n[y * C.w + x]++;
      }
    }
    var k = g / sum;
    for (i = 0; i < n; i++) {
      o = i * 3;
      var wt = out[o + 2] * k;
      if (!(wt > 0)) continue;
      var f = 0;
      for (l = 1; l <= PYR_N; l++) {
        var D = cnt.L[l], sl = 1 / (1 << l), xx = Math.floor(out[o] * ix * sl) + 1, yy = Math.floor(out[o + 1] * iy * sl) + 1;
        var m = xx >= 0 && yy >= 0 && xx < D.w && yy < D.h ? D.n[yy * D.w + xx] : 0;
        f = Math.max(f, (1 << l) * 1.2 / Math.sqrt(Math.max(m, 1)));
        if (m >= 24) break;
      }
      T.cloudSpread(out[o], out[o + 1], col[0] * wt, col[1] * wt, col[2] * wt, f);
    }
  }

  // each point's place on the screen and its light
  var OUT = null;

  /* ------------------------------------------------------------------------
     o.elements: the comet's orbit, as Comet.HALLEY. o.jd: the Julian day.
     o.pos: where its nucleus is (AU). o.x, o.y: where the nucleus is on
     the screen, in device pixels. o.scale: device pixels per AU there.
     o.frame: the nucleus's N, Q and E, which turn the jets. o.fade: a
     share from 0 to 1 that its activity is scaled by. o.key: the comet's
     name. o.gain: the tails' brightness. o.max: the brightness the tails
     are compressed toward.
     ------------------------------------------------------------------------ */
  function draw(T, o) {
    var c = CM.at(o.elements, o.jd, o.pos, o.fade), coma = c.coma, tail = c.tail;
    if (coma < 0.01) return;
    var cols = T.cols, rows = T.rows, cw = T.cw, ch = T.ch, W = T.W, H = T.H, view = T.view;
    var sampleX = T.sampleX, sampleY = T.sampleY, addBase = T.add;
    var kk = o.scale, cx = o.x, cy = o.y, Lion = c.length;
    // tails too short to see from here are drawn longer
    var X = tail > 0.01 ? Math.max(1, ch * 6 * tail / (Lion * kk)) : 1, kx = kk * X;
    var Rc = c.comaRadius * kk, reach = Math.max(4 * Rc, 2.5 * ch), tailPx = Lion * kx * 1.5;
    if (cx < -reach - tailPx || cx > W + reach + tailPx || cy < -reach - tailPx || cy > H + reach + tailPx) return;
    // The coma's core, a thirtieth of its size, is as bright as it gets.
    // Once the core fills a tenth of the screen, coma and tails dim
    // together as the view goes further in. The dust round the head is
    // far brighter than the tails, so once the coma is wider than a third
    // of the screen the dust dims as well, by the square root of how much
    // wider, and the jets in it still show.
    var rc = Math.max(Rc, 0.6 * ch), core = Math.max(0.3 * ch, rc * 0.03), inside = Math.min(1, Math.sqrt(0.1 * H / core));
    var dustDim = inside * Math.min(1, Math.sqrt(0.3 * H / rc));
    var R = view.R, Uv = view.U, i, p;
    // the screen offset of a world offset (AU), with the tails drawn X times longer
    var rx = [R[0] * kx, R[1] * kx, R[2] * kx], ry = [-Uv[0] * kx, -Uv[1] * kx, -Uv[2] * kx];
    if (tail > 0.01) {
      // Both tails keep their brightness per area as their size on the
      // screen changes. The dust gives three fifths of the light and the
      // ion tail two.
      var area = Math.max(1, Lion * kx * Lion * kx * 0.15 * 6 / (cw * ch)), G = (o.gain == null ? 0.002 : o.gain) * tail * area;
      var D = CM.dust(c, o.frame, o.key), Q = D.pos, Dw = D.w;
      if (!OUT || OUT.length < Math.max(D.n, 3000) * 3) OUT = new Float32Array(Math.max(D.n, 3000) * 3);
      var out = OUT;
      T.cloudStart();
      for (i = 0; i < D.n; i++) {
        p = i * 3;
        out[p] = cx + (Q[p] * rx[0] + Q[p + 1] * rx[1] + Q[p + 2] * rx[2]); out[p + 1] = cy + (Q[p] * ry[0] + Q[p + 1] * ry[1] + Q[p + 2] * ry[2]);
        out[p + 2] = Dw[i];
      }
      cometSplat(T, out, D.n, G * 0.6, DUST_COL);
      var I = CM.ion(c), Ip = I.pos, Iw = I.w;
      for (i = 0; i < I.n; i++) {
        p = i * 3;
        var x = Ip[p], y = Ip[p + 1], z = Ip[p + 2];
        out[p] = cx + x * rx[0] + y * rx[1] + z * rx[2]; out[p + 1] = cy + x * ry[0] + y * ry[1] + z * ry[2];
        out[p + 2] = Iw[i];
      }
      cometSplat(T, out, I.n, G * 0.4, ION_COL);
      T.cometEnd(o.max == null ? 0.9 : o.max, dustDim);
    }
    // the coma, at its real size but never smaller than a dot. Where its
    // core is more than two rows across it changes little within a cell,
    // so it is worked out once a cell.
    var amp = 0.45 * coma * inside;
    // it reaches as far as it is bright enough to draw
    var near = 0, far = reach;
    if (amp * core / (far + core) * Math.exp(-far / rc) < 0.003) {
      for (var it = 0; it < 24; it++) {
        var mid = (near + far) / 2;
        if (amp * core / (mid + core) * Math.exp(-mid / rc) > 0.003) near = mid; else far = mid;
      }
    }
    far = Math.max(far, 2.5 * ch);
    var c0 = clamp(Math.floor((cx - far) / cw), 0, cols), c1 = clamp(Math.ceil((cx + far) / cw), 0, cols);
    var r0 = clamp(Math.floor((cy - far) / ch), 0, rows), r1 = clamp(Math.ceil((cy + far) / ch), 0, rows), smooth = core > 2 * ch;
    for (var rr = r0; rr < r1; rr++) for (var cc = c0; cc < c1; cc++) {
      var cell = (rr * cols + cc) * 6, dx, dy, rho, v;
      if (smooth) {
        dx = (cc + 0.5) * cw - cx; dy = (rr + 0.5) * ch - cy; rho = Math.sqrt(dx * dx + dy * dy);
        v = amp * core / (rho + core) * Math.exp(-rho / rc);
        if (v > 0.003) for (var ks = 0; ks < 6; ks++) addBase(cell + ks, v * COMA_COL[0], v * COMA_COL[1], v * COMA_COL[2]);
        continue;
      }
      for (var kk2 = 0; kk2 < 6; kk2++) {
        dx = sampleX(cc, kk2) - cx; dy = sampleY(rr, kk2) - cy; rho = Math.sqrt(dx * dx + dy * dy);
        v = amp * core / (rho + core) * Math.exp(-rho / rc);
        if (v > 0.003) addBase(cell + kk2, v * COMA_COL[0], v * COMA_COL[1], v * COMA_COL[2]);
      }
    }
  }

  CM.draw = draw;
})();
