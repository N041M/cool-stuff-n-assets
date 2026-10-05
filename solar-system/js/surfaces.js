/* ==========================================================================
   Surfaces: what each body looks like.

   Every body has a texture, generated in the browser the first time it is
   needed. A small version is made at once and a full-size one is refined a
   few rows per frame while the body is large on screen. Textures are
   equirectangular albedo in RGB: east longitude across, north at the top.
   Ring systems are radial profiles of opacity, albedo and colour, in units
   of the planet's equatorial radius.

   The surfaces follow the real bodies where it matters: the Earth is drawn
   from a Natural Earth land mask, the Moon's maria, the Martian albedo
   features and the polar caps sit at their real coordinates, and the ring
   radii are the measured ones. Cloud features on the giants are not tied to
   real longitudes.
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
     map of their own (genEarthClouds) that the renderer lays over the
     ground and moves with the winds.
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
  // are (green). The renderer adds the cover for the latitude (cloudCover)
  // and turns the sum into cloud.
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
     Spacecraft: small models at their real size, in metres, built from a
     few kinds of part the renderer ray-casts. Each model's z axis is the way
     it points: its dish to the Earth, or its shield to or from the Sun.
     Parts marked as reaching out (the long booms and wire antennas) do not
     count when the model is framed. s: how shiny a part is; gain: drawn
     brighter than its light.
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

  // which model each spacecraft uses; JWST stays by the Earth
  var FLEET = { voyager1: 'voyager', voyager2: 'voyager', newhorizons: 'newhorizons', pioneer10: 'pioneer', pioneer11: 'pioneer',
                parker: 'parker', jwst: 'jwst' };
  Object.keys(FLEET).forEach(function (k) {
    var M = CRAFT[FLEET[k]];
    BODIES[k] = { r: M.r / 1000, f: 0, kind: 'rock', cls: 'craft', col: M.col, model: M, host: k === 'jwst' ? 'earth' : null };
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
     opacity, al = albedo, c = colour. Cumulative sums let the renderer
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

  /* ------------------------------------------------------------------------
     The Milky Way seen face-on, for the explorer's widest views. Positions
     are galactocentric kiloparsecs as in ephemeris.js: x toward the centre
     as seen from the Sun, which is at x = -8.15, and y toward longitude 90°.

     The spiral arms are the log spirals Reid et al. (2019, ApJ 885, 131,
     table 2) fitted to the parallaxes of masers in young, massive
     star-forming regions: ln(R / R_kink) = -(beta - beta_kink) tan(psi).
     Beta is the azimuth about the centre, 0 toward the Sun and growing the
     way the galaxy turns, and the pitch angle psi differs on either side of
     the kink. The fits cover the side of the galaxy the masers reach. Past
     that each arm goes on with its last pitch angle, joined the way the
     paper's appendix describes. Scutum-Centaurus carries on round the far
     side into the outer Scutum-Centaurus arm, Norma joins the Outer arm, and
     Perseus starts near the far end of the bar. The paper measures the arms
     widening outward as 0.336 + 0.036 (R - 8.15) kpc. Young stars and their
     glowing gas spread wider than the masers, so an arm here is drawn 1.6
     times as wide.

     The bar reaches 5 kpc from the centre at 28° to the line to the Sun, its
     near end at positive longitude (Wegg, Gerhard and Portail 2015). The
     disc's light falls off with a scale length of 2.6 kpc (Bland-Hawthorn
     and Gerhard 2016).
     ------------------------------------------------------------------------ */
  // [beta_kink (deg), R_kink (kpc), psi below the kink, psi above (deg)]
  var GAL_FIT = {
    norma: [18, 4.46, -1.0, 19.5], scutum: [23, 4.91, 14.1, 12.1], sagittarius: [24, 6.04, 17.1, 1.0],
    local: [9, 8.26, 11.4, 11.4], perseus: [40, 8.87, 10.3, 8.7], outer: [18, 12.24, 3.0, 9.4]
  };
  function galLnR(f, beta) {
    return Math.log(f[1]) - (beta - f[0]) * DEG * Math.tan((beta < f[0] ? f[2] : f[3]) * DEG);
  }
  // each arm as drawn: its beta range, how bright it is against the others,
  // and ln R along it. Norma-Outer runs from the Outer arm's tip round the
  // far side and in to Norma's inner end, so its beta passes 360.
  var GAL_ARMS = [
    { key: 'scutum', from: -210, to: 104, w: 1.0, lnR: function (b) { return galLnR(GAL_FIT.scutum, b); } },
    { key: 'perseus', from: -115, to: 215, w: 0.9, lnR: function (b) { return galLnR(GAL_FIT.perseus, b); } },
    { key: 'sagittarius', from: -100, to: 100, w: 0.6, lnR: function (b) { return galLnR(GAL_FIT.sagittarius, b); } },
    { key: 'local', from: -40, to: 62, w: 0.8, lnR: function (b) { return galLnR(GAL_FIT.local, b); } },
    { key: 'outer', from: -50, to: 414, w: 0.6, lnR: function (b) {
      var o = galLnR(GAL_FIT.outer, b), n = galLnR(GAL_FIT.norma, b - 360);
      return b <= 270 ? o : b >= 330 ? n : o + (n - o) * smoothstep(270, 330, b);
    } }
  ];
  // ln R every half degree
  GAL_ARMS.forEach(function (a) {
    var n = Math.round((a.to - a.from) * 2) + 1;
    a.tab = new Float64Array(n);
    for (var i = 0; i < n; i++) a.tab[i] = a.lnR(a.from + i / 2);
  });
  // the visible width of an arm at radius R, kpc
  function galSigma(R) { return 1.6 * Math.max(0.336 + 0.036 * (R - 8.15), 0.15); }
  // an arm fades in over its last 30 degrees at either end
  function galTip(a, b) { return smoothstep(a.from, a.from + 30, b) * (1 - smoothstep(a.to - 30, a.to, b)); }
  // a point on an arm, kpc
  function galArmPoint(key, beta) {
    var a = GAL_ARMS.filter(function (x) { return x.key === key; })[0], R = Math.exp(a.lnR(beta));
    return [-R * Math.cos(beta * DEG), R * Math.sin(beta * DEG)];
  }

  // the bulge and the long bar as Gaussian ellipsoids along the bar:
  // centre along the bar (kpc), sigma along the bar, across it and up
  // (kpc), and peak brightness seen face-on
  var BAR_ANGLE = 28;
  var GAL_BLOBS = [[0, 1.1, 0.55, 0.42, 1.0], [1.5, 0.85, 0.34, 0.17, 0.42], [-1.5, 0.85, 0.34, 0.17, 0.42],
                   [2.8, 0.8, 0.3, 0.15, 0.3], [-2.8, 0.8, 0.3, 0.15, 0.3], [3.9, 0.7, 0.26, 0.13, 0.18], [-3.9, 0.7, 0.26, 0.13, 0.18]];
  // along the bar toward its near end, and across it
  var BAR_A = [-Math.cos(BAR_ANGLE * DEG), Math.sin(BAR_ANGLE * DEG)], BAR_B = [Math.sin(BAR_ANGLE * DEG), Math.cos(BAR_ANGLE * DEG)];

  /* ------------------------------------------------------------------------
     The galaxy is drawn from a population of stars, the way simulated
     images of galaxies are made. Each part of the galaxy is a recipe for
     placing stars, and their light is added up.

     Old stars fill an exponential disc and gather loosely on the arms.
     Young stars keep close to the arms, many of them in clusters and
     star-forming complexes from 35 to 350 pc across, and the gas round some
     of those glows pink. Spurs of young stars and dust trail off the outer
     edges of the arms at a wider angle than the arms themselves, as in
     other spiral galaxies. Dust runs in clumpy lanes along the inner edges
     of the arms and dims and reddens the light behind it. A ring of star
     formation surrounds the bar.

     450,000 such stars are made, and the renderer draws them one by one, so
     the arms break up into stars and clusters as the camera comes closer.
     They take about half a second to make, so they are made a few
     milliseconds at a time while the page is idle.
     ------------------------------------------------------------------------ */
  var GAL_EXT = 20;
  var COL_OLD = [1.0, 0.85, 0.66], COL_YOUNG = [0.62, 0.75, 1.0], COL_CLUSTER = [0.56, 0.7, 1.0], COL_HII = [1.0, 0.34, 0.58],
      COL_RING = [0.78, 0.8, 1.0], COL_BULGE = [1.0, 0.78, 0.52];
  // the share of the stars each part gives: old disc, old stars on the
  // arms, young stars on the arms, clusters, glowing gas, spurs, the ring
  // round the bar, the bulge and bar
  var LIVE_SHARE = [0, 0.05, 0.31, 0.25, 0.1, 0.12, 0.05, 0.12];
  var N_LIVE = 450000;

  function galRng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function galGauss(rng) { return Math.sqrt(-2 * Math.log(rng() + 1e-12)) * Math.cos(TAU * rng()); }
  function galCdf(w) {
    var c = new Float64Array(w.length), s = 0;
    for (var i = 0; i < w.length; i++) { s += w[i]; c[i] = s; }
    for (i = 0; i < w.length; i++) c[i] /= s || 1;
    return c;
  }
  function galPick(c, u) {
    var lo = 0, hi = c.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (c[mid] < u) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // a point on arm a at azimuth b (degrees): its position, the unit vector
  // along the arm toward growing beta, the unit normal away from the
  // centre, and the radius
  var AF = new Float64Array(7);
  function galArmFrame(a, b) {
    var fi = clamp((b - a.from) * 2, 0, a.tab.length - 1.001), i0 = fi | 0, t = fi - i0;
    var R = Math.exp(a.tab[i0] + (a.tab[i0 + 1] - a.tab[i0]) * t), dl = (a.tab[i0 + 1] - a.tab[i0]) * 2 / DEG;
    var cb = Math.cos(b * DEG), sb = Math.sin(b * DEG), rx = -cb, ry = sb;
    var tx = dl * rx + sb, ty = dl * ry + cb, tl = Math.sqrt(tx * tx + ty * ty), nx = -ty / tl, ny = tx / tl;
    if (nx * rx + ny * ry < 0) { nx = -nx; ny = -ny; }
    AF[0] = R * rx; AF[1] = R * ry; AF[2] = tx / tl; AF[3] = ty / tl; AF[4] = nx; AF[5] = ny; AF[6] = R;
  }

  // the arms' half degrees weighted by length and brightness, the clusters
  // along them and the spurs off them
  var armCdf = null, armA = null, armI = null, galCx = null, cxCdf = null, hiiCdf = null, galSp = null, spCdf = null, blobCdf = null;
  function galStructures() {
    if (armCdf) return;
    var w = [], i, j;
    armA = []; armI = [];
    GAL_ARMS.forEach(function (a, k) {
      for (i = 0; i < a.tab.length; i++) {
        var R = Math.exp(a.tab[i]);
        w.push(a.w * galTip(a, a.from + i / 2) * R * (R < 3.3 ? 0.2 : 1));
        armA.push(k); armI.push(i);
      }
    });
    armCdf = galCdf(w);
    var rng = galRng(0x51ab2e), cx = [], sp = [];
    GAL_ARMS.forEach(function (a) {
      var b = a.from, toSpur = 0;
      while (b < a.to) {
        galArmFrame(a, b);
        var R = AF[6], s = galSigma(R), tip = galTip(a, b), step = -0.28 * Math.log(rng() + 1e-9);
        b += step / R / DEG;
        if (R < 3.3 || rng() > tip) continue;
        var size = 0.035 * Math.exp(rng() * 2.3), off = galGauss(rng) * 0.45 * s;
        cx.push(AF[0] + AF[4] * off, AF[1] + AF[5] * off, size, a.w * Math.pow(size / 0.1, 1.2) * (0.3 + rng()), rng() < 0.5 ? 1 : 0);
        toSpur -= step;
        if (toSpur > 0) continue;
        toSpur = 0.3 - 0.8 * Math.log(rng() + 1e-9);
        // out along the arm is against growing beta; a spur turns 25 to 45 degrees further out
        var ph = (25 + 20 * rng()) * DEG, dx = -AF[2] * Math.cos(ph) + AF[4] * Math.sin(ph), dy = -AF[3] * Math.cos(ph) + AF[5] * Math.sin(ph);
        var L = (0.4 + 1.2 * rng()) * Math.sqrt(R / 8);
        sp.push(AF[0] + AF[4] * 0.35 * s, AF[1] + AF[5] * 0.35 * s, dx, dy, L, a.w * tip * L);
      }
    });
    galCx = cx; galSp = sp;
    var cw = [], hw = [], sw = [];
    for (i = 0; i < cx.length; i += 5) { cw.push(cx[i + 3]); hw.push(cx[i + 3] * cx[i + 4]); }
    for (i = 0; i < sp.length; i += 6) sw.push(sp[i + 5]);
    cxCdf = galCdf(cw); hiiCdf = galCdf(hw); spCdf = galCdf(sw);
    var bw = [];
    for (j = 0; j < GAL_BLOBS.length; j++) { var o = GAL_BLOBS[j]; bw.push(o[4] * o[1] * o[2]); }
    blobCdf = galCdf(bw);
  }
  // a random spot on a random arm, by length and brightness, into AF
  function galArmAt(rng) {
    var k = galPick(armCdf, rng()), a = GAL_ARMS[armA[k]];
    galArmFrame(a, clamp(a.from + (armI[k] + rng() - 0.5) / 2, a.from, a.to));
    return a;
  }

  // a light grid of n x n cells over +-GAL_EXT kpc, added to bilinearly
  function galDeposit(g, n, ch, x, y, r, gg, b) {
    var f = n / (2 * GAL_EXT), fx = (x + GAL_EXT) * f - 0.5, fy = (y + GAL_EXT) * f - 0.5;
    var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    if (x0 < 0 || y0 < 0 || x0 >= n - 1 || y0 >= n - 1) return;
    var w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], o = [y0 * n + x0, y0 * n + x0 + 1, (y0 + 1) * n + x0, (y0 + 1) * n + x0 + 1];
    for (var k = 0; k < 4; k++) {
      var i = o[k] * ch;
      g[i] += r * w[k];
      if (ch === 3) { g[i + 1] += gg * w[k]; g[i + 2] += b * w[k]; }
    }
  }
  // a Gaussian blur of an interleaved grid, done in place a few rows or
  // columns at a time
  function galBlurPass(g, n, ch, sigma, vertical, from, to) {
    var r = Math.ceil(sigma * 3), k = new Float32Array(2 * r + 1), s = 0, line = new Float32Array(n * ch), i, j, c;
    for (i = -r; i <= r; i++) { k[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); s += k[i + r]; }
    for (i = 0; i <= 2 * r; i++) k[i] /= s;
    for (var l = from; l < to; l++) {
      for (i = 0; i < n; i++) for (c = 0; c < ch; c++) line[i * ch + c] = g[(vertical ? i * n + l : l * n + i) * ch + c];
      for (i = 0; i < n; i++) for (c = 0; c < ch; c++) {
        var acc = 0;
        for (j = -r; j <= r; j++) { var ii = i + j; if (ii >= 0 && ii < n) acc += line[ii * ch + c] * k[j + r]; }
        g[(vertical ? i * n + l : l * n + i) * ch + c] = acc;
      }
    }
  }
  // the value below which a share q of the positive values lie
  function galPercentile(g, ch, q) {
    var v = [];
    for (var i = 0; i < g.length; i += ch * 7) {
      var y = ch === 3 ? 0.2126 * g[i] + 0.7152 * g[i + 1] + 0.0722 * g[i + 2] : g[i];
      if (y > 0) v.push(y);
    }
    v.sort(function (a, b) { return a - b; });
    return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * q))] : 1;
  }

  // Dust, as optical depth on a 512 x 512 grid: clumpy lanes along the
  // inner edges of the arms, thin lanes along the spurs and a faint haze
  // over the disc
  var DUST_N = 512, galDust = null, dustGrid = null;
  function galDustSamples(rng, count) {
    var g = dustGrid, i;
    for (i = 0; i < count; i++) {
      var u = rng(), x, y, w;
      if (u < 0.72) {
        // the Sun sits in the Local Bubble, a hollow with little dust, so the
        // Orion Arm's lane is kept thin
        var arm = galArmAt(rng);
        var s = galSigma(AF[6]), d = -0.75 * s + galGauss(rng) * 0.18 * s, al = galGauss(rng) * 0.04;
        x = AF[0] + AF[4] * d + AF[2] * al; y = AF[1] + AF[5] * d + AF[3] * al;
        w = Math.max(0, 0.45 + 1.7 * fbm(x * 1.7 + 40, y * 1.7 + 40, 256, 3)) * (arm.key === 'local' ? 0.2 : 1);
      } else if (u < 0.9) {
        var p = galPick(spCdf, rng()) * 6, sp = galSp, t = rng(), q = galGauss(rng) * 0.025;
        x = sp[p] + sp[p + 2] * sp[p + 4] * t - sp[p + 3] * q; y = sp[p + 1] + sp[p + 3] * sp[p + 4] * t + sp[p + 2] * q;
        w = 1.1 * (1 - t);
      } else {
        var R = -3.4 * Math.log(rng() * rng() + 1e-12), th = rng() * TAU;
        if (R > 15) continue;
        x = R * Math.cos(th); y = R * Math.sin(th); w = 0.5;
      }
      galDeposit(g, DUST_N, 1, x, y, w, 0, 0);
    }
  }
  function galTau(x, y) {
    var n = DUST_N, f = n / (2 * GAL_EXT), fx = (x + GAL_EXT) * f - 0.5, fy = (y + GAL_EXT) * f - 0.5;
    var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    if (x0 < 0 || y0 < 0 || x0 >= n - 1 || y0 >= n - 1) return 0;
    var g = galDust, i = y0 * n + x0;
    return (g[i] * (1 - tx) + g[i + 1] * tx) * (1 - ty) + (g[i + n] * (1 - tx) + g[i + n + 1] * tx) * ty;
  }

  // One star from part `kind` of the galaxy, into GS: its place in kpc and
  // its light, dimmed and reddened by the dust in front of it. Old stars
  // are as often in front of the dust as behind it, so they lose half as much.
  var GS = new Float64Array(6);
  function galStar(rng, kind) {
    var x = 0, y = 0, z = 0, c = COL_OLD, behind = 1, i, s, R, th;
    switch (kind) {
      case 0:   // old disc: surface density falling off over 2.6 kpc, dimmer where the bar takes over
        for (i = 0; i < 8; i++) {
          R = -2.6 * Math.log(rng() * rng() + 1e-12);
          if (R < 17 && rng() > smoothstep(11, 17, R) && rng() > 0.65 * Math.exp(-R * R / 9.7)) break;
        }
        th = rng() * TAU; x = R * Math.cos(th); y = R * Math.sin(th); z = galGauss(rng) * 0.3; behind = 0.5;
        break;
      case 1:   // old stars gathered loosely on the arms
        galArmAt(rng); s = galSigma(AF[6]) * galGauss(rng) * 2.4;
        x = AF[0] + AF[4] * s; y = AF[1] + AF[5] * s; z = galGauss(rng) * 0.2; behind = 0.5;
        break;
      case 2:   // young stars along the arms
        galArmAt(rng); s = galSigma(AF[6]) * galGauss(rng) * 1.5;
        var al = galGauss(rng) * 0.08;
        x = AF[0] + AF[4] * s + AF[2] * al; y = AF[1] + AF[5] * s + AF[3] * al; z = galGauss(rng) * 0.07; c = COL_YOUNG;
        break;
      case 3:   // in a cluster or star-forming complex
      case 4:   // in the glowing gas round one
        i = galPick(kind === 3 ? cxCdf : hiiCdf, rng()) * 5; s = galCx[i + 2] * (kind === 3 ? 1 : 0.45);
        x = galCx[i] + galGauss(rng) * s; y = galCx[i + 1] + galGauss(rng) * s; z = galGauss(rng) * 0.04;
        c = kind === 3 ? COL_CLUSTER : COL_HII; behind = kind === 3 ? 0.7 : 0.55;
        break;
      case 5:   // along a spur
        i = galPick(spCdf, rng()) * 6;
        var t = Math.pow(rng(), 1.4), q = galGauss(rng) * 0.05, sp = galSp;
        x = sp[i] + sp[i + 2] * sp[i + 4] * t - sp[i + 3] * q; y = sp[i + 1] + sp[i + 3] * sp[i + 4] * t + sp[i + 2] * q;
        z = galGauss(rng) * 0.06; c = COL_YOUNG;
        break;
      case 6:   // the ring of star formation round the bar
        th = rng() * TAU;
        var ra = 4.7 + galGauss(rng) * 0.22, rb = 3.6 + galGauss(rng) * 0.22;
        x = BAR_A[0] * ra * Math.cos(th) + BAR_B[0] * rb * Math.sin(th); y = BAR_A[1] * ra * Math.cos(th) + BAR_B[1] * rb * Math.sin(th);
        z = galGauss(rng) * 0.06; c = rng() < 0.35 ? COL_HII : COL_RING;
        break;
      default:  // the bulge and bar
        var o = GAL_BLOBS[galPick(blobCdf, rng())], al2 = o[0] + galGauss(rng) * o[1], ac = galGauss(rng) * o[2];
        x = BAR_A[0] * al2 + BAR_B[0] * ac; y = BAR_A[1] * al2 + BAR_B[1] * ac; z = galGauss(rng) * o[3]; c = COL_BULGE; behind = 0.3;
    }
    var tau = galTau(x, y) * behind;
    GS[0] = x; GS[1] = y; GS[2] = z;
    GS[3] = c[0] * Math.exp(-0.75 * tau); GS[4] = c[1] * Math.exp(-tau); GS[5] = c[2] * Math.exp(-1.3 * tau);
  }
  function galKind(share, u) {
    for (var k = 0; k < share.length; k++) { u -= share[k]; if (u < 0) return k; }
    return 0;
  }

  // The build, in steps that each stop when their time is up.
  var galLive = null, galB = { stage: 0, i: 0 };
  var GAL_STAGES = [
    function () { galStructures(); dustGrid = new Float32Array(DUST_N * DUST_N); galB.rng = galRng(0x2d17a3); return true; },
    function (out) {
      while (galB.i < 400000) { galDustSamples(galB.rng, 20000); galB.i += 20000; if (out()) return false; }
      return true;
    },
    function (out) {
      while (galB.i < 2 * DUST_N) {
        var v = galB.i >= DUST_N, l = galB.i % DUST_N;
        galBlurPass(dustGrid, DUST_N, 1, 1.2, v, l, l + 64); galB.i += 64;
        if (out()) return false;
      }
      var sc = 1.7 / galPercentile(dustGrid, 1, 0.995);
      for (var i = 0; i < dustGrid.length; i++) dustGrid[i] *= sc;
      galDust = dustGrid;
      galLive = { n: N_LIVE, pos: new Float32Array(N_LIVE * 3), col: new Uint8Array(N_LIVE * 3), colScale: 1 / 80, done: 0 };
      galB.rng = galRng(0x7f4a1c);
      return true;
    },
    function (out) {
      var L = galLive, rng = galB.rng;
      while (L.done < L.n) {
        for (var e = Math.min(L.n, L.done + 8000); L.done < e; L.done++) {
          galStar(rng, galKind(LIVE_SHARE, rng()));
          // a few bright stars and clusters among many faint ones
          var m = 0.15 + 3 * Math.pow(rng(), 6), o = L.done * 3;
          L.pos[o] = GS[0]; L.pos[o + 1] = GS[1]; L.pos[o + 2] = GS[2];
          L.col[o] = Math.min(255, Math.round(GS[3] * m * 80)); L.col[o + 1] = Math.min(255, Math.round(GS[4] * m * 80)); L.col[o + 2] = Math.min(255, Math.round(GS[5] * m * 80));
        }
        if (out()) return false;
      }
      return true;
    }
  ];
  // carry the build on for up to budgetMs; true once it is all done
  function prepareGalaxy(budgetMs) {
    var t0 = performance.now(), out = function () { return performance.now() - t0 > budgetMs; };
    while (galB.stage < GAL_STAGES.length) {
      if (!GAL_STAGES[galB.stage](out)) return false;
      galB.stage++; galB.i = 0;
      if (out() && galB.stage < GAL_STAGES.length) return false;
    }
    return true;
  }
  // the stars, null until they are made
  function galaxyPoints() { return galLive && galLive.done === galLive.n ? galLive : null; }

  var GALAXY = {
    prepare: prepareGalaxy, points: galaxyPoints, armPoint: galArmPoint,
    blobs: GAL_BLOBS, barAngle: BAR_ANGLE, blobColour: COL_BULGE
  };

  /* ------------------------------------------------------------------------
     Nebulae are drawn like the galaxy, from a cloud of points: gas whose
     light adds up, and the brightest stars inside, each kept as one point.
     Each nebula is a recipe of parts sketched from photographs: lobes and
     wisps of glowing gas, shells, rings, filaments, pillars of dust and the
     stars that light it. A point is placed in the nebula's own frame, in
     units of its radius, with u to the right and v up as it looks from the
     Earth with north up, and w toward the Earth. The depth of every part is
     made up. A nebula's points are made the first time it is needed, a few
     milliseconds at a time, and its gas adds up to a light of 1. The
     Pleiades, a star cluster, are made the same way, with their stars as
     the main part and the dust round them as the gas.
     ------------------------------------------------------------------------ */
  var LY_KM = 9.4607e12;
  var NEB_HA = [1.0, 0.3, 0.4], NEB_PINK = [1.0, 0.46, 0.62], NEB_OIII = [0.38, 0.95, 0.86], NEB_BLUE = [0.48, 0.62, 1.0],
      NEB_ORANGE = [1.0, 0.56, 0.28], NEB_DUST = [0.78, 0.44, 0.24], NEB_HOT = [0.78, 0.86, 1.0];
  function nebSet(P, u, v, w, c, a) { P[0] = u; P[1] = v; P[2] = w; P[3] = c[0] * a; P[4] = c[1] * a; P[5] = c[2] * a; return true; }
  function nebMix(a, b, t) { t = clamp(t, 0, 1); return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  // patchy light in [0, 1], and thin filaments where the noise crosses zero
  function nebWisp(u, v, w, f, sd) { return clamp(0.5 + 0.9 * fbm3(u * f + sd, v * f - sd, w * f + 0.5 * sd, 3), 0, 1); }
  function nebRidge(u, v, w, f, sd, k) {
    var a = 1 - Math.abs(noise3(u * f + sd, v * f, w * f - sd)), b = 1 - Math.abs(noise3(u * f * 2.1 - sd, v * f * 2.1 + sd, w * f * 2.1));
    return Math.pow(a, k || 3) * (0.6 + 0.4 * b * b);
  }
  // a point a Gaussian distance from the curve a -> m -> b, at t along it
  function nebAlong(rng, a, m, b, t, width, P) {
    var s = 1 - t, x = s * s * a[0] + 2 * s * t * m[0] + t * t * b[0], y = s * s * a[1] + 2 * s * t * m[1] + t * t * b[1];
    P[0] = x + galGauss(rng) * width; P[1] = y + galGauss(rng) * width;
  }
  // distance from (u, v) to the segment a -> b, and how far along it
  function nebSeg(u, v, a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], t = clamp(((u - a[0]) * dx + (v - a[1]) * dy) / (dx * dx + dy * dy), 0, 1);
    return [Math.hypot(u - a[0] - dx * t, v - a[1] - dy * t), t];
  }
  // a ring of radius 1 in its own plane, tipped by `tilt` about the u axis and turned by `pa` on the sky
  function nebRing(x, y, z, tilt, pa, P) {
    var ct = Math.cos(tilt), st = Math.sin(tilt), y2 = y * ct - z * st, z2 = y * st + z * ct, cp = Math.cos(pa), sp = Math.sin(pa);
    P[0] = x * cp - y2 * sp; P[1] = x * sp + y2 * cp; P[2] = z2;
  }
  // a column of dust from base b, d units long toward the unit direction t
  function nebPillar(rng, b, t, len, r0, sd, P) {
    var s = Math.pow(rng(), 0.8), rr = r0 * (1 - 0.45 * s) * (0.75 + 0.5 * nebWisp(s * 3, sd, 0, 2, sd));
    var g = galGauss(rng), h = galGauss(rng) * 0.6, edge = Math.min(1, Math.abs(g) / 1.6);
    P[0] = b[0] + t[0] * len * s - t[1] * g * rr; P[1] = b[1] + t[1] * len * s + t[0] * g * rr; P[2] = h * rr;
    var tip = smoothstep(0.82, 1, s), lit = 0.12 + 0.5 * tip + 0.35 * edge * edge;
    return nebMix(NEB_DUST, NEB_ORANGE, tip + 0.5 * edge).map(function (c) { return c * lit; });
  }

  var NEB = {
    // the Pleiades: a cluster of young blue stars passing through a cloud of
    // dust that their light shows as a faint blue haze. The haze is
    // brightest round Merope, where it reaches south, then round Maia,
    // Electra and Alcyone, and elsewhere it lies in faint streaks. The nine
    // brightest stars are bodies of their own, further down, and here are
    // only the fainter members.
    pleiades: { n: 50000, gain: 0.16, parts: [
      [0.36, function (rng, P) {
        var u = 0.15 + galGauss(rng) * 0.08, v = -0.27 + galGauss(rng) * 0.14, w = galGauss(rng) * 0.08;
        if (rng() > 0.05 + 0.95 * Math.pow(pleiadesStreak(u, v, w), 1.5)) return false;
        return nebSet(P, u, v, w, NEB_BLUE, Math.max(0.3, 1.3 - 1.5 * Math.hypot(u - 0.149, v + 0.166)));
      }],
      [0.34, function (rng, P) {
        var s = PLEIADES[[3, 3, 2, 0][(rng() * 4) | 0]], u = s[0] + galGauss(rng) * 0.08, v = s[1] + galGauss(rng) * 0.08, w = galGauss(rng) * 0.06;
        if (rng() > 0.05 + 0.95 * Math.pow(pleiadesStreak(u, v, w), 1.5)) return false;
        return nebSet(P, u, v, w, NEB_BLUE, 0.8);
      }],
      [0.3, function (rng, P) {
        var u = galGauss(rng) * 0.42, v = galGauss(rng) * 0.36, w = galGauss(rng) * 0.15;
        if (rng() > Math.pow(pleiadesStreak(u, v, w), 2)) return false;
        return nebSet(P, u, v, w, nebMix(NEB_BLUE, NEB_HOT, 0.3), 0.45);
      }]
    ], stars: function (rng, out) {
      // about 120 fainter members, the fainter of them yellower
      for (var i = 0; i < 120; i++) {
        var m = Math.pow(rng(), 2);
        out.push([galGauss(rng) * 0.45, galGauss(rng) * 0.45, galGauss(rng) * 0.45, nebMix([1.0, 0.86, 0.66], NEB_HOT, m * 2), 0.05 + 0.2 * m]);
      }
    } },

    // the Helix: a disc of gas seen nearly face-on, a torus tipped across it
    // and a faint outer ring, with comet-like knots round the inner edge
    helix: { n: 70000, stars: [[0, 0, 0, NEB_HOT, 0.5]], parts: [
      [0.17, function (rng, P) {
        var r = 0.4 * Math.sqrt(rng()), a = rng() * TAU, u = r * Math.cos(a), v = r * Math.sin(a) * 0.92, w = galGauss(rng) * 0.12;
        if (rng() > 0.35 + 0.65 * nebWisp(u, v, w, 5, 3)) return false;
        return nebSet(P, u, v, w, nebMix(NEB_BLUE, NEB_OIII, r / 0.4), 0.6 + 0.8 * r);
      }],
      [0.38, function (rng, P) {
        var a = rng() * TAU, rr = 0.5 + galGauss(rng) * 0.07, z = galGauss(rng) * 0.05;
        nebRing(rr * Math.cos(a), rr * Math.sin(a) * 1.05, z, 0.55, 0.5, P);
        if (rng() > 0.3 + 0.7 * nebWisp(P[0], P[1], P[2], 7, 5)) return false;
        return nebSet(P, P[0], P[1], P[2], nebMix(NEB_ORANGE, NEB_HA, (rr - 0.43) / 0.14), 1);
      }],
      [0.15, function (rng, P) {
        var a = rng() * TAU, rr = 0.68 + galGauss(rng) * 0.06;
        nebRing(rr * Math.cos(a), rr * Math.sin(a), galGauss(rng) * 0.05, 1.0, -0.6, P);
        if (rng() > nebWisp(P[0], P[1], P[2], 5, 7)) return false;
        return nebSet(P, P[0], P[1], P[2], NEB_HA, 0.7);
      }],
      [0.08, function (rng, P) {
        var a = rng() * TAU, rr = 0.93 + galGauss(rng) * 0.035;
        nebRing(rr * Math.cos(a), rr * Math.sin(a), galGauss(rng) * 0.04, 0.4, 0.2, P);
        if (rng() > smoothstep(0.45, 0.75, nebWisp(P[0], P[1], P[2], 3, 9))) return false;
        return nebSet(P, P[0], P[1], P[2], NEB_HA, 0.5);
      }],
      // about 40,000 knots, each with a tail pointing away from the star; 900 are drawn
      [0.22, function (rng, P) {
        var k = (rng() * 900) | 0, a = hash3(k, 1, 2, 3) * TAU, r0 = 0.36 + 0.13 * hash3(k, 4, 5, 6), s = Math.pow(rng(), 1.8);
        var rr = r0 + s * (0.03 + 0.06 * hash3(k, 7, 8, 9)), ja = galGauss(rng) * 0.004 / rr;
        nebRing(rr * Math.cos(a + ja), rr * Math.sin(a + ja) * 1.05, galGauss(rng) * 0.01, 0.55, 0.5, P);
        return nebSet(P, P[0], P[1], P[2], nebMix([1.0, 0.78, 0.45], NEB_HA, s * 1.6), 1.5 - s);
      }]
    ] },

    // the Orion Nebula: a bright core round the Trapezium, wings of glowing
    // gas sweeping south, the dark bay of the Fish's Mouth reaching in from
    // the north-east and De Mairan's nebula, M43, to the north. It is a
    // blister on the near face of a dark cloud, so its gas lies on a bowl.
    orionnebula: { n: 130000, gain: 1.1, parts: [
      [0.13, function (rng, P) {
        var u = 0.02 + galGauss(rng) * 0.07, v = -0.02 + galGauss(rng) * 0.065, r = Math.hypot(u, v);
        if (orionDark(u, v)) return false;
        return nebSet(P, u, v, orionBowl(u, v, rng), nebMix([0.88, 1.0, 0.92], NEB_PINK, r / 0.15), 0.6);
      }],
      [0.2, function (rng, P) {
        var u = 0.07 + galGauss(rng) * 0.2, v = 0.0 + galGauss(rng) * 0.18, r = Math.hypot(u, v);
        if (orionDark(u, v) || rng() > 0.2 + 0.8 * nebWisp(u, v, 0, 6, 11)) return false;
        return nebSet(P, u, v, orionBowl(u, v, rng), nebMix(NEB_OIII, NEB_PINK, r / 0.18 + 0.3), 0.8);
      }],
      [0.21, function (rng, P) {
        var t = rng();
        nebAlong(rng, [0.1, 0.02], [0.6, -0.04], [0.62, -0.62], t, 0.05 + 0.08 * t, P);
        if (orionDark(P[0], P[1]) || rng() > 0.15 + 0.85 * nebRidge(P[0], P[1], 0, 5, 13, 2)) return false;
        return nebSet(P, P[0], P[1], orionBowl(P[0], P[1], rng), NEB_HA, 2 - 0.8 * t);
      }],
      [0.21, function (rng, P) {
        var t = rng();
        nebAlong(rng, [-0.08, -0.08], [-0.5, -0.22], [-0.52, -0.7], t, 0.05 + 0.08 * t, P);
        if (orionDark(P[0], P[1]) || rng() > 0.15 + 0.85 * nebRidge(P[0], P[1], 0, 5, 17, 2)) return false;
        return nebSet(P, P[0], P[1], orionBowl(P[0], P[1], rng), nebMix(NEB_PINK, NEB_HA, t), 2 - 0.8 * t);
      }],
      [0.1, function (rng, P) {
        var u = galGauss(rng) * 0.32, v = -0.42 + galGauss(rng) * 0.26;
        if (orionDark(u, v) || rng() > nebWisp(u, v, 0, 4, 19)) return false;
        return nebSet(P, u, v, orionBowl(u, v, rng), NEB_HA, 0.9);
      }],
      [0.06, function (rng, P) {
        // the fainter glow north-west of the core
        var u = 0.26 + galGauss(rng) * 0.14, v = 0.2 + galGauss(rng) * 0.13;
        if (orionDark(u, v) || rng() > nebWisp(u, v, 0, 6, 21)) return false;
        return nebSet(P, u, v, orionBowl(u, v, rng), NEB_PINK, 0.7);
      }],
      [0.06, function (rng, P) {
        var u = -0.06 + galGauss(rng) * 0.05, v = 0.26 + galGauss(rng) * 0.045;
        if (Math.abs(v - 0.25 + 0.4 * (u + 0.06)) < 0.008) return false;
        return nebSet(P, u, v, -0.1 + galGauss(rng) * 0.04, NEB_PINK, 1);
      }],
      [0.09, function (rng, P) {
        var u = galGauss(rng) * 0.48, v = -0.15 + galGauss(rng) * 0.44;
        if (orionDark(u, v) || rng() > nebWisp(u, v, 0, 3, 23)) return false;
        return nebSet(P, u, v, orionBowl(u, v, rng), NEB_BLUE, 0.45);
      }]
    ], stars: function (rng, out) {
      // the Trapezium, then the young cluster round it
      [[0, 0, 1.2], [0.022, 0.026, 0.7], [0.03, -0.018, 0.6], [-0.026, -0.008, 0.6]].forEach(function (s) { out.push([s[0], s[1], -0.05, NEB_HOT, s[2]]); });
      out.push([-0.06, 0.25, -0.1, NEB_HOT, 0.5]);
      for (var i = 0; i < 45; i++) out.push([galGauss(rng) * 0.13, galGauss(rng) * 0.13, galGauss(rng) * 0.05, NEB_HOT, 0.1 + 0.3 * Math.pow(rng(), 3)]);
    } },

    // the Ring Nebula: a thick elliptical ring seen about 30 degrees from
    // its axis, green and yellow inside and red outside, round a faint blue
    // middle, with petals of a fainter halo beyond
    ringnebula: { n: 60000, stars: [[0, 0, 0, NEB_HOT, 0.35]], parts: [
      [0.6, function (rng, P) {
        var a = rng() * TAU, rr = 1 + galGauss(rng) * 0.15;
        nebRing(0.66 * rr * Math.cos(a), 0.52 * rr * Math.sin(a), galGauss(rng) * 0.09, 0.5, 0.45, P);
        if (rng() > 0.35 + 0.65 * nebWisp(P[0], P[1], P[2], 8, 29)) return false;
        return nebSet(P, P[0], P[1], P[2], rr < 1 ? nebMix([0.55, 1.0, 0.52], [1.0, 0.86, 0.4], (rr - 0.8) / 0.2) : nebMix([1.0, 0.86, 0.4], NEB_HA, (rr - 1) / 0.18), 1);
      }],
      [0.22, function (rng, P) {
        var r = 0.86 * Math.sqrt(rng()), a = rng() * TAU;
        nebRing(0.66 * r * Math.cos(a), 0.52 * r * Math.sin(a), galGauss(rng) * 0.35, 0.5, 0.45, P);
        return nebSet(P, P[0], P[1], P[2], nebMix(NEB_BLUE, NEB_OIII, r), 0.45);
      }],
      [0.18, function (rng, P) {
        var a = rng() * TAU, rr = 0.82 + 0.18 * rng();
        if (rng() > 0.5 + 0.5 * Math.cos(7 * a + 2 * nebWisp(Math.cos(a), Math.sin(a), 0, 2, 31))) return false;
        nebRing(rr * Math.cos(a), rr * Math.sin(a) * 0.86, galGauss(rng) * 0.15, 0.5, 0.45, P);
        return nebSet(P, P[0], P[1], P[2], NEB_HA, 0.35);
      }]
    ] },

    // the Eagle Nebula: a broken shell of glowing gas round a cavity, the
    // young cluster NGC 6611 in it, and the Pillars of Creation and the
    // Spire, columns of dust pointing at the cluster with their tips lit
    eagle: { n: 150000, parts: [
      [0.36, function (rng, P) {
        var a = rng() * TAU, rr = 1 + galGauss(rng) * 0.22, u = 0.78 * rr * Math.cos(a), v = 0.6 * rr * Math.sin(a), w = galGauss(rng) * 0.3;
        if (rng() > smoothstep(0.25, 0.7, nebWisp(u, v, w, 2.5, 37)) * (0.4 + 0.6 * nebWisp(u, v, w, 9, 41))) return false;
        return nebSet(P, u, v, w, nebMix(NEB_ORANGE, NEB_HA, rr), 1);
      }],
      [0.2, function (rng, P) {
        var u = 0.04 + galGauss(rng) * 0.3, v = 0.02 + galGauss(rng) * 0.26, w = galGauss(rng) * 0.2;
        if (eagleDust(u, v) || rng() > 0.2 + 0.8 * nebWisp(u, v, w, 5, 43)) return false;
        return nebSet(P, u, v, w, nebMix(NEB_OIII, NEB_BLUE, Math.hypot(u, v) * 1.5), 0.8);
      }],
      [0.1, function (rng, P) {
        // the glow behind the pillars
        var u = -0.04 + galGauss(rng) * 0.1, v = -0.12 + galGauss(rng) * 0.09, w = -0.05 + galGauss(rng) * 0.05;
        if (eagleDust(u, v) || rng() > 0.3 + 0.7 * nebWisp(u, v, w, 14, 44)) return false;
        return nebSet(P, u, v, w, NEB_OIII, 0.55);
      }],
      [0.13, function (rng, P) {
        var k = rng(), p = EAGLE_PILLARS[k < 0.45 ? 0 : k < 0.78 ? 1 : 2];
        return nebSet(P, P[0], P[1], P[2], nebPillar(rng, p[0], p[1], p[2], p[3], k * 10, P), 1);
      }],
      [0.06, function (rng, P) {
        var p = EAGLE_PILLARS[3];
        return nebSet(P, P[0], P[1], P[2], nebPillar(rng, p[0], p[1], p[2], p[3], 47, P), 1);
      }],
      [0.15, function (rng, P) {
        var u = galGauss(rng) * 0.6, v = galGauss(rng) * 0.48, w = galGauss(rng) * 0.4;
        if (rng() > nebWisp(u, v, w, 3, 53)) return false;
        return nebSet(P, u, v, w, NEB_HA, 0.4);
      }]
    ], stars: function (rng, out) {
      for (var i = 0; i < 70; i++) out.push([0.12 + galGauss(rng) * 0.09, 0.18 + galGauss(rng) * 0.09, galGauss(rng) * 0.05, NEB_HOT, 0.12 + 0.5 * Math.pow(rng(), 4)]);
    } },

    // the Crab Nebula: a cage of red and orange filaments round a blue
    // glow, the light of fast electrons spiralling in the magnetic field of
    // the spinning neutron star at its centre, stretched north-west to
    // south-east
    crab: { n: 110000, gain: 1.2, stars: [[0.03, -0.02, 0, NEB_HOT, 0.7]], parts: [
      [0.3, function (rng, P) {
        var x = rng() * 2 - 1, y = rng() * 2 - 1, z = rng() * 2 - 1, q = x * x + y * y + z * z;
        if (q > crabEdge(x, y, z) || rng() > 1 - q) return false;
        crabTurn(x, y * 0.69, z * 0.69, P);
        if (rng() > 0.3 + 0.7 * nebWisp(P[0], P[1], P[2], 4, 59)) return false;
        return nebSet(P, P[0], P[1], P[2], nebMix([0.66, 0.76, 1.0], NEB_BLUE, Math.sqrt(q)), 0.4);
      }],
      [0.62, function (rng, P) {
        var x = galGauss(rng), y = galGauss(rng), z = galGauss(rng), l = Math.sqrt(x * x + y * y + z * z) || 1, r = (0.72 + 0.28 * Math.pow(rng(), 0.5)) * Math.sqrt(crabEdge(x / l, y / l, z / l));
        x *= r / l; y *= r / l; z *= r / l;
        if (rng() > nebRidge(x, y, z, 2.2, 61, 9)) return false;
        crabTurn(x, y * 0.69, z * 0.69, P);
        var c = rng() < 0.2 ? [0.88, 0.92, 0.42] : rng() < 0.25 ? NEB_PINK : nebMix(NEB_ORANGE, NEB_HA, rng());
        return nebSet(P, P[0], P[1], P[2], c, 1.6);
      }],
      [0.08, function (rng, P) {
        var x = galGauss(rng), y = galGauss(rng), z = galGauss(rng), l = Math.sqrt(x * x + y * y + z * z) || 1, r = (0.9 + 0.1 * rng()) * Math.sqrt(crabEdge(x / l, y / l, z / l));
        crabTurn(x * r / l, y * r / l * 0.69, z * r / l * 0.69, P);
        if (rng() > nebWisp(P[0], P[1], P[2], 6, 62)) return false;
        return nebSet(P, P[0], P[1], P[2], NEB_HA, 0.6);
      }]
    ] },

    // the Carina Nebula: glowing gas split by a V of dark dust, round Eta
    // Carinae and the young clusters Trumpler 14 and 16, with the dark
    // Keyhole beside Eta Carinae
    carina: { n: 150000, parts: [
      [0.38, function (rng, P) {
        var u = galGauss(rng) * 0.46, v = galGauss(rng) * 0.3, w = galGauss(rng) * 0.25;
        if (carinaDark(u, v) || rng() > 0.15 + 0.85 * nebWisp(u, v, w, 4, 67)) return false;
        return nebSet(P, u, v, w, nebMix(NEB_HA, NEB_ORANGE, nebWisp(u, v, w, 2, 71)), 0.9);
      }],
      [0.2, function (rng, P) {
        var u = -0.02 + galGauss(rng) * 0.17, v = galGauss(rng) * 0.14, w = galGauss(rng) * 0.12, d = Math.hypot(u + 0.06, v + 0.03);
        if (carinaDark(u, v) || rng() > 0.2 + 0.8 * nebWisp(u, v, w, 7, 73)) return false;
        return nebSet(P, u, v, w, nebMix(NEB_OIII, NEB_PINK, d / 0.12), 1);
      }],
      [0.32, function (rng, P) {
        var u = galGauss(rng) * 0.6, v = galGauss(rng) * 0.42, w = galGauss(rng) * 0.3;
        if (carinaDark(u, v) || rng() > nebRidge(u, v, w, 3, 79, 4)) return false;
        return nebSet(P, u, v, w, nebMix(NEB_HA, NEB_ORANGE, 0.3 * rng()), 1);
      }],
      [0.1, function (rng, P) {
        // the rims of the dust, lit from inside
        var arm = rng() < 0.5 ? CARINA_V[0] : CARINA_V[1], t = rng(), s = rng() < 0.5 ? -1 : 1, wd = 0.012 + 0.045 * t;
        var u = arm[0][0] + (arm[1][0] - arm[0][0]) * t, v = arm[0][1] + (arm[1][1] - arm[0][1]) * t, dx = arm[1][0] - arm[0][0], dy = arm[1][1] - arm[0][1], l = Math.hypot(dx, dy);
        var off = s * (wd + Math.abs(galGauss(rng)) * 0.02);
        u += -dy / l * off; v += dx / l * off;
        if (rng() > nebWisp(u, v, 0, 8, 83)) return false;
        return nebSet(P, u, v, galGauss(rng) * 0.1, NEB_ORANGE, 0.35);
      }]
    ], stars: function (rng, out) {
      out.push([-0.06, -0.03, 0, [1.0, 0.86, 0.66], 1.5]);
      for (var i = 0; i < 40; i++) out.push([0.1 + galGauss(rng) * 0.03, 0.17 + galGauss(rng) * 0.03, galGauss(rng) * 0.02, NEB_HOT, 0.1 + 0.5 * Math.pow(rng(), 4)]);
      for (i = 0; i < 40; i++) out.push([-0.05 + galGauss(rng) * 0.06, -0.02 + galGauss(rng) * 0.06, galGauss(rng) * 0.03, NEB_HOT, 0.1 + 0.4 * Math.pow(rng(), 4)]);
      for (i = 0; i < 60; i++) out.push([galGauss(rng) * 0.4, galGauss(rng) * 0.3, galGauss(rng) * 0.2, NEB_HOT, 0.06 + 0.25 * Math.pow(rng(), 4)]);
    } }
  };
  // The nine brightest Pleiades at their places on the sky, in units of the
  // cluster's 8 light-year radius, for the haze round them: Alcyone, Atlas,
  // Electra, Maia, Merope, Taygeta, Pleione, Celaeno and Asterope.
  var PLEIADES = [[-0.107, -0.014], [-0.478, -0.065], [0.470, -0.007], [0.259, 0.240], [0.149, -0.166],
                  [0.396, 0.336], [-0.484, 0.016], [0.486, 0.164], [0.241, 0.421]];
  // the haze's streaks, which run from upper left to lower right
  function pleiadesStreak(u, v, w) {
    var a = -0.6, x = u * Math.cos(a) + v * Math.sin(a), y = v * Math.cos(a) - u * Math.sin(a);
    return nebRidge(x * 1.5, y * 9, w * 3, 1, 97, 3) * 0.7 + 0.3 * nebWisp(u, v, w, 4, 101);
  }
  // the Orion Nebula's bowl, its dark bay and the lane between it and M43
  function orionBowl(u, v, rng) { return -0.3 + 0.55 * (u * u + v * v) + galGauss(rng) * 0.06; }
  function orionDark(u, v) {
    var d = nebSeg(u, v, [-0.06, 0.06], [-0.58, 0.4]);
    return d[0] < 0.015 + 0.1 * d[1] + 0.12 * d[1] * d[1] || (Math.abs(v - 0.2 + 0.25 * u) < 0.02 && u > -0.3 && u < 0.25);
  }
  // the Eagle's pillars as [base, direction, length, width], the Spire last,
  // and the dust that hides the glow behind them
  var EAGLE_PILLARS = [[[-0.11, -0.2], [0.42, 0.91], 0.12, 0.022], [[-0.05, -0.19], [0.42, 0.91], 0.085, 0.018],
                       [[0.02, -0.17], [0.42, 0.91], 0.065, 0.016], [[-0.5, -0.06], [0.94, 0.34], 0.27, 0.035]];
  function eagleDust(u, v) {
    for (var i = 0; i < EAGLE_PILLARS.length; i++) {
      var p = EAGLE_PILLARS[i], b = p[0], e = [b[0] + p[1][0] * p[2], b[1] + p[1][1] * p[2]], d = nebSeg(u, v, b, e);
      if (d[0] < p[3] * 1.6 * (1 - 0.45 * d[1])) return true;
    }
    return false;
  }
  // the Crab's long axis, at position angle 125 degrees
  // and its ragged outline: how far out it reaches in each direction, squared
  function crabEdge(x, y, z) { var e = 0.82 + 0.3 * fbm3(x * 1.6 + 7, y * 1.6, z * 1.6 - 3, 2); return e * e; }
  function crabTurn(x, y, z, P) { var c = Math.cos(0.61), s = Math.sin(0.61); P[0] = x * c - y * s; P[1] = x * s + y * c; P[2] = z; }
  // the V of dust across the Carina Nebula, and the Keyhole
  var CARINA_V = [[[0.0, -0.1], [-0.42, 0.42]], [[0.0, -0.1], [0.38, 0.36]]];
  function carinaDark(u, v) {
    for (var i = 0; i < 2; i++) { var d = nebSeg(u, v, CARINA_V[i][0], CARINA_V[i][1]); if (d[0] < (0.012 + 0.045 * d[1]) * (0.6 + 0.8 * nebWisp(u, v, 0, 9, 89))) return true; }
    return Math.hypot(u + 0.085, v + 0.01) < 0.022;
  }

  var nebMade = {};
  // carry a nebula's points on for up to budgetMs; true once they are made
  function prepareNebula(key, budgetMs) {
    var D = NEB[key], M = nebMade[key], t0 = performance.now(), P = [0, 0, 0, 0, 0, 0];
    if (!D) return true;
    if (!M) {
      var rng = galRng(0x51ed27 + key.length * 977 + key.charCodeAt(0) * 131), stars = [];
      if (typeof D.stars === 'function') D.stars(rng, stars); else stars = D.stars || [];
      var cdf = [], acc = 0;
      D.parts.forEach(function (p) { acc += p[0]; cdf.push(acc); });
      M = nebMade[key] = { n: D.n, done: 0, pos: new Float32Array(D.n * 3), col: new Float32Array(D.n * 3), rng: rng, cdf: cdf, sum: 0,
                           stars: stars, gain: D.gain || 1, ready: false };
    }
    while (M.done < M.n) {
      for (var e = Math.min(M.n, M.done + 2000); M.done < e; M.done++) {
        var u = M.rng() * acc0(M.cdf), k = 0;
        while (k < M.cdf.length - 1 && u > M.cdf[k]) k++;
        for (var tries = 0; tries < 60 && !D.parts[k][1](M.rng, P); tries++);
        var o = M.done * 3;
        M.pos[o] = P[0]; M.pos[o + 1] = P[1]; M.pos[o + 2] = P[2];
        M.col[o] = P[3]; M.col[o + 1] = P[4]; M.col[o + 2] = P[5];
        M.sum += (P[3] + P[4] + P[5]) / 3;
      }
      if (performance.now() - t0 > budgetMs) return false;
    }
    if (!M.ready) {
      for (var i = 0, f = 1 / M.sum; i < M.col.length; i++) M.col[i] *= f;
      M.ready = true;
    }
    return true;
  }
  function acc0(c) { return c[c.length - 1]; }
  // a nebula's points, null until they are made
  function nebulaPoints(key) { var M = nebMade[key]; return M && M.ready ? M : null; }

  var NEBULA = { prepare: prepareNebula, points: nebulaPoints };

  // Their radii in kilometres: half the size of the part drawn. The
  // Pleiades' core is about 16 light-years across, the Helix reaches 2.87
  // light-years from its star, the Orion Nebula is about 25 light-years
  // across, the Ring Nebula's ring 1.05 by 0.73, the Eagle Nebula 70 by 55,
  // the Crab Nebula 13 by 9 and the Carina Nebula about 300.
  [['pleiades', 8, [0.62, 0.74, 1.0]], ['helix', 2.87, [1.0, 0.48, 0.42]], ['orionnebula', 12.5, [1.0, 0.5, 0.68]], ['ringnebula', 0.8, [0.72, 1.0, 0.6]],
   ['eagle', 35, [0.55, 0.9, 0.8]], ['crab', 6.65, [1.0, 0.62, 0.4]], ['carina', 150, [1.0, 0.5, 0.5]]].forEach(function (n) {
    BODIES[n[0]] = { r: n[1] * LY_KM, f: 0, kind: 'nebula', cls: 'nebula', col: n[2], glowCol: n[2] };
  });

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

  /* ------------------------------------------------------------------------
     Sagittarius A*, the black hole at the centre of the galaxy. The Event
     Horizon Telescope saw a ring of hot gas 51.8 microarcseconds across
     round its shadow (EHT Collaboration 2022, ApJL 930, L12). At the
     distance the galaxy is drawn at, that is 63 million km, and r is the
     ring's radius. m is the hole's mass, 4.297 million Suns (GRAVITY
     Collaboration 2022, A&A 657, L12), as a length, GM/c². The renderer
     bends light round the hole in units of m. The gas round it is drawn as
     a disc, and its map is of the disc laid flat: east longitude runs round
     it from the prime meridian, and latitude out from it, from radial[0]
     times m at the top to radial[1] at the bottom. The clumps of brighter,
     hotter gas on it are made up, and they go round with the gas.
     ------------------------------------------------------------------------ */
  // [east longitude, radius in m, half-widths round the disc (degrees) and across it (m), brightness]
  var SGRA_CLUMPS = [[20, 4.8, 26, 0.6, 0.5], [105, 4.5, 18, 0.45, 0.35], [190, 5.2, 34, 0.7, 0.45], [262, 4.7, 14, 0.4, 0.3],
                     [318, 5.0, 22, 0.5, 0.25]];
  function genSgrA(lon, lat, px, py, pz, out) {
    var S = BODIES.sgra.radial, r = S[0] + (90 - lat) / 180 * (S[1] - S[0]), a = lon * DEG, ca = Math.cos(a), sa = Math.sin(a);
    // filaments drawn out round the disc by its spin, and a slower patchiness
    var A = 0.5 + 0.22 * fbm3(ca * 2.2, sa * 2.2, r * 2.5, 3) + 0.18 * fbm3(ca * 1.3 + 5, sa * 1.3, r * 0.6, 2);
    for (var i = 0; i < SGRA_CLUMPS.length; i++) {
      var c = SGRA_CLUMPS[i], d = ((lon - c[0]) % 360 + 540) % 360 - 180, e = (r - c[1]) / c[3];
      A += c[4] * Math.exp(-0.5 * (d * d / (c[2] * c[2]) + e * e));
    }
    // the brighter the gas, the hotter and whiter
    A = clamp(A, 0.1, 1);
    var hot = smoothstep(0.45, 0.95, A);
    out[0] = A; out[1] = A * (0.48 + 0.38 * hot); out[2] = A * (0.18 + 0.42 * hot);
  }
  BODIES.sgra = { r: 3.1578e7, m: 6.345e6, f: 0, tex: [512, 128], kind: 'hole', gen: genSgrA, radial: [3, 12], col: [1.0, 0.62, 0.3], cls: 'hole',
                  glowCol: [1.0, 0.56, 0.24] };
  // S2, the star best followed round it: a hot B0-2.5 star on the main
  // sequence, about 14 times the mass of the Sun (Habibi et al. 2017, ApJ
  // 847, 120). It is drawn at 6 times the Sun's radius, the size of such a
  // star, and smooth, as the other hot stars are.
  BODIES.s2 = { r: 6 * BODIES.sun.r, f: 0, tex: [256, 128], kind: 'star', gen: starGen({ seed: 0, groups: 0, gran: 0, tint: [0.72, 0.8, 1.0] }),
                col: [0.72, 0.8, 1.0], exposure: 1.2, cls: 'star', glowCol: [0.64, 0.74, 1.0], parent: 'sgra' };

  window.Surfaces = {
    BODIES: BODIES,
    galaxy: GALAXY,
    nebula: NEBULA,
    texture: texture,
    prepare: prepare,
    has: function (key) { return !!textures[key]; },
    cloudCover: cloudCover,
    cloudWind: cloudWind,
    cloudOf: cloudOf,
    refine: refine,
    ring: ring,
    noise2: noise2,
    fbm: fbm,
    noise3: noise3,
    fbm3: fbm3,
    hash3: hash3,
    _earthMask: function () { return earthMask(); }
  };
})();
