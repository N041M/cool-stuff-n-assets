/* ==========================================================================
   NIGHT SKY // the stars and galaxies behind everything else
   --------------------------------------------------------------------------
   Stars on the celestial sphere, with the Milky Way along the real
   galactic plane. A second sky of stars spread evenly, for a camera that
   looks at the galaxy from outside. Other galaxies far behind it, made
   up, a deep field of every kind.

   Everything here is placed by direction only, as a unit vector in
   ecliptic J2000 coordinates (x toward the March equinox, z toward the
   north pole of the ecliptic). The sky turns with a camera and never moves
   as the camera moves. Nothing here draws. night-sky-glyphs.js draws it
   with the glyph renderer.
   ========================================================================== */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
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
     Noise: gradient noise periodic in x, from the same seeded table as the
     planets' maps
     ------------------------------------------------------------------------ */
  var PERM = new Uint8Array(512);
  var GX = new Float32Array(256);
  var GY = new Float32Array(256);
  (function seedNoise(seed) {
    var s = seed >>> 0;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    var p = new Uint8Array(256), i;
    for (i = 0; i < 256; i++) p[i] = i;
    for (i = 255; i > 0; i--) { var j = (rnd() * (i + 1)) | 0, t = p[i]; p[i] = p[j]; p[j] = t; }
    for (i = 0; i < 512; i++) PERM[i] = p[i & 255];
    for (i = 0; i < 256; i++) { var a = rnd() * TAU; GX[i] = Math.cos(a); GY[i] = Math.sin(a); }
  })(0x6a5d39);

  function noise2(x, y, px) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var x0 = xi % px; if (x0 < 0) x0 += px;
    var x1 = x0 + 1; if (x1 >= px) x1 = 0;
    x0 &= 255; x1 &= 255;
    var y0 = yi & 255, y1 = (yi + 1) & 255;
    var h00 = PERM[PERM[x0] + y0], h10 = PERM[PERM[x1] + y0];
    var h01 = PERM[PERM[x0] + y1], h11 = PERM[PERM[x1] + y1];
    var n00 = GX[h00] * xf + GY[h00] * yf;
    var n10 = GX[h10] * (xf - 1) + GY[h10] * yf;
    var n01 = GX[h01] * xf + GY[h01] * (yf - 1);
    var n11 = GX[h11] * (xf - 1) + GY[h11] * (yf - 1);
    var u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    var v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    var a = n00 + (n10 - n00) * u;
    var b = n01 + (n11 - n01) * u;
    return (a + (b - a) * v) * 1.41;
  }
  function fbm(x, y, px, oct) {
    var sum = 0, amp = 0.5, f = 1, nrm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * noise2(x * f, y * f, px * f);
      nrm += amp; amp *= 0.5; f *= 2;
    }
    return sum / nrm;
  }

  /* ------------------------------------------------------------------------
     The galaxy's frame. The north galactic pole and the direction of the
     centre (l = 0, b = 0) are the IAU's, in J2000. x points toward the
     centre as seen from the Sun, y toward longitude 90 degrees and z toward
     the north pole, each as a unit vector in ecliptic coordinates.
     ------------------------------------------------------------------------ */
  var OBLIQUITY = 23.4392911 * DEG;
  function radec(ra, dec) {
    ra *= DEG; dec *= DEG;
    return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  }
  // equatorial (J2000) unit vector -> ecliptic
  function eqToEcl(v) {
    var c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
    return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
  }
  var FRAME = (function () {
    var z = eqToEcl(radec(192.85948, 27.12825)), c = eqToEcl(radec(266.40510, -28.93617));
    var k = c[0] * z[0] + c[1] * z[1] + c[2] * z[2];
    var x = [c[0] - k * z[0], c[1] - k * z[1], c[2] - k * z[2]], lx = Math.sqrt(x[0] * x[0] + x[1] * x[1] + x[2] * x[2]);
    x = [x[0] / lx, x[1] / lx, x[2] / lx];
    return { x: x, y: cross(z, x), z: z };
  })();

  /* ------------------------------------------------------------------------
     Stars on the celestial sphere, with the Milky Way along the real
     galactic plane. Each star has a direction d, a glyph, a tint (0 white,
     1 blue, 2 warm; see TINTS), a brightness a from 0 to 1, and a twinkle:
     how fast it goes (tw, radians a second), where it starts (ph) and how
     deep it is (amp).
     ------------------------------------------------------------------------ */
  var TINTS = [[255, 255, 255], [190, 210, 255], [255, 236, 214]];
  function skyDir(ra, dec) {
    ra *= DEG; dec *= DEG;
    var x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec), e = 23.4392911 * DEG;
    return [x, Math.cos(e) * y + Math.sin(e) * z, -Math.sin(e) * y + Math.cos(e) * z];
  }
  var STARS = null;
  function buildStars() {
    STARS = [];
    var s = 0x9e3779b9;
    function rnd() { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return s / 4294967296; }
    var GNP = skyDir(192.85948, 27.12825), GC = skyDir(266.405, -28.936);
    var tries = 0;
    while (STARS.length < 5200 && tries++ < 60000) {
      var z = rnd() * 2 - 1, a = rnd() * TAU, q = Math.sqrt(1 - z * z), d = [q * Math.cos(a), q * Math.sin(a), z];
      var bLat = Math.asin(clamp(dot(d, GNP), -1, 1)) / DEG, gcA = Math.acos(clamp(dot(d, GC), -1, 1)) / DEG;
      var band = Math.exp(-Math.pow(bLat / 10, 2)), bulge = Math.exp(-Math.pow(gcA / 22, 2));
      var dust = band * (0.55 + 0.45 * fbm(a * 3, z * 9, 256, 3)) + bulge * 0.8;
      var p = rnd(), st = null;
      if (p < 0.16 + dust * 0.22) {
        var m = Math.pow(rnd(), 3.2);
        var glyph = m > 0.82 ? '*' : m > 0.55 ? '+' : m > 0.25 ? (rnd() < 0.5 ? "'" : '.') : (rnd() < 0.7 ? '.' : '`');
        var hue = rnd();
        st = { d: d, glyph: glyph, tint: hue < 0.7 ? 0 : hue < 0.86 ? 1 : 2,
               a: 0.25 + 0.75 * m, tw: 0.5 + rnd() * 2.5, ph: rnd() * TAU, amp: m > 0.25 ? 0.35 : 0.15 };
      } else if (dust > 0.3 && rnd() < dust * 0.5) {
        st = { d: d, glyph: rnd() < 0.6 ? '.' : ',', tint: 2, a: 0.06 + dust * 0.10, tw: 0, ph: 0, amp: 0 };
      }
      if (st) STARS.push(st);
    }
  }
  // Over the galaxy a sky of its own twinkles in the empty space round it.
  // These stars are made like the ones above but spread evenly, since the
  // band of the Milky Way is not there to see from outside it, and brighter,
  // as the characters over the galaxy are smaller. Each has cut, a number
  // from 0 to 1, so they can thin out toward the middle of the galaxy's
  // disc, each from its own distance, and the sky and the disc run into
  // each other with no edge between them.
  var GSTARS = null;
  function buildGalStars() {
    GSTARS = [];
    var s = 0x51f15e7d;
    function rnd() { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return s / 4294967296; }
    for (var i = 0; i < 7000; i++) {
      var z = rnd() * 2 - 1, a = rnd() * TAU, q = Math.sqrt(1 - z * z), m = Math.pow(rnd(), 1.9), hue = rnd();
      var glyph = m > 0.8 ? '*' : m > 0.5 ? '+' : m > 0.22 ? (rnd() < 0.5 ? "'" : '.') : (rnd() < 0.7 ? '.' : '`');
      GSTARS.push({ d: [q * Math.cos(a), q * Math.sin(a), z], glyph: glyph, tint: hue < 0.7 ? 0 : hue < 0.86 ? 1 : 2,
                    a: 0.5 + 0.6 * m, tw: 0.5 + rnd() * 2.5, ph: rnd() * TAU, amp: m > 0.22 ? 0.4 : 0.2, cut: rnd() });
    }
  }

  /* ------------------------------------------------------------------------
     Other galaxies, far behind the Milky Way. They are made up, a deep
     field of every kind: spirals with two or three arms, barred spirals,
     patchy spirals with no clear arms, lenticulars with a smooth disc, ring
     galaxies, ellipticals and irregulars. Each has its own colours, and the
     young ones have pink knots where stars are forming. Seen edge-on, a
     disc shows a dark lane of dust along its middle. Some sit in small
     groups round a large elliptical. Like the stars they are placed by
     direction.
     ------------------------------------------------------------------------ */
  // types
  var SPIRAL = 0, BARRED = 1, ELLIPTICAL = 2, IRREGULAR = 3, LENTICULAR = 4, RING = 5, PATCHY = 6;
  var FAR = null;
  // A few large ones are set where the empty sky beside the Milky Way is
  // when a camera first looks down on it from the north galactic pole:
  // [across, up] from the middle of the screen in units of its focal
  // length, size in radians, how far the disc tips from face-on in degrees,
  // which way its axis leans, and type.
  var FAR_SET = [[-0.56, 0.28, 0.13, 28, 40, SPIRAL], [0.62, 0.3, 0.11, 84, 160, SPIRAL], [-0.62, -0.36, 0.085, 52, 250, BARRED],
                 [-0.36, 0.42, 0.05, 0, 0, ELLIPTICAL], [0.4, 0.42, 0.045, 40, 100, IRREGULAR]];
  function buildFar() {
    FAR = [];
    var s = 0x7a3c19e1, X = FRAME.x, Y = FRAME.y, Z = FRAME.z, i, j, k, tries;
    function rnd() { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return s / 4294967296; }
    function dir() { var z = rnd() * 2 - 1, a = rnd() * TAU, q = Math.sqrt(1 - z * z); return [q * Math.cos(a), q * Math.sin(a), z]; }
    // a direction within maxDeg of the south galactic pole, where the camera looks over the galaxy
    function capDir(maxDeg) {
      var cm = Math.cos(maxDeg * DEG), ct = cm + (1 - cm) * rnd(), st = Math.sqrt(1 - ct * ct), ph = rnd() * TAU, e = st * Math.cos(ph), w = st * Math.sin(ph);
      return [e * X[0] + w * Y[0] - ct * Z[0], e * X[1] + w * Y[1] - ct * Z[1], e * X[2] + w * Y[2] - ct * Z[2]];
    }
    // a direction an angle of up to `spread` radians from c
    function near(c, spread) {
      var e1 = norm(cross(c, Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), e2 = cross(c, e1), r = spread * Math.sqrt(rnd()), a = rnd() * TAU;
      return norm([c[0] + r * (Math.cos(a) * e1[0] + Math.sin(a) * e2[0]), c[1] + r * (Math.cos(a) * e1[1] + Math.sin(a) * e2[1]),
                   c[2] + r * (Math.cos(a) * e1[2] + Math.sin(a) * e2[2])]);
    }
    function pickType() {
      var u = rnd();
      return u < 0.3 ? SPIRAL : u < 0.44 ? BARRED : u < 0.56 ? PATCHY : u < 0.66 ? LENTICULAR : u < 0.71 ? RING : u < 0.88 ? ELLIPTICAL : IRREGULAR;
    }
    // axes on its disc that stay put, laid as the camera first sees it, so it
    // looks at first just as it was drawn
    function make(G) {
      var A = farAxes(G.n, [-Y[0], -Y[1], -Y[2]], X);
      G.e1 = A.L; G.e2 = A.M;
      G.arms = rnd() < 0.7 ? 2 : 3; G.tw = 1 / Math.tan((14 + 16 * rnd()) * DEG); G.ph = rnd() * TAU; G.seed = rnd() * 200;
      G.q = 0.45 + 0.55 * rnd();
      G.core = [1.0, 0.76 + 0.14 * rnd(), 0.48 + 0.22 * rnd()];
      G.arm = [0.55 + 0.3 * rnd(), 0.68 + 0.2 * rnd(), 1.0];
      if (G.type === LENTICULAR) G.arm = [0.98, 0.86 + 0.06 * rnd(), 0.72 + 0.1 * rnd()];
      if (G.type === ELLIPTICAL) G.core = [1.0, 0.7 + 0.15 * rnd(), 0.42 + 0.2 * rnd()];
      return G;
    }
    // kept only if it does not overlap one already placed
    function add(G) {
      for (var m = 0; m < FAR.length; m++) if (dot(FAR[m].d, G.d) > Math.cos((FAR[m].size + G.size) * 0.85)) return false;
      FAR.push(make(G));
      return true;
    }
    // the camera over the galaxy at first looks along -Z with -Y to the right and X up
    for (i = 0; i < FAR_SET.length; i++) {
      var f = FAR_SET[i], d = norm([-f[0] * Y[0] + f[1] * X[0] - Z[0], -f[0] * Y[1] + f[1] * X[1] - Z[1], -f[0] * Y[2] + f[1] * X[2] - Z[2]]);
      // the disc's axis tipped away from the line of sight
      var t = f[3] * DEG, l = f[4] * DEG, e = Math.sin(t) * Math.cos(l), w = Math.sin(t) * Math.sin(l);
      var n = [e * Y[0] + w * X[0] + Math.cos(t) * Z[0], e * Y[1] + w * X[1] + Math.cos(t) * Z[1], e * Y[2] + w * X[2] + Math.cos(t) * Z[2]];
      FAR.push(make({ d: d, n: n, type: f[5], size: f[2], bright: 1.1 }));
    }
    // small groups, each round a large elliptical
    for (i = 0; i < 2; i++) {
      for (tries = 0; tries < 40; tries++) if (add({ d: capDir(55), n: dir(), type: ELLIPTICAL, size: 0.038 + 0.014 * rnd(), bright: 1.0 })) break;
      var centre = FAR[FAR.length - 1].d, members = 3 + ((rnd() * 3) | 0);
      for (j = 0, k = 0; j < members && k < 60; k++) if (add({ d: near(centre, 0.12), n: dir(), type: pickType(), size: 0.02 + 0.014 * rnd(), bright: 1.0 + 0.3 * rnd() })) j++;
    }
    // the field: mostly small, some medium, a few larger
    for (i = 0, tries = 0; i < 70 && tries < 4000; tries++) {
      var u = rnd(), size = u < 0.7 ? 0.021 + 0.015 * Math.pow(rnd(), 1.5) : u < 0.95 ? 0.036 + 0.03 * rnd() : 0.066 + 0.03 * rnd();
      if (add({ d: capDir(62), n: dir(), type: pickType(), size: size, bright: size < 0.036 ? 1.0 + 0.4 * rnd() : 0.8 + 0.35 * rnd() })) i++;
    }
    // and over the rest of the sky, for when the camera tips or turns
    for (i = 0, tries = 0; i < 90 && tries < 4000; tries++) {
      var u2 = rnd(), size2 = u2 < 0.7 ? 0.021 + 0.015 * Math.pow(rnd(), 1.5) : u2 < 0.95 ? 0.036 + 0.03 * rnd() : 0.066 + 0.03 * rnd();
      if (add({ d: dir(), n: dir(), type: pickType(), size: size2, bright: size2 < 0.036 ? 1.0 + 0.4 * rnd() : 0.8 + 0.35 * rnd() })) i++;
    }
  }
  // A disc with axis n, seen by a camera with right R and up U, shows as an
  // ellipse whose long axis lies at pa on the screen. L is that axis in
  // space, and M the way across the disc that its short axis shows.
  function farAxes(n, R, U) {
    var pa = Math.atan2(-dot(n, U), dot(n, R)) + Math.PI / 2, c = Math.cos(pa), s = Math.sin(pa);
    var L = [c * R[0] - s * U[0], c * R[1] - s * U[1], c * R[2] - s * U[2]], M = cross(n, L);
    if (-s * dot(M, R) - c * dot(M, U) < 0) M = [-M[0], -M[1], -M[2]];
    return { pa: pa, L: L, M: M };
  }
  // Each one's face-on look is worked out once, the first time it is
  // wanted: its light on a grid of FAR_N x FAR_N across its disc, from -1.1
  // to 1.1 of its radius, and its pink knots on another. The bulge is left
  // out, so it can be added on the screen, round however the disc is tipped.
  var FAR_N = 40;
  function farSprite(G) {
    var n = FAR_N, I = new Float32Array(n * n), K = new Float32Array(n * n), sd = G.seed, ty = G.type;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var u = (x + 0.5) / n * 2.2 - 1.1, v = (y + 0.5) / n * 2.2 - 1.1, rr = Math.sqrt(u * u + v * v), L = 0, kn = 0;
      if (rr > 1.1) continue;
      var th = Math.atan2(v, u), wind = th - G.tw * Math.log(rr + 0.04);
      var grain = noise2(u * 9 + sd, v * 9 + sd + 40, 256);
      if (ty === ELLIPTICAL) L = 1.6 * Math.exp(-6 * Math.pow(rr, 0.7));
      else if (ty === LENTICULAR) L = 1.1 * Math.exp(-rr / 0.22);
      else if (ty === IRREGULAR) {
        L = Math.exp(-rr / 0.3) * clamp(0.4 + 1.2 * noise2(u * 5 + sd, v * 5 + sd, 256), 0, 1.4);
        kn = smoothstep(0.2, 0.55, grain) * Math.exp(-rr / 0.45);
      } else if (ty === RING) {
        var ring = Math.exp(-Math.pow((rr - 0.62) / 0.09, 2)) * (0.7 + 0.6 * noise2((th / TAU) * 10 + sd, sd, 10));
        L = 0.95 * ring + 0.12 * Math.exp(-rr / 0.3);
        kn = ring * smoothstep(0.15, 0.5, grain);
      } else if (ty === PATCHY) {
        var p = 0.5 + 0.5 * noise2((wind / TAU) * 14 + sd, rr * 5 + sd, 14);
        L = Math.exp(-rr / 0.3) * (0.3 + 1.0 * p * p);
        kn = p * p * smoothstep(0.25, 0.6, grain) * smoothstep(0.15, 0.3, rr);
      } else {
        var spiral = Math.pow(0.5 + 0.5 * Math.cos(G.arms * wind - G.ph), 3);
        var bar = ty === BARRED ? Math.exp(-(u * u) / 0.04 - (v * v) / 0.003) * 0.9 : 0;
        L = Math.exp(-rr / 0.32) * (0.25 + 1.1 * spiral) + bar;
        kn = spiral * spiral * smoothstep(0.3, 0.6, grain) * smoothstep(0.18, 0.35, rr) * (1 - smoothstep(0.7, 1.0, rr));
      }
      var edge = 1 - smoothstep(0.85, 1.1, rr);
      I[y * n + x] = L * edge; K[y * n + x] = kn * edge;
    }
    return { I: I, K: K };
  }

  window.NightSky = {
    // the stars of the sky, with the Milky Way along its band
    stars: function () { if (!STARS) buildStars(); return STARS; },
    // the stars round the galaxy, seen from outside it
    galaxyStars: function () { if (!GSTARS) buildGalStars(); return GSTARS; },
    // the other galaxies
    galaxies: function () { if (!FAR) buildFar(); return FAR; },
    // a galaxy's face-on picture, made the first time it is asked for
    galaxyImage: function (G) { if (!G.img) G.img = farSprite(G); return G.img; },
    discAxes: farAxes,
    IMAGE_N: FAR_N,
    TYPES: { spiral: SPIRAL, barred: BARRED, elliptical: ELLIPTICAL, irregular: IRREGULAR, lenticular: LENTICULAR, ring: RING, patchy: PATCHY },
    TINTS: TINTS,
    // the colour of the knots where stars are forming, 0 to 1
    KNOT: [1.0, 0.42, 0.68],
    frame: FRAME
  };
})();
