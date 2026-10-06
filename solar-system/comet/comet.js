/* ==========================================================================
   COMET // Halley's Comet: its coma, its jets and its dust and gas tails
   --------------------------------------------------------------------------
   The coma is a glow round the nucleus, brighter toward the middle as gas
   streaming out at an even speed is. The ion tail is a narrow beam the
   solar wind blows straight back from the Sun, tipped a few degrees by the
   comet's own speed. It breaks into thin rays with knots running out along
   them. The dust tail is made as the real one forms. Grains leave the
   nucleus over the last 45 days, and the Sun's light pushes each one
   outward with a share beta of the Sun's pull. Each grain then follows an
   orbit of its own, so the tail fans out and curves back along the comet's
   path. Grains leave mostly from the sunlit side, so the head has a
   rounded hood toward the Sun, and most of them leave in jets that curve
   away from the turning nucleus. Halley's activity rose and fell every
   7.4 days in 1986, and each rise leaves a band of grains that left
   together across the dust tail. All three grow as the comet comes in.

   Positions are heliocentric ecliptic J2000 coordinates in AU, and times
   are Julian days. Nothing here draws. comet-glyphs.js draws the comet
   with the glyph renderer.
   ========================================================================== */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var DEG = Math.PI / 180;
  var AU_KM = 149597870.7;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function smoothstep(a, b, x) {
    var t = (x - a) / (b - a);
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return t * t * (3 - 2 * t);
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  // Halley's orbit, heliocentric ecliptic J2000: q (AU), e, i, node, peri
  // (argument of perihelion, degrees) and T (JD of perihelion), from the
  // Minor Planet Center via Stellarium
  var HALLEY = { q: 0.5871036, e: 0.9672769, i: 162.24217, node: 58.86013, peri: 111.86566, T: 2446470.95895 };

  var GAUSS = 0.01720209895;   // rad/day, the Gaussian gravitational constant
  function rotateOrbit(el, x, y) {
    var w = el.peri * DEG, O = el.node * DEG, I = el.i * DEG;
    var cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(O), sn = Math.sin(O), ci = Math.cos(I), si = Math.sin(I);
    return [
      (cw * cn - sw * sn * ci) * x + (-sw * cn - cw * sn * ci) * y,
      (cw * sn + sw * cn * ci) * x + (-sw * sn + cw * cn * ci) * y,
      (sw * si) * x + (cw * si) * y
    ];
  }
  // position on an elliptic orbit (heliocentric ecliptic J2000, AU) at a JD
  function smallPosition(el, jd) {
    var e = el.e, a = el.q / (1 - e), M = GAUSS * (jd - el.T) / Math.pow(a, 1.5);
    M = Math.atan2(Math.sin(M), Math.cos(M));
    var E = M + 0.85 * e * (M >= 0 ? 1 : -1);
    for (var k = 0; k < 50; k++) {
      var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-13) break;
    }
    return rotateOrbit(el, a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E));
  }

  var GM_SUN = 2.959122e-4;                   // AU³ a day²
  var DUST_N = 20, DUST_A0 = 0.05, DUST_MIN = 0.01, DUST_DAYS = 45, DUST_BETA = [0.02, 0.06, 0.12, 0.22, 0.36, 0.55, 0.8, 1.0];
  // Most of Halley's dust came out in jets from a few sources on its
  // sunlit side, which swept round as the nucleus turned every 2.2 days.
  // Each source is a latitude and longitude on the nucleus, and a source
  // only works in sunlight. JET_SHARE of the dust leaves in the jets. The
  // jets are drawn from the large grains the Sun's light hardly pushes,
  // with beta up to JET_BETA, so each jet keeps its shape as it curves
  // away. They are followed for their first JET_AGE days, by which time
  // they have spread into the coma, and older grains are drawn as if they
  // had left from anywhere on the sunlit side.
  var JETS = [[20, 0], [-35, 130], [55, 250]], JET_DAYS = 2.2, JET_SHARE = 0.75, JET_BETA = 0.12, JET_AGE = 3;
  var COMA_KM = 3e5, PULSE_DAYS = 7.37, ION_MIN = 1e-4, ION_RAYS = 7, ION_COL = [0.55, 0.72, 1.0], DUST_COL = [1.0, 0.86, 0.62], COMA_COL = [0.8, 0.95, 0.85];
  // how active a comet is at r AU from the Sun: its coma, and its tails
  function comaActivity(r) { return smoothstep(3.2, 0.6, r); }
  function tailActivity(r) { return smoothstep(2.4, 0.7, r); }
  // position (AU) and velocity (AU a day) on a comet's orbit
  function cometState(el, jd) {
    var p = smallPosition(el, jd), a = smallPosition(el, jd + 0.01), b = smallPosition(el, jd - 0.01);
    return [p, [(a[0] - b[0]) / 0.02, (a[1] - b[1]) / 0.02, (a[2] - b[2]) / 0.02]];
  }
  // one Runge-Kutta step of h days of an orbit about the Sun with pull mu
  function orbitStep(p, v, h, mu) {
    function acc(x) { var r2 = x[0] * x[0] + x[1] * x[1] + x[2] * x[2], f = -mu / (r2 * Math.sqrt(r2)); return [x[0] * f, x[1] * f, x[2] * f]; }
    function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }
    var a1 = acc(p), v1 = v;
    var p2 = add(p, v1, h / 2), v2 = add(v, a1, h / 2), a2 = acc(p2);
    var p3 = add(p, v2, h / 2), v3 = add(v, a2, h / 2), a3 = acc(p3);
    var p4 = add(p, v3, h), v4 = add(v, a3, h), a4 = acc(p4);
    for (var i = 0; i < 3; i++) {
      p[i] += h / 6 * (v1[i] + 2 * v2[i] + 2 * v3[i] + v4[i]);
      v[i] += h / 6 * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]);
    }
  }
  // Where the dust is now relative to the nucleus, for grains that left at
  // DUST_N ages from DUST_A0 to DUST_DAYS days ago, evenly over the powers
  // of ten, and with each beta. It is kept divided by the square of the
  // age. That hardly changes for young grains, which have only begun to be
  // pushed back, so younger ones and those between the ages worked out are
  // read off in between. w is how much dust left at each age. The table is
  // kept for each comet and worked out again once its date has moved by
  // half an hour.
  function dustAge(i) { return DUST_A0 * Math.pow(DUST_DAYS / DUST_A0, i / (DUST_N - 1)); }
  var dust = { key: null, jd: NaN, off: null, w: null };
  function dustNow(key, el, jd) {
    if (dust.key === key && Math.abs(jd - dust.jd) < 1 / 48) return dust;
    var nb = DUST_BETA.length, now = smallPosition(el, jd);
    var off = new Float64Array(DUST_N * nb * 3), w = new Float64Array(DUST_N);
    for (var i = 0; i < DUST_N; i++) {
      var age = dustAge(i), st = cometState(el, jd - age), ia2 = 1 / (age * age);
      w[i] = tailActivity(Math.sqrt(dot(st[0], st[0])));
      for (var j = 0; j < nb; j++) {
        var q = st[0].slice(), v = st[1].slice(), n = Math.max(4, Math.ceil(age / 0.75)), o = (i * nb + j) * 3;
        for (var k = 0; k < n; k++) orbitStep(q, v, age / n, GM_SUN * (1 - DUST_BETA[j]));
        off[o] = (q[0] - now[0]) * ia2; off[o + 1] = (q[1] - now[1]) * ia2; off[o + 2] = (q[2] - now[2]) * ia2;
      }
    }
    dust = { key: key, jd: jd, off: off, w: w };
    return dust;
  }
  // The same scatter of points is used every time, so the tails hold still
  // as the camera moves: for the dust, where among the ages and betas, a
  // drift from the speed grains leave at and the jet they left in; for the
  // ion tail, how far along it and how far out to either side.
  var COMET_PTS = null;
  function cometPoints() {
    if (COMET_PTS) return COMET_PTS;
    function halton(i, b) { var f = 1, r = 0; for (; i > 0; i = Math.floor(i / b)) { f /= b; r += f * (i % b); } return r; }
    function gauss(i, b1, b2) { return Math.sqrt(-2 * Math.log(halton(i, b1) + 1e-9)) * Math.cos(TAU * halton(i, b2)); }
    var nd = 11000, ni = 3000, nj = 1000, n0 = nd - nj * JETS.length, D = new Float32Array(nd * 6), I = new Float32Array(ni * 3), i;
    for (i = 0; i < nd; i++) {
      // The first n0 grains leave from anywhere on the sunlit side and the
      // rest in the jets. Each jet has a run of points of its own, spread
      // evenly along it.
      var j = i < n0 ? -1 : Math.floor((i - n0) / nj), k = (j < 0 ? i : i - n0 - j * nj) + 1;
      D[i * 6] = halton(k, 2); D[i * 6 + 1] = halton(k, 3);
      D[i * 6 + 2] = gauss(k, 5, 7); D[i * 6 + 3] = gauss(k, 11, 13); D[i * 6 + 4] = gauss(k, 17, 19);
      D[i * 6 + 5] = j;
    }
    for (i = 0; i < ni; i++) { I[i * 3] = halton(i + 1, 2); I[i * 3 + 1] = gauss(i + 1, 3, 5); I[i * 3 + 2] = gauss(i + 1, 7, 11); }
    return (COMET_PTS = { nd: nd, n0: n0, nJ: nd - n0, D: D, ni: ni, I: I,
                          dust: { n: nd, pos: new Float64Array(nd * 3), w: new Float64Array(nd) },
                          ion: { n: ni, pos: new Float64Array(ni * 3), w: new Float64Array(ni) } });
  }

  /* ------------------------------------------------------------------------
     The comet at a moment: el, its orbit; jd, the Julian day; pos, where
     its nucleus is (AU); fade, a share from 0 to 1 that its activity is
     scaled by, to fade it out. The result holds its distance from the Sun
     (r, AU), how active its coma and tails are (0 to 1), the way from the
     Sun (u) and the way the ion tail points (dir) as unit vectors, the ion
     tail's length (AU), the coma's radius (AU), and how many days gas takes
     to cross the coma's bright core.
     ------------------------------------------------------------------------ */
  function at(el, jd, pos, fade) {
    if (fade == null) fade = 1;
    var r = Math.sqrt(pos[0] * pos[0] + pos[1] * pos[1] + pos[2] * pos[2]), coma = comaActivity(r) * fade, tail = tailActivity(r) * fade;
    // the ion tail points away from the Sun, tipped by the comet's speed
    // against a solar wind of 400 km/s
    var vel = cometState(el, jd)[1], kms = AU_KM / 86400;
    var u = [pos[0] / r, pos[1] / r, pos[2] / r];
    var d = norm([u[0] * 400 - vel[0] * kms, u[1] * 400 - vel[1] * kms, u[2] * 400 - vel[2] * kms]);
    return { el: el, jd: jd, pos: pos, r: r, coma: coma, tail: tail, u: u, dir: d,
             length: 0.15 * tail / Math.max(r, 0.45),
             comaRadius: COMA_KM / AU_KM * Math.sqrt(coma / Math.max(r, 0.5)),
             coreDays: 0.03 * COMA_KM * Math.sqrt(coma / Math.max(r, 0.5)) / (0.5 * 86400) };
  }

  // The dust tail's grains for the comet c from at(): where each one is
  // from the nucleus (pos, AU, three numbers a grain) and its light (w).
  // frame holds the nucleus's pole N, prime meridian Q and east E as unit
  // vectors, which turn the jets. key names the comet, for the table of
  // where its dust has gone. The arrays are reused by the next call.
  function dustTail(c, frame, key) {
    var pts = cometPoints(), jd = c.jd, u = c.u, coreDays = c.coreDays, P = pts.dust.pos, Wt = pts.dust.w, i, o, k;
    var Dn = dustNow(key || 'comet', c.el, jd), nb = DUST_BETA.length, lnD = Math.log(DUST_DAYS / DUST_MIN), lnJ = Math.log(JET_AGE / DUST_MIN), lnA = Math.log(DUST_MIN / DUST_A0);
    var perLn = (DUST_N - 1) / Math.log(DUST_DAYS / DUST_A0), q = [0, 0, 0], jetB = DUST_BETA.indexOf(JET_BETA);
    var Q = frame.Q, E = frame.E, N = frame.N;
    for (i = 0; i < pts.nd; i++) {
      o = i * 6;
      // Ages are spread evenly over the powers of ten, from 15 minutes to
      // 45 days, or to JET_AGE in a jet, so that every zoom has points at
      // the scale it shows. Each point's light is in step with its age,
      // over how closely the points of its kind lie, so the light is
      // still that of a steady outflow.
      var js = pts.D[o + 5], lnAge = pts.D[o] * (js < 0 ? lnD : lnJ), age = DUST_MIN * Math.exp(lnAge), a2 = age * age;
      var fa = clamp((lnAge + lnA) * perLn, 0, DUST_N - 1), fb = pts.D[o + 1] * (js < 0 ? nb - 1 : jetB);
      var share = js >= 0 ? JET_SHARE * lnJ / pts.nJ : (age < JET_AGE ? 1 - JET_SHARE : 1) * lnD / pts.n0;
      var a0 = Math.min(fa | 0, DUST_N - 2), b0 = Math.min(fb | 0, nb - 2), ta = fa - a0, tb = fb - b0;
      var w00 = (1 - ta) * (1 - tb) * a2, w01 = (1 - ta) * tb * a2, w10 = ta * (1 - tb) * a2, w11 = ta * tb * a2;
      var i00 = (a0 * nb + b0) * 3, i01 = i00 + 3, i10 = i00 + nb * 3, i11 = i10 + 3;
      for (k = 0; k < 3; k++) q[k] = Dn.off[i00 + k] * w00 + Dn.off[i01 + k] * w01 + Dn.off[i10 + k] * w10 + Dn.off[i11 + k] * w11;
      // Grains leave at about 0.5 km/s, more of them toward the Sun, and
      // the Sun's light turns them back, which spreads them as they age.
      // A grain from a jet left in a narrow cone along the jet as it
      // pointed then, so each jet leaves a curved trail.
      var drift = 0.5 * 86400 / AU_KM * age, lit = 1, o3 = i * 3;
      if (js < 0) {
        q[0] += (pts.D[o + 2] - u[0]) * drift; q[1] += (pts.D[o + 3] - u[1]) * drift; q[2] += (pts.D[o + 4] - u[2]) * drift;
      } else {
        var J = JETS[js], lon = J[1] * DEG + TAU * (jd - age) / JET_DAYS, cl = Math.cos(J[0] * DEG), sl = Math.sin(J[0] * DEG);
        var cq = cl * Math.cos(lon), sq = cl * Math.sin(lon);
        var nx = cq * Q[0] + sq * E[0] + sl * N[0], ny = cq * Q[1] + sq * E[1] + sl * N[1], nz = cq * Q[2] + sq * E[2] + sl * N[2];
        lit = -(nx * u[0] + ny * u[1] + nz * u[2]) * 2.5;
        q[0] += (nx + 0.12 * pts.D[o + 2]) * drift; q[1] += (ny + 0.12 * pts.D[o + 3]) * drift; q[2] += (nz + 0.12 * pts.D[o + 4]) * drift;
      }
      P[o3] = q[0]; P[o3 + 1] = q[1]; P[o3 + 2] = q[2];
      if (lit <= 0) { Wt[i] = 0; continue; }
      var cp = 0.5 + 0.5 * Math.cos(TAU * (jd - age) / PULSE_DAYS), c2 = cp * cp;
      // grains younger than it takes to cross the coma's core are dimmed
      // to keep the core as bright as it gets
      Wt[i] = share * lit * age * age / (age + coreDays) * (Dn.w[a0] * (1 - ta) + Dn.w[a0 + 1] * ta) * (0.35 + 1.3 * c2 * c2 * c2);
    }
    return pts.dust;
  }

  // The ion tail's points for the comet c from at(): where each one is
  // from the nucleus (pos, AU) and its light (w). The arrays are reused by
  // the next call.
  function ionTail(c) {
    var pts = cometPoints(), jd = c.jd, d = c.dir, Lion = c.length, P = pts.ion.pos, Wt = pts.ion.w, i, o;
    var e1 = norm(cross(d, Math.abs(d[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(d, e1), lnI = Math.log(Lion / ION_MIN);
    for (i = 0; i < pts.ni; i++) {
      o = i * 3;
      // each point on one of the rays, which fan out from the head at up to
      // 10 degrees and drift slowly round the axis
      var ray = i % ION_RAYS, spin = ray * 2.4 + jd * 0.3, tilt = 0.18 * ((ray + 0.5) / ION_RAYS - 0.5) * 2 * (ray % 2 ? 1 : 0.6);
      // spread evenly over the powers of ten along the tail, each point's
      // light in step with its distance
      var s = ION_MIN * Math.exp(pts.I[o] * lnI), wd = 0.0015 * Math.min(1, s / 0.01) + 0.008 * s, sp = s * tilt;
      var lx = Math.cos(spin) * sp + pts.I[o + 1] * wd, ly = Math.sin(spin) * sp + pts.I[o + 2] * wd;
      P[o] = d[0] * s + e1[0] * lx + e2[0] * ly; P[o + 1] = d[1] * s + e1[1] * lx + e2[1] * ly; P[o + 2] = d[2] * s + e1[2] * lx + e2[2] * ly;
      // knots carried out along the ray
      var knot = 0.55 + 0.45 * Math.cos(TAU * (s / 0.03 - jd * 4 + ray * 0.37));
      Wt[i] = s * (1 - 0.7 * s / Lion) * (0.5 + 0.5 * ((ray * 7) % 5) / 4) * knot;
    }
    return pts.ion;
  }

  window.Comet = {
    HALLEY: HALLEY,
    position: smallPosition,
    at: at,
    dust: dustTail,
    ion: ionTail,
    // the coma's radius at full activity, km
    COMA_KM: COMA_KM,
    colours: { dust: DUST_COL, ion: ION_COL, coma: COMA_COL }
  };
})();
