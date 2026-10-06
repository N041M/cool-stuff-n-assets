/* ==========================================================================
   DEEP SKY // the galaxy, the nebulae and the black hole at its centre
   --------------------------------------------------------------------------
   The Milky Way as 450,000 stars on its measured spiral arms, with its bar,
   its clusters, its glowing gas and its dust. Six nebulae and the
   Pleiades as clouds of points sketched from photographs. Sagittarius A*,
   the black hole at the centre of the galaxy, with the light of its disc
   bent round it.

   Each object is described in a frame of its own: the galaxy in
   galactocentric kiloparsecs, a nebula in units of its radius as seen from
   the Earth, and the hole in units of the radius of its ring. Nothing here
   draws. deep-sky-glyphs.js draws them with the glyph renderer.
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

  /* ------------------------------------------------------------------------
     Noise, from the same seeded table as the planets' maps. noise2 is
     gradient noise periodic in x. noise3 is Perlin's improved noise.
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

  /* ------------------------------------------------------------------------
     The Milky Way seen face-on. Positions are galactocentric kiloparsecs:
     x toward the centre as seen from the Sun, which is at x = -8.15, y
     toward longitude 90° and z toward the north galactic pole.

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

     450,000 such stars are made, to be drawn one by one, so the arms
     break up into stars and clusters as a camera comes closer. They take
     about half a second to make, so prepare() makes them a few
     milliseconds at a time.
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


  // Their radii in kilometres: half the size of the part drawn. The
  // Pleiades' core is about 16 light-years across, the Helix reaches 2.87
  // light-years from its star, the Orion Nebula is about 25 light-years
  // across, the Ring Nebula's ring 1.05 by 0.73, the Eagle Nebula 70 by 55,
  // the Crab Nebula 13 by 9 and the Carina Nebula about 300.
  // by key: radius in km and colour from 0 to 1
  var NEB_SIZE = {};
  [['pleiades', 8, [0.62, 0.74, 1.0]], ['helix', 2.87, [1.0, 0.48, 0.42]], ['orionnebula', 12.5, [1.0, 0.5, 0.68]], ['ringnebula', 0.8, [0.72, 1.0, 0.6]],
   ['eagle', 35, [0.55, 0.9, 0.8]], ['crab', 6.65, [1.0, 0.62, 0.4]], ['carina', 150, [1.0, 0.5, 0.5]]].forEach(function (n) {
    NEB_SIZE[n[0]] = { radius: n[1] * LY_KM, colour: n[2] };
  });

  /* ------------------------------------------------------------------------
     Sagittarius A*, the black hole at the centre of the galaxy. The Event
     Horizon Telescope saw a ring of hot gas 51.8 microarcseconds across
     round its shadow (EHT Collaboration 2022, ApJL 930, L12). At the
     distance of 8.15 kiloparsecs, that is 63 million km, and radius is the
     ring's radius. mass is the hole's mass, 4.297 million Suns (GRAVITY
     Collaboration 2022, A&A 657, L12), as a length, GM/c², in km. Light is
     bent round the hole in units of mass. The gas round it is drawn as a
     disc, and its map is of the disc laid flat: east longitude runs round
     it from the prime meridian, and latitude out from it, from radial[0]
     times mass at the top to radial[1] at the bottom. The clumps of
     brighter, hotter gas on it are made up, and they go round with the gas.
     ------------------------------------------------------------------------ */
  // [east longitude, radius in units of mass, half-widths round the disc (degrees) and across it (units of mass), brightness]
  var SGRA_CLUMPS = [[20, 4.8, 26, 0.6, 0.5], [105, 4.5, 18, 0.45, 0.35], [190, 5.2, 34, 0.7, 0.45], [262, 4.7, 14, 0.4, 0.3],
                     [318, 5.0, 22, 0.5, 0.25]];
  function genSgrA(lon, lat, px, py, pz, out) {
    var S = HOLE.radial, r = S[0] + (90 - lat) / 180 * (S[1] - S[0]), a = lon * DEG, ca = Math.cos(a), sa = Math.sin(a);
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
  // mapSize is the size its map is made at, colour its mean colour and
  // glow the colour of its glow from far off
  var HOLE = { radius: 3.1578e7, mass: 6.345e6, mapSize: [512, 128], radial: [3, 12], colour: [1.0, 0.62, 0.3], glow: [1.0, 0.56, 0.24] };

  /* ------------------------------------------------------------------------
     A black hole and the disc of gas round it. Each sample's ray is traced
     back from the camera round the hole, bent as a hole that does not spin
     bends light, and wherever it crosses the plane of the disc it picks up
     the disc's light there. Lengths are in units of the hole's mass, GM/c²,
     in which the edge of the shadow is at √27. A ray can cross the disc
     behind the hole, in front of it and, close to the shadow, again after
     going round it, so the far side of the disc shows over the top of the
     shadow and under it as well as beside it, and thin rings of light edge
     the shadow. Seen from near the disc's pole, as from the Earth, that is
     the ring the Event Horizon Telescope saw. The gas goes round at up to
     nearly half the speed of light, so the side coming toward the camera is
     brighter, and light climbing out from close to the hole is dimmer. The
     disc is see-through and a little thick, so light that runs along it
     picks up more of it. The clumps on its map go round with the gas. The
     shadow hides whatever lies behind it, and far off the hole is a soft
     glow.
     ------------------------------------------------------------------------ */
  // The rays: for HL_N impact parameters b, packed closely round √27, the
  // path traced back from the camera as u = 1/r and du/dψ every HL_DPSI of
  // ψ, the angle round the hole from the camera's side. A ray inside √27
  // ends where it falls in, and one outside it where it leaves again.
  var HL_N = 400, HL_DPSI = 0.02, HL_S = 0.002, HL_BC = Math.sqrt(27), HL_BMAX = 14, hl = null;
  function holeRays() {
    if (hl) return hl;
    var x0 = -Math.asinh(HL_BC / HL_S), dx = (Math.asinh((HL_BMAX - HL_BC) / HL_S) - x0) / (HL_N - 1);
    var off = new Int32Array(HL_N + 1), fell = new Uint8Array(HL_N), U = [], Wv = [], h = HL_DPSI;
    // u'' = 3u² - u: the path of light round a mass of 1
    function acc(u) { return 3 * u * u - u; }
    for (var i = 0; i < HL_N; i++) {
      var u = 0, w = 1 / Math.max(0.05, HL_BC + HL_S * Math.sinh(x0 + i * dx));
      off[i] = U.length;
      U.push(u); Wv.push(w);
      for (var s = 0; s < 1100; s++) {
        var k1u = w, k1w = acc(u), k2u = w + 0.5 * h * k1w, k2w = acc(u + 0.5 * h * k1u);
        var k3u = w + 0.5 * h * k2w, k3w = acc(u + 0.5 * h * k2u), k4u = w + h * k3w, k4w = acc(u + h * k3u);
        u += h / 6 * (k1u + 2 * k2u + 2 * k3u + k4u); w += h / 6 * (k1w + 2 * k2w + 2 * k3w + k4w);
        if (u >= 0.5) { fell[i] = 1; break; }
        if (u < 0) break;
        U.push(u); Wv.push(w);
      }
    }
    off[HL_N] = U.length;
    return (hl = { x0: x0, dx: dx, off: off, fell: fell, u: new Float32Array(U), w: new Float32Array(Wv) });
  }
  // u and du/dψ on ray i at ψ, in lu and lw; false once the ray has ended
  var lu = 0, lw = 0;
  function rayAt(i, psi) {
    var o = hl.off[i], f = psi / HL_DPSI, j = f | 0;
    if (j >= hl.off[i + 1] - o - 1) { lu = hl.fell[i] ? 0.5 : 0; lw = 0; return false; }
    var t = f - j, a = o + j;
    lu = hl.u[a] + (hl.u[a + 1] - hl.u[a]) * t; lw = hl.w[a] + (hl.w[a + 1] - hl.w[a]) * t;
    return true;
  }
  // the disc from HOLE_RIN to HOLE_ROUT, its light falling off as 1 / r³,
  // its gas at HOLE_SPEED / √(r - 2) of the speed of light, the share of its
  // light that takes the clumps, and how far out it is drawn, in ring radii.
  // It is drawn thin: a ray either side for its thickness split the narrow
  // band of its near side into copies once it was seen nearly edge on.
  var HOLE_RIN = 4, HOLE_ROUT = 10, HOLE_SPEED = 0.6, HOLE_GAIN = 2.2, HOLE_KNOTS = 0.7, HOLE_REACH = 2.4,
      HOLE_HOT = [1.0, 0.86, 0.62], HOLE_WARM = [1.0, 0.46, 0.18];
  // what stays the same across the hole for view V (its right, up and
  // backward unit vectors R, U and B), with samples px ring radii apart.
  // F holds the disc's pole N, prime meridian Q and east E as unit vectors
  // in the same frame as V. mean is the clumps' colour where there is no map.
  function holeSetup(F, V, px, mean) {
    holeRays();
    var S = HOLE, N = F.N, K = S.radius / S.mass, M = cross(N, V.B), nR = dot(N, V.R), nU = dot(N, V.U);
    return { K: K, aa: 0.5 * px * K, nB: dot(N, V.B), nR: nR, nU: nU, mR: dot(M, V.R), mU: dot(M, V.U),
             qB: dot(F.Q, V.B), qR: dot(F.Q, V.R), qU: dot(F.Q, V.U), eB: dot(F.E, V.B), eR: dot(F.E, V.R), eU: dot(F.E, V.U),
             mean: mean || S.colour, v0: S.radial[0], vk: 1 / (S.radial[1] - S.radial[0]) };
  }
  // The hole at (x, y), in ring radii from its middle and y up: its light
  // without the clumps in out.r, out.g and out.b, the light that takes the
  // clumps from the map at (out.u, out.v) in out.f, and the shadow's cover,
  // which it returns.
  var hr = 0, hg = 0, hb = 0, hu = 0, hv = 0, hf = 0;
  function holeAt(Hs, x, y, out) {
    var cover = lightAt(Hs, x, y);
    out.r = hr; out.g = hg; out.b = hb; out.u = hu; out.v = hv; out.f = hf;
    return cover;
  }
  function lightAt(Hs, x, y) {
    var rho = Math.sqrt(x * x + y * y), b = rho * Hs.K, cover = 1 - smoothstep(HL_BC - Hs.aa, HL_BC + Hs.aa, b);
    hr = hg = hb = hf = 0;
    if (b >= HL_BMAX || rho < 1e-9) return cover;
    // The ray's plane holds the camera's direction and d, the way out from
    // the middle on the screen. It meets the disc at psi0, and half a turn
    // and a whole turn on.
    var id = 1 / rho, dn = (x * Hs.nR + y * Hs.nU) * id, dm = (x * Hs.mR + y * Hs.mU) * id, p0 = Math.atan2(-Hs.nB, dn);
    if (p0 < 0) p0 += Math.PI;
    var c0 = Math.cos(p0), s0 = Math.sin(p0), f = (Math.asinh((b - HL_BC) / HL_S) - hl.x0) / hl.dx;
    var i = Math.min(f | 0, HL_N - 2), t = f - i, sum = 0, top = 0, tc = 0, ts = 0, tr = 0;
    for (var k = 0; k < 3; k++) {
      var psi = p0 + k * Math.PI, on = rayAt(i, psi), u = lu, w = lw;
      if (!rayAt(i + 1, psi) && !on) break;
      u += (lu - u) * t; w += (lw - w) * t;
      if (u * HOLE_ROUT < 1 || u * (HOLE_RIN - 0.8) > 1) continue;
      var r = 1 / u, cp = k & 1 ? -c0 : c0, sp = k & 1 ? -s0 : s0;
      // The light leaves toward the camera, q steps outward for each step
      // round as a static observer there sees it. cosT is how far it runs
      // along the gas's way round the pole and kz how steeply it leaves the disc.
      var q = w / (u * Math.sqrt(1 - 2 * u)), kn = 1 / Math.sqrt(q * q + 1);
      var cosT = -dm * kn, kz = Math.abs(cp * dn - sp * Hs.nB) * kn;
      var beta = HOLE_SPEED / Math.sqrt(r - 2), g = Math.sqrt((1 - 2 * u) * (1 - beta * beta)) / (1 - beta * cosT);
      var e = HOLE_RIN * u, I = smoothstep(HOLE_RIN - 0.8, HOLE_RIN + 0.8, r) * (1 - smoothstep(HOLE_ROUT - 4, HOLE_ROUT, r)) *
              e * e * e * g * g * g * Math.min(1 / Math.max(kz, 1e-3), 3);
      sum += I;
      if (I > top) { top = I; tc = cp; ts = sp; tr = r; }
    }
    if (!(sum > 0)) return cover;
    // Brighter light is drawn hotter and whiter. The brightest crossing takes the clumps.
    sum *= HOLE_GAIN; top *= HOLE_GAIN;
    var hot = smoothstep(0.3, 1.4, sum), d = top * HOLE_KNOTS;
    if (d < 0.002) d = 0;
    var s = sum - d;
    hr = s * (HOLE_WARM[0] + (HOLE_HOT[0] - HOLE_WARM[0]) * hot);
    hg = s * (HOLE_WARM[1] + (HOLE_HOT[1] - HOLE_WARM[1]) * hot);
    hb = s * (HOLE_WARM[2] + (HOLE_HOT[2] - HOLE_WARM[2]) * hot);
    if (d) {
      hf = d;
      hu = Math.atan2(tc * Hs.eB + ts * (x * Hs.eR + y * Hs.eU) * id, tc * Hs.qB + ts * (x * Hs.qR + y * Hs.qU) * id) / TAU + 0.5;
      hv = clamp((tr - Hs.v0) * Hs.vk, 0, 1);
    }
    return cover;
  }

  window.DeepSky = {
    galaxy: GALAXY,
    nebula: { prepare: prepareNebula, points: nebulaPoints, catalogue: NEB_SIZE },
    hole: { radius: HOLE.radius, mass: HOLE.mass, radial: HOLE.radial, colour: HOLE.colour, glow: HOLE.glow,
            reach: HOLE_REACH, mapSize: HOLE.mapSize, map: genSgrA, setup: holeSetup, at: holeAt }
  };
})();
