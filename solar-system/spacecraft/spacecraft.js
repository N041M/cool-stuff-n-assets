/* ==========================================================================
   SPACECRAFT // seven spacecraft as small models at their real size
   --------------------------------------------------------------------------
   Voyager 1 and 2, New Horizons, Pioneer 10 and 11, Parker Solar Probe
   and the James Webb Space Telescope, built in metres from a few kinds of
   part: dishes, cylinders, rods too thin to see whole, flat panels and
   prisms, and JWST's mirror of hexagons. A ray cast through a model keeps
   every part it passes, nearest last, so a boom thinner than a pixel
   covers only part of it. Parts shade one another from the Sun, and a
   faint light from the camera's side keeps the shaded side readable.

   Nothing here draws. spacecraft-glyphs.js draws the models with the
   glyph renderer.
   ========================================================================== */
(function () {
  'use strict';

  var DEG = Math.PI / 180;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  /* ------------------------------------------------------------------------
     The models, in metres. Each model's z axis is the way it points: its
     dish to the Earth, or its shield to or from the Sun. Parts marked as
     reaching out (the long booms and wire antennas) do not count when the
     model is framed. s: how shiny a part is; gain: drawn brighter than its
     light. view: the side a model is best seen from, in its own frame.
     ------------------------------------------------------------------------ */
  var WHITE = [0.93, 0.93, 0.91], GREY = [0.64, 0.64, 0.66], DARK = [0.46, 0.44, 0.41], FOIL = [0.4, 0.39, 0.37];
  var GOLD = [1.0, 0.74, 0.32], CELLS = [0.2, 0.25, 0.5], KAPTON = [0.84, 0.76, 0.94];
  var X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  // a paraboloid dish: vertex, the way it opens, rim radius, depth
  function dish(c, a, r, h, col) { return { t: 'dish', c: c, a: a, r: r, h: h, col: col, s: 0.25 }; }
  // a solid cylinder from p to q, and a rod, which is a cylinder too thin to see whole, drawn with soft edges
  function cyl(p, q, r, col, s) { return { t: 'cyl', p: p, q: q, r: r, col: col, s: s || 0 }; }
  function rod(p, q, r, col, reach) { return { t: 'rod', p: p, q: q, r: r, col: col, reach: reach }; }
  // a convex polygon (u, v coordinates) in the plane through c spanned by u and v,
  // th thick. Zero thickness makes a two-sided panel.
  function poly(c, u, v, pts, th, col, s) { return { t: 'poly', c: c, u: u, v: v, pts: pts, th: th, col: col, s: s || 0 }; }
  function prism(c, pts, th, col) { return poly(c, X, Y, pts, th, col); }
  function box(c, s, col) { return prism(c, [[-s[0], -s[1]], [s[0], -s[1]], [s[0], s[1]], [-s[0], s[1]]], 2 * s[2], col); }
  function ngon(n, r, a0) {
    for (var out = [], k = 0; k < n; k++) out.push([r * Math.cos((a0 + 360 * k / n) * DEG), r * Math.sin((a0 + 360 * k / n) * DEG)]);
    return out;
  }
  function polar(r, a, z) { return [r * Math.cos(a * DEG), r * Math.sin(a * DEG), z]; }
  // struts from a dish's rim to the feed at its focus
  function struts(n, rim, z0, feed, z1, a0) {
    for (var out = [], k = 0; k < n; k++) out.push(rod(polar(rim, a0 + 360 * k / n, z0), polar(feed, a0 + 360 * k / n, z1), 0.025, GREY));
    return out;
  }

  var CRAFT = {
    // Voyager: a ten-sided bus under a 3.7 m dish, plutonium generators on one
    // boom, cameras on the other, the Golden Record on the side and a 13 m
    // magnetometer boom
    voyager: { point: 'earth', view: [0.3, -0.9, 0.3], col: [0.82, 0.82, 0.8], parts: [
      prism([0, 0, -0.235], ngon(10, 0.89, 0), 0.47, FOIL),
      dish([0, 0, 0.02], Z, 1.83, 0.42, WHITE),
      cyl([0, 0, 1.12], [0, 0, 1.2], 0.26, WHITE)
    ].concat(struts(3, 1.8, 0.44, 0.2, 1.14, 90), [
      cyl([0, 0.84, -0.22], [0, 0.88, -0.22], 0.155, GOLD, 0.5),
      rod([-0.85, 0, -0.3], [-3.7, 0, -0.55], 0.04, GREY),
      cyl([-2.08, 0, -0.42], [-2.6, 0, -0.46], 0.2, DARK), cyl([-2.66, 0, -0.47], [-3.18, 0, -0.51], 0.2, DARK),
      cyl([-3.24, 0, -0.52], [-3.76, 0, -0.56], 0.2, DARK),
      rod([0.85, 0, -0.3], [2.6, 0, -0.5], 0.05, GREY),
      box([1.6, 0, -0.42], [0.16, 0.2, 0.16], FOIL),
      box([2.8, 0, -0.5], [0.26, 0.3, 0.24], GREY),
      cyl([2.7, 0.12, -0.3], [2.95, 0.12, 0.45], 0.12, GREY), cyl([2.95, -0.15, -0.3], [3.15, -0.15, 0.1], 0.1, GREY),
      rod([0, -0.85, -0.3], [0.4, -13, -1.1], 0.03, GREY, true),
      rod([-0.3, 0.7, -0.45], [-4.2, 9.4, -2.5], 0.015, GREY, true), rod([0.3, 0.7, -0.45], [4.2, 9.4, -2.5], 0.015, GREY, true)
    ]) },
    // New Horizons: a triangular body in gold foil, a 2.1 m dish and one generator
    newhorizons: { point: 'earth', view: [0.5, -0.75, 0.32], col: [0.92, 0.78, 0.5], parts: [
      prism([0, 0, -0.4], [[1.2, 0], [-0.9, 1.05], [-0.9, -1.05]], 0.7, GOLD),
      dish([0, 0, -0.05], Z, 1.05, 0.28, WHITE),
      cyl([0, 0, 0.55], [0, 0, 0.62], 0.16, WHITE)
    ].concat(struts(3, 1.03, 0.22, 0.12, 0.58, 30), [
      cyl([1.1, 0, -0.4], [2.25, 0, -0.4], 0.21, DARK),
      box([-0.95, 0.35, -0.4], [0.1, 0.18, 0.22], GREY), cyl([-0.9, -0.4, -0.3], [-1.3, -0.4, -0.3], 0.1, GREY)
    ]) },
    // Pioneer 10 and 11: a 2.7 m dish over a six-sided box, two generators on
    // each of two booms, and a magnetometer boom
    pioneer: { point: 'earth', view: [0.45, -0.8, 0.3], col: [0.85, 0.85, 0.82], parts: [
      prism([0, 0, -0.18], ngon(6, 0.71, 0), 0.36, FOIL),
      box([0, -0.82, -0.18], [0.32, 0.22, 0.17], FOIL),
      dish([0, 0, 0.02], Z, 1.37, 0.46, WHITE),
      cyl([0, 0, 1.12], [0, 0, 1.42], 0.11, WHITE),
      rod(polar(0.6, 30, -0.25), polar(3.1, 30, -0.25), 0.035, GREY), rod(polar(0.6, 150, -0.25), polar(3.1, 150, -0.25), 0.035, GREY),
      cyl(polar(1.95, 30, -0.25), polar(2.5, 30, -0.25), 0.2, DARK), cyl(polar(2.56, 30, -0.25), polar(3.1, 30, -0.25), 0.2, DARK),
      cyl(polar(1.95, 150, -0.25), polar(2.5, 150, -0.25), 0.2, DARK), cyl(polar(2.56, 150, -0.25), polar(3.1, 150, -0.25), 0.2, DARK),
      rod([0, -1.04, -0.2], [0, -6.6, -0.2], 0.03, GREY, true)
    ].concat(struts(3, 1.35, 0.46, 0.11, 1.14, 90)) },
    // Parker Solar Probe hides in the shade of a 2.3 m heat shield. A cup
    // and four antennas reach past it into the sunlight.
    parker: { point: 'sun', view: [0.6, -0.75, 0.15], col: [0.86, 0.86, 0.85], parts: [
      cyl([0, 0, 1.0], [0, 0, 1.115], 1.15, WHITE),
      prism([0, 0, 0], ngon(6, 0.5, 0), 1.1, FOIL),
      rod(polar(0.45, 30, 0.55), polar(0.9, 30, 1.0), 0.03, GREY), rod(polar(0.45, 150, 0.55), polar(0.9, 150, 1.0), 0.03, GREY),
      rod(polar(0.45, 270, 0.55), polar(0.9, 270, 1.0), 0.03, GREY),
      poly([0.95, 0, 0.1], Y, [0.35, 0, 0.94], [[-0.4, -0.6], [0.4, -0.6], [0.4, 0.6], [-0.4, 0.6]], 0, CELLS, 0.5),
      poly([-0.95, 0, 0.1], Y, [-0.35, 0, 0.94], [[-0.4, -0.6], [0.4, -0.6], [0.4, 0.6], [-0.4, 0.6]], 0, CELLS, 0.5),
      rod([0, 0, -0.55], [0, 0, -2.7], 0.03, GREY), box([0, 0, -1.9], [0.06, 0.06, 0.06], GREY), box([0, 0, -2.7], [0.07, 0.07, 0.07], GREY),
      cyl(polar(1.0, 45, 0.85), polar(1.3, 45, 1.32), 0.07, GREY),
      rod(polar(1.1, 0, 1.0), polar(3.1, 0, 1.0), 0.012, GREY, true), rod(polar(1.1, 90, 1.0), polar(3.1, 90, 1.0), 0.012, GREY, true),
      rod(polar(1.1, 180, 1.0), polar(3.1, 180, 1.0), 0.012, GREY, true), rod(polar(1.1, 270, 1.0), polar(3.1, 270, 1.0), 0.012, GREY, true)
    ] },
    // JWST has the Sun under its 21 x 14 m sunshield of five layers. Above
    // it, in the cold, the gold mirror of 18 segments looks along x at the
    // secondary mirror on its three struts. The mirror never sees the Sun, so it is
    // drawn brighter than its light alone would make it
    jwst: { point: 'out', view: [0.62, -0.62, 0.48], col: [0.88, 0.78, 0.86], parts: [
      { t: 'hex', c: [-1.4, 0, 4.4], u: Y, v: Z, rc: 0.762, col: GOLD, back: DARK, s: 0.7, gain: 1.7 },
      cyl([5.6, 0, 4.4], [5.48, 0, 4.4], 0.37, GOLD, 0.7),
      rod([-1.3, 3.1, 4.5], [5.5, 0.2, 4.45], 0.06, GREY), rod([-1.3, -3.1, 4.5], [5.5, -0.2, 4.45], 0.06, GREY),
      rod([-1.3, 0, 1.2], [5.5, 0, 4.15], 0.06, GREY),
      box([-2.45, 0, 2.9], [0.8, 1.1, 1.5], FOIL),
      cyl([-1.6, 0, -0.4], [-1.6, 0, 1.4], 0.22, GREY),
      box([-1.2, 0, -1.0], [1.0, 1.0, 0.55], FOIL),
      poly([-5.0, 0, -1.6], X, Y, [[-2.6, -1.2], [2.6, -1.2], [2.6, 1.2], [-2.6, 1.2]], 0, CELLS, 0.5),
      dish([-0.6, 0.8, -1.6], [0, 0, -1], 0.3, 0.1, WHITE),
      poly([0, 0, 0.25], X, Y, [[10.6, 0], [6, 7.1], [-6, 7.1], [-10.6, 0], [-6, -7.1], [6, -7.1]], 0.5, KAPTON, 0.3)
    ] }
  };

  // work out each part's bounds, then move the model so its framed parts are
  // centred on the origin
  function sub3(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function len3(a) { return Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]); }
  function buildCraft(M) {
    var lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
    M.parts.forEach(function (P) {
      var pts, pad;
      if (P.t === 'cyl' || P.t === 'rod') {
        var d = sub3(P.q, P.p); P.L = len3(d); P.a = [d[0] / P.L, d[1] / P.L, d[2] / P.L];
        pts = [P.p, P.q]; pad = P.r;
      } else if (P.t === 'dish') {
        P.k = P.h / (P.r * P.r);
        pts = [P.c, [P.c[0] + P.a[0] * P.h, P.c[1] + P.a[1] * P.h, P.c[2] + P.a[2] * P.h]]; pad = P.r;
      } else {
        P.n = [P.u[1] * P.v[2] - P.u[2] * P.v[1], P.u[2] * P.v[0] - P.u[0] * P.v[2], P.u[0] * P.v[1] - P.u[1] * P.v[0]];
        if (P.t === 'hex') P.pts = ngon(6, 4.6 * P.rc, 0);
        // outward edge normals and offsets, for a polygon listed anticlockwise
        P.edges = P.pts.map(function (a, i) {
          var b = P.pts[(i + 1) % P.pts.length], ex = b[0] - a[0], ey = b[1] - a[1], l = Math.sqrt(ex * ex + ey * ey);
          return [ey / l, -ex / l, (ey * a[0] - ex * a[1]) / l];
        });
        pts = P.pts.map(function (q) { return [0, 1, 2].map(function (i) { return P.c[i] + q[0] * P.u[i] + q[1] * P.v[i]; }); });
        pad = (P.th || 0) / 2 + 0.01;
      }
      P.pts3 = pts; P.pad = pad;
      if (P.reach) return;
      pts.forEach(function (q) { for (var i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], q[i] - pad); hi[i] = Math.max(hi[i], q[i] + pad); } });
    });
    var c = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
    M.r = len3(sub3(hi, c));
    M.reach = 0;
    M.parts.forEach(function (P) {
      ['c', 'p', 'q'].forEach(function (f) { if (P[f]) P[f] = sub3(P[f], c); });
      P.pts3 = P.pts3.map(function (q) { return sub3(q, c); });
      // a bounding sphere, to skip parts a ray cannot touch
      var m = [0, 0, 0];
      P.pts3.forEach(function (q) { m[0] += q[0] / P.pts3.length; m[1] += q[1] / P.pts3.length; m[2] += q[2] / P.pts3.length; });
      var br = 0;
      P.pts3.forEach(function (q) { br = Math.max(br, len3(sub3(q, m))); });
      P.bs = [m[0], m[1], m[2], br + P.pad];
      M.reach = Math.max(M.reach, len3(m) + br + P.pad);
      delete P.pts3;
    });
    return M;
  }
  for (var ck in CRAFT) buildCraft(CRAFT[ck]);

  // which model each spacecraft uses
  var FLEET = { voyager1: 'voyager', voyager2: 'voyager', newhorizons: 'newhorizons', pioneer10: 'pioneer', pioneer11: 'pioneer',
                parker: 'parker', jwst: 'jwst' };

  // A spacecraft's z axis points its dish at the Earth, or its shield to or
  // from the Sun, and its x axis lies along the ecliptic. pos and earth are
  // where it and the Earth are, heliocentric ecliptic, in any one unit.
  function orient(model, pos, earth) {
    var p = pos, pt = model.point;
    var N = norm(pt === 'earth' ? [earth[0] - p[0], earth[1] - p[1], earth[2] - p[2]] : pt === 'sun' ? [-p[0], -p[1], -p[2]] : p);
    var Q = norm(cross([0, 0, 1], N));
    return { N: N, Q: Q, E: cross(N, Q) };
  }

  /* ------------------------------------------------------------------------
     Rays through a model, in metres in its own frame
     ------------------------------------------------------------------------ */
  var gT = 0, gC = 0, gX = 0, gY = 0, gZ = 0, gK = 1, gCol = null;   // the last hit: t, coverage, normal, shade, colour
  var HN = 0, HT = new Float64Array(16), HC = new Float32Array(16), HX = new Float32Array(16), HY = new Float32Array(16), HZ = new Float32Array(16);
  var HK = new Float32Array(16), HI = new Int16Array(16), HCol = new Array(16);   // the hits along a ray
  var SQ3 = Math.sqrt(3);

  // a convex polygon, flat or with thickness: the ray clipped by its faces
  function hitPoly(P, ox, oy, oz, dx, dy, dz) {
    var u = P.u, v = P.v, n = P.n, wx = ox - P.c[0], wy = oy - P.c[1], wz = oz - P.c[2];
    var lu = wx * u[0] + wy * u[1] + wz * u[2], lv = wx * v[0] + wy * v[1] + wz * v[2], ln = wx * n[0] + wy * n[1] + wz * n[2];
    var du = dx * u[0] + dy * u[1] + dz * u[2], dv = dx * v[0] + dy * v[1] + dz * v[2], dn = dx * n[0] + dy * n[1] + dz * n[2];
    var h = (P.th || 0) / 2, tIn = -1e30, tOut = 1e30, au = 0, av = 0, an = 0, i, fo, fd, t;
    for (i = -2; i < P.edges.length; i++) {
      var eu = 0, ev = 0, en = 0, off;
      if (i < 0) { en = i === -2 ? 1 : -1; off = h; fo = en * ln - h; fd = en * dn; }
      else { eu = P.edges[i][0]; ev = P.edges[i][1]; off = P.edges[i][2]; fo = eu * lu + ev * lv - off; fd = eu * du + ev * dv; }
      if (fd === 0) { if (fo > 0) return false; continue; }
      t = -fo / fd;
      if (fd > 0) { if (t < tOut) { tOut = t; au = eu; av = ev; an = en; } }
      else if (t > tIn) tIn = t;
      if (tIn > tOut) return false;
    }
    gT = tOut; gK = 1; gCol = P.col;
    gX = au * u[0] + av * v[0] + an * n[0]; gY = au * u[1] + av * v[1] + an * n[1]; gZ = au * u[2] + av * v[2] + an * n[2];
    if (P.back && an < 0) gCol = P.back;
    if (P.t === 'hex') {
      // JWST's mirror: rings one and two of a grid of flat-topped hexagons, with darker seams
      var pu = lu + tOut * du, pv = lv + tOut * dv, rc = P.rc;
      var q = 2 / 3 * pu / rc, r = (-pu / 3 + SQ3 / 3 * pv) / rc, s = -q - r;
      var rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
      var eq = Math.abs(rq - q), er = Math.abs(rr - r), es = Math.abs(rs - s);
      if (eq > er && eq > es) rq = -rr - rs; else if (er > es) rr = -rq - rs;
      var ring = Math.max(Math.abs(rq), Math.abs(rr), Math.abs(rq + rr));
      if (ring < 1 || ring > 2) return false;
      var lx = pu - 1.5 * rc * rq, ly = pv - SQ3 * rc * (rr + rq / 2);
      var edge = rc * 0.866 - Math.max(Math.abs(ly), Math.abs(0.866 * lx + 0.5 * ly), Math.abs(0.866 * lx - 0.5 * ly));
      gK = 0.5 + 0.5 * smoothstep(0.015, 0.08, edge);
    }
    gC = 1;
    return true;
  }
  // a solid cylinder with flat ends
  function hitCyl(P, ox, oy, oz, dx, dy, dz) {
    var a = P.a, wx = ox - P.p[0], wy = oy - P.p[1], wz = oz - P.p[2];
    var wa = wx * a[0] + wy * a[1] + wz * a[2], da = dx * a[0] + dy * a[1] + dz * a[2];
    var px = wx - wa * a[0], py = wy - wa * a[1], pz = wz - wa * a[2], qx = dx - da * a[0], qy = dy - da * a[1], qz = dz - da * a[2];
    var A = qx * qx + qy * qy + qz * qz, B = px * qx + py * qy + pz * qz, C = px * px + py * py + pz * pz - P.r * P.r;
    var best = -1e30, t, s, nx = 0, ny = 0, nz = 0;
    if (A > 1e-12) {
      var D = B * B - A * C;
      if (D < 0) return false;
      t = (-B + Math.sqrt(D)) / A; s = wa + t * da;
      if (s >= 0 && s <= P.L) { best = t; nx = (px + t * qx) / P.r; ny = (py + t * qy) / P.r; nz = (pz + t * qz) / P.r; }
    }
    if (da !== 0) {
      for (var e = 0; e < 2; e++) {
        t = ((e ? P.L : 0) - wa) / da;
        if (t <= best) continue;
        var ex = px + t * qx, ey = py + t * qy, ez = pz + t * qz;
        if (ex * ex + ey * ey + ez * ez > P.r * P.r) continue;
        best = t; nx = e ? a[0] : -a[0]; ny = e ? a[1] : -a[1]; nz = e ? a[2] : -a[2];
      }
    }
    if (best === -1e30) return false;
    gT = best; gC = 1; gK = 1; gCol = P.col; gX = nx; gY = ny; gZ = nz;
    return true;
  }
  // a rod: the nearest approach of the ray to it, with an edge as soft as a
  // sample is wide, and at most as dense as the rod is thick for its width
  function hitRod(P, ox, oy, oz, dx, dy, dz, px) {
    var a = P.a, wx = ox - P.p[0], wy = oy - P.p[1], wz = oz - P.p[2];
    var b = a[0] * dx + a[1] * dy + a[2] * dz, dw = dx * wx + dy * wy + dz * wz, aw = a[0] * wx + a[1] * wy + a[2] * wz;
    var den = 1 - b * b, t, s;
    if (den < 1e-9) { s = 0; t = -dw; }
    else { t = (b * aw - dw) / den; s = aw + t * b; }
    if (s < 0 || s > P.L) { s = s < 0 ? 0 : P.L; t = s * b - dw; }
    var vx = wx + t * dx - s * a[0], vy = wy + t * dy - s * a[1], vz = wz + t * dz - s * a[2];
    var dist = Math.sqrt(vx * vx + vy * vy + vz * vz), re = Math.max(P.r, px * 0.35);
    var cov = clamp(0.5 + (re - dist) / px, 0, 1) * P.r / re;
    if (cov <= 0.004) return false;
    // the normal: round the rod, toward the camera
    var va = vx * a[0] + vy * a[1] + vz * a[2], cx = dx - b * a[0], cy = dy - b * a[1], cz = dz - b * a[2];
    var cl = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1, lift = Math.sqrt(Math.max(0, re * re - dist * dist)) / cl;
    gX = vx - va * a[0] + cx * lift; gY = vy - va * a[1] + cy * lift; gZ = vz - va * a[2] + cz * lift;
    var nl = Math.sqrt(gX * gX + gY * gY + gZ * gZ) || 1;
    gX /= nl; gY /= nl; gZ /= nl;
    gT = t; gC = cov; gK = 1; gCol = P.col;
    return true;
  }
  // a dish: a paraboloid shell opening along a, rim radius r, depth h
  function hitDish(P, ox, oy, oz, dx, dy, dz) {
    var a = P.a, k = P.k, wx = ox - P.c[0], wy = oy - P.c[1], wz = oz - P.c[2];
    var wa = wx * a[0] + wy * a[1] + wz * a[2], da = dx * a[0] + dy * a[1] + dz * a[2];
    var px = wx - wa * a[0], py = wy - wa * a[1], pz = wz - wa * a[2], qx = dx - da * a[0], qy = dy - da * a[1], qz = dz - da * a[2];
    var A = k * (qx * qx + qy * qy + qz * qz), B = 2 * k * (px * qx + py * qy + pz * qz) - da, C = k * (px * px + py * py + pz * pz) - wa;
    var t0, t1;
    if (Math.abs(A) < 1e-12) { if (B === 0) return false; t0 = t1 = -C / B; }
    else {
      var D = B * B - 4 * A * C;
      if (D < 0) return false;
      var sq = Math.sqrt(D);
      t0 = (-B + sq) / (2 * A); t1 = (-B - sq) / (2 * A);
      if (t1 > t0) { var tt = t0; t0 = t1; t1 = tt; }
    }
    for (var j = 0; j < 2; j++) {
      var t = j ? t1 : t0, ex = px + t * qx, ey = py + t * qy, ez = pz + t * qz;
      if (ex * ex + ey * ey + ez * ez > P.r * P.r) continue;
      gX = a[0] - 2 * k * ex; gY = a[1] - 2 * k * ey; gZ = a[2] - 2 * k * ez;
      var nl = Math.sqrt(gX * gX + gY * gY + gZ * gZ);
      gX /= nl; gY /= nl; gZ /= nl;
      gT = t; gC = 1; gK = 1; gCol = P.col;
      return true;
    }
    return false;
  }
  function hitPart(P, ox, oy, oz, dx, dy, dz, px) {
    var bs = P.bs, cx = bs[0] - ox, cy = bs[1] - oy, cz = bs[2] - oz, tc = cx * dx + cy * dy + cz * dz, br = bs[3] + px;
    if (cx * cx + cy * cy + cz * cz - tc * tc > br * br) return false;
    switch (P.t) {
      case 'cyl': return hitCyl(P, ox, oy, oz, dx, dy, dz);
      case 'rod': return hitRod(P, ox, oy, oz, dx, dy, dz, px);
      case 'dish': return hitDish(P, ox, oy, oz, dx, dy, dz);
      default: return hitPoly(P, ox, oy, oz, dx, dy, dz);
    }
  }
  // how much of the Sun the other parts hide from a point
  function craftShade(parts, skip, ox, oy, oz, L) {
    var sh = 0;
    for (var i = 0; i < parts.length; i++) {
      if (i === skip || !hitPart(parts[i], ox, oy, oz, L[0], L[1], L[2], 0.004) || gT <= 1e-4) continue;
      if ((sh = Math.max(sh, gC)) >= 1) break;
    }
    return sh;
  }
  // one ray toward the camera (direction d), against the parts listed in
  // ids[i0..i1); returns its coverage and leaves its colour, premultiplied,
  // in out. Only the hits that show are shaded.
  function craftRay(parts, ids, i0, i1, ox, oy, oz, d, L, px, out) {
    HN = 0;
    for (var ii = i0; ii < i1 && HN < 16; ii++) {
      if (!hitPart(parts[ids[ii]], ox, oy, oz, d[0], d[1], d[2], px)) continue;
      // keep the hits in order, nearest first
      var j = HN++;
      while (j > 0 && HT[j - 1] < gT) {
        HT[j] = HT[j - 1]; HC[j] = HC[j - 1]; HX[j] = HX[j - 1]; HY[j] = HY[j - 1]; HZ[j] = HZ[j - 1]; HK[j] = HK[j - 1]; HI[j] = HI[j - 1]; HCol[j] = HCol[j - 1];
        j--;
      }
      HT[j] = gT; HC[j] = gC; HX[j] = gX; HY[j] = gY; HZ[j] = gZ; HK[j] = gK; HI[j] = ids[ii]; HCol[j] = gCol;
    }
    var acc = 0, r = 0, g = 0, b = 0;
    for (var h = 0; h < HN && acc < 0.999; h++) {
      var nx = HX[h], ny = HY[h], nz = HZ[h], nd = nx * d[0] + ny * d[1] + nz * d[2], t = HT[h], col = HCol[h];
      if (nd < 0) { nx = -nx; ny = -ny; nz = -nz; nd = -nd; }
      var nl = nx * L[0] + ny * L[1] + nz * L[2], lit = 0, spec = 0;
      if (nl > 0) {
        lit = nl * (1 - craftShade(parts, HI[h], ox + t * d[0] + nx * 0.002, oy + t * d[1] + ny * 0.002, oz + t * d[2] + nz * 0.002, L));
        var sp = parts[HI[h]].s;
        if (sp && lit > 0) {
          var rv = (2 * nl * nx - L[0]) * d[0] + (2 * nl * ny - L[1]) * d[1] + (2 * nl * nz - L[2]) * d[2];
          if (rv > 0) spec = sp * Math.pow(rv, 12) * lit / nl;
        }
      }
      var f = (0.8 * lit + 0.14 + 0.36 * nd) * HK[h] * (parts[HI[h]].gain || 1), w = (1 - acc) * HC[h];
      r += w * (col[0] * f + spec); g += w * (col[1] * f + spec); b += w * (col[2] * f + spec);
      acc += w;
    }
    out[0] = r; out[1] = g; out[2] = b;
    return acc;
  }

  // all of a model's parts, for a ray that may meet any of them
  var allIds = new Int16Array(64);
  for (var ci0 = 0; ci0 < allIds.length; ci0++) allIds[ci0] = ci0;
  // one ray through a whole model: from the point o (metres, the model's
  // frame) toward the camera along d, with the Sun along L, and footprint
  // the width of what the ray stands for (metres). Returns its coverage,
  // 0 to 1, and leaves its colour, premultiplied, in out.
  function ray(model, o, d, L, footprint, out) {
    var parts = model.parts;
    if (allIds.length < parts.length) { allIds = new Int16Array(parts.length); for (var q = 0; q < parts.length; q++) allIds[q] = q; }
    return craftRay(parts, allIds, 0, parts.length, o[0], o[1], o[2], d, L, footprint, out);
  }

  window.Spacecraft = {
    models: CRAFT,
    fleet: FLEET,
    orient: orient,
    ray: ray,
    rayParts: craftRay
  };
})();
