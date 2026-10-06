/* ==========================================================================
   SURFACES // what the Sun, the planets, their moons and the stars look like
   --------------------------------------------------------------------------
   Every body has a map, generated in the browser the first time it is
   needed. A small version is made at once and a full-size one can be
   refined a few rows at a time. Maps are equirectangular albedo in RGB:
   east longitude across, north at the top. Ring systems are radial
   profiles of opacity, albedo and colour, in units of the planet's
   equatorial radius.

   The surfaces follow the real bodies where it matters: the Earth is drawn
   from a Natural Earth land mask (earth-map.js), the Moon's maria, the
   Martian albedo features and the polar caps sit at their real
   coordinates, and the ring radii are the measured ones. Cloud features on
   the giants are not tied to real longitudes.
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
  function wrapDeg(d) { d = (d + 180) % 360; if (d < 0) d += 360; return d - 180; }
  function mix3(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

  /* ------------------------------------------------------------------------
     Noise. noise2 is gradient noise periodic in x (for maps that wrap in
     longitude); noise3 is Perlin's improved noise, used on the unit sphere
     so nothing pinches at the poles.
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
    var sum = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * noise2(x * f, y * f, px * f);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return sum / norm;
  }

  function grad3(h, x, y, z) {
    h &= 15;
    var u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14) ? x : z;
    return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
  }
  function noise3(x, y, z) {
    var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    x -= X; y -= Y; z -= Z;
    X &= 255; Y &= 255; Z &= 255;
    var u = x * x * x * (x * (x * 6 - 15) + 10);
    var v = y * y * y * (y * (y * 6 - 15) + 10);
    var w = z * z * z * (z * (z * 6 - 15) + 10);
    var A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z;
    var B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z;
    var x1 = x - 1, y1 = y - 1, z1 = z - 1;
    var a0 = grad3(PERM[AA], x, y, z), a1 = grad3(PERM[BA], x1, y, z);
    var b0 = grad3(PERM[AB], x, y1, z), b1 = grad3(PERM[BB], x1, y1, z);
    var c0 = grad3(PERM[AA + 1], x, y, z1), c1 = grad3(PERM[BA + 1], x1, y, z1);
    var d0 = grad3(PERM[AB + 1], x, y1, z1), d1 = grad3(PERM[BB + 1], x1, y1, z1);
    var e = a0 + (a1 - a0) * u, f = b0 + (b1 - b0) * u;
    var g = c0 + (c1 - c0) * u, h = d0 + (d1 - d0) * u;
    var i = e + (f - e) * v, j = g + (h - g) * v;
    return i + (j - i) * w;
  }
  function fbm3(x, y, z, oct) {
    var sum = 0, amp = 0.5, norm = 0;
    for (var i = 0; i < oct; i++) {
      sum += amp * noise3(x, y, z);
      norm += amp; amp *= 0.5; x *= 2.03; y *= 2.03; z *= 2.03;
    }
    return sum / norm;
  }

  // integer hash -> [0, 1)
  function hash3(x, y, z, s) {
    var h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(s | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  // unit vector for latitude / east longitude (degrees), body frame:
  // x toward longitude 0, y toward 90 E, z north
  function unit(lat, lon) {
    var cl = Math.cos(lat * DEG);
    return [cl * Math.cos(lon * DEG), cl * Math.sin(lon * DEG), Math.sin(lat * DEG)];
  }
  // a feature at a place on the sphere: centre, a local east/north frame and a size
  function spot(lat, lon, a, b, tilt) {
    var c = unit(lat, lon);
    var e = [-Math.sin(lon * DEG), Math.cos(lon * DEG), 0];
    var n = [-Math.sin(lat * DEG) * Math.cos(lon * DEG), -Math.sin(lat * DEG) * Math.sin(lon * DEG), Math.cos(lat * DEG)];
    var t = (tilt || 0) * DEG, ct = Math.cos(t), st = Math.sin(t);
    return { c: c, e: [e[0] * ct + n[0] * st, e[1] * ct + n[1] * st, e[2] * ct + n[2] * st],
             n: [n[0] * ct - e[0] * st, n[1] * ct - e[1] * st, n[2] * ct - e[2] * st],
             a: a * DEG, b: (b || a) * DEG };
  }
  // normalised elliptical distance of p from a spot (1 = on its edge),
  // measured as an angle along the sphere, so it keeps growing over the far
  // side even for a spot wider than a radian (Pluto's Cthulhu)
  function spotDist(S, x, y, z) {
    var d = x * S.c[0] + y * S.c[1] + z * S.c[2];
    if (d < 0 && S.a < 0.6 && S.b < 0.6) return 99;        // a small spot never reaches the far side
    var pe = x * S.e[0] + y * S.e[1] + z * S.e[2], pn = x * S.n[0] + y * S.n[1] + z * S.n[2];
    var s = Math.sqrt(pe * pe + pn * pn);
    if (s < 1e-12) return d > 0 ? 0 : 99;
    var k = Math.atan2(s, d) * Math.sqrt(d * d + s * s) / s;
    var u = pe * k / S.a, v = pn * k / S.b;
    return Math.sqrt(u * u + v * v);
  }

  // impact craters on a sphere: one candidate crater per lattice cell,
  // returns an albedo change. fresh craters get bright floors and ejecta.
  function craters(x, y, z, freq, seed, density, contrast) {
    x *= freq; y *= freq; z *= freq;
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), acc = 0;
    for (var dx = -1; dx <= 1; dx++) for (var dy = -1; dy <= 1; dy++) for (var dz = -1; dz <= 1; dz++) {
      var cx = xi + dx, cy = yi + dy, cz = zi + dz;
      if (hash3(cx, cy, cz, seed) > density) continue;
      var jx = cx + hash3(cx, cy, cz, seed + 1), jy = cy + hash3(cx, cy, cz, seed + 2), jz = cz + hash3(cx, cy, cz, seed + 3);
      var r = 0.14 + 0.42 * Math.pow(hash3(cx, cy, cz, seed + 4), 2.2);
      var ex = x - jx, ey = y - jy, ez = z - jz;
      var d = Math.sqrt(ex * ex + ey * ey + ez * ez) / r;
      if (d > 2.4) continue;
      var fresh = Math.pow(hash3(cx, cy, cz, seed + 5), 5);
      acc += 0.10 * Math.exp(-Math.pow((d - 0.95) / 0.14, 2))
           - 0.07 * smoothstep(0.95, 0.55, d) * (1 - fresh)
           + 0.16 * fresh * smoothstep(0.9, 0.2, d)
           + 0.10 * fresh * smoothstep(2.4, 1.0, d) * smoothstep(0.8, 1.0, d);
    }
    return acc * contrast;
  }

  // bright ray system around a young crater
  function rays(x, y, z, S, len, seed) {
    var d = x * S.c[0] + y * S.c[1] + z * S.c[2];
    if (d < 0.2) return 0;
    var ang = Math.acos(clamp(d, -1, 1));
    if (ang > len * 1.6) return 0;
    var th = Math.atan2(x * S.n[0] + y * S.n[1] + z * S.n[2], x * S.e[0] + y * S.e[1] + z * S.e[2]);
    var n = noise2(th / TAU * 12, seed, 12) * 0.6 + noise2(th / TAU * 30, seed + 7.7, 30) * 0.4;
    var streak = smoothstep(0.0, 0.6, n) * (0.6 + 0.4 * noise2(ang * 20, seed + 3.3, 256));
    return streak * Math.exp(-ang / (len * 0.45)) * smoothstep(0, 0.02, ang) + 0.5 * Math.exp(-ang / (len * 0.06));
  }

  /* ------------------------------------------------------------------------
     Banded atmospheres: a latitude profile, blurred, plus a colour ramp
     ------------------------------------------------------------------------ */
  var LUT_N = 1801; // 0.1 degree steps, +90 .. -90
  function bandProfile(bands, blurDeg, stripe) {
    var A = new Float32Array(LUT_N), T = new Float32Array(LUT_N), U = new Float32Array(LUT_N), S = new Float32Array(LUT_N);
    var rawA = new Float32Array(LUT_N), rawT = new Float32Array(LUT_N), rawU = new Float32Array(LUT_N), i, k;
    for (i = 0; i < LUT_N; i++) {
      var lat = 90 - i * 0.1;
      for (var b = 0; b < bands.length; b++) {
        var B = bands[b];
        if (lat <= B[0] && lat >= B[1]) { rawA[i] = B[2]; rawT[i] = B[3]; rawU[i] = B[4]; break; }
      }
      if (stripe) rawA[i] += stripe(lat);
    }
    var R = Math.ceil(blurDeg * 30), w = [], ws = 0, sig = blurDeg * 10;
    for (k = -R; k <= R; k++) { var g = Math.exp(-(k * k) / (2 * sig * sig)); w.push(g); ws += g; }
    for (i = 0; i < LUT_N; i++) {
      var sa = 0, st = 0, su = 0;
      for (k = -R; k <= R; k++) {
        var j = clamp(i + k, 0, LUT_N - 1), ww = w[k + R];
        sa += rawA[j] * ww; st += rawT[j] * ww; su += rawU[j] * ww;
      }
      A[i] = sa / ws; T[i] = st / ws; U[i] = su / ws;
    }
    var maxS = 1e-6;
    for (i = 0; i < LUT_N; i++) {
      var d = Math.abs(A[Math.min(i + 3, LUT_N - 1)] - A[Math.max(i - 3, 0)]);
      S[i] = d; if (d > maxS) maxS = d;
    }
    for (i = 0; i < LUT_N; i++) S[i] /= maxS;
    return { A: A, T: T, U: U, S: S };
  }
  function lutIdx(lat) { return clamp((90 - lat) * 10, 0, LUT_N - 1.001); }
  function lutGet(arr, f) { var i = f | 0, t = f - i; return arr[i] + (arr[i + 1] - arr[i]) * t; }

  function ramp(stops) {
    var n = 256, out = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1), k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      var a = stops[k], b = stops[k + 1];
      var c = mix3(a[1], b[1], clamp((t - a[0]) / (b[0] - a[0]), 0, 1));
      out[i * 3] = c[0]; out[i * 3 + 1] = c[1]; out[i * 3 + 2] = c[2];
    }
    return out;
  }
  function rampSet(R, t, A, out) {
    var i = clamp(Math.round(t * 255), 0, 255) * 3;
    out[0] = A * R[i]; out[1] = A * R[i + 1]; out[2] = A * R[i + 2];
  }

  /* ------------------------------------------------------------------------
     Jupiter: belts and zones, the Great Red Spot in the south, white ovals,
     brown barges in the north equatorial belt and festoons trailing from it
     ------------------------------------------------------------------------ */
  var JUP = null;
  function jupiterSetup() {
    if (JUP) return JUP;
    var prof = bandProfile([
      [ 90,  60, 0.46, 0.04, 1.00],   // north polar region
      [ 60,  50, 0.56, 0.16, 0.90],
      [ 50,  44, 0.74, 0.30, 0.65],
      [ 44,  37, 0.50, 0.52, 0.85],   // NNTB
      [ 37,  31, 0.86, 0.28, 0.50],   // NTZ
      [ 31,  24, 0.46, 0.64, 0.90],   // NTB
      [ 24,  18, 0.93, 0.24, 0.35],   // NTrZ
      [ 18,   7, 0.34, 0.82, 1.00],   // NEB
      [  7,  -7, 0.95, 0.36, 0.55],   // EZ
      [ -7, -19, 0.36, 0.86, 1.00],   // SEB
      [-19, -27, 0.94, 0.24, 0.35],   // STrZ
      [-27, -34, 0.52, 0.60, 0.85],   // STB
      [-34, -40, 0.85, 0.30, 0.50],   // STZ
      [-40, -46, 0.55, 0.48, 0.85],   // SSTB
      [-46, -57, 0.68, 0.22, 0.80],
      [-57, -90, 0.46, 0.04, 1.00]    // south polar region
    ], 1.1, function (lat) {
      return 0.035 * Math.sin(lat * 0.95) + 0.02 * Math.sin(lat * 1.7 + 1.1) - 0.10 * Math.exp(-Math.pow(lat / 1.4, 2));
    });
    var storms = [
      { lon: 128, lat: -22.5, a: 15.5, b: 7.2, spin: 2.9, kind: 'red' },
      { lon: 32,  lat: -33.6, a: 4.4, b: 2.5, spin: 2.2, kind: 'white' },
      { lon: 64,  lat: -33.2, a: 3.6, b: 2.2, spin: 2.2, kind: 'white' },
      { lon: 238, lat: -33.8, a: 4.6, b: 2.6, spin: 2.2, kind: 'white' },
      { lon: 300, lat: -41.5, a: 3.1, b: 1.9, spin: 1.8, kind: 'white' },
      { lon: 172, lat: -41.0, a: 2.7, b: 1.7, spin: 1.8, kind: 'white' },
      { lon: 12,  lat: 33.8,  a: 3.4, b: 2.0, spin: 1.8, kind: 'white' },
      { lon: 205, lat: 14.5,  a: 6.5, b: 1.9, spin: 1.2, kind: 'barge' },
      { lon: 330, lat: 15.0,  a: 5.2, b: 1.7, spin: 1.2, kind: 'barge' },
      { lon: 92,  lat: 13.8,  a: 5.8, b: 1.8, spin: 1.2, kind: 'barge' },
      { lon: 280, lat: 27.5,  a: 4.0, b: 1.6, spin: 1.0, kind: 'barge' }
    ];
    var festoons = [];
    for (var fi = 0; fi < 11; fi++) festoons.push({ lon: fi * (360 / 11) + 9 * Math.sin(fi * 2.3), len: 12 + 5 * Math.sin(fi * 1.7) });
    JUP = {
      prof: prof, storms: storms, great: storms[0], festoons: festoons,
      ramp: ramp([
        [0.00, [0.62, 0.68, 0.76]],   // cool polar grey-blue
        [0.18, [0.91, 0.92, 0.93]],   // white
        [0.38, [0.97, 0.93, 0.85]],   // cream
        [0.62, [0.93, 0.79, 0.62]],   // tan
        [0.84, [0.86, 0.60, 0.38]],   // orange-brown
        [1.00, [0.74, 0.38, 0.24]]    // rust
      ])
    };
    return JUP;
  }

  function genJupiter(lon, lat, px, py, pz, out) {
    var J = jupiterSetup(), P = J.prof, G = J.great, i, S;
    var sLat = lat, sLon = lon, turbBoost = 0;
    // vortices drag the surrounding bands into a swirl
    for (i = 0; i < J.storms.length; i++) {
      S = J.storms[i];
      var dx = wrapDeg(lon - S.lon) / S.a, dy = (lat - S.lat) / S.b;
      var r2 = dx * dx + dy * dy;
      if (r2 < 7) {
        var ang = S.spin * Math.exp(-r2 * 0.75) * (S.lat < 0 ? 1 : -1);
        var c = Math.cos(ang), s = Math.sin(ang);
        sLon = S.lon + (dx * c - dy * s) * S.a;
        sLat = S.lat + (dx * s + dy * c) * S.b;
      }
    }
    // turbulent wake west of the red spot, inside the south equatorial belt
    var wdx = wrapDeg(lon - G.lon);
    if (wdx < -8 && wdx > -110) {
      turbBoost = smoothstep(-110, -40, wdx) * smoothstep(-8, -22, wdx) * Math.exp(-Math.pow((lat + 15) / 5.5, 2)) * 1.6;
    }
    // wavy belt edges, stronger where the shear is
    var su = ((sLon % 360) + 360) % 360 / 360, sv = (90 - sLat) / 180;
    var w1 = fbm(su * 6, sv * 18, 6, 3);
    var w2 = fbm(su * 6 + 31.7, sv * 18 + 7.3, 6, 3);
    var shear = lutGet(P.S, lutIdx(sLat));
    var wl = sLat + (0.9 + 3.6 * shear) * w1 + 1.4 * Math.sin(su * TAU * 9 + w2 * 3) * shear;
    var wu = su + 0.012 * w2;
    var fb = lutIdx(wl);
    var A = lutGet(P.A, fb), T = lutGet(P.T, fb), turb = lutGet(P.U, fb) + turbBoost;
    // eddies stretched east-west, fine streaks
    var d1 = fbm(wu * 32 + w2 * 0.9, sv * 100 + w1 * 0.9, 32, 5);
    var d2 = fbm(wu * 64, (90 - wl) / 180 * 700, 64, 3);
    var d3 = turbBoost > 0.05 ? fbm(wu * 128 + d1, sv * 240, 128, 3) * turbBoost : 0;
    A += turb * 0.17 * d1 + 0.06 * d2 + 0.16 * d3;
    T += turb * 0.10 * d1 + 0.05 * d3;
    // festoons and hot spots along the south edge of the north equatorial belt
    if (lat < 10 && lat > -4) {
      for (i = 0; i < J.festoons.length; i++) {
        var F = J.festoons[i];
        var ft = (7.5 - lat) / 8;
        if (ft < -0.35 || ft > 1) continue;
        var tt = Math.max(ft, 0);
        var dl = wrapDeg(lon - (F.lon - F.len * tt + 4 * tt * tt));
        if (dl > 12 || dl < -12) continue;
        var width = 1.6 * (1 - 0.55 * tt) + 0.4;
        var plume = Math.exp(-(dl * dl) / (width * width)) * Math.pow(1 - tt, 0.6);
        if (ft < 0) plume = Math.exp(-(dl * dl) / 5) * smoothstep(-0.35, 0, ft);
        var hot = Math.exp(-(Math.pow(wrapDeg(lon - F.lon) / 2.6, 2) + Math.pow((lat - 7) / 1.3, 2)));
        A -= 0.30 * plume + 0.16 * hot;
        T -= 0.40 * plume + 0.30 * hot;
      }
    }
    // storm interiors
    for (i = 0; i < J.storms.length; i++) {
      S = J.storms[i];
      var ex = wrapDeg(lon - S.lon) / S.a, ey = (lat - S.lat) / S.b;
      var rr = Math.sqrt(ex * ex + ey * ey);
      if (rr > 1.6) continue;
      var th = Math.atan2(ey, ex);
      if (S.kind === 'red') {
        var spiral = noise2(th / TAU * 8 + rr * 5, rr * 4, 8) * 0.5 + fbm(ex * 3 + 50, ey * 3 + 50, 256, 3) * 0.5;
        var core = smoothstep(1.0, 0.75, rr);
        var collar = Math.exp(-Math.pow((rr - 1.08) / 0.13, 2));
        var inner = 0.52 + 0.14 * spiral + 0.12 * smoothstep(0.55, 0.0, rr) - 0.08 * Math.exp(-Math.pow((rr - 0.85) / 0.1, 2));
        A = A * (1 - core) + inner * core + 0.24 * collar;
        T = T * (1 - core) + (0.98 + 0.08 * spiral) * core - 0.35 * collar;
      } else if (S.kind === 'white') {
        var wc = smoothstep(1.0, 0.7, rr);
        var rim = Math.exp(-Math.pow((rr - 1.05) / 0.16, 2));
        A = A * (1 - wc) + (0.99 + 0.04 * noise2(ex * 4, ey * 4, 256)) * wc - 0.26 * rim;
        T = T * (1 - wc) + 0.14 * wc + 0.2 * rim;
      } else {
        var bc = smoothstep(1.1, 0.5, rr);
        A = A * (1 - bc) + 0.24 * bc;
        T = T * (1 - bc) + 1.0 * bc;
      }
    }
    // polar regions: mottled, cool, crowded with small cyclones
    var alat = Math.abs(lat);
    if (alat > 46) {
      var pb = smoothstep(46, 64, alat);
      var pr = (90 - alat) / 90 * 18;
      var qx = Math.cos(lon * DEG) * pr, qy = Math.sin(lon * DEG) * pr, off = lat < 0 ? 300 : 100;
      var pn = fbm(qx + off, qy + off, 256, 5);
      var pw = fbm(qx * 0.7 + 7, qy * 0.7 - 3, 256, 3);
      var cyc = smoothstep(0.30, 0.75, noise2(qx * 1.3 + 40 + pw, qy * 1.3 + 40 - pw, 256));
      var cyd = smoothstep(0.35, 0.80, noise2(qx * 1.7 - 70 - pw, qy * 1.7 - 10 + pw, 256));
      A = A * (1 - pb) + (0.44 + 0.22 * pn + 0.12 * cyc - 0.10 * cyd) * pb;
      T = T * (1 - pb) + (0.05 + 0.16 * pn + 0.08 * cyd) * pb;
    }
    rampSet(J.ramp, clamp(T, 0, 1), clamp(A, 0.04, 1.05), out);
  }

  /* ------------------------------------------------------------------------
     Saturn: soft butterscotch bands, the north polar hexagon
     ------------------------------------------------------------------------ */
  var SAT = null;
  function saturnSetup() {
    if (SAT) return SAT;
    SAT = {
      prof: bandProfile([
        [ 90,  88, 0.42, 0.62, 0.6],   // polar vortex
        [ 88,  79, 0.62, 0.52, 0.6],   // inside the hexagon
        [ 79,  75, 0.48, 0.72, 0.9],   // hexagon jet
        [ 75,  62, 0.66, 0.44, 0.7],
        [ 62,  55, 0.70, 0.58, 0.7],
        [ 55,  46, 0.80, 0.42, 0.6],
        [ 46,  40, 0.72, 0.60, 0.8],
        [ 40,  31, 0.87, 0.40, 0.5],
        [ 31,  19, 0.74, 0.66, 0.9],   // north equatorial belt
        [ 19,   3, 0.95, 0.38, 0.4],   // equatorial zone
        [  3,  -3, 0.89, 0.44, 0.5],
        [ -3, -19, 0.95, 0.36, 0.4],
        [-19, -30, 0.76, 0.64, 0.9],   // south equatorial belt
        [-30, -41, 0.86, 0.42, 0.5],
        [-41, -49, 0.74, 0.60, 0.8],
        [-49, -62, 0.77, 0.48, 0.6],
        [-62, -87, 0.64, 0.58, 0.7],
        [-87, -90, 0.46, 0.70, 0.6]
      ], 1.4, function (lat) { return 0.025 * Math.sin(lat * 1.3) + 0.018 * Math.sin(lat * 2.9 + 0.7); }),
      ramp: ramp([
        [0.00, [0.66, 0.72, 0.78]],
        [0.30, [0.98, 0.94, 0.82]],
        [0.60, [0.95, 0.82, 0.58]],
        [1.00, [0.80, 0.60, 0.40]]
      ])
    };
    return SAT;
  }

  function genSaturn(lon, lat, px, py, pz, out) {
    var P = saturnSetup().prof, l = lat;
    // the hexagon: a six-sided jet at 78 N that turns with the planet
    if (lat > 64) {
      var r = 90 - lat, th = ((lon % 60) + 60) % 60 - 30;
      var hex = 90 - r * Math.cos(th * DEG) / Math.cos(30 * DEG);
      l = lat + (hex - lat) * smoothstep(26, 18, r);
    }
    var su = ((lon % 360) + 360) % 360 / 360, sv = (90 - l) / 180;
    var w1 = fbm(su * 5, sv * 14, 5, 3), w2 = fbm(su * 5 + 13.1, sv * 14 + 3.3, 5, 3);
    var shear = lutGet(P.S, lutIdx(l));
    var wl = l + (0.5 + 1.8 * shear) * w1 + 0.6 * Math.sin(su * TAU * 7 + w2 * 3) * shear;
    var fb = lutIdx(wl);
    var A = lutGet(P.A, fb), T = lutGet(P.T, fb), turb = lutGet(P.U, fb);
    var d1 = fbm(su * 28 + w2, sv * 90 + w1, 28, 4);
    var d2 = fbm(su * 64, (90 - wl) / 180 * 600, 64, 3);
    A += turb * 0.07 * d1 + 0.035 * d2;
    T += turb * 0.06 * d1;
    // a few small white storms
    var st = [[42, 40], [118, 41.5], [251, 39.5], [300, -38], [190, -36]];
    for (var i = 0; i < st.length; i++) {
      var ex = wrapDeg(lon - st[i][0]) / 2.6, ey = (lat - st[i][1]) / 1.4;
      var d = ex * ex + ey * ey;
      if (d < 4) { A += 0.16 * Math.exp(-d * 1.6); T -= 0.18 * Math.exp(-d * 1.6); }
    }
    rampSet(SAT.ramp, clamp(T, 0, 1), clamp(A, 0.04, 1.05), out);
  }

  /* ------------------------------------------------------------------------
     Uranus and Neptune
     ------------------------------------------------------------------------ */
  function genUranus(lon, lat, px, py, pz, out) {
    var A = 0.90 + 0.025 * Math.sin(lat * 0.21) + 0.015 * fbm(lon / 360 * 6, (90 - lat) / 180 * 30, 6, 3);
    // the north pole, turned toward the Sun now, has a bright hood
    var cap = smoothstep(42, 62, lat), collar = Math.exp(-Math.pow((lat - 46) / 3.5, 2));
    A += 0.07 * cap + 0.04 * collar - 0.05 * smoothstep(-30, -70, lat);
    var c = mix3([0.66, 0.86, 0.90], [0.84, 0.95, 0.96], cap);
    out[0] = A * c[0]; out[1] = A * c[1]; out[2] = A * c[2];
  }

  var NEP_DARK = spot(-24, 118, 14, 7);
  var NEP_COMP = spot(-31, 112, 8, 1.6);
  function genNeptune(lon, lat, px, py, pz, out) {
    var su = ((lon % 360) + 360) % 360 / 360, sv = (90 - lat) / 180;
    var w = fbm(su * 6, sv * 16, 6, 3);
    var l = lat + 2.5 * w;
    var A = 0.80 + 0.06 * Math.sin(l * 0.12) - 0.16 * Math.exp(-Math.pow((l + 58) / 7, 2)) +
            0.06 * Math.exp(-Math.pow((l + 70) / 4, 2)) + 0.03 * fbm(su * 24 + w, sv * 70, 24, 4);
    var c = [0.42, 0.58, 0.88];
    // the dark spot and the bright methane cloud riding alongside it
    var dd = spotDist(NEP_DARK, px, py, pz);
    if (dd < 1.6) { A -= 0.28 * smoothstep(1.2, 0.6, dd); }
    var cloud = 0;
    var dc = spotDist(NEP_COMP, px, py, pz);
    if (dc < 1.5) cloud += smoothstep(1.2, 0.3, dc);
    // streaks of high cirrus at mid latitudes
    var s1 = Math.exp(-Math.pow((lat + 43) / 2.2, 2)), s2 = Math.exp(-Math.pow((lat - 28) / 2.5, 2));
    var n = fbm(su * 10, sv * 4 + 3, 10, 3);
    cloud += (s1 + s2) * smoothstep(0.05, 0.45, n);
    cloud = clamp(cloud, 0, 1);
    out[0] = A * (c[0] + (0.95 - c[0]) * cloud);
    out[1] = A * (c[1] + (0.97 - c[1]) * cloud);
    out[2] = A * (c[2] + (1.00 - c[2]) * cloud);
  }

  /* ------------------------------------------------------------------------
     Venus: an unbroken deck of sulphuric acid cloud, faint streaks
     ------------------------------------------------------------------------ */
  function genVenus(lon, lat, px, py, pz, out) {
    var su = ((lon % 360) + 360) % 360 / 360, sv = (90 - lat) / 180;
    var w = fbm(su * 4, sv * 6, 4, 3);
    // the sideways Y: dark arms that open toward the west
    var y = lat - 18 * Math.sin(su * TAU + w) * smoothstep(0, 40, Math.abs(lat));
    var A = 0.92 - 0.045 * Math.exp(-Math.pow(y / 14, 2)) + 0.03 * fbm(su * 16 + w, sv * 20, 16, 4) +
            0.035 * smoothstep(55, 75, Math.abs(lat));
    out[0] = A * 0.97; out[1] = A * 0.90; out[2] = A * 0.73;
  }

  /* ------------------------------------------------------------------------
     Mercury and the Moon: cratered rock
     ------------------------------------------------------------------------ */
  var CALORIS = spot(31.5, 162.7, 18);
  var MERC_RAYS = [spot(58.0, 16.8, 1), spot(-11.3, -30.9, 1), spot(-21, 171, 1)];
  function genMercury(lon, lat, px, py, pz, out) {
    var A = 0.56 + 0.07 * fbm3(px * 3, py * 3, pz * 3, 4) + 0.03 * fbm3(px * 14, py * 14, pz * 14, 3);
    var cd = spotDist(CALORIS, px, py, pz);
    if (cd < 1.3) A += 0.06 * smoothstep(1.0, 0.7, cd) - 0.05 * Math.exp(-Math.pow((cd - 1.02) / 0.06, 2));
    A += craters(px, py, pz, 6, 11, 0.55, 0.8) + craters(px, py, pz, 15, 23, 0.45, 0.6) + craters(px, py, pz, 34, 37, 0.4, 0.45);
    for (var i = 0; i < MERC_RAYS.length; i++) A += 0.18 * rays(px, py, pz, MERC_RAYS[i], 0.30, 3 + i * 5.1);
    A = clamp(A, 0.1, 1);
    out[0] = A * 0.97; out[1] = A * 0.93; out[2] = A * 0.87;
  }

  // lunar maria at their selenographic coordinates (lat, east lon, semi-axes)
  var MARIA = [
    spot(32.8, -15.6, 17, 16), spot(28.0, 17.5, 10.5), spot(8.5, 31.4, 13, 11), spot(17.0, 59.1, 8, 7),
    spot(-7.8, 51.3, 11, 13), spot(-15.2, 35.5, 5.5), spot(-21.3, -16.6, 10, 9), spot(-24.4, -38.6, 6),
    spot(56.0, 1.4, 34, 5), spot(13.3, 3.6, 4), spot(-10.0, -23.1, 6), spot(7.5, -30.9, 8, 7),
    spot(18.0, -57.0, 15, 22, 15), spot(35.0, -48.0, 10, 13), spot(-2.0, -48.0, 11, 9), spot(-19.4, -92.8, 4.5),
    spot(1.3, 87.5, 5), spot(13.3, 86.1, 5), spot(27.3, 147.9, 4), spot(-35.0, 162.0, 5, 3), spot(-25.0, 14.0, 4.5, 3)
  ];
  var TYCHO = spot(-43.3, -11.2, 1), COPERNICUS = spot(9.6, -20.1, 1), KEPLER = spot(8.1, -38.0, 1), ARISTARCHUS = spot(23.7, -47.4, 1);
  function genMoon(lon, lat, px, py, pz, out) {
    var A = 0.66 + 0.05 * fbm3(px * 4, py * 4, pz * 4, 4), mare = 0;
    // warp the outline so the maria flood into each other irregularly
    var qx = px + 0.10 * fbm3(px * 3 + 5, py * 3, pz * 3, 3), qy = py + 0.10 * fbm3(px * 3, py * 3 + 5, pz * 3, 3);
    var qz = pz + 0.10 * fbm3(px * 3, py * 3, pz * 3 + 5, 3);
    for (var i = 0; i < MARIA.length; i++) {
      var d = spotDist(MARIA[i], qx, qy, qz);
      if (d < 1.6) {
        var edge = 1.12 + 0.3 * fbm3(px * 8 + i, py * 8, pz * 8, 3);
        mare = Math.max(mare, smoothstep(1.05, 0.75, d / edge));
      }
    }
    A = A * (1 - mare) + (0.34 + 0.04 * fbm3(px * 12, py * 12, pz * 12, 3)) * mare;
    A += craters(px, py, pz, 5, 41, 0.35, 0.6 - 0.35 * mare) + craters(px, py, pz, 13, 53, 0.4, 0.5 - 0.3 * mare) +
         craters(px, py, pz, 30, 67, 0.4, 0.4 - 0.25 * mare);
    A += 0.30 * rays(px, py, pz, TYCHO, 0.55, 1.3) + 0.20 * rays(px, py, pz, COPERNICUS, 0.30, 4.1) +
         0.12 * rays(px, py, pz, KEPLER, 0.18, 7.7) + 0.35 * Math.exp(-Math.pow(spotDist(ARISTARCHUS, px, py, pz) / 0.9, 2));
    A = clamp(A, 0.08, 1);
    var warm = 1 - 0.06 * mare;
    out[0] = A * 0.98 * warm; out[1] = A * 0.96; out[2] = A * (0.92 + 0.05 * mare);
  }

  /* ------------------------------------------------------------------------
     Mars: rust plains, dark albedo features, polar caps
     ------------------------------------------------------------------------ */
  var MARS_DARK = [
    [spot(9, 69.5, 9, 14, 10), 1.0],     // Syrtis Major
    [spot(-3, 5, 13, 4), 0.9],           // Sinus Meridiani
    [spot(-8, 22, 18, 5), 0.85],         // Sinus Sabaeus
    [spot(-25, -38, 24, 11), 0.8],       // Mare Erythraeum
    [spot(46, -28, 16, 11), 0.85],       // Mare Acidalium
    [spot(-18, 108, 18, 9), 0.8],        // Mare Tyrrhenum
    [spot(-22, 142, 24, 8), 0.75],       // Mare Cimmerium
    [spot(-30, -152, 20, 7), 0.75],      // Mare Sirenum
    [spot(-26, -86, 6, 5), 0.6],         // Solis Lacus
    [spot(46, 112, 20, 10), 0.45],       // Utopia
    [spot(-14, -52, 9, 5), 0.6]          // Aurorae Sinus
  ];
  var MARS_BRIGHT = [[spot(-42.4, 70.5, 17), 0.55], [spot(-49.7, -43.4, 9), 0.4], [spot(20, 5, 20, 14), 0.25], [spot(5, -110, 25, 20), 0.15]];
  var OLYMPUS = spot(18.65, -133.8, 3);
  function genMars(lon, lat, px, py, pz, out) {
    var n = fbm3(px * 4, py * 4, pz * 4, 5), n2 = fbm3(px * 11 + 5, py * 11, pz * 11, 3);
    var dark = 0, bright = 0, i;
    var qx = px + 0.16 * fbm3(px * 2.5 + 3, py * 2.5, pz * 2.5, 4), qy = py + 0.16 * fbm3(px * 2.5, py * 2.5 + 3, pz * 2.5, 4);
    var qz = pz + 0.16 * fbm3(px * 2.5, py * 2.5, pz * 2.5 + 3, 4);
    for (i = 0; i < MARS_DARK.length; i++) {
      var d = spotDist(MARS_DARK[i][0], qx, qy, qz) * (1 + 0.3 * n2);
      if (d < 1.8) dark = Math.max(dark, MARS_DARK[i][1] * smoothstep(1.4, 0.3, d));
    }
    // the dark collar round the north cap
    dark = Math.max(dark, 0.45 * Math.exp(-Math.pow((lat - 71 - 3 * n) / 5, 2)) * (0.6 + 0.6 * n2));
    for (i = 0; i < MARS_BRIGHT.length; i++) {
      var b = spotDist(MARS_BRIGHT[i][0], px, py, pz);
      if (b < 1.4) bright = Math.max(bright, MARS_BRIGHT[i][1] * smoothstep(1.2, 0.5, b));
    }
    dark = clamp(dark + 0.25 * n2 * dark, 0, 1);
    // Valles Marineris, a long dark scar
    var vm = Math.exp(-Math.pow((lat + 9 + 3 * Math.sin((lon + 70) * 0.06)) / 1.3, 2)) * smoothstep(-100, -88, lon) * smoothstep(-35, -48, lon);
    dark = Math.max(dark, 0.7 * vm);
    var om = spotDist(OLYMPUS, px, py, pz);
    bright += 0.15 * Math.exp(-Math.pow((om - 1) / 0.25, 2));
    var A = 0.82 + 0.12 * n + 0.12 * bright - 0.55 * dark;
    A += craters(px, py, pz, 9, 71, 0.35, 0.35);
    var c = mix3([0.86, 0.54, 0.33], [0.48, 0.34, 0.27], dark);
    // polar caps: water ice in the north, carbon dioxide ice offset in the south
    var cap = Math.max(smoothstep(80.5, 83, lat + 1.5 * n2), smoothstep(-84.5, -86.5, lat + 2 * n2 - 1.5 * Math.cos((lon + 45) * DEG)));
    A = A * (1 - cap) + 0.98 * cap;
    c = mix3(c, [0.97, 0.96, 0.94], cap);
    A = clamp(A, 0.1, 1);
    out[0] = A * c[0]; out[1] = A * c[1]; out[2] = A * c[2];
  }

  /* ------------------------------------------------------------------------
     The Earth: Natural Earth land and ice and rough biomes. The clouds are a
     map of their own (genEarthClouds), to be laid over the ground and moved
     with the winds.
     ------------------------------------------------------------------------ */
  var EM = null;
  function earthMask() {
    if (EM) return EM;
    var src = window.EARTH_MASK;
    if (!src) { EM = { w: 1, h: 1, m: new Uint8Array(1) }; return EM; }
    var m = new Uint8Array(src.w * src.h), rows = src.rle.split('|');
    for (var y = 0; y < rows.length; y++) {
      var runs = rows[y].split(','), x = y * src.w;
      for (var i = 0; i < runs.length; i++) {
        var v = +runs[i][0], n = parseInt(runs[i].slice(1), 36);
        m.fill(v, x, x + n); x += n;
      }
    }
    EM = { w: src.w, h: src.h, m: m };
    return EM;
  }
  function maskAt(lon, lat) {
    var M = earthMask();
    var fx = (lon + 180) / 360 * M.w - 0.5, fy = (90 - lat) / 180 * M.h - 0.5;
    var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    var land = 0, ice = 0;
    for (var k = 0; k < 4; k++) {
      var xx = ((x0 + (k & 1)) % M.w + M.w) % M.w, yy = clamp(y0 + (k >> 1), 0, M.h - 1);
      var w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty), v = M.m[yy * M.w + xx];
      if (v) land += w;
      if (v === 2) ice += w;
    }
    EM.land = land; EM.ice = ice;
  }
  // deserts and steppes: [lat0, lat1, lon0, lon1, strength]
  var DESERTS = [
    [15, 32, -17, 33, 1], [14, 31, 34, 58, 1], [24, 37, 50, 71, 0.75], [23, 30, 68, 75, 0.6],
    [36, 48, 52, 75, 0.55], [37, 42, 76, 92, 0.9], [38, 47, 92, 118, 0.75], [-32, -19, 116, 144, 0.85],
    [-28, -17, 12, 25, 0.6], [-28, -16, -71, -68, 0.8], [-50, -38, -71, -64, 0.5], [25, 40, -119, -103, 0.6],
    [0, 12, 38, 52, 0.5], [-35, -27, 135, 145, 0.4]
  ];
  var CYCLONES = [[52, -35], [58, 165], [47, -160], [55, 20], [-50, -10], [-55, 80], [-48, 150], [-58, -110]];
  var CYCLONE_AXES = CYCLONES.map(function (c) { return unit(c[0], c[1]); }), CYCLONE_EDGE = Math.exp(-6 * 0.8);
  function genEarth(lon, lat, px, py, pz, out) {
    maskAt(lon, lat);
    var land = EM.land, ice = EM.ice, i;
    var n = fbm3(px * 5, py * 5, pz * 5, 5), n2 = fbm3(px * 16 + 3, py * 16, pz * 16, 3);
    // land: forest / grass / savanna / desert / tundra by latitude and the desert boxes
    var arid = 0;
    for (i = 0; i < DESERTS.length; i++) {
      var D = DESERTS[i];
      var a = smoothstep(D[0] - 7, D[0] + 4, lat) * smoothstep(D[1] + 7, D[1] - 4, lat) *
              smoothstep(D[2] - 8, D[2] + 4, lon) * smoothstep(D[3] + 8, D[3] - 4, lon);
      arid = Math.max(arid, a * D[4]);
    }
    arid = smoothstep(0.2, 0.8, arid + 0.45 * n + 0.15 * n2);
    var forest = clamp(Math.exp(-Math.pow(lat / 11, 2)) + Math.exp(-Math.pow((lat - 58) / 8, 2)) * 0.9 + 0.3 * n2, 0, 1) * (1 - arid);
    var tundra = smoothstep(62, 72, lat) + smoothstep(-55, -60, lat) * 0.5;
    var L = mix3([0.28, 0.33, 0.17], [0.13, 0.22, 0.10], forest);              // grass -> forest
    L = mix3(L, [0.50, 0.46, 0.27], smoothstep(0.2, 0.55, arid));             // savanna
    var desert = lon > 110 && lat < -10 ? [0.76, 0.50, 0.30] : [0.82, 0.70, 0.49];
    L = mix3(L, desert, smoothstep(0.5, 0.9, arid));                           // desert
    L = mix3(L, [0.44, 0.42, 0.36], clamp(tundra, 0, 1));
    L = mix3(L, [0.93, 0.95, 0.98], ice);
    var sea = [0.020, 0.060, 0.150];
    var r = sea[0] + (L[0] - sea[0]) * land, g = sea[1] + (L[1] - sea[1]) * land, b = sea[2] + (L[2] - sea[2]) * land;
    // sea ice around Antarctica and in the Arctic
    var seaIce = smoothstep(-62, -68, lat + 3 * n) + smoothstep(78, 84, lat + 3 * n);
    seaIce *= 1 - land;
    out[0] = r + (0.85 - r) * seaIce; out[1] = g + (0.88 - g) * seaIce; out[2] = b + (0.92 - b) * seaIce;
  }

  // The clouds: warped noise swirled round a few mid-latitude lows. Each low
  // turns the point about its centre by an angle that falls to exactly zero
  // at its edge, and overlapping lows compose, so the field has no seams.
  // The map holds the noise (red, 0.5 = zero) and how bright the cloud tops
  // are (green). Whoever draws the clouds adds the cover for the latitude
  // (cloudCover) and turns the sum into cloud (cloudOf).
  function genEarthClouds(lon, lat, px, py, pz, out) {
    var i, qx = px, qy = py, qz = pz;
    for (i = 0; i < CYCLONES.length; i++) {
      var cu = CYCLONE_AXES[i], cd = clamp(px * cu[0] + py * cu[1] + pz * cu[2], -1, 1);
      var ad = Math.acos(cd) / DEG, d2 = ad * ad / 120;
      if (d2 < 6) {
        var ang = 1.7 * (Math.exp(-d2 * 0.8) - CYCLONE_EDGE) / (1 - CYCLONE_EDGE) * (CYCLONES[i][0] > 0 ? 1 : -1);
        var c = Math.cos(ang), s = Math.sin(ang), kd = (qx * cu[0] + qy * cu[1] + qz * cu[2]) * (1 - c);
        var rx = qx * c + (cu[1] * qz - cu[2] * qy) * s + cu[0] * kd;
        var ry = qy * c + (cu[2] * qx - cu[0] * qz) * s + cu[1] * kd;
        var rz = qz * c + (cu[0] * qy - cu[1] * qx) * s + cu[2] * kd;
        qx = rx; qy = ry; qz = rz;
      }
    }
    var wx = fbm3(qx * 2 + 9, qy * 2, qz * 2, 3), wy = fbm3(qx * 2, qy * 2 + 9, qz * 2, 3);
    var cn = fbm3(qx * 4 + wx * 1.4, qy * 4 * 1.0 + wy * 1.4, qz * 9, 5);
    var n2 = fbm3(px * 16 + 3, py * 16, pz * 16, 3);
    out[0] = clamp(0.5 + 0.45 * cn, 0, 1);
    out[1] = 0.75 + 0.25 * smoothstep(-0.3, 0.3, n2);
    out[2] = 0;
  }
  // how cloudy a latitude is on average: the tropics' cloud band, the clear
  // subtropics, the storm tracks at mid latitudes
  function cloudCover(lat) {
    var alat = Math.abs(lat);
    return 0.42 + 0.20 * Math.exp(-Math.pow((lat - 6) / 6, 2)) - 0.22 * Math.exp(-Math.pow((alat - 24) / 9, 2)) +
           0.24 * Math.exp(-Math.pow((alat - 55) / 12, 2));
  }
  // how much cloud: the noise plus the cover for the latitude, through a
  // soft threshold, times how bright the tops are
  function cloudOf(noise, cover, bright) { return smoothstep(0.30, 0.68, noise + cover) * bright * 0.94; }
  // the share of the globe under cloud, from the coarse map, for the colour
  // of the Earth when it is only a dot
  function cloudShare(L) {
    var sum = 0, sw = 0;
    for (var y = 0; y < L.h; y++) {
      var lat = 90 - (y + 0.5) / L.h * 180, wt = Math.cos(lat * DEG), cv = cloudCover(lat);
      for (var x = 0; x < L.w; x++) {
        var o = (y * L.w + x) * 3;
        sum += cloudOf((L.d[o] / 255 - 0.5) * 2, cv, L.d[o + 1] / 255) * wt; sw += wt;
      }
    }
    return sum / sw;
  }
  // the winds that carry the clouds over the ground, in m/s toward the east:
  // the trade winds blow west, the westerlies east, the polar easterlies west
  function cloudWind(lat) {
    var alat = Math.abs(lat);
    return -7 * Math.exp(-Math.pow((alat - 12) / 12, 2)) + 13 * Math.exp(-Math.pow((alat - 45) / 12, 2)) -
           4 * Math.exp(-Math.pow((alat - 72) / 8, 2));
  }

  /* ------------------------------------------------------------------------
     The Sun: granulation, a few sunspot groups in the active latitudes
     ------------------------------------------------------------------------ */
  var SUNSPOTS = (function () {
    var out = [], s = 7;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    for (var g = 0; g < 7; g++) {
      var lat = (rnd() < 0.5 ? -1 : 1) * (8 + rnd() * 20), lon = rnd() * 360, n = 2 + ((rnd() * 4) | 0);
      for (var k = 0; k < n; k++) {
        var r = 0.5 + rnd() * (k ? 1.1 : 1.9);
        out.push(spot(lat + (rnd() - 0.5) * 3, lon + k * (2 + rnd() * 3), r * 1.3, r));
      }
    }
    return out;
  })();
  function genSun(lon, lat, px, py, pz, out) {
    var A = 0.93 + 0.05 * fbm3(px * 50, py * 50, pz * 50, 2) + 0.025 * fbm3(px * 9, py * 9, pz * 9, 3), fac = 0;
    for (var i = 0; i < SUNSPOTS.length; i++) {
      var d = spotDist(SUNSPOTS[i], px, py, pz);
      if (d > 4) continue;
      A -= 0.62 * smoothstep(0.55, 0.35, d) + 0.30 * smoothstep(1.0, 0.7, d) * smoothstep(0.35, 0.55, d);
      fac += 0.05 * smoothstep(4, 1.2, d) * smoothstep(0.9, 1.3, d);
    }
    A = clamp(A + fac, 0.12, 1.05);
    out[0] = A; out[1] = A * 0.93; out[2] = A * 0.80;
  }

  /* ------------------------------------------------------------------------
     The other stars, made like the Sun: granulation, spots, and the colour
     of their temperature. Proxima is a red dwarf about 3,000 K, with large
     starspots and the bright patches of its flares. Alpha Centauri A is a
     little warmer than the Sun and B a little cooler. Arcturus and Polaris
     have spots too, and Betelgeuse has a few convection cells so large
     that each covers a good part of its face. The spots and cells are made
     up. Sirius A and B, Vega and Rigel are hot stars with no large spots,
     and are drawn smooth. Vega turns fast enough to be 10,070 K at its
     poles and 8,910 K at its equator (Monnier et al. 2012).
     ------------------------------------------------------------------------ */
  function starGen(o) {
    var list = [], s = o.seed;
    function rnd() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }
    for (var g = 0; g < o.groups; g++) {
      var lat = (rnd() < 0.5 ? -1 : 1) * (o.lat[0] + rnd() * (o.lat[1] - o.lat[0])), lon = rnd() * 360, n = 1 + ((rnd() * 3) | 0);
      for (var k = 0; k < n; k++) {
        var r = o.size * (0.5 + rnd() * (k ? 0.8 : 1.4));
        list.push(spot(lat + (rnd() - 0.5) * o.size, lon + k * o.size * (0.8 + rnd()), r * 1.3, r));
      }
    }
    var plage = (o.plage || []).map(function (p) { return spot(p[0], p[1], p[2], p[2]); });
    return function (lon, lat, px, py, pz, out) {
      var A = 0.93 + (o.gran ? o.gran * fbm3(px * o.freq, py * o.freq, pz * o.freq, 2) : 0) + 0.025 * fbm3(px * 9, py * 9, pz * 9, 3), i, d;
      for (i = 0; i < list.length; i++) {
        d = spotDist(list[i], px, py, pz);
        if (d > 3) continue;
        A -= o.dark * smoothstep(0.55, 0.3, d) + 0.3 * o.dark * smoothstep(1.0, 0.7, d) * smoothstep(0.3, 0.55, d);
      }
      for (i = 0; i < plage.length; i++) { d = spotDist(plage[i], px, py, pz); if (d < 1.5) A += 0.22 * smoothstep(1.2, 0.3, d); }
      A = clamp(A, 0.1, 1.15);
      var t = o.tint;
      if (o.equator) {
        // a star spinning near break-up is cooler, dimmer and redder round its equator
        var w = 1 - pz * pz, q = o.equator[1];
        A *= 1 - o.equator[0] * w;
        out[0] = A * (t[0] + (q[0] - t[0]) * w); out[1] = A * (t[1] + (q[1] - t[1]) * w); out[2] = A * (t[2] + (q[2] - t[2]) * w);
        return;
      }
      out[0] = A * t[0]; out[1] = A * t[1]; out[2] = A * t[2];
    };
  }
  var genProxima = starGen({ seed: 41, groups: 9, lat: [5, 70], size: 9, dark: 0.55, gran: 0.08, freq: 22, tint: [1.0, 0.5, 0.3],
                             plage: [[18, 40, 6], [-30, 200, 5]] });
  var genAlphaA = starGen({ seed: 43, groups: 4, lat: [6, 26], size: 2.2, dark: 0.62, gran: 0.05, freq: 50, tint: [1.0, 0.95, 0.86] });
  var genAlphaB = starGen({ seed: 47, groups: 6, lat: [6, 32], size: 3.2, dark: 0.6, gran: 0.06, freq: 42, tint: [1.0, 0.82, 0.6] });
  var genSiriusA = starGen({ seed: 0, groups: 0, gran: 0, tint: [0.83, 0.89, 1.0] });
  var genSiriusB = starGen({ seed: 0, groups: 0, gran: 0, tint: [0.74, 0.82, 1.0] });
  var genVega = starGen({ seed: 0, groups: 0, gran: 0, tint: [0.8, 0.87, 1.0], equator: [0.3, [0.9, 0.93, 1.0]] });
  var genArcturus = starGen({ seed: 53, groups: 5, lat: [5, 60], size: 6, dark: 0.35, gran: 0.1, freq: 12, tint: [1.0, 0.72, 0.46] });
  var genPolaris = starGen({ seed: 59, groups: 4, lat: [5, 60], size: 7, dark: 0.3, gran: 0.08, freq: 16, tint: [1.0, 0.95, 0.86] });
  var genBetelgeuse = starGen({ seed: 71, groups: 3, lat: [0, 50], size: 24, dark: 0.3, gran: 0.3, freq: 3, tint: [1.0, 0.58, 0.34],
                                plage: [[20, 60, 30], [-25, 250, 26]] });
  var genRigel = starGen({ seed: 0, groups: 0, gran: 0, tint: [0.76, 0.84, 1.0] });

  /* ------------------------------------------------------------------------
     Moons, Pluto and Halley's nucleus: one cratered-world generator with a
     base colour, its variation, crater density and the features that make
     each one recognisable, placed at their real coordinates
     ------------------------------------------------------------------------ */
  function world(o) {
    var spots = (o.spots || []).map(function (p) { return { s: spot(p[0], p[1], p[2], p[3] || p[2], p[4] || 0), a: p[5], c: p[6] }; });
    var seed = o.seed || 1;
    return function (lon, lat, px, py, pz, out) {
      var n = fbm3(px * 3 + seed, py * 3, pz * 3, 4), n2 = fbm3(px * 9, py * 9 + seed, pz * 9, 3);
      var A = 1 + (o.vary || 0.12) * n + 0.05 * n2, c = o.col, r = c[0], g = c[1], b = c[2], i;
      if (o.craters) A += craters(px, py, pz, 6, seed + 11, 0.5, o.craters) + craters(px, py, pz, 15, seed + 23, 0.45, o.craters * 0.7);
      for (i = 0; i < spots.length; i++) {
        var d = spotDist(spots[i].s, px, py, pz);
        if (d > 1.6) continue;
        var w = smoothstep(1.15, 0.75, d * (1 + 0.2 * n2));
        if (spots[i].c) { r += (spots[i].c[0] - r) * w; g += (spots[i].c[1] - g) * w; b += (spots[i].c[2] - b) * w; }
        A += spots[i].a * w;
      }
      if (o.extra) { var x = o.extra(lon, lat, px, py, pz, n, n2); A += x[0]; if (x[1]) { r += (x[1][0] - r) * x[2]; g += (x[1][1] - g) * x[2]; b += (x[1][2] - b) * x[2]; } }
      A = clamp(A * (o.albedo || 1), 0.03, 1.2);
      out[0] = r * A; out[1] = g * A; out[2] = b * A;
    };
  }
  // lines along noise ridges: Europa's lineae, Dione's wisps
  function ridges(px, py, pz, f, width, seed) {
    var v = noise3(px * f + seed, py * f, pz * f);
    return smoothstep(width, 0, Math.abs(v));
  }

  var MOON_GEN = {
    io: world({ col: [0.92, 0.83, 0.45], vary: 0.18, seed: 3, spots: [[0, -30, 8, 0, 0, -0.35, [0.5, 0.3, 0.2]], [-10, 160, 6, 0, 0, -0.3, [0.45, 0.25, 0.15]],
      [15, 50, 5, 0, 0, -0.35, [0.35, 0.22, 0.15]], [-30, 260, 7, 0, 0, 0.12, [1, 1, 0.9]], [20, 300, 9, 0, 0, -0.25, [0.6, 0.35, 0.2]]],
      extra: function (lon, lat, px, py, pz, n, n2) {
        var dots = smoothstep(0.55, 0.75, noise3(px * 12 + 1, py * 12, pz * 12));
        var pole = smoothstep(50, 75, Math.abs(lat));
        return [-0.45 * dots - 0.15 * pole, [0.62, 0.42, 0.28], 0.6 * pole + 0.5 * dots];
      } }),
    europa: world({ col: [0.93, 0.89, 0.80], vary: 0.08, seed: 5,
      extra: function (lon, lat, px, py, pz, n, n2) {
        var l = Math.max(ridges(px, py, pz, 4, 0.05, 2), ridges(px, py, pz, 7, 0.04, 9) * 0.7);
        var mottle = smoothstep(0.1, 0.5, n2) * 0.6;
        return [-0.32 * l - 0.12 * mottle, [0.66, 0.48, 0.34], Math.max(l, mottle)];
      } }),
    ganymede: world({ col: [0.66, 0.62, 0.56], vary: 0.25, craters: 0.6, seed: 7,
      spots: [[30, 220, 30, 25, 0, -0.32, [0.42, 0.38, 0.33]], [-20, 300, 22, 18, 0, -0.25, [0.45, 0.4, 0.35]], [-60, 100, 25, 15, 0, 0.12, [0.85, 0.85, 0.85]]] }),
    callisto: world({ col: [0.42, 0.38, 0.33], vary: 0.15, craters: 1.3, seed: 9, spots: [[15, 304, 6, 0, 0, 0.35, [0.75, 0.72, 0.66]]] }),
    mimas: world({ col: [0.82, 0.81, 0.79], vary: 0.06, craters: 0.9, seed: 13,
      extra: function (lon, lat, px, py, pz) {
        var d = spotDist(MIMAS_H, px, py, pz);
        return [d < 1.3 ? 0.18 * Math.exp(-Math.pow((d - 1) / 0.08, 2)) - 0.12 * smoothstep(0.95, 0.5, d) + 0.1 * Math.exp(-d * d / 0.02) : 0];
      } }),
    enceladus: world({ col: [0.97, 0.98, 1.0], vary: 0.04, craters: 0.3, seed: 15,
      extra: function (lon, lat, px, py, pz) {
        var t = 0;
        if (lat < -55) for (var k = 0; k < 4; k++) {
          var dl = (lat + 82 - k * 3.4) + 2.5 * Math.sin((lon + k * 30) * DEG * 2);
          t = Math.max(t, Math.exp(-dl * dl / 0.5));
        }
        return [-0.4 * t, [0.62, 0.66, 0.72], t];
      } }),
    tethys: world({ col: [0.92, 0.91, 0.89], vary: 0.06, craters: 0.6, seed: 17, spots: [[32.8, 231.1, 24, 0, 0, -0.1, null]],
      extra: function (lon, lat, px, py, pz) { return [-0.15 * Math.exp(-Math.pow((lon - 0) / 4, 2) * 0) * 0]; } }),
    dione: world({ col: [0.86, 0.86, 0.85], vary: 0.08, craters: 0.7, seed: 19,
      extra: function (lon, lat, px, py, pz) {
        // the trailing hemisphere is centred on 90E here (270W); 270E leads, as on Iapetus
        var trailing = smoothstep(0.1, -0.4, -Math.cos((lon - 90) * DEG));
        return [0.18 * ridges(px, py, pz, 5, 0.06, 4) * trailing - 0.12 * trailing];
      } }),
    rhea: world({ col: [0.88, 0.87, 0.85], vary: 0.07, craters: 0.9, seed: 21, spots: [[-14.1, 247.9, 3, 0, 0, 0.35, [1, 1, 1]]] }),
    titan: world({ col: [0.86, 0.62, 0.34], vary: 0.06, seed: 23,
      extra: function (lon, lat) { return [0.05 * Math.sin(lat * 0.1) - 0.08 * smoothstep(-30, 30, lat) * 0]; } }),
    iapetus: world({ col: [0.86, 0.84, 0.80], vary: 0.06, craters: 0.5, seed: 25,
      extra: function (lon, lat, px, py, pz, n) {
        // Cassini Regio: the leading hemisphere is coal-dark
        var ang = Math.acos(clamp(Math.cos(lat * DEG) * Math.cos((lon + 90) * DEG), -1, 1)) / DEG;
        var dark = smoothstep(78 + 8 * n, 70 + 8 * n, ang);
        return [-0.82 * dark, [0.45, 0.32, 0.22], dark];
      } }),
    miranda: world({ col: [0.72, 0.72, 0.72], vary: 0.2, craters: 0.5, seed: 27, spots: [[-40, 0, 18, 12, 30, -0.18, null], [-30, 120, 20, 14, 0, 0.15, null], [-20, 250, 22, 14, 0, -0.12, null]] }),
    ariel: world({ col: [0.78, 0.77, 0.76], vary: 0.12, craters: 0.6, seed: 29 }),
    umbriel: world({ col: [0.45, 0.45, 0.46], vary: 0.08, craters: 0.6, seed: 31, spots: [[-10, 270, 4, 0, 0, 0.5, [0.85, 0.85, 0.85]]] }),
    titania: world({ col: [0.66, 0.64, 0.62], vary: 0.12, craters: 0.8, seed: 33 }),
    oberon: world({ col: [0.58, 0.55, 0.53], vary: 0.14, craters: 1.0, seed: 35 }),
    triton: world({ col: [0.86, 0.76, 0.70], vary: 0.12, seed: 37,
      extra: function (lon, lat, px, py, pz, n, n2) {
        var cap = smoothstep(-5 + 8 * n, -25 + 8 * n, lat);
        var melon = smoothstep(0, 20, lat) * (0.5 + 0.5 * ridges(px, py, pz, 14, 0.25, 6));
        return [0.12 * cap - 0.18 * melon, [0.62, 0.66, 0.66], 0.6 * melon];
      } }),
    phobos: world({ col: [0.45, 0.40, 0.36], vary: 0.12, craters: 1.0, seed: 39, spots: [[1, 311, 23, 0, 0, -0.15, null]] }),
    deimos: world({ col: [0.48, 0.43, 0.38], vary: 0.08, craters: 0.6, seed: 41 }),
    charon: world({ col: [0.66, 0.65, 0.64], vary: 0.12, craters: 0.5, seed: 43,
      extra: function (lon, lat) { var m = smoothstep(55, 72, lat); return [-0.25 * m, [0.55, 0.35, 0.28], m]; } }),
    pluto: world({ col: [0.86, 0.72, 0.58], vary: 0.18, seed: 45,
      // Tombaugh Regio, the heart: Sputnik Planitia and its eastern lobe
      spots: [[22, 178, 18, 24, -20, 0.38, [1, 0.97, 0.94]], [0, 215, 20, 24, 10, 0.26, [0.98, 0.94, 0.9]]],
      extra: function (lon, lat, px, py, pz, n) {
        // Cthulhu Macula, the long dark red whale west of the heart
        var d = spotDist(PLUTO_C, px, py, pz) * (1 + 0.35 * n);
        var cth = smoothstep(1.1, 0.7, d);
        return [-0.55 * cth, [0.48, 0.26, 0.18], cth];
      } }),
    // Halley: soot-dark, with brighter hills and the pits its jets came from
    halley: world({ col: [0.34, 0.31, 0.28], vary: 0.3, craters: 0.5, seed: 61,
      extra: function (lon, lat, px, py, pz, n, n2) { return [0.25 * smoothstep(0.3, 0.7, n2) - 0.2 * smoothstep(0.55, 0.8, n)]; } })
  };
  var MIMAS_H = spot(1.4, 248.2, 19), PLUTO_C = spot(-5, 95, 60, 16, 4);

  /* ------------------------------------------------------------------------
     Bodies. r = equatorial radius (km), f = flattening, tex = texture size,
     kind = how it is lit, haze / glow = atmosphere, col = mean colour for
     when the body is a dot, clouds = a map of clouds laid over the ground
     ------------------------------------------------------------------------ */
  var BODIES = {
    sun:     { r: 695700, f: 0,       tex: [512, 256],  kind: 'star',  gen: genSun,     col: [1.0, 0.92, 0.78], exposure: 1.35 },
    mercury: { r: 2440.5, f: 0,       tex: [512, 256],  kind: 'rock',  gen: genMercury, col: [0.62, 0.59, 0.55] },
    venus:   { r: 6051.8, f: 0,       tex: [256, 128],  kind: 'cloud', gen: genVenus,   col: [0.92, 0.85, 0.68], haze: 0.22, hazeCol: [1.0, 0.95, 0.82], glow: 0.30 },
    earth:   { r: 6378.1, f: 0.00335, tex: [1024, 512], kind: 'earth', gen: genEarth,   col: [0.45, 0.55, 0.75], haze: 0.32, hazeCol: [0.45, 0.68, 1.0], glow: 0.35, exposure: 1.25,
               clouds: 'earthclouds' },
    moon:    { r: 1738.1, f: 0.0012,  tex: [512, 256],  kind: 'rock',  gen: genMoon,    col: [0.62, 0.61, 0.59] },
    mars:    { r: 3396.2, f: 0.00589, tex: [512, 256],  kind: 'rock',  gen: genMars,    col: [0.86, 0.55, 0.35], haze: 0.07, hazeCol: [0.95, 0.75, 0.6], glow: 0.10 },
    jupiter: { r: 71492,  f: 0.06487, tex: [1024, 512], kind: 'gas',   gen: genJupiter, col: [0.90, 0.80, 0.66], haze: 0.30, hazeCol: [0.98, 0.95, 0.9], glow: 0.22 },
    saturn:  { r: 60268,  f: 0.09796, tex: [1024, 512], kind: 'gas',   gen: genSaturn,  col: [0.94, 0.84, 0.62], haze: 0.30, hazeCol: [0.98, 0.94, 0.84], glow: 0.22 },
    uranus:  { r: 25559,  f: 0.02293, tex: [256, 128],  kind: 'gas',   gen: genUranus,  col: [0.70, 0.88, 0.91], haze: 0.30, hazeCol: [0.85, 0.96, 0.98], glow: 0.20, limb: 0.62 },
    neptune: { r: 24764,  f: 0.01708, tex: [512, 256],  kind: 'gas',   gen: genNeptune, col: [0.42, 0.58, 0.88], haze: 0.26, hazeCol: [0.66, 0.78, 1.0], glow: 0.20, limb: 0.6 }
  };
  // maps that belong to a body without being one
  var LAYERS = { earthclouds: { tex: [1024, 512], gen: genEarthClouds, share: cloudShare } };
  function spec(key) { return BODIES[key] || LAYERS[key]; }

  BODIES.sun.cls = 'star'; BODIES.moon.cls = 'moon'; BODIES.moon.parent = 'earth';

  // The nearest stars, at their measured radii: Proxima 0.1542 of the Sun's
  // (Boyajian et al. 2012), Alpha Centauri A 1.2175 and B 0.8591 (Akeson et
  // al. 2021). Proxima's planets are known only by their minimum masses,
  // 1.06 and 0.26 Earths, so their sizes are what a rocky planet of those
  // masses would have, and what they look like is made up. They are lit by
  // Proxima, and its red light is in the colours of their maps.
  BODIES.proxima = { r: 107277, f: 0, tex: [256, 128], kind: 'star', gen: genProxima, col: [1.0, 0.52, 0.32], exposure: 1.6, cls: 'star', glowCol: [1.0, 0.42, 0.24] };
  BODIES.alphacena = { r: 847015, f: 0, tex: [256, 128], kind: 'star', gen: genAlphaA, col: [1.0, 0.94, 0.84], exposure: 1.35, cls: 'star', glowCol: [1.0, 0.86, 0.66] };
  BODIES.alphacenb = { r: 597676, f: 0, tex: [256, 128], kind: 'star', gen: genAlphaB, col: [1.0, 0.82, 0.6], exposure: 1.4, cls: 'star', glowCol: [1.0, 0.72, 0.45] };
  BODIES.sun.glowCol = [1.0, 0.8, 0.55];
  // Sirius A 1.713 of the Sun's radius (Davis et al. 2011), Sirius B 0.008098
  // (Bond et al. 2017), Vega 2.726 at its equator and 2.418 at its poles
  // (Monnier et al. 2012), Arcturus 25.4 (Ramirez and Allende Prieto 2011),
  // Polaris 46.27 (Evans et al. 2024), Betelgeuse 764 (Joyce et al. 2020)
  // and Rigel 78.9 (Moravveji et al. 2012)
  BODIES.siriusa = { r: 1191700, f: 0, tex: [256, 128], kind: 'star', gen: genSiriusA, col: [0.83, 0.89, 1.0], exposure: 1.2, cls: 'star', glowCol: [0.74, 0.84, 1.0] };
  BODIES.siriusb = { r: 5634, f: 0, tex: [256, 128], kind: 'star', gen: genSiriusB, col: [0.74, 0.82, 1.0], exposure: 1.2, cls: 'star', glowCol: [0.66, 0.77, 1.0] };
  BODIES.vega = { r: 1896500, f: 0.11299, tex: [256, 128], kind: 'star', gen: genVega, col: [0.84, 0.89, 1.0], exposure: 1.35, cls: 'star', glowCol: [0.74, 0.84, 1.0] };
  BODIES.arcturus = { r: 17670000, f: 0, tex: [256, 128], kind: 'star', gen: genArcturus, col: [1.0, 0.72, 0.46], exposure: 1.45, cls: 'star', glowCol: [1.0, 0.62, 0.36] };
  BODIES.polaris = { r: 32190000, f: 0, tex: [256, 128], kind: 'star', gen: genPolaris, col: [1.0, 0.95, 0.86], exposure: 1.35, cls: 'star', glowCol: [1.0, 0.86, 0.66] };
  BODIES.betelgeuse = { r: 531500000, f: 0, tex: [256, 128], kind: 'star', gen: genBetelgeuse, col: [1.0, 0.58, 0.34], exposure: 1.55, cls: 'star', glowCol: [1.0, 0.48, 0.26] };
  BODIES.rigel = { r: 54900000, f: 0, tex: [256, 128], kind: 'star', gen: genRigel, col: [0.76, 0.84, 1.0], exposure: 1.2, cls: 'star', glowCol: [0.68, 0.78, 1.0] };
  BODIES.proximab = { r: 6530, f: 0, tex: [256, 128], kind: 'rock', cls: 'planet', parent: 'proxima', star: 'proxima',
                      gen: world({ col: [0.66, 0.4, 0.3], vary: 0.3, craters: 0.5, seed: 61,
                                   spots: [[0, 0, 40, 30, 0, 0.18, [0.8, 0.5, 0.36]], [0, 180, 70, 60, 0, -0.1, [0.42, 0.3, 0.32]]] }) };
  BODIES.proximad = { r: 4430, f: 0, tex: [256, 128], kind: 'rock', cls: 'planet', parent: 'proxima', star: 'proxima',
                      gen: world({ col: [0.52, 0.34, 0.27], vary: 0.2, craters: 0.9, seed: 67 }) };
  ['proximab', 'proximad'].forEach(function (k) {
    var B = BODIES[k], o = new Float32Array(3), sr = 0, sg = 0, sb = 0, nn = 0;
    for (var la = -60; la <= 60; la += 30) for (var lo = -180; lo < 180; lo += 30) {
      var u = unit(la, lo); B.gen(lo, la, u[0], u[1], u[2], o); sr += o[0]; sg += o[1]; sb += o[2]; nn++;
    }
    B.col = [sr / nn, sg / nn, sb / nn];
  });
  ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'].forEach(function (k) { BODIES[k].cls = 'planet'; });

  // [radius km, class, parent, generator, mean colour, extras]
  var MORE = {
    io: [1821.5, 'moon', 'jupiter'], europa: [1560.8, 'moon', 'jupiter'], ganymede: [2631.2, 'moon', 'jupiter'], callisto: [2410.3, 'moon', 'jupiter'],
    mimas: [198.2, 'moon', 'saturn'], enceladus: [252.1, 'moon', 'saturn'], tethys: [531.0, 'moon', 'saturn'], dione: [561.4, 'moon', 'saturn'],
    rhea: [763.5, 'moon', 'saturn'], titan: [2574.7, 'moon', 'saturn', { kind: 'cloud', haze: 0.3, hazeCol: [1.0, 0.75, 0.42], glow: 0.25 }],
    iapetus: [734.3, 'moon', 'saturn'],
    miranda: [235.8, 'moon', 'uranus'], ariel: [578.9, 'moon', 'uranus'], umbriel: [584.7, 'moon', 'uranus'], titania: [788.9, 'moon', 'uranus'], oberon: [761.4, 'moon', 'uranus'],
    triton: [1353.4, 'moon', 'neptune', { haze: 0.06, hazeCol: [0.8, 0.85, 1.0] }], phobos: [11.1, 'moon', 'mars'], deimos: [6.2, 'moon', 'mars'],
    pluto: [1188.3, 'dwarf', null, { haze: 0.05, hazeCol: [0.7, 0.8, 1.0] }], charon: [606, 'moon', 'pluto'],
    // Halley's nucleus is a peanut about 15 x 8 x 8 km: shape gives its three semi-axes as fractions of r
    halley: [7.5, 'comet', null, { shape: [1, 0.53, 0.53] }]
  };
  Object.keys(MORE).forEach(function (k) {
    var m = MORE[k], x = m[3] || {}, small = m[0] < 100;
    var gen = MOON_GEN[k];
    var B = { r: m[0], f: 0, tex: small ? [128, 64] : [256, 128], kind: x.kind || 'rock', gen: gen, cls: m[1], parent: m[2] || null };
    for (var e in x) B[e] = x[e];
    if (!B.col) {
      var o = new Float32Array(3), sr = 0, sg = 0, sb = 0, nn = 0;
      for (var la = -60; la <= 60; la += 30) for (var lo = -180; lo < 180; lo += 30) {
        var u = unit(la, lo); gen(lo, la, u[0], u[1], u[2], o); sr += o[0]; sg += o[1]; sb += o[2]; nn++;
      }
      B.col = [sr / nn, sg / nn, sb / nn];
    }
    BODIES[k] = B;
  });

  /* ------------------------------------------------------------------------
     Textures: RGB bytes in a mip chain. A coarse pass is made at once, then
     the full-size map replaces it a few rows at a time.
     ------------------------------------------------------------------------ */
  var textures = {};
  var px3 = new Float32Array(3);

  function makeLevel(w, h) { return { w: w, h: h, d: new Uint8ClampedArray(w * h * 3) }; }

  function fillRow(gen, L, y) {
    var lat = 90 - (y + 0.5) / L.h * 180, cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG);
    for (var x = 0; x < L.w; x++) {
      var lon = (x + 0.5) / L.w * 360 - 180;
      gen(lon, lat, cl * Math.cos(lon * DEG), cl * Math.sin(lon * DEG), sl, px3);
      var o = (y * L.w + x) * 3;
      L.d[o] = px3[0] * 255; L.d[o + 1] = px3[1] * 255; L.d[o + 2] = px3[2] * 255;
    }
  }

  function downRows(src, dst, y0, y1) {
    var sw = src.w, s = src.d, d = dst.d;
    for (var y = y0; y < y1 && y < dst.h; y++) {
      var r0 = 2 * y * sw, r1 = (2 * y + 1) * sw;
      for (var x = 0; x < dst.w; x++) {
        var a = (r0 + 2 * x) * 3, b = (r1 + 2 * x) * 3, o = (y * dst.w + x) * 3;
        d[o] = (s[a] + s[a + 3] + s[b] + s[b + 3] + 2) >> 2;
        d[o + 1] = (s[a + 1] + s[a + 4] + s[b + 1] + s[b + 4] + 2) >> 2;
        d[o + 2] = (s[a + 2] + s[a + 5] + s[b + 2] + s[b + 5] + 2) >> 2;
      }
    }
  }
  function chain(levels, y0, y1) {
    for (var l = 1; l < levels.length; l++) {
      y0 = y0 >> 1; y1 = (y1 + 1) >> 1;
      downRows(levels[l - 1], levels[l], y0, y1);
    }
  }

  // Making a texture is done in steps, so it can be spread over idle time:
  // the coarse map row by row, then the full-size map filled from it, then
  // its mip chain. texture() runs whatever is left at once.
  var builds = {};
  function prepare(key, budgetMs) {
    if (textures[key]) return true;
    var B = spec(key), w = B.tex[0], h = B.tex[1], t0 = performance.now(), y, x, c;
    var st = builds[key];
    if (!st) {
      st = builds[key] = { stage: 0, row: 0, lo: makeLevel(Math.max(64, w >> 3), Math.max(32, h >> 3)), levels: null };
    }
    var lo = st.lo, out = function () { return performance.now() - t0 > budgetMs; };
    if (st.stage === 0) {
      while (st.row < lo.h) { fillRow(B.gen, lo, st.row++); if (out()) return false; }
      st.levels = [];
      for (var lw = w, lh = h; lw >= 16; lw >>= 1, lh >>= 1) st.levels.push(makeLevel(lw, lh));
      st.stage = 1; st.row = 0;
    }
    var top = st.levels[0], k = w / lo.w;
    if (st.stage === 1) {
      // the full-size map starts as the coarse one, smoothly enlarged
      while (st.row < h) {
        y = st.row++;
        var fy = (y + 0.5) / k - 0.5, y0 = clamp(Math.floor(fy), 0, lo.h - 1), y1 = Math.min(y0 + 1, lo.h - 1), ty = clamp(fy - y0, 0, 1);
        for (x = 0; x < w; x++) {
          var fx = (x + 0.5) / k - 0.5, x0 = Math.floor(fx), tx = fx - x0;
          x0 = (x0 + lo.w) % lo.w; var x1 = (x0 + 1) % lo.w, o = (y * w + x) * 3;
          var i00 = (y0 * lo.w + x0) * 3, i10 = (y0 * lo.w + x1) * 3, i01 = (y1 * lo.w + x0) * 3, i11 = (y1 * lo.w + x1) * 3;
          for (c = 0; c < 3; c++) {
            var a = lo.d[i00 + c] + (lo.d[i10 + c] - lo.d[i00 + c]) * tx;
            var b = lo.d[i01 + c] + (lo.d[i11 + c] - lo.d[i01 + c]) * tx;
            top.d[o + c] = a + (b - a) * ty;
          }
        }
        if ((y & 15) === 15 && out()) return false;
      }
      st.stage = 2;
    }
    chain(st.levels, 0, h);
    // mean colour, for when the body is drawn as a dot
    var sr = 0, sg = 0, sb = 0, sw = 0;
    for (y = 0; y < lo.h; y++) {
      var wt = Math.cos((90 - (y + 0.5) / lo.h * 180) * DEG);
      for (x = 0; x < lo.w; x++) { var q = (y * lo.w + x) * 3; sr += lo.d[q] * wt; sg += lo.d[q + 1] * wt; sb += lo.d[q + 2] * wt; sw += wt; }
    }
    textures[key] = { key: key, w: w, h: h, levels: st.levels, row: 0, ready: false, progress: 0,
                      mean: [sr / sw / 255, sg / sw / 255, sb / sw / 255] };
    if (B.share) textures[key].share = B.share(lo);
    delete builds[key];
    return true;
  }

  function texture(key) {
    if (!textures[key]) prepare(key, Infinity);
    return textures[key];
  }

  // compute full-size rows for up to budgetMs; returns progress 0..1
  function refine(key, budgetMs) {
    var T = texture(key);
    if (T.ready) return 1;
    var gen = spec(key).gen, top = T.levels[0], t0 = performance.now(), start = T.row;
    while (T.row < T.h && performance.now() - t0 < budgetMs) fillRow(gen, top, T.row++);
    chain(T.levels, start & ~7, (T.row + 7) & ~7);
    if (T.row >= T.h) T.ready = true;
    T.progress = T.row / T.h;
    return T.progress;
  }

  /* ------------------------------------------------------------------------
     Rings: radial profiles [inner, outer] in equatorial radii. op = optical
     opacity, al = albedo, c = colour. Cumulative sums let a renderer
     average the profile over a sample's footprint, so rings narrower than a
     character still show, faintly.
     ------------------------------------------------------------------------ */
  function buildRing(inner, outer, n, fn) {
    var R = { inner: inner, outer: outer, n: n, scale: (n - 1) / (outer - inner) };
    var cOp = new Float64Array(n + 1), cR = new Float64Array(n + 1), cG = new Float64Array(n + 1), cB = new Float64Array(n + 1), cU = new Float64Array(n + 1);
    var o = { op: 0, al: 0, c: [1, 1, 1] };
    for (var i = 0; i < n; i++) {
      var r = inner + (outer - inner) * (i / (n - 1));
      o.op = 0; o.al = 0; o.c = [1, 1, 1];
      fn(r, o);
      var op = clamp(o.op, 0, 0.97), lit = op * o.al;
      cOp[i + 1] = cOp[i] + op;
      cR[i + 1] = cR[i] + lit * o.c[0]; cG[i + 1] = cG[i] + lit * o.c[1]; cB[i + 1] = cB[i] + lit * o.c[2];
      // the unlit face: light that leaks through, strongest where the ring is half clear
      cU[i + 1] = cU[i] + o.al * op * (1 - op) * 2.2 * (0.6 + 0.4 * o.c[0]);
    }
    R.cOp = cOp; R.cR = cR; R.cG = cG; R.cB = cB; R.cU = cU;
    return R;
  }

  var RINGS = {};
  function ring(key) {
    if (key in RINGS) return RINGS[key];
    var R = null;
    if (key === 'saturn') {
      R = buildRing(1.10, 2.36, 4096, function (r, o) {
        var fine = noise2(r * 180, 0.37, 256), fine2 = noise2(r * 600, 3.1, 256);
        var struct = 0.5 * noise2(r * 38, 1.7, 256) + 0.35 * noise2(r * 110, 4.2, 256) + 0.15 * fine2;
        var tn = 0.3;
        if (r > 1.11 && r < 1.235) { o.op = 0.04; o.al = 0.25; tn = 0.15; }                        // D
        else if (r >= 1.235 && r < 1.525) { o.op = 0.16 + 0.10 * fine + 0.05 * fine2; o.al = 0.42; tn = 0.20;   // C
          if (Math.abs(r - 1.45) < 0.008) o.op *= 0.2; }
        else if (r >= 1.525 && r < 1.95) {                                                         // B
          var bi = smoothstep(1.525, 1.64, r);
          o.op = 0.55 + 0.36 * bi + 0.10 * fine + 0.12 * struct;
          o.al = 0.62 + 0.30 * bi + 0.26 * struct; tn = 0.42 + 0.10 * struct;
        }
        else if (r >= 1.95 && r < 2.025) { o.op = 0.07 + 0.05 * fine; o.al = 0.3; tn = 0.25;        // Cassini Division
          if (r > 1.99 && r < 2.0) o.op += 0.08; }
        else if (r >= 2.025 && r < 2.27) {                                                         // A
          o.op = 0.62 + 0.10 * fine + 0.10 * struct - 0.12 * smoothstep(2.15, 2.27, r);
          o.al = 0.64 + 0.22 * struct - 0.1 * smoothstep(2.1, 2.27, r); tn = 0.34 + 0.06 * struct;
          if (Math.abs(r - 2.214) < 0.007) o.op *= 0.1;                                            // Encke Gap
          if (Math.abs(r - 2.262) < 0.003) o.op *= 0.25;                                           // Keeler Gap
        }
        else if (r > 2.322 && r < 2.334) { o.op = 0.42; o.al = 0.75; tn = 0.28; }                  // F
        o.c = mix3([0.80, 0.80, 0.80], [0.98, 0.86, 0.68], clamp(tn * 2, 0, 1));
      });
    } else if (key === 'uranus') {
      // narrow, dark rings, their widths exaggerated a little so they register at all
      var U = [[1.637, 0.002, 0.5], [1.652, 0.002, 0.5], [1.666, 0.002, 0.5], [1.750, 0.004, 0.6], [1.787, 0.005, 0.6],
               [1.846, 0.002, 0.4], [1.863, 0.003, 0.6], [1.890, 0.004, 0.6], [1.957, 0.002, 0.3], [2.001, 0.012, 0.85]];
      R = buildRing(1.6, 2.04, 8192, function (r, o) {
        for (var i = 0; i < U.length; i++) if (Math.abs(r - U[i][0]) < U[i][1] / 2) { o.op = U[i][2]; o.al = 0.32; }
        o.c = [0.82, 0.86, 0.88];
      });
    } else if (key === 'neptune') {
      R = buildRing(1.6, 2.6, 4096, function (r, o) {
        if (Math.abs(r - 1.692) < 0.04) { o.op = 0.05; o.al = 0.35; }
        if (r > 2.148 && r < 2.31) { o.op = 0.03; o.al = 0.35; }
        if (Math.abs(r - 2.148) < 0.004) { o.op = 0.35; o.al = 0.35; }
        if (Math.abs(r - 2.541) < 0.004) { o.op = 0.4; o.al = 0.35; }
        o.c = [0.78, 0.80, 0.86];
      });
    } else if (key === 'jupiter') {
      R = buildRing(1.28, 3.2, 4096, function (r, o) {
        if (r < 1.713) { o.op = 0.02 * smoothstep(1.29, 1.7, r); o.al = 0.4; }
        else if (r < 1.806) { o.op = 0.12; o.al = 0.4; }
        // the gossamer rings: Amalthea's out to its orbit, Thebe's fainter one out to 226,000 km
        else { o.op = 0.015 * smoothstep(2.546, 1.81, r) + 0.0045 * smoothstep(3.161, 3.0, r); o.al = 0.4; }
        o.c = [0.92, 0.82, 0.72];
      });
    }
    RINGS[key] = R;
    return R;
  }

  // The Pleiades' nine brightest stars, hot and blue-white, at the radii
  // White et al. (2017, MNRAS 471, 2882) measured with the CHARA Array:
  // Alcyone 9.3 times the Sun's, Atlas 7.9, Electra 6.3, Maia 6.61, Merope
  // 4.79, Taygeta 4.36 and Pleione 4.17. Celaeno's 3.8 and Asterope's 2.7
  // are worked out from their luminosities and temperatures. The hotter
  // ones are a little bluer. They are drawn smooth, like the other hot
  // stars, and hide in the cluster's glow while it is too small to show them.
  [['alcyone', 9.3, 12258], ['atlas', 7.9, 13446], ['electra', 6.3, 12754], ['maia', 6.61, 12550], ['merope', 4.79, 13691],
   ['taygeta', 4.36, 13696], ['pleione', 4.17, 12106], ['celaeno', 3.8, 12800], ['asterope', 2.7, 11041]].forEach(function (s) {
    var hot = smoothstep(11000, 13700, s[2]), t = [0.86 - 0.08 * hot, 0.91 - 0.05 * hot, 1.0];
    BODIES[s[0]] = { r: s[1] * BODIES.sun.r, f: 0, tex: [256, 128], kind: 'star', gen: starGen({ seed: 0, groups: 0, gran: 0, tint: t }),
                     col: t, exposure: 1.2, cls: 'star', glowCol: [t[0] - 0.1, t[1] - 0.08, 1.0], host: 'pleiades' };
  });

  // S2, the star best followed round Sagittarius A*, the black hole at the
  // centre of the galaxy: a hot B0-2.5 star on the main sequence, about 14
  // times the mass of the Sun (Habibi et al. 2017, ApJ 847, 120). It is
  // drawn at 6 times the Sun's radius, the size of such a star, and smooth,
  // as the other hot stars are.
  BODIES.s2 = { r: 6 * BODIES.sun.r, f: 0, tex: [256, 128], kind: 'star', gen: starGen({ seed: 0, groups: 0, gran: 0, tint: [0.72, 0.8, 1.0] }),
                col: [0.72, 0.8, 1.0], exposure: 1.2, cls: 'star', glowCol: [0.64, 0.74, 1.0], parent: 'sgra' };

  window.Surfaces = {
    BODIES: BODIES,
    texture: texture,
    prepare: prepare,
    has: function (key) { return !!textures[key]; },
    refine: refine,
    ring: ring,
    cloudCover: cloudCover,
    cloudWind: cloudWind,
    cloudOf: cloudOf,
    // a map of another component's, made in the same way: spec.size is
    // [width, height] and spec.gen(lon, lat, x, y, z, out) its colour
    define: function (key, spec) { LAYERS[key] = { tex: spec.size, gen: spec.gen }; }
  };
})();
