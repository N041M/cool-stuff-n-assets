/* ==========================================================================
   SPACECRAFT GLYPHS // a spacecraft model drawn with the glyph renderer
   --------------------------------------------------------------------------
   Each sample casts four rays through the model once the camera is still,
   and one while it moves. Only the parts whose outlines reach a cell are
   tried there, so most cells cast no rays at all. It needs spacecraft.js
   and a renderer from glyph-renderer.js.
   ========================================================================== */
(function () {
  'use strict';

  var SC = window.Spacecraft;
  if (!SC) return;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  var cellAt = new Int32Array(0), cellPos = new Int32Array(0), cellIds = new Int16Array(0), so = [0, 0, 0];

  /* ------------------------------------------------------------------------
     s.model: a model from Spacecraft.models. s.x, s.y: where its middle is
     on the screen, in device pixels. s.metres: metres per device pixel
     there. s.frame: the model's N (its z axis), Q (x) and E (y) as unit
     vectors in the camera's space, as Spacecraft.orient gives them. s.light:
     the way to the Sun from it, a unit vector. s.reach: how far its parts
     reach from its middle on the screen, in device pixels. s.alpha: how
     much of it shows. s.fine: four rays a sample rather than one.
     ------------------------------------------------------------------------ */
  function draw(T, s) {
    var M = s.model, view = T.view, cw = T.cw, ch = T.ch, cols = T.cols, rows = T.rows;
    var bR = T.red, bG = T.green, bB = T.blue, dK = T.tex, cOcc = T.cover, sampleX = T.sampleX, sampleY = T.sampleY;
    // screen, light and the camera in the model's frame; m: metres per device pixel
    var m = s.metres, Q = s.frame.Q, Eb = s.frame.E, N = s.frame.N, sx0 = s.x, sy0 = s.y;
    var R = [dot(view.R, Q) * m, dot(view.R, Eb) * m, dot(view.R, N) * m], U = [dot(view.U, Q) * m, dot(view.U, Eb) * m, dot(view.U, N) * m];
    var d = [dot(view.B, Q), dot(view.B, Eb), dot(view.B, N)];
    var Ls = s.light, L = [dot(Ls, Q), dot(Ls, Eb), dot(Ls, N)];
    var ext = (s.reach == null ? M.reach / m : s.reach) + Math.max(cw, ch);
    var c0 = clamp(Math.floor((sx0 - ext) / cw), 0, cols), c1 = clamp(Math.ceil((sx0 + ext) / cw), 0, cols);
    var r0 = clamp(Math.floor((sy0 - ext) / ch), 0, rows), r1 = clamp(Math.ceil((sy0 + ext) / ch), 0, rows);
    var fine = s.fine !== false, n = fine ? 4 : 1, ax = cw / 8, ay = ch / 12;
    var px = (fine ? Math.max(cw / 4, ch / 6) : Math.max(cw / 2, ch / 3)) * m;
    if (!fine) T.coarse = true;
    var parts = M.parts, A = s.alpha == null ? 1 : s.alpha;
    // the parts that can reach each cell, from their outlines on the screen,
    // so most cells cast no rays at all
    var gw = c1 - c0, gh = r1 - r0, pad = 0.5 * Math.sqrt(cw * cw + ch * ch) + px / m;
    if (gw <= 0 || gh <= 0) return;
    if (cellAt.length < gw * gh + 1) cellAt = new Int32Array(gw * gh + 1);
    cellAt.fill(0, 0, gw * gh + 1);
    var outl = parts.map(function (P) {
      var a = P.p || P.bs, z = P.q || P.bs, rr = (P.p ? P.r : P.bs[3]) / m + pad;
      var ax0 = sx0 + (a[0] * R[0] + a[1] * R[1] + a[2] * R[2]) / (m * m), ay0 = sy0 - (a[0] * U[0] + a[1] * U[1] + a[2] * U[2]) / (m * m);
      var ax1 = sx0 + (z[0] * R[0] + z[1] * R[1] + z[2] * R[2]) / (m * m), ay1 = sy0 - (z[0] * U[0] + z[1] * U[1] + z[2] * U[2]) / (m * m);
      return [ax0, ay0, ax1, ay1, rr];
    });
    function near(o, x, y) {
      var dx = o[2] - o[0], dy = o[3] - o[1], l2 = dx * dx + dy * dy, t = l2 ? clamp(((x - o[0]) * dx + (y - o[1]) * dy) / l2, 0, 1) : 0;
      var ex = o[0] + t * dx - x, ey = o[1] + t * dy - y;
      return ex * ex + ey * ey <= o[4] * o[4];
    }
    for (var pass = 0; pass < 2; pass++) {
      for (var pi = 0; pi < parts.length; pi++) {
        var o = outl[pi];
        var ca = Math.max(c0, Math.floor((Math.min(o[0], o[2]) - o[4]) / cw)), cb = Math.min(c1, Math.ceil((Math.max(o[0], o[2]) + o[4]) / cw));
        var ra = Math.max(r0, Math.floor((Math.min(o[1], o[3]) - o[4]) / ch)), rb = Math.min(r1, Math.ceil((Math.max(o[1], o[3]) + o[4]) / ch));
        for (var rr = ra; rr < rb; rr++) for (var cc = ca; cc < cb; cc++) {
          if (!near(o, (cc + 0.5) * cw, (rr + 0.5) * ch)) continue;
          var gi = (rr - r0) * gw + cc - c0;
          if (pass) cellIds[cellPos[gi]++] = pi; else cellAt[gi + 1]++;
        }
      }
      if (pass) break;
      for (var g = 0; g < gw * gh; g++) cellAt[g + 1] += cellAt[g];
      if (cellIds.length < cellAt[gw * gh]) cellIds = new Int16Array(cellAt[gw * gh] * 2);
      if (cellPos.length < gw * gh) cellPos = new Int32Array(gw * gh);
      cellPos.set(cellAt.subarray(0, gw * gh));
    }
    var rayParts = SC.rayParts;
    for (var r = r0; r < r1; r++) {
      for (var c = c0; c < c1; c++) {
        var cell = r * cols + c, occ = cOcc[cell], gc = (r - r0) * gw + c - c0, i0 = cellAt[gc], i1 = cellAt[gc + 1];
        if (i0 === i1) continue;
        for (var k = 0; k < 6; k++) {
          var i = cell * 6 + k, x0 = sampleX(c, k) - sx0, y0 = sy0 - sampleY(r, k), cov = 0, cr = 0, cg = 0, cb2 = 0;
          for (var j = 0; j < n; j++) {
            var x = fine ? x0 + ((j & 1) ? ax : -ax) : x0, y = fine ? y0 + ((j & 2) ? ay : -ay) : y0;
            cov += rayParts(parts, cellIds, i0, i1, x * R[0] + y * U[0], x * R[1] + y * U[1], x * R[2] + y * U[2], d, L, px, so);
            cr += so[0]; cg += so[1]; cb2 += so[2];
          }
          cov *= A / n;
          if (cov < 0.002) continue;
          if (dK[i]) T.freeze(i);
          var f = A / n;
          bR[i] = bR[i] * (1 - cov) + cr * f; bG[i] = bG[i] * (1 - cov) + cg * f; bB[i] = bB[i] * (1 - cov) + cb2 * f;
          if (cov > occ) occ = cov;
        }
        cOcc[cell] = occ;
      }
    }
  }

  SC.draw = draw;
})();
