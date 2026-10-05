/* ==========================================================================
   ORRERY // the solar system, live, drawn in characters
   --------------------------------------------------------------------------
   The Sun, the eight planets and the Moon sit where they really are now
   (js/ephemeris.js), with their real sizes, oblateness, axial tilts
   and rotation. The camera is orthographic, except that a body far behind
   the one in view is drawn at the size it looks from there. Close to a
   body it looks at it from a low angle above the ecliptic; zooming out
   pitches it up until it looks straight down on the plane of the planets,
   and the target slides from the body to the Sun, so one zoom runs from
   a single planet to the whole system and back. Further out the camera
   turns to the plane of the galaxy and the target slides on to the
   galactic centre, out to the whole Milky Way.

   Every character cell is sampled at six points (2 x 3). Bodies are ray-cast
   as ellipsoids with ring planes, ring and planet shadows and eclipses;
   spacecraft as small models at their real size, and the black hole at
   the galaxy's centre by bending light round it.
   Orbits, the asteroid and Kuiper belts, the Sun's glow and the points
   the galaxy and the nebulae are made of are rasterised into the same
   samples. Each cell then takes the glyph whose shape best
   matches its six samples (an edge) or a glyph from a density ramp (a
   smooth area), tinted from a hue / saturation palette. The grid is drawn
   on the GPU with WebGL where the browser has it, and on a 2D canvas where
   it does not.

   Whatever does not change while a body spins (geometry, lighting, shadows)
   is cached per view, so a still camera costs one texture lookup per sample.
   While the camera moves, a large body is sampled at three of the six
   points and the picture is drawn in full once the camera stops.
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
  function wrapAngle(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { var l = Math.sqrt(dot(a, a)) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  var Sf = window.Surfaces, Eph = window.Ephemeris;
  var AU_KM = Eph.AU_KM, LIGHT_AU_DAY = 299792.458 * 86400 / AU_KM;
  var SUN_R = Sf.BODIES.sun.r / AU_KM;
  var GAL = Eph.GALAXY, KPC = GAL.KPC_AU, LY = 63241.077, GC_DIST = Math.sqrt(dot(GAL.centre, GAL.centre));

  /* ------------------------------------------------------------------------
     Bodies
     ------------------------------------------------------------------------ */
  var MAJOR = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  var KEYS = Object.keys(Sf.BODIES);
  // While the clock shows the present, some bodies spin in time-lapse. The
  // stars and the giants spin tune.lapse times faster than real, because
  // their spots and cloud features are not tied to real longitudes.
  // Mercury, Venus, Mars, the Moon and Pluto turn too slowly to be seen
  // turning, so each of them turns once in TURN seconds. The Earth and every other body turn at their real
  // rate, and so does every body at any other moment.
  var LAPSE = { jupiter: 1, saturn: 1, uranus: 1, neptune: 1 };
  var TURN = { mercury: 300, venus: 300, mars: 300, moon: 300, pluto: 300 };
  // how many times faster than real a body turns while the clock is live
  function lapse(k) {
    return LAPSE[k] || Sf.BODIES[k].kind === 'star' ? tune.lapse : TURN[k] ? 86400 * 360 / Math.abs(Eph.rotationRate(k)) / TURN[k] : 1;
  }
  // smallest drawn radius, in character heights, so distant bodies stay visible
  var MIN_R = { sun: 1.0, mercury: 0.34, venus: 0.42, earth: 0.44, moon: 0.28, mars: 0.38, jupiter: 0.62, saturn: 0.58, uranus: 0.5, neptune: 0.5,
                proxima: 0.5, alphacena: 0.75, alphacenb: 0.6, proximab: 0.3, proximad: 0.26,
                siriusa: 0.75, siriusb: 0.3, vega: 0.7, arcturus: 0.75, polaris: 0.7, betelgeuse: 0.9, rigel: 0.85,
                alcyone: 0.42, atlas: 0.37, electra: 0.36, maia: 0.35, merope: 0.33, taygeta: 0.32, pleione: 0.28, celaeno: 0.26, asterope: 0.25,
                pleiades: 0.6, helix: 0.5, orionnebula: 0.6, ringnebula: 0.45, eagle: 0.55, crab: 0.5, carina: 0.65, sgra: 0.5, s2: 0.3 };
  function minR(S) {
    switch (S.cls) {
      case 'moon': return S.r > 1300 ? 0.26 : S.r > 400 ? 0.2 : 0.15;
      case 'dwarf': return 0.3;
      case 'craft': return 0.22;
      default: return 0.25;
    }
  }
  // what can cast a shadow on what: a planet's moons on it, the planet on its moons
  var SHADOWS = {};

  var bodies = [], byKey = {};
  KEYS.forEach(function (k, i) {
    var S = Sf.BODIES[k];
    var b = {
      key: k, i: i, S: S, R: S.r / AU_KM, f: S.f, ring: Sf.ring(k), tex: null, minR: MIN_R[k] != null ? MIN_R[k] : minR(S),
      parent: S.parent || null, model: S.model || null, reach: S.model ? S.model.reach / 1000 / AU_KM : 0,
      pos: [0, 0, 0], N: [0, 0, 1], Q: [1, 0, 0], E: [0, 1, 0], W: 0, dist: 1,
      sx: 0, sy: 0, depth: 0, shrink: 1, rp: 0, rd: 0, ext: 0, vis: false, alpha: 1, lvl: 0, dyn: false, W0: 0, rot: 0
    };
    if (b.ring) {
      var n = b.ring.n;
      var m = Math.max(b.ring.cR[n], b.ring.cG[n], b.ring.cB[n]) || 1;
      b.ring.meanCol = [b.ring.cR[n] / m, b.ring.cG[n] / m, b.ring.cB[n] / m];
    }
    bodies.push(b); byKey[k] = b;
  });
  var SUN = byKey.sun;
  // the direction from a body to the star that lights it: the Sun, or for
  // Proxima's planets, Proxima
  function lightDir(b) {
    var st = b.S.star ? byKey[b.S.star] : SUN;
    return norm([st.pos[0] - b.pos[0], st.pos[1] - b.pos[1], st.pos[2] - b.pos[2]]);
  }
  // eclipses are worked out for sunlight, so not for planets round another
  // star, nor for a star round a black hole
  bodies.forEach(function (b) {
    if (!b.parent || b.S.star || b.S.kind === 'star') return;
    (SHADOWS[b.parent] = SHADOWS[b.parent] || []).push(b.key);
    (SHADOWS[b.key] = SHADOWS[b.key] || []).push(b.parent);
  });

  // what the controls over the map cover at the top, bottom and right of the
  // screen, in CSS pixels. A body in focus is framed in the rest.
  var inset = { top: 0, bottom: 0, right: 0 };
  function freeShare() { return H ? clamp(1 - (inset.top + inset.bottom) * dpr / H, 0.35, 1) : 1; }
  function freeCentre() { return H ? clamp((inset.top * dpr + freeShare() * H / 2) / H, 0.2, 0.8) : 0.5; }
  function freeWidth() { return W ? clamp(1 - inset.right * dpr / W, 0.4, 1) : 1; }
  function freeCentreX() { return freeWidth() / 2; }
  // the HUD's rows at the top that the controls cover, and the first row
  // below them that the name of the body in focus may take, a row clear
  function barRows() { return Math.ceil(inset.top * dpr / hudGrid.ch); }
  function nameRow() { return barRows() + 1; }

  // span (AU per screen height) that frames a body nicely
  function spanClose(b) {
    if (!b) return 1;
    var fit = 1 / freeShare(), freeAspect = aspect * freeWidth();
    // The corner brackets round the body, its name above them and a row's
    // gap above that fit under the controls: the brackets stand 1.06 times
    // its radius out, or 1.5 times that round a black hole's disc.
    var room = H ? Math.max(freeShare() / 2 - 2.5 * hudGrid.ch / H, 0.15) : 0.5;
    var named = 1.06 * (b.S.kind === 'hole' ? 1.5 : 1) / room;
    // a spacecraft is framed whole, its long booms and wire antennas reaching out of the picture
    if (b.model) return b.R * Math.max(2.4 * fit, named, 2 / Math.max(freeAspect, 0.3) * 1.1);
    var need = (b.ring && b.key === 'saturn' ? b.ring.outer * 2.3 : b.S.kind === 'nebula' ? 3 : b.S.kind === 'hole' ? 4.6 : 3.2) * fit;
    var wide = b.ring && b.key === 'saturn' ? b.ring.outer * 2.3 / Math.max(freeAspect, 0.3) : 0;
    return b.R * Math.max(need, named, wide, 2 / Math.max(freeAspect, 0.3) * 1.25);
  }

  /* ------------------------------------------------------------------------
     Glyphs: an atlas of every glyph in every palette colour, built lazily,
     plus the shape vectors used to match edges
     ------------------------------------------------------------------------ */
  var GLYPHS = " .'`^\",:;-_~=+*!|/\\()[]{}<>?ilrtcvxzsoaenuJCLYXZOQ0UV%#&8$@BMW";
  var NG = GLYPHS.length;
  var SHAPE_SET = " .'`^\",:;-_~=+*/\\|()<>";
  var RAMP_SET = " .:-=+*#%@";
  var shapeIdx = [], rampLUT = new Uint8Array(256);
  var SHAPE = null;
  var LUT = new Int16Array(1 << 18);
  var Q7 = 7;

  // palette rows: 0 white, then hue x saturation, then two HUD colours
  var HUE_N = 36, SAT_LV = [0.07, 0.15, 0.25, 0.37, 0.51, 0.67, 0.85], SAT_N = SAT_LV.length;
  var ROW_ACCENT = 253, ROW_DIM = 254;
  var pages = [], rowReady = new Uint8Array(256);
  var accentRGB = [240, 161, 74], dimRGB = [150, 150, 156];
  // each body's own colour, for its name and orbit while it is under the pointer
  var colours = {};
  function colourOf(b) { return colours[b.key] || accentRGB; }
  var ROW_STAR_B = 0, ROW_STAR_W = 0;

  function hexToRgb(h) {
    h = h.trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbStr(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }

  function rowRGB(row) {
    if (row === ROW_ACCENT) return accentRGB;
    if (row === ROW_DIM) return dimRGB;
    if (row <= 0 || row > HUE_N * SAT_N) return [255, 255, 255];
    var h = (((row - 1) / SAT_N) | 0) / HUE_N * 6, s = SAT_LV[(row - 1) % SAT_N];
    var i = Math.floor(h), f = h - i, p = 1 - s, q = 1 - s * f, t = 1 - s * (1 - f), c;
    switch (i % 6) {
      case 0: c = [1, t, p]; break; case 1: c = [q, 1, p]; break; case 2: c = [p, 1, t]; break;
      case 3: c = [p, q, 1]; break; case 4: c = [t, p, 1]; break; default: c = [1, p, q];
    }
    return [c[0] * 255, c[1] * 255, c[2] * 255];
  }
  // the palette row for a colour, remembered by its proportions to 1 part in 64
  var rowCache = new Uint8Array(1 << 18).fill(255);
  function rowFor(r, g, b) {
    var mx = r > g ? (r > b ? r : b) : (g > b ? g : b);
    if (mx <= 1e-9) return 0;
    var kq = 63.99 / mx, key = (((r * kq) | 0) << 12) | (((g * kq) | 0) << 6) | ((b * kq) | 0), v = rowCache[key];
    if (v === 255) v = rowCache[key] = rowOf(r, g, b, mx);
    return v;
  }
  function rowOf(r, g, b, mx) {
    var mn = r < g ? (r < b ? r : b) : (g < b ? g : b);
    var s = (mx - mn) / mx * tune.saturation;
    if (s < 0.035) return 0;
    var d = mx - mn, h;
    if (mx === r) h = ((g - b) / d) / 6;
    else if (mx === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    if (h < 0) h += 1;
    var hi = Math.round(h * HUE_N) % HUE_N, si = 0;
    while (si < SAT_N - 1 && s > (SAT_LV[si] + SAT_LV[si + 1]) * 0.5) si++;
    return 1 + hi * SAT_N + si;
  }

  /* ------------------------------------------------------------------------
     Renderer state
     ------------------------------------------------------------------------ */
  var canvas, ctx = null, mctx = null, hudCanvas, hctx, dpr = 1;
  var cw = 0, ch = 0, cols = 0, rows = 0, fontPx = 10, fontOverride = 0;
  var fontFamily = 'monospace', fontWeight = '400';
  var W = 0, H = 0, aspect = 1.6;
  var HUD_BG = '#050608';

  var tune = {
    gamma: 1.0, filmic: 2.2, rampGamma: 2.0, alphaGain: 1.0, alphaPow: 0.6,
    edge: 0.25, edgeRel: 0.55, contrast: 2.0, mipBias: 0, saturation: 0.92,
    orbit: 0.20, orbitFocus: 0.34, belt: 0.22, lapse: 160, galaxy: 2.5, galaxyPoints: 0.0055, nebula: 0.2, nebulaMax: 0.9, nebulaStars: 1.4, comet: 0.002
  };

  var TONE_N = 2048, TONE_MAX = 2, toneLUT = new Float32Array(TONE_N + 1);
  function buildTone() {
    var k = tune.filmic, nrm = k > 0 ? 1 - Math.exp(-k) : 1;
    for (var i = 0; i <= TONE_N; i++) {
      var x = i / TONE_N * TONE_MAX;
      var y = k > 0 ? (1 - Math.exp(-k * x)) / nrm : x;
      toneLUT[i] = Math.pow(Math.min(y, 1.2), tune.gamma);
    }
  }
  function tone(x) { return x <= 0 ? 0 : toneLUT[x >= TONE_MAX ? TONE_N : (x * (TONE_N / TONE_MAX)) | 0]; }

  var running = true, reduced = false;
  var t = 0;                                  // seconds since start (twinkle)
  // At warp 1 the simulated clock is the wall clock plus simOffset, so it
  // keeps up through hidden tabs and slow frames. At any other warp it
  // steps by each frame's time.
  // lapseSec counts the seconds of time-lapse spin, which stops while the
  // clock is stopped or setRunning(false) holds it.
  var simTime = Date.now(), simOffset = 0, warp = 1, lapseSec = 0;
  // the clock shows now, not just runs at the real rate
  function liveClock() { return warp === 1 && Math.abs(simOffset) < 1000; }
  var lastFrame = 0, lastNow = 0, frameInterval = 1000 / 30, minInterval = 1000 / 30;
  var stats = { fps: 0, cells: 0, ms: 0, phase: 0, ready: 0, rebuilds: 0 };
  var fpsAcc = 0, fpsT = 0, msAvg = 8;

  /* ------------------------------------------------------------------------
     World: positions and orientations at the simulated time
     ------------------------------------------------------------------------ */
  var simDate = new Date();
  function updateWorld() {
    simDate = new Date(simTime);
    var sys = Eph.system(simDate);
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i], s = sys.bodies[b.key], F = s.frame;
      b.pos = s.pos; b.dist = s.dist; b.off = !!s.off; b.vel = s.vel || null;
      if (b.model) { craftFrame(b, sys.bodies.earth.pos); continue; }
      b.N = F.N;
      var extra = liveClock() ? lapseSec / 86400 * (lapse(b.key) - 1) * Eph.rotationRate(b.key) : 0;
      var x = extra * DEG, c = Math.cos(x), sn = Math.sin(x);
      b.Q = [F.Q[0] * c + F.E[0] * sn, F.Q[1] * c + F.E[1] * sn, F.Q[2] * c + F.E[2] * sn];
      b.E = cross(b.N, b.Q);
      b.W = F.W + extra; b.Wtrue = F.W;
    }
  }

  // a spacecraft's z axis points its dish at the Earth, or its shield to or
  // from the Sun, and its x axis lies along the ecliptic
  function craftFrame(b, earth) {
    var p = b.pos, pt = b.model.point;
    b.N = norm(pt === 'earth' ? [earth[0] - p[0], earth[1] - p[1], earth[2] - p[2]] : pt === 'sun' ? [-p[0], -p[1], -p[2]] : p);
    b.Q = norm(cross([0, 0, 1], b.N));
    b.E = cross(b.N, b.Q);
    b.W = 0;
  }

  /* ------------------------------------------------------------------------
     Camera director
     ------------------------------------------------------------------------ */
  var cam = {
    focus: 'saturn',
    z: 0, zGoal: 0,
    psi: 0, psiGoal: 0,            // heading: the direction the camera looks, across the ecliptic
    th: 10 * DEG, thGoal: 10 * DEG, // pitch above the ecliptic when close to a body
    top: 90 * DEG, topGoal: 90 * DEG, // pitch when the whole system is in view
    roll: 0, rollGoal: 0,          // turn about the line of sight
    gpsi: 0, gpsiGoal: 0,          // heading over the galaxy: 0 puts its centre up the screen
    gtop: 90 * DEG, gtopGoal: 90 * DEG, // pitch over the galaxy's plane
    groll: 0, grollGoal: 0,        // turn about the line of sight over the galaxy
    ax: 0.5, ay: 0.5, axGoal: 0.5, ayGoal: 0.5,
    o: 0, ov: 0, oGoal: 0,         // the tip from a low angle (0) to straight down (1), and its speed
    offT: [0, 0, 0], offTh: 0, offG: 0, glide: 0.4,
    fly: null
  };
  var view = { T: [0, 0, 0], R: [1, 0, 0], U: [0, 1, 0], B: [0, 0, 1], span: 1, k: 1, ax: 0.5, ay: 0.5, o: 0, w: 0, pitch: 0 };

  // the target slides from the body to the Sun as the view widens, in a way
  // that never lets the body drift more than 0.3 screen heights off centre,
  // and further out from the Sun to the galactic centre in the same way. A
  // black hole at the centre stays the target, and a star or ship going
  // round it slides to it as a planet does to the Sun, so zoomed out it goes
  // round the hole rather than the hole round it.
  function atCentre(F) { return F.S.kind === 'hole' || (!!F.parent && byKey[F.parent].S.kind === 'hole'); }
  function idealTarget(F, z, out) {
    var P = F.pos, C0 = F.parent && byKey[F.parent].S.kind === 'hole' ? byKey[F.parent].pos : null;
    var d = C0 ? Math.sqrt(Math.pow(P[0] - C0[0], 2) + Math.pow(P[1] - C0[1], 2) + Math.pow(P[2] - C0[2], 2)) : F.dist;
    var w = F === SUN ? 1 : F.S.kind === 'hole' ? 0 : smoothstep(0, 1, Math.min(1, 0.3 * Math.exp(z) / d));
    C0 = C0 || [0, 0, 0];
    out[0] = P[0] + (C0[0] - P[0]) * w; out[1] = P[1] + (C0[1] - P[1]) * w; out[2] = P[2] + (C0[2] - P[2]) * w;
    var g = smoothstep(0, 1, Math.min(1, 0.3 * Math.exp(z) / GC_DIST)), C = GAL.centre;
    if (g > 1e-9) { out[0] += (C[0] - out[0]) * g; out[1] += (C[1] - out[1]) * g; out[2] += (C[2] - out[2]) * g; }
    return w;
  }

  // Past the planets the camera turns from the plane of their orbits to the
  // plane of the galaxy, 60 degrees away, while there is nothing close
  // enough to see turn with it. Then the galaxy fades in, the background
  // stars fade out, and the Sun gives way to a mark on the map.
  var LN_TURN = [Math.log(3000), Math.log(60000)];
  function galTurn(z) { return smoothstep(LN_TURN[0], LN_TURN[1], z); }
  function galShown(z) { return smoothstep(Math.log(3500 * LY), Math.log(25000 * LY), z); }
  // what is left of the solar system's own drawing: orbits, belts and bodies other than the Sun
  function sysShown(z) { return 1 - smoothstep(Math.log(1500), Math.log(6000), z); }
  function starsShown(z) { return 1 - smoothstep(Math.log(2000 * LY), Math.log(14000 * LY), z); }
  // the span that frames the whole disc in the free part of the screen
  function galaxySpan() { return 40 * KPC * Math.max(1 / freeShare(), 1 / Math.max(aspect * freeWidth(), 0.3)); }

  // the camera over the galaxy, from its own heading and pitch, in ecliptic coordinates
  function galBasis() {
    var b = basis(cam.gpsi, cam.gtop, cam.groll), X = GAL.x, Y = GAL.y, Z = GAL.z;
    function ecl(v) { return [v[0] * X[0] + v[1] * Y[0] + v[2] * Z[0], v[0] * X[1] + v[1] * Y[1] + v[2] * Z[1], v[0] * X[2] + v[1] * Y[2] + v[2] * Z[2]]; }
    return { R: ecl(b.R), U: ecl(b.U), B: ecl(b.B) };
  }
  // v turned about the unit axis k by angle a
  function turnAbout(v, k, a) {
    var c = Math.cos(a), s = Math.sin(a), kv = cross(k, v), d = dot(k, v) * (1 - c);
    return [v[0] * c + kv[0] * s + k[0] * d, v[1] * c + kv[1] * s + k[1] * d, v[2] * c + kv[2] * s + k[2] * d];
  }
  // v turned by t of the least turn that takes the unit vector a to b
  function turnToward(v, a, b, t) {
    var k = cross(a, b), s = Math.sqrt(dot(k, k));
    if (s < 1e-12) return v;
    return turnAbout(v, [k[0] / s, k[1] / s, k[2] / s], t * Math.atan2(s, dot(a, b)));
  }
  // The turn to the galaxy's plane, by t from the frame A to the frame G.
  // The line of sight swings the short way from one frame's to the other's,
  // and the picture turns about it by t of the angle between their up
  // directions. When the frames are about half a turn apart, that angle
  // could flip between +180 and -180 degrees from one frame to the next and
  // the view would jump. So while the turn is under way, it is kept within
  // half a turn of the angle in the frame before.
  var turnRoll = null;
  function turnFrame(A, G, t) {
    var B = turnToward(A.B, A.B, G.B, t), Ua = turnToward(A.U, A.B, G.B, t), Ug = turnToward(G.U, G.B, A.B, 1 - t);
    var roll = Math.atan2(dot(cross(Ua, Ug), B), dot(Ua, Ug));
    if (turnRoll != null) roll += TAU * Math.round((turnRoll - roll) / TAU);
    turnRoll = roll;
    var U = turnAbout(Ua, B, t * roll);
    return { R: cross(U, B), U: U, B: B };
  }
  // how far the view has tipped from a low angle to straight down, 0 to 1
  function pitchBlend(F, z) {
    var sc = spanClose(F);
    return smoothstep(Math.log(sc * 1.03), Math.log(sc * 4.5), z);
  }
  // how far the camera has turned from the plane of the planets to the plane of the galaxy, 0 to 1
  function turnBlend(z) { return smoothstep(0, 1, galTurn(z)); }
  // o, when given, is the pitch blend to use in place of the one the zoom gives
  function idealPitch(F, z, o) {
    if (o == null) o = pitchBlend(F, z);
    view.o = o;
    return cam.th + (cam.top - cam.th) * o;
  }

  function computeView() {
    var F = byKey[cam.focus], span = Math.exp(cam.z), T = [0, 0, 0];
    view.w = idealTarget(F, cam.z, T);
    var fl = cam.fly;
    if (fl) {
      // In flight the target runs straight from where it was to where it
      // ends. It is measured from the nearer end, because a flight that
      // starts kiloparsecs away would otherwise miss a spacecraft by kilometres.
      idealTarget(F, fl.z1, T);
      var f = fl.f, r = fl.rest, c0 = fl.c0;
      T = f <= 0.5 ? [c0[0] + (T[0] - c0[0]) * f, c0[1] + (T[1] - c0[1]) * f, c0[2] + (T[2] - c0[2]) * f]
                   : [T[0] + (c0[0] - T[0]) * r, T[1] + (c0[1] - T[1]) * r, T[2] + (c0[2] - T[2]) * r];
    }
    view.T = [T[0] + cam.offT[0] * span, T[1] + cam.offT[1] * span, T[2] + cam.offT[2] * span];
    var th = idealPitch(F, cam.z, fl ? along(fl.o, fl.p) : cam.o) + (fl ? fl.offTh : cam.offTh);
    th = clamp(th, -89.5 * DEG, 89.9 * DEG);
    view.pitch = th;
    var psi = cam.psi, ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(psi), sp = Math.sin(psi);
    var R = [sp, -cp, 0], U = [st * cp, st * sp, ct], cr = Math.cos(cam.roll), srl = Math.sin(cam.roll);
    view.R = [R[0] * cr + U[0] * srl, R[1] * cr + U[1] * srl, R[2] * cr + U[2] * srl];
    view.U = [U[0] * cr - R[0] * srl, U[1] * cr - R[1] * srl, U[2] * cr - R[2] * srl];
    view.B = [-ct * cp, -ct * sp, st];
    var g = fl ? along(fl.g, fl.p) : clamp(turnBlend(cam.z) + cam.offG, 0, 1);
    view.turn = g;
    if (g > 0) {
      var G = galBasis();
      if (g < 1) G = turnFrame(view, G, g);
      view.R = G.R; view.U = G.U; view.B = G.B;
    }
    if (g <= 0 || g >= 1) turnRoll = null;
    view.span = span;
    view.k = H / span;
    view.ax = cam.ax; view.ay = cam.ay;
  }

  // switch focus without a jump: the difference glides away
  function setFocus(key, glide) {
    if (key === cam.focus || !byKey[key]) return;
    var prev = cam.focus, prevT = cam.offT, prevTh = cam.offTh;
    computeView();
    var T0 = view.T, th0 = view.pitch, span = view.span;
    cam.focus = key;
    cam.offT = [0, 0, 0]; cam.offTh = 0;
    computeView();
    cam.offT = [(T0[0] - view.T[0]) / span, (T0[1] - view.T[1]) / span, (T0[2] - view.T[2]) / span];
    cam.offTh = th0 - view.pitch;
    cam.glide = glide || 0.45;
    // more than a couple of screens away: fly instead of gliding
    if (Math.sqrt(dot(cam.offT, cam.offT)) > 2.5) {
      cam.offT = prevT; cam.offTh = prevTh;
      cam.focus = prev;
      flyTo(key, { z1: cam.zGoal, keep: true });
      return;
    }
    if (onFocus) onFocus(key);
  }

  // a pleasant way to look at a body: lit from behind the left shoulder,
  // and for ringed planets from the side of the rings the Sun lights. A
  // black hole is seen as it is from the Earth, with north up, as in the
  // Event Horizon Telescope's picture.
  function niceHeading(b) {
    if (b.S.kind === 'hole') return eclFrom(earthView(b)).psi;
    if (b.S.kind === 'star' || b.S.kind === 'nebula') return cam.psiGoal;
    if (b.model) return craftView(b).psi;
    var L = lightDir(b), phiS = Math.atan2(L[1], L[0]);
    return phiS - 135 * DEG;
  }
  function nicePitch(b, psi) {
    if (b.S.kind === 'hole') return eclFrom(earthView(b)).th;
    if (b.model) return craftView(b).th;
    if (!b.ring || b.key === 'jupiter') return 20 * DEG;
    var L = lightDir(b), side = dot(L, b.N) >= 0 ? 1 : -1;
    var best = 20 * DEG, bc = 1e9, f = [Math.cos(psi), Math.sin(psi), 0];
    for (var d = -60; d <= 60; d++) {
      var th = d * DEG, D = [-Math.cos(th) * f[0], -Math.cos(th) * f[1], Math.sin(th)];
      var el = Math.asin(clamp(dot(D, b.N), -1, 1)) / DEG;
      var c = Math.pow(el - side * 18, 2) + 0.15 * Math.pow(d - 15, 2);
      if (c < bc) { bc = c; best = th; }
    }
    return best;
  }

  // ringed planets seen from below their rings are turned south-up, so the
  // near side of the rings passes in front of the lower half of the globe
  function niceRoll(b, psi, th) {
    if (b.S.kind === 'hole') return eclFrom(earthView(b)).roll;
    if (b.model) return craftView(b).roll;
    if (!b.ring || b.key === 'jupiter') return 0;
    var D = [-Math.cos(th) * Math.cos(psi), -Math.cos(th) * Math.sin(psi), Math.sin(th)];
    return dot(D, b.N) < 0 ? Math.PI : 0;
  }

  // a spacecraft is seen from the side its model names, the way it points
  // straight up the screen
  function craftView(b) {
    var v = b.model.view, Q = b.Q, E = b.E;
    var D = norm([0, 1, 2].map(function (i) { return v[0] * Q[i] + v[1] * E[i] + v[2] * b.N[i]; }));
    var th = clamp(Math.asin(clamp(D[2], -1, 1)), -60 * DEG, 70 * DEG), psi = Math.atan2(-D[1], -D[0]);
    var R = [Math.sin(psi), -Math.cos(psi), 0], U = [Math.sin(th) * Math.cos(psi), Math.sin(th) * Math.sin(psi), Math.cos(th)];
    return { psi: psi, th: th, roll: -Math.atan2(dot(b.N, R), dot(b.N, U)) };
  }

  // A flight looks almost straight down in the middle, and from there the
  // heading and the roll turn the picture the same way, by their sum. Each
  // can go either way round. Of the four pairs, this takes the one with the
  // least turn overhead plus half the turn of each on its own. Jupiter to
  // Saturn, which ends south-up, then turns the picture 60 degrees overhead
  // instead of 300.
  function leastSpin(dpsi, droll) {
    var best = [dpsi, droll], least = Infinity;
    for (var i = 0; i < 2; i++) for (var j = 0; j < 2; j++) {
      var a = dpsi - i * TAU * Math.sign(dpsi), b = droll - j * TAU * Math.sign(droll);
      var c = Math.abs(a + b) + 0.5 * (Math.abs(a) + Math.abs(b));
      if (c < least - 1e-9) { least = c; best = [a, b]; }
    }
    return best;
  }

  // A flight follows van Wijk and Nuij's path for panning and zooming at
  // once ("Smooth and efficient zooming and panning", 2003): it widens the
  // view just enough to keep both ends in sight and moves at an even
  // apparent speed, with no stop at the top. The heading, pitch and roll
  // ease to their new values over the same flight.
  // opts.z1: where the zoom ends; opts.keep: leave the heading alone;
  // opts.psi / th / roll: end exactly there
  var RHO = 1.42;
  function flyTo(key, opts) {
    var F = byKey[key];
    if (!F) return;
    opts = opts || {};
    computeView();                                   // the camera as it is now, in flight or not
    var c0 = view.T.slice(), w0 = view.span, th0 = view.pitch, g0 = view.turn;
    var psi0 = cam.psi, thc0 = cam.th, roll0 = cam.roll, top0 = cam.top;
    cam.fly = null; cam.offT = [0, 0, 0]; cam.offTh = 0; cam.offG = 0;
    cam.focus = key;
    var z1 = opts.z1 != null ? opts.z1 : Math.log(spanClose(F)), w1 = Math.exp(z1);
    var c1 = [0, 0, 0];
    idealTarget(F, z1, c1);
    var dx = c1[0] - c0[0], dy = c1[1] - c0[1], dz = c1[2] - c0[2], u1 = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var psi1 = psi0, thc1 = thc0, roll1 = roll0;
    if (opts.psi != null) {
      psi1 = psi0 + wrapAngle(opts.psi - psi0); thc1 = opts.th; roll1 = roll0 + wrapAngle(opts.roll - roll0);
    } else if (!opts.keep) {
      psi1 = psi0 + wrapAngle(niceHeading(F) - psi0);
      thc1 = nicePitch(F, psi1);
      roll1 = roll0 + wrapAngle(niceRoll(F, psi1, thc1) - roll0);
    }
    var spin = leastSpin(psi1 - psi0, roll1 - roll0);
    psi1 = psi0 + spin[0]; roll1 = roll0 + spin[1];
    var fl = { p: 0, w0: w0, z1: z1, c0: c0, u1: u1, f: 0, offTh: 0,
               psi0: psi0, psi1: psi1, thc0: thc0, thc1: thc1, roll0: roll0, roll1: roll1, top0: top0 };
    if (u1 < w0 * 1e-6) {
      fl.zoomOnly = true; fl.k = w1 >= w0 ? 1 : -1;
      fl.S = Math.abs(Math.log(w1 / w0)) / RHO;
    } else {
      var r2 = RHO * RHO, r4 = r2 * r2;
      var b0 = (w1 * w1 - w0 * w0 + r4 * u1 * u1) / (2 * w0 * r2 * u1);
      var b1 = (w1 * w1 - w0 * w0 - r4 * u1 * u1) / (2 * w1 * r2 * u1);
      fl.r0 = -Math.asinh(b0);
      fl.S = (-Math.asinh(b1) - fl.r0) / RHO;
    }
    flightAt(fl, 0, fl);
    // past 3.6 seconds a flight grows half as fast with its length, so the
    // longest, from a spacecraft out to the whole galaxy, take about 5 seconds
    var dur = 0.75 + 0.16 * fl.S;
    fl.dur = reduced ? 0.01 : clamp(dur > 3.6 ? 3.6 + (dur - 3.6) / 2 : dur, 0.9, 5);
    // A nebula is seen as it is from the Earth, with north up. Anything
    // else leaves the view over the galaxy level again.
    if (F.S.kind === 'nebula') {
      var g = galFrom(earthView(F));
      cam.gpsiGoal = cam.gpsi + wrapAngle(g.psi - cam.gpsi); cam.gtopGoal = g.th; cam.grollGoal = cam.groll + wrapAngle(g.roll - cam.groll);
      queueNebula(F.key);
    } else if (!opts.keep) levelGalaxy();
    // whatever pitch the old focus had eases out over the first part
    fl.offTh0 = th0 - idealPitch(F, Math.log(w0));
    fl.offTh = fl.offTh0;
    flightBlends(fl, F, g0);
    cam.fly = fl;
    cam.zGoal = z1; cam.topGoal = 90 * DEG;
    if (onFocus) onFocus(key);
  }

  // Where a flight is at progress p: its span w, the share of the way its
  // target has come (f) and the share it has left (rest). f and rest are
  // each worked out on their own, so neither loses precision near its end.
  function flightAt(fl, p, out) {
    var c = Math.cos(Math.PI * p), s = fl.S * (0.5 - 0.5 * c), left = fl.S * (0.5 + 0.5 * c);
    if (fl.zoomOnly) { out.w = fl.w0 * Math.exp(fl.k * RHO * s); out.f = 1; out.rest = 0; return out; }
    var chx = Math.cosh(RHO * s + fl.r0), d = Math.sinh(RHO * fl.S) * chx;
    out.w = fl.w0 * Math.cosh(fl.r0) / chx;
    out.f = Math.sinh(RHO * s) * Math.cosh(fl.r0 + RHO * fl.S) / d;
    out.rest = Math.sinh(RHO * left) * Math.cosh(fl.r0) / d;
    return out;
  }

  // The view tips to look straight down, and further out turns to the plane
  // of the galaxy, at set zooms. A long flight passes those zooms in a tenth
  // of a second, so in flight both follow the clock instead. Each is worked
  // out along the flight, then spread over about half a second either side,
  // and keeps its values at both ends. A flight turns towards the galaxy
  // only as far as the galaxy comes into view on the way.
  var BLEND_N = 240, BLEND_SPREAD = 0.55;
  function flightBlends(fl, F, g0) {
    var n = BLEND_N, z = new Float64Array(n + 1), o = new Float32Array(n + 1), g = new Float32Array(n + 1), at = {}, top = -Infinity, i;
    for (i = 0; i <= n; i++) { z[i] = Math.log(flightAt(fl, i / n, at).w); top = Math.max(top, z[i]); }
    var ends = Math.max(g0, turnBlend(fl.z1)), most = ends + Math.max(0, turnBlend(top) - ends) * smoothstep(0, 0.3, galShown(top));
    for (i = 0; i <= n; i++) { o[i] = pitchBlend(F, z[i]); g[i] = Math.min(turnBlend(z[i]), most); }
    g[0] = g0; g[n] = turnBlend(fl.z1);
    var spread = reduced ? 0 : BLEND_SPREAD / fl.dur;
    fl.o = spreadOut(o, spread);
    fl.g = spreadOut(g, spread);
  }
  // A Gaussian blur of a flight's samples with a deviation of `spread` of
  // the flight. The samples are mirrored past each end, so the blurred
  // curve is level at both ends and the view starts and stops turning
  // gently. Near each end the curve is then eased back to that end's value.
  function spreadOut(a, spread) {
    var n = a.length - 1, h = spread * n;
    if (h < 0.5) return a;
    var r = Math.min(n, Math.ceil(h * 3)), wt = new Float32Array(2 * r + 1), sum = 0, out = new Float32Array(n + 1), i, j;
    for (j = -r; j <= r; j++) sum += wt[j + r] = Math.exp(-0.5 * j * j / (h * h));
    for (i = 0; i <= n; i++) {
      var acc = 0;
      for (j = -r; j <= r; j++) { var k = Math.abs(i + j); acc += wt[j + r] * a[k > n ? 2 * n - k : k]; }
      out[i] = acc / sum;
    }
    var d0 = a[0] - out[0], d1 = a[n] - out[n], m = Math.min(r, n / 2);
    for (i = 0; i <= n; i++) out[i] = clamp(out[i] + d0 * (1 - smoothstep(0, m, i)) + d1 * smoothstep(n - m, n, i), 0, 1);
    return out;
  }
  // a flight's samples read at progress p
  function along(a, p) {
    var x = clamp(p, 0, 1) * (a.length - 1), i = Math.min(a.length - 2, Math.floor(x));
    return a[i] + (a[i + 1] - a[i]) * (x - i);
  }

  function stepFly(dt) {
    var fl = cam.fly;
    fl.p = Math.min(1, fl.p + dt / fl.dur);
    cam.z = Math.log(flightAt(fl, fl.p, fl).w);
    var o = smoothstep(0.05, 0.85, fl.p);
    cam.psi = fl.psi0 + (fl.psi1 - fl.psi0) * o;
    cam.th = fl.thc0 + (fl.thc1 - fl.thc0) * o;
    cam.roll = fl.roll0 + (fl.roll1 - fl.roll0) * o;
    cam.top = fl.top0 + (90 * DEG - fl.top0) * o;
    fl.offTh = fl.offTh0 * (1 - smoothstep(0, 0.6, fl.p));
    if (fl.p >= 1) {
      cam.fly = null;
      cam.z = cam.zGoal = fl.z1;
      cam.psi = cam.psiGoal = fl.psi1; cam.th = cam.thGoal = fl.thc1; cam.roll = cam.rollGoal = fl.roll1;
      cam.top = cam.topGoal = 90 * DEG;
    }
  }

  // the heading, pitch and roll over the galaxy that give a camera frame
  function galFrom(V) {
    var X = GAL.x, Y = GAL.y, Z = GAL.z, B = [dot(V.B, X), dot(V.B, Y), dot(V.B, Z)], Ut = [dot(V.U, X), dot(V.U, Y), dot(V.U, Z)];
    var th = Math.asin(clamp(B[2], -1, 1)), psi = Math.atan2(-B[1], -B[0]), b0 = basis(psi, th, 0);
    return { psi: psi, th: th, roll: Math.atan2(-dot(Ut, b0.R), dot(Ut, b0.U)) };
  }
  // the heading, pitch and roll close to a body that give a camera frame
  function eclFrom(V) {
    var th = Math.asin(clamp(V.B[2], -1, 1)), psi = Math.atan2(-V.B[1], -V.B[0]), b0 = basis(psi, th, 0);
    return { psi: psi, th: th, roll: Math.atan2(-dot(V.U, b0.R), dot(V.U, b0.U)) };
  }
  // over the galaxy the camera looks down on it from 25 degrees or more, level
  function levelGalaxy() {
    cam.gtopGoal = Math.max(cam.gtopGoal, 25 * DEG);
    cam.grollGoal = cam.groll + wrapAngle(-cam.groll);
  }

  // stop a flight where it is and hand the camera back to the user
  function endFly() {
    if (!cam.fly) return;
    computeView();
    var T0 = view.T, th0 = view.pitch, span = view.span, g0 = view.turn;
    cam.fly = null;
    cam.o = view.o;                                  // the tip carries on from where the flight had it
    cam.zGoal = cam.z; cam.psiGoal = cam.psi; cam.thGoal = cam.th; cam.rollGoal = cam.roll; cam.topGoal = 90 * DEG;
    cam.offT = [0, 0, 0]; cam.offTh = 0; cam.offG = 0;
    computeView();
    cam.offT = [(T0[0] - view.T[0]) / span, (T0[1] - view.T[1]) / span, (T0[2] - view.T[2]) / span];
    cam.offTh = th0 - view.pitch;
    cam.offG = g0 - view.turn;
    cam.glide = 0.35;
  }

  function zLimits(F) {
    var lo = F.R * (F.model ? 0.6 : F.ring && F.key === 'saturn' ? 1.6 : F.S.kind === 'nebula' ? 0.15 : F.S.kind === 'hole' ? 0.9 : 1.25);
    return [Math.log(lo), Math.log(galaxySpan() * 1.3)];
  }

  // a body a few kilometres or metres across is a lone dot over many powers
  // of ten, until the next body comes into view: zoom through them faster.
  // The same goes for the space between the solar system and the galaxy.
  function zoomRate(F) {
    var z = cam.z, empty = 1 + 2.5 * smoothstep(Math.log(600), Math.log(3000), z) * (1 - smoothstep(Math.log(2500 * LY), Math.log(8000 * LY), z));
    if (F.S.r > 100) return empty;
    var near = 1e9;
    for (var i = 0; i < bodies.length; i++) {
      var o = bodies[i];
      if (o !== F) near = Math.min(near, Math.sqrt(Math.pow(o.pos[0] - F.pos[0], 2) + Math.pow(o.pos[1] - F.pos[1], 2) + Math.pow(o.pos[2] - F.pos[2], 2)));
    }
    var zc = Math.log(spanClose(F)), zn = Math.log(near);
    return Math.max(empty, 1 + 3 * smoothstep(zc + 2, zc + 4.5, cam.z) * (1 - smoothstep(zn - 1.5, zn + 0.5, cam.z)));
  }

  // Zooming in on a body from above swings the camera round to the body's
  // lit side on the way down. The swing waits until the body looks half as
  // big again as when the zoom began, and at least a quarter of a second.
  // It then speeds up and slows down over 1.5 to 3 seconds, longer for a
  // bigger turn. The heading and the roll go whichever way round turns the
  // picture least. Dragging, a flight or another body in focus stops it.
  var swing = null, SWING_WAIT = 0.25, SWING_IN = Math.log(1.5);
  function startSwing(B) {
    swing = { key: B.key, z0: cam.z, wait: 0, t: -1, at: 0 };
    if (reduced) stepSwing(0);
  }
  function stepSwing(dt) {
    var S = swing;
    if (!S) return;
    if (cam.fly || cam.focus !== S.key) { swing = null; return; }
    if (S.t < 0) {
      S.wait += dt;
      if (!reduced && (S.wait < SWING_WAIT || S.z0 - cam.z < SWING_IN)) return;
      var B = byKey[S.key], psi1 = niceHeading(B), th1 = nicePitch(B, psi1), roll1 = niceRoll(B, psi1, th1);
      var spin = leastSpin(wrapAngle(psi1 - cam.psiGoal), wrapAngle(roll1 - cam.rollGoal));
      var turn = Math.max(Math.abs(spin[0] + spin[1]), Math.abs(spin[0]), Math.abs(spin[1]));
      S.dpsi = spin[0]; S.droll = spin[1]; S.dth = th1 - cam.thGoal;
      S.dur = 1.5 + 1.5 * Math.min(1, turn / Math.PI);
      S.t = 0;
    }
    S.t += dt;
    var e = reduced ? 1 : smoothstep(0, S.dur, S.t), d = e - S.at;
    S.at = e;
    cam.psiGoal += S.dpsi * d; cam.rollGoal += S.droll * d; cam.thGoal += S.dth * d;
    if (e >= 1) swing = null;
  }
  // a swing that has started, or will on the next frame
  function swingDue() { return !!swing && (swing.t >= 0 || swing.z0 - cam.z >= SWING_IN); }

  // Zooming by hand tips the view from a low angle to straight down, and
  // back, between set zooms. A quick scroll passes them in a fifth of a
  // second, so the tip follows the zoom through a critically damped spring.
  // It starts and stops gently and lags a steady zoom by 0.4 seconds. In
  // flight the tip follows the flight's own, and the spring takes it over
  // at the same speed if the flight is cut short.
  var TIP_RATE = 5;
  function stepTip(dt) {
    var g = cam.oGoal = pitchBlend(byKey[cam.focus], cam.z);
    if (reduced) { cam.o = g; cam.ov = 0; return; }
    var d = cam.o - g, c = cam.ov + TIP_RATE * d, e = Math.exp(-TIP_RATE * dt);
    cam.o = clamp(g + (d + c * dt) * e, 0, 1);
    cam.ov = (cam.ov - TIP_RATE * c * dt) * e;
    if (Math.abs(cam.o - g) < 1e-5 && Math.abs(cam.ov) < 1e-4) { cam.o = g; cam.ov = 0; }
  }

  function stepCamera(dt) {
    var a, fl = cam.fly;
    if (fl) {
      stepFly(dt);
      var o1 = along(fl.o, fl.p);
      cam.ov = fl.oLast != null && dt > 0 ? (o1 - fl.oLast) / dt : 0;
      fl.oLast = cam.o = cam.oGoal = o1;
      if (!cam.fly) cam.ov = 0;
    }
    else {
      stepSwing(dt);
      a = reduced ? 1 : 1 - Math.exp(-dt / 0.13);
      cam.z += (cam.zGoal - cam.z) * a;
      if (Math.abs(cam.zGoal - cam.z) < 1e-5) cam.z = cam.zGoal;
      stepTip(dt);
      a = reduced ? 1 : 1 - Math.exp(-dt / 0.3);
      var dpsi = wrapAngle(cam.psiGoal - cam.psi);
      cam.psi = Math.abs(dpsi) < 1e-6 ? cam.psiGoal : cam.psi + dpsi * a;
      cam.th += (cam.thGoal - cam.th) * a; if (Math.abs(cam.thGoal - cam.th) < 1e-6) cam.th = cam.thGoal;
      cam.top += (cam.topGoal - cam.top) * a; if (Math.abs(cam.topGoal - cam.top) < 1e-6) cam.top = cam.topGoal;
      var drl = wrapAngle(cam.rollGoal - cam.roll);
      cam.roll = Math.abs(drl) < 1e-6 ? cam.rollGoal : cam.roll + drl * a;
    }
    a = reduced ? 1 : 1 - Math.exp(-dt / 0.3);
    var dg = wrapAngle(cam.gpsiGoal - cam.gpsi);
    cam.gpsi = Math.abs(dg) < 1e-6 ? cam.gpsiGoal : cam.gpsi + dg * a;
    cam.gtop += (cam.gtopGoal - cam.gtop) * a; if (Math.abs(cam.gtopGoal - cam.gtop) < 1e-6) cam.gtop = cam.gtopGoal;
    var dgr = wrapAngle(cam.grollGoal - cam.groll);
    cam.groll = Math.abs(dgr) < 1e-6 ? cam.grollGoal : cam.groll + dgr * a;
    // A nebula may be seen from any side, the galaxy only from above. A
    // flight to a nebula keeps the view it ends on all the way.
    var toNebula = cam.fly && byKey[cam.focus].S.kind === 'nebula';
    if (!toNebula && galShown(cam.z) > 0.05 && (cam.gtopGoal < 25 * DEG || Math.abs(wrapAngle(cam.grollGoal)) > 1e-9)) levelGalaxy();
    // looking straight down, a roll is the same as a turn of the heading;
    // hand it over so the next close-up comes in level with the ecliptic
    if (cam.roll === cam.rollGoal && cam.roll !== 0 && view.pitch > 89.85 * DEG && !cam.fly && !swing) {
      cam.psi += cam.roll; cam.psiGoal += cam.roll; cam.roll = cam.rollGoal = 0;
    }
    cam.ax += (cam.axGoal - cam.ax) * a; if (Math.abs(cam.axGoal - cam.ax) < 1e-6) cam.ax = cam.axGoal;
    cam.ay += (cam.ayGoal - cam.ay) * a; if (Math.abs(cam.ayGoal - cam.ay) < 1e-6) cam.ay = cam.ayGoal;
    var g = reduced ? 0 : Math.exp(-dt / cam.glide);
    cam.offT[0] *= g; cam.offT[1] *= g; cam.offT[2] *= g; cam.offTh *= g; cam.offG *= g;
    if (Math.abs(cam.offT[0]) + Math.abs(cam.offT[1]) + Math.abs(cam.offT[2]) < 1e-7) cam.offT = [0, 0, 0];
    if (Math.abs(cam.offTh) < 1e-7) cam.offTh = 0;
    if (Math.abs(cam.offG) < 1e-6) cam.offG = 0;
    computeView();
  }

  /* ------------------------------------------------------------------------
     Per-sample cache
     ------------------------------------------------------------------------ */
  var nS = 0, nC = 0;
  var bR, bG, bB, dK, dU, dV, dF, cOcc, cHas, dynList, nDyn = 0, cloudR = null, cloudG = null, cloudB = null;
  function allocCache() {
    nC = cols * rows; nS = nC * 6;
    bR = new Float32Array(nS); bG = new Float32Array(nS); bB = new Float32Array(nS);
    dK = new Uint8Array(nS); dU = new Float32Array(nS); dV = new Float32Array(nS); dF = new Float32Array(nS);
    cOcc = new Float32Array(nC); cHas = new Uint8Array(nC); dynList = new Int32Array(nC);
  }

  var sr = 0, sg = 0, sb = 0;
  function texSample(T, lvl, u, v) {
    var L = T.levels[lvl], w = L.w, h = L.h, d = L.d;
    var fu = u * w - 0.5, fv = v * h - 0.5;
    var x0 = Math.floor(fu), y0 = Math.floor(fv), tx = fu - x0, ty = fv - y0;
    x0 %= w; if (x0 < 0) x0 += w;
    var x1 = x0 + 1; if (x1 >= w) x1 = 0;
    if (y0 < 0) { y0 = 0; ty = 0; }
    var y1 = y0 + 1; if (y1 > h - 1) { y1 = h - 1; if (y0 > h - 1) y0 = h - 1; }
    var i00 = (y0 * w + x0) * 3, i10 = (y0 * w + x1) * 3, i01 = (y1 * w + x0) * 3, i11 = (y1 * w + x1) * 3;
    var a, c;
    a = d[i00] + (d[i10] - d[i00]) * tx; c = d[i01] + (d[i11] - d[i01]) * tx; sr = (a + (c - a) * ty) * (1 / 255);
    a = d[i00 + 1] + (d[i10 + 1] - d[i00 + 1]) * tx; c = d[i01 + 1] + (d[i11 + 1] - d[i01 + 1]) * tx; sg = (a + (c - a) * ty) * (1 / 255);
    a = d[i00 + 2] + (d[i10 + 2] - d[i00 + 2]) * tx; c = d[i01 + 2] + (d[i11 + 2] - d[i01 + 2]) * tx; sb = (a + (c - a) * ty) * (1 / 255);
  }

  /* ------------------------------------------------------------------------
     The Earth's clouds are a map of their own (surfaces.js) laid over the
     ground. Two copies of it drift with the winds, each fading in and out
     over a cycle, half a cycle apart. A copy that has faded out comes back
     showing a different part of the map, so the pattern does not repeat.
     The weather runs at an hour a second while the planets spin.
     ------------------------------------------------------------------------ */
  var CLOUD = [0.93, 0.94, 0.96], CLOUD_RATE = 1 / 24, CLOUD_CYCLE = 0.75;   // days a second; days a copy lasts
  var cloudT = 0, cloudW = [0, 0], cloudS = [0, 0], cloudU = [0, 0], cloudNorm = 1;
  var cloudCoverV = new Float32Array(256), cloudWindV = new Float32Array(256);
  (function () {
    var R = Sf.BODIES.earth.r;
    for (var i = 0; i < 256; i++) {
      var lat = 90 - (i + 0.5) / 256 * 180;
      cloudCoverV[i] = Sf.cloudCover(lat);
      // m/s to turns of the map a day
      cloudWindV[i] = Sf.cloudWind(lat) * 86.4 / (TAU * R * Math.max(Math.cos(lat * DEG), 0.25));
    }
  })();
  function stepClouds() {
    for (var k = 0; k < 2; k++) {
      var x = cloudT / CLOUD_CYCLE + k * 0.5, cyc = Math.floor(x), fr = x - cyc;
      cloudW[k] = 1 - Math.abs(2 * fr - 1);
      cloudS[k] = (fr - 0.5) * CLOUD_CYCLE;
      cloudU[k] = (Math.imul(cyc * 2 + k + 1, 2654435761) >>> 0) / 4294967296;
    }
    // the two copies are independent, so their sum is scaled back up to the
    // contrast of one, and the amount of cloud holds steady through a fade
    cloudNorm = 1 / Math.sqrt(cloudW[0] * cloudW[0] + cloudW[1] * cloudW[1]);
  }
  stepClouds();

  // a body's colour at (u, v) on its map as it turns now, with the clouds
  // over the ground when it has them
  function surface(bd, u, v) {
    u -= bd.rot;
    texSample(bd.tex, bd.lvl, u, v);
    var C = bd.clouds;
    if (!C) return;
    var gr = sr, gg = sg, gb = sb, lv = Math.min(bd.lvl, C.levels.length - 1), vi = (v * 255.99) | 0;
    var mu = C.mean[0], wind = cloudWindV[vi], n = 0, br = 0;
    for (var k = 0; k < 2; k++) {
      if (cloudW[k] < 1e-3) continue;
      texSample(C, lv, u - cloudU[k] - wind * cloudS[k], v);
      n += (sr - mu) * cloudW[k]; br += sg * cloudW[k];
    }
    var c = Sf.cloudOf((mu + n * cloudNorm - 0.5) * 2, cloudCoverV[vi], br);
    sr = gr + (CLOUD[0] - gr) * c; sg = gg + (CLOUD[1] - gg) * c; sb = gb + (CLOUD[2] - gb) * c;
  }
  // the colour of a body too small for its map, which for the Earth takes in its clouds
  function dotColour(b) {
    var S = b.S;
    if (!b.tex) return S.col;
    if (!S.clouds) return b.tex.mean;
    if (!Sf.has(S.clouds)) return S.col;
    var m = b.tex.mean, k = Sf.texture(S.clouds).share;
    return [m[0] + (CLOUD[0] - m[0]) * k, m[1] + (CLOUD[1] - m[1]) * k, m[2] + (CLOUD[2] - m[2]) * k];
  }

  // ring profile averaged over [r - fw/2, r + fw/2]
  var ra = { op: 0, r: 0, g: 0, b: 0, u: 0 };
  function ringAvg(Rg, r, fw) {
    ringSpan(Rg, r, fw);
    ra.op = spanMean(Rg.cOp); ra.r = spanMean(Rg.cR); ra.g = spanMean(Rg.cG); ra.b = spanMean(Rg.cB); ra.u = spanMean(Rg.cU);
  }
  // The span of the profile to average runs from step sI0 plus sF0 to step
  // sI1 plus sF1, and sInv is 1 / its length. The planet's raster finds the
  // span once and then reads only the profiles it needs.
  var sI0 = 0, sF0 = 0, sI1 = 0, sF1 = 0, sInv = 1;
  function ringSpan(Rg, r, fw) {
    var n = Rg.n, a = (r - fw * 0.5 - Rg.inner) * Rg.scale, b = (r + fw * 0.5 - Rg.inner) * Rg.scale;
    if (a < 0) a = 0;
    if (b > n) b = n;
    if (b - a < 1) { var m = (a + b) * 0.5; a = Math.max(0, m - 0.5); b = Math.min(n, a + 1); }
    sI0 = a | 0; sF0 = a - sI0; sI1 = b | 0; sF1 = b - sI1;
    // the last entry of a cumulative profile is read from the step below it
    if (sI0 >= n) { sI0 = n - 1; sF0 = 1; }
    if (sI1 >= n) { sI1 = n - 1; sF1 = 1; }
    sInv = 1 / (b - a);
  }
  // the mean of a profile over the span, from its cumulative sums C
  function spanMean(C) { return (C[sI1] + (C[sI1 + 1] - C[sI1]) * sF1 - C[sI0] - (C[sI0 + 1] - C[sI0]) * sF0) * sInv; }
  // the opacity alone, for the rings' shadow on the planet
  function ringOp(Rg, r, fw) { ringSpan(Rg, r, fw); return spanMean(Rg.cOp); }

  // The brightness of a gas or cloud-covered body falls off with a power of
  // the cosine of the Sun's angle. The powers are looked up in tables,
  // because Math.pow on every sample is one of the slowest steps in drawing
  // a planet that fills the screen.
  var LIT_N = 1024, litGas = new Float32Array(LIT_N + 2), litCloud = new Float32Array(LIT_N + 2);
  for (var li = 0; li <= LIT_N + 1; li++) {
    var lx = Math.min(li / LIT_N, 1);
    litGas[li] = Math.pow(lx * 0.92 + 0.08, 0.92);
    litCloud[li] = Math.pow(lx * 0.95 + 0.05, 0.9);
  }
  // T at m, for m from 0 to 1
  function litAt(T, m) { var x = m * LIT_N, i = x | 0; return T[i] + (T[i + 1] - T[i]) * (x - i); }

  // sample centre, in device pixels
  function sampleX(c, k) { return (c + ((k & 1) + 0.5) * 0.5) * cw; }
  function sampleY(r, k) { return (r + ((k >> 1) + 0.5) / 3) * ch; }

  /* ------------------------------------------------------------------------
     Rebuild: lay out every static contribution for the current view
     ------------------------------------------------------------------------ */
  function project(P, out) {
    var dx = P[0] - view.T[0], dy = P[1] - view.T[1], dz = P[2] - view.T[2];
    out[0] = view.ax * W + (dx * view.R[0] + dy * view.R[1] + dz * view.R[2]) * view.k;
    out[1] = view.ay * H - (dx * view.U[0] + dy * view.U[1] + dz * view.U[2]) * view.k;
    out[2] = dx * view.B[0] + dy * view.B[1] + dz * view.B[2];
    return out;
  }

  // A body more than BACK screen heights behind what the camera looks at is
  // drawn at the size it has as seen from that point, as if it were moved
  // in along that line of sight to BACK screen heights. At full scale,
  // Saturn seen behind Mimas would fill the screen many times over and
  // sweep past in a few pixels of drag. This moves a point from project()
  // to where it is drawn and returns how much smaller the body is drawn.
  var BACK = 32;
  function pullIn(out) {
    var d = -out[2] / view.span;
    if (!(d > BACK)) return 1;
    var s = BACK / d;
    out[0] = view.ax * W + (out[0] - view.ax * W) * s;
    out[1] = view.ay * H + (out[1] - view.ay * H) * s;
    return s;
  }

  var tmp3 = [0, 0, 0];
  function layoutBodies() {
    var i, b;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      project(b.pos, tmp3);
      b.depth = tmp3[2];
      b.shrink = pullIn(tmp3);
      b.sx = tmp3[0]; b.sy = tmp3[1];
      b.rp = b.R * view.k * b.shrink;
    }
    // dots shrink where the view is crowded, so neighbours never merge
    var nearSun = 1e9;
    for (i = 1; i < bodies.length; i++) {
      b = bodies[i];
      if (b.parent) continue;
      b.dSun = Math.sqrt(Math.pow(b.sx - SUN.sx, 2) + Math.pow(b.sy - SUN.sy, 2));
      if (b.dSun < nearSun) nearSun = b.dSun;
    }
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      var rmin = b.minR * ch;
      if (b === SUN) rmin = Math.min(rmin, Math.max(0.45 * nearSun, ch * 0.22));
      else if (!b.parent) rmin = Math.min(rmin, Math.max(0.28 * b.dSun, ch * 0.12));
      b.rd = Math.sqrt(b.rp * b.rp + rmin * rmin);
      b.ext = Math.max(b.rd * (b.ring ? b.ring.outer : b.S.kind === 'nebula' ? 1.5 : b.S.kind === 'hole' ? HOLE_REACH : 1.1), b.reach * view.k * b.shrink) + Math.max(cw, ch);
      b.vis = !b.off && b.sx + b.ext > 0 && b.sx - b.ext < W && b.sy + b.ext > 0 && b.sy - b.ext < H;
      b.alpha = 1;
    }
    // a moon drawn as a dot hides in its planet's dot when they are too close
    // to tell apart, and so does JWST in the Earth's. A moon big enough to
    // be drawn at its real size is always drawn, and the drawing order puts
    // it in front of its planet or behind it. The Pleiades' stars lie inside
    // the cluster, so they show once it is a few rows across and hide in
    // its glow before that.
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      if (!b.parent && !b.S.host) continue;
      var P = byKey[b.parent || b.S.host], sep = Math.sqrt(Math.pow(b.sx - P.sx, 2) + Math.pow(b.sy - P.sy, 2));
      var hide = P.S.kind === 'nebula' ? 1 - smoothstep(2.5 * ch, 6 * ch, P.rp)
        : (1 - smoothstep(1.1, 2.4, sep / (P.rd + b.rd))) * (1 - smoothstep(0.5 * ch, 1.5 * ch, b.rp));
      b.alpha = 1 - hide;
    }
    // the camera is taken to sit 25 to 32 screen heights in front of what it
    // looks at, so a body nearer than that, such as Jupiter seen past
    // Ganymede or the Earth past the Moon's near side, is behind it. A
    // nebula, the Pleiades or the black hole at the centre has the camera no
    // more than most of the way from it to the Sun, so seen from the Earth's
    // side the Sun and the nearest stars, which lie along that line of
    // sight, are not drawn across it.
    // out past the planets only the Sun is left, and over the galaxy a mark
    // in the HUD takes its place
    var sys = sysShown(cam.z), sunGone = smoothstep(0.25, 0.65, galShown(cam.z)), Fc = byKey[cam.focus];
    var nebDist = Fc.S.kind === 'nebula' || Fc.S.kind === 'hole' ? Fc.dist : 0;
    for (i = 0; i < bodies.length; i++) {
      b = bodies[i];
      b.alpha *= 1 - smoothstep(25, 32, (b.depth - b.R) / view.span);
      if (nebDist && b !== Fc) b.alpha *= 1 - smoothstep(0.6, 0.8, (b.depth - b.R) / nebDist);
      // the nearest stars and the nebulae stay with the Sun, and the stars'
      // planets go with the rest. The black hole stays, at the galaxy's middle.
      if (b.S.kind !== 'hole') b.alpha *= b.S.kind === 'star' || b.S.kind === 'nebula' ? 1 - sunGone : sys;
      if (b.alpha < 0.02) b.vis = false;
    }
  }

  function addBase(i, r, g, b) { bR[i] += r; bG[i] += g; bB[i] += b; }

  // splat a point into the four nearest samples
  var SX = 1, SY = 1;
  function splat(x, y, r, g, b) {
    var fx = x / SX - 0.5, fy = y / SY - 0.5;
    var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    for (var k = 0; k < 4; k++) {
      var xx = x0 + (k & 1), yy = y0 + (k >> 1);
      if (xx < 0 || yy < 0 || xx >= cols * 2 || yy >= rows * 3) continue;
      var w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty);
      var i = (((yy / 3) | 0) * cols + (xx >> 1)) * 6 + (yy % 3) * 2 + (xx & 1);
      bR[i] += r * w; bG[i] += g * w; bB[i] += b * w;
    }
  }
  // a line from a to b (device px), constant brightness per length
  function line(ax, ay, bx, by, r, g, b) {
    var x0 = -SX, y0 = -SY, x1 = W + SX, y1 = H + SY;
    // clip to the screen (Liang-Barsky)
    var dx = bx - ax, dy = by - ay, t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [ax - x0, x1 - ax, ay - y0, y1 - ay];
    for (var i = 0; i < 4; i++) {
      if (p[i] === 0) { if (q[i] < 0) return; continue; }
      var tt = q[i] / p[i];
      if (p[i] < 0) { if (tt > t1) return; if (tt > t0) t0 = tt; }
      else { if (tt < t0) return; if (tt < t1) t1 = tt; }
    }
    var len = Math.sqrt(dx * dx + dy * dy) * (t1 - t0);
    var step = Math.min(SX, SY) * 0.5, n = Math.max(1, Math.ceil(len / step));
    var wgt = len / n / Math.min(SX, SY);
    r *= wgt; g *= wgt; b *= wgt;
    for (var j = 0; j < n; j++) {
      var u = t0 + (t1 - t0) * (j + 0.5) / n;
      splat(ax + dx * u, ay + dy * u, r, g, b);
    }
  }

  // an orbit drawn by recursive subdivision, so it stays a smooth curve
  // even when the camera is close enough that the planet fills the screen
  // a curve fn(t) for t in [t0, t1], subdivided until it looks smooth
  function drawCurve(fn, t0, t1, n, r, g, b) {
    var prev = null, prevT = 0;
    for (var i = 0; i <= n; i++) {
      var tt = t0 + (t1 - t0) * i / n, P = project(fn(tt), [0, 0, 0]);
      if (prev) curveSeg(fn, prevT, tt, prev, P, 0, r, g, b);
      prev = P; prevT = tt;
    }
  }
  function curveSeg(fn, ta, tb, a, b, depth, r, g, bl) {
    var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy), m = len * 0.35 + 4;
    if (!isFinite(len)) return;                 // a broken view would subdivide forever
    if (Math.max(a[0], b[0]) < -m || Math.min(a[0], b[0]) > W + m || Math.max(a[1], b[1]) < -m || Math.min(a[1], b[1]) > H + m) return;
    if (len < 14 || depth > 22) { line(a[0], a[1], b[0], b[1], r, g, bl); return; }
    var tm = (ta + tb) * 0.5, M = project(fn(tm), [0, 0, 0]);
    curveSeg(fn, ta, tm, a, M, depth + 1, r, g, bl);
    curveSeg(fn, tm, tb, M, b, depth + 1, r, g, bl);
  }
  function drawOrbit(el, r, g, b) {
    drawCurve(function (E) { return Eph.orbitPoint(el, E); }, el.E, el.E + TAU, 96, r, g, b);
  }
  // an elliptic orbit from its elements (Halley's, Parker Solar Probe's)
  function drawSmallOrbit(el, r, g, b) {
    var e = el.e, a = el.q / (1 - e), bb = a * Math.sqrt(1 - e * e);
    var w = el.peri * DEG, O = el.node * DEG, I = el.i * DEG;
    var cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(O), sn = Math.sin(O), ci = Math.cos(I), si = Math.sin(I);
    drawCurve(function (E) {
      var x = a * (Math.cos(E) - e), y = bb * Math.sin(E);
      return [(cw * cn - sw * sn * ci) * x + (-sw * cn - cw * sn * ci) * y, (cw * sn + sw * cn * ci) * x + (-sw * sn + cw * cn * ci) * y, (sw * si) * x + (cw * si) * y];
    }, 0, TAU, 128, r, g, b);
  }
  // circular orbits of a planet's moons, when the system is big enough to see
  function drawMoonOrbits() {
    for (var i = 0; i < bodies.length; i++) {
      var m = bodies[i];
      if (!m.parent || m.key === 'moon') continue;
      var P = byKey[m.parent];
      if (P.S.kind === 'hole') continue;
      if (P.sx < -W || P.sx > 2 * W || P.sy < -H || P.sy > 2 * H) continue;
      var a = Math.sqrt(Math.pow(m.pos[0] - P.pos[0], 2) + Math.pow(m.pos[1] - P.pos[1], 2) + Math.pow(m.pos[2] - P.pos[2], 2));
      var rpx = a * view.k, al = smoothstep(P.rd * 1.6, P.rd * 4, rpx) * (1 - smoothstep(1.5 * H, 5 * H, rpx));
      if (al < 0.02) continue;
      var v = tune.orbit * al * (m.key === cam.focus ? 1.6 : 0.8), Qm = m.Q, Em = m.E, c = P.pos;
      drawCurve(function (t) {
        var ct = Math.cos(t), st = Math.sin(t);
        return [c[0] + a * (ct * Qm[0] + st * Em[0]), c[1] + a * (ct * Qm[1] + st * Em[1]), c[2] + a * (ct * Qm[2] + st * Em[2])];
      }, 0, TAU, 64, v * 0.8, v * 0.84, v * 0.92);
    }
  }

  /* ------------------------------------------------------------------------
     Comets. The coma is a glow round the nucleus, brighter toward the
     middle as gas streaming out at an even speed is. The ion tail is a
     narrow beam the solar wind blows straight back from the Sun, tipped a
     few degrees by the comet's own speed. It breaks into thin rays with
     knots running out along them. The dust tail is made as the real one
     forms. Grains leave the nucleus over the last 45 days, and the Sun's
     light pushes each one outward with a share beta of the Sun's pull.
     Each grain then follows an orbit of its own, so the tail fans out and
     curves back along the comet's path. Grains leave mostly from the
     sunlit side, so the head has a rounded hood toward the Sun, and most
     of them leave in jets that curve away from the turning nucleus.
     Halley's activity rose and fell every 7.4 days in 1986, and each rise
     leaves a band of grains that left together across the dust tail. All
     three grow as the comet comes in and are drawn at their real size.
     Where the tails would be shorter than a few characters they are drawn
     longer, so they show.
     ------------------------------------------------------------------------ */
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
    var p = Eph.smallPosition(el, jd), a = Eph.smallPosition(el, jd + 0.01), b = Eph.smallPosition(el, jd - 0.01);
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
  // read off in between. w is how much dust left at each age.
  function dustAge(i) { return DUST_A0 * Math.pow(DUST_DAYS / DUST_A0, i / (DUST_N - 1)); }
  var dust = { key: null, jd: NaN, off: null, w: null };
  function dustNow(b, jd) {
    if (dust.key === b.key && Math.abs(jd - dust.jd) < 1 / 48) return dust;
    var el = Eph.SMALL[b.key], nb = DUST_BETA.length, now = Eph.smallPosition(el, jd);
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
    dust = { key: b.key, jd: jd, off: off, w: w };
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
    // each point's place on the screen and its light
    return (COMET_PTS = { nd: nd, n0: n0, nJ: nd - n0, D: D, ni: ni, I: I, out: new Float32Array(Math.max(nd, ni) * 3) });
  }
  // Spread a comet's points into the cloud, their light scaled to add up
  // to g. Each point is spread over about the distance to its neighbours.
  // That comes from how many points share its square on a few coarse
  // grids, 2, 4, 8 ... samples across, from the finest up to the first
  // square that holds two dozen of them. The widest spacing any of those
  // squares gives is taken, so a lone grain next to the crowded head is
  // spread as widely as its own neighbourhood needs.
  var cnt = null;
  function cometSplat(out, n, g, col) {
    var sum = 0, i, l, o;
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
      cloudSpread(out[o], out[o + 1], col[0] * wt, col[1] * wt, col[2] * wt, f);
    }
  }
  function drawComets(fade) {
    var P = [0, 0, 0], jd = Eph.julianDay(simDate), pts = cometPoints(), out = pts.out;
    for (var ci = 0; ci < bodies.length; ci++) {
      var b = bodies[ci];
      if (b.S.cls !== 'comet' || b.off) continue;
      var r = b.dist, coma = comaActivity(r) * fade, tail = tailActivity(r) * fade;
      if (coma < 0.01) continue;
      project(b.pos, P);
      var kk = view.k * pullIn(P), cx = P[0], cy = P[1];
      // the ion tail points away from the Sun, tipped by the comet's speed
      // against a solar wind of 400 km/s
      var el = Eph.SMALL[b.key], vel = cometState(el, jd)[1], kms = AU_KM / 86400;
      var u = [b.pos[0] / r, b.pos[1] / r, b.pos[2] / r];
      var d = norm([u[0] * 400 - vel[0] * kms, u[1] * 400 - vel[1] * kms, u[2] * 400 - vel[2] * kms]);
      var Lion = 0.15 * tail / Math.max(r, 0.45);
      // tails too short to see from here are drawn longer
      var X = tail > 0.01 ? Math.max(1, ch * 6 * tail / (Lion * kk)) : 1, kx = kk * X;
      var Rc = COMA_KM / AU_KM * Math.sqrt(coma / Math.max(r, 0.5)) * kk, reach = Math.max(4 * Rc, 2.5 * ch), tailPx = Lion * kx * 1.5;
      if (cx < -reach - tailPx || cx > W + reach + tailPx || cy < -reach - tailPx || cy > H + reach + tailPx) continue;
      // The coma's core, a thirtieth of its size, is as bright as it gets.
      // Once the core fills a tenth of the screen, coma and tails dim
      // together as the view goes further in. The dust round the head is
      // far brighter than the tails, so once the coma is wider than a third
      // of the screen the dust dims as well, by the square root of how much
      // wider, and the jets in it still show.
      var rc = Math.max(Rc, 0.6 * ch), core = Math.max(0.3 * ch, rc * 0.03), inside = Math.min(1, Math.sqrt(0.1 * H / core));
      var dustDim = inside * Math.min(1, Math.sqrt(0.3 * H / rc));
      var coreDays = 0.03 * COMA_KM * Math.sqrt(coma / Math.max(r, 0.5)) / (0.5 * 86400);
      var R = view.R, Uv = view.U;
      // the screen offset of a world offset (AU), with the tails drawn X times longer
      var rx = [R[0] * kx, R[1] * kx, R[2] * kx], ry = [-Uv[0] * kx, -Uv[1] * kx, -Uv[2] * kx];
      if (tail > 0.01) {
        // Both tails keep their brightness per area as their size on the
        // screen changes. The dust gives three fifths of the light and the
        // ion tail two.
        var area = Math.max(1, Lion * kx * Lion * kx * 0.15 * 6 / (cw * ch)), G = tune.comet * tail * area;
        var i, o, k;
        var Dn = dustNow(b, jd), nb = DUST_BETA.length, lnD = Math.log(DUST_DAYS / DUST_MIN), lnJ = Math.log(JET_AGE / DUST_MIN), lnA = Math.log(DUST_MIN / DUST_A0);
        var perLn = (DUST_N - 1) / Math.log(DUST_DAYS / DUST_A0), q = [0, 0, 0], jetB = DUST_BETA.indexOf(JET_BETA);
        cloudStart();
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
            var nx = cq * b.Q[0] + sq * b.E[0] + sl * b.N[0], ny = cq * b.Q[1] + sq * b.E[1] + sl * b.N[1], nz = cq * b.Q[2] + sq * b.E[2] + sl * b.N[2];
            lit = -(nx * u[0] + ny * u[1] + nz * u[2]) * 2.5;
            q[0] += (nx + 0.12 * pts.D[o + 2]) * drift; q[1] += (ny + 0.12 * pts.D[o + 3]) * drift; q[2] += (nz + 0.12 * pts.D[o + 4]) * drift;
          }
          if (lit <= 0) { out[o3 + 2] = 0; continue; }
          var c = 0.5 + 0.5 * Math.cos(TAU * (jd - age) / PULSE_DAYS), c2 = c * c;
          out[o3] = cx + dot(q, rx); out[o3 + 1] = cy + dot(q, ry);
          // grains younger than it takes to cross the coma's core are dimmed
          // to keep the core as bright as it gets
          out[o3 + 2] = share * lit * age * age / (age + coreDays) * (Dn.w[a0] * (1 - ta) + Dn.w[a0 + 1] * ta) * (0.35 + 1.3 * c2 * c2 * c2);
        }
        cometSplat(out, pts.nd, G * 0.6, DUST_COL);
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
          var x = d[0] * s + e1[0] * lx + e2[0] * ly, y = d[1] * s + e1[1] * lx + e2[1] * ly, z = d[2] * s + e1[2] * lx + e2[2] * ly;
          // knots carried out along the ray
          var knot = 0.55 + 0.45 * Math.cos(TAU * (s / 0.03 - jd * 4 + ray * 0.37)), o3i = i * 3;
          out[o3i] = cx + x * rx[0] + y * rx[1] + z * rx[2]; out[o3i + 1] = cy + x * ry[0] + y * ry[1] + z * ry[2];
          out[o3i + 2] = s * (1 - 0.7 * s / Lion) * (0.5 + 0.5 * ((ray * 7) % 5) / 4) * knot;
        }
        cometSplat(out, pts.ni, G * 0.4, ION_COL);
        cometEnd(tune.nebulaMax, dustDim);
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
  }

  // the Moon's path around the Earth over one month, from the ephemeris
  var moonPath = null, moonPathT = 0;
  function drawMoonOrbit(alpha) {
    if (!moonPath || Math.abs(simTime - moonPathT) > 6 * 3600e3) {
      moonPath = [];
      for (var i = 0; i <= 72; i++) moonPath.push(Eph.moonVector(new Date(simTime + (i / 72 - 0.5) * 27.32 * 86400e3)));
      moonPathT = simTime;
    }
    var E = byKey.earth.pos, prev = null, P = [0, 0, 0];
    var c = tune.orbit * alpha;
    for (var j = 0; j < moonPath.length; j++) {
      var m = moonPath[j];
      project([E[0] + m[0], E[1] + m[1], E[2] + m[2]], P);
      if (prev) line(prev[0], prev[1], P[0], P[1], c * 0.8, c * 0.82, c * 0.9);
      prev = [P[0], P[1]];
    }
  }

  // minor bodies: the main belt (with its Kirkwood gaps) and the Kuiper belt
  var MINOR = null;
  function buildMinor() {
    MINOR = [];
    var s = 0x2f6b9a1;
    function rnd() { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return s / 4294967296; }
    function add(a, e, inc, belt) {
      MINOR.push({ a: a, e: e, I: inc * DEG, node: rnd() * TAU, w: rnd() * TAU, M0: rnd() * TAU,
                   n: 0.9856076686 * DEG / Math.pow(a, 1.5), m: Math.pow(rnd(), 2.5), belt: belt });
    }
    var gaps = [2.502, 2.825, 2.958, 3.279];
    while (MINOR.length < 1700) {
      var a = 2.1 + rnd() * 1.25, ok = true;
      for (var g = 0; g < gaps.length; g++) if (Math.abs(a - gaps[g]) < 0.025 && rnd() < 0.9) ok = false;
      if (ok) add(a, rnd() * 0.22, Math.abs((rnd() + rnd() - 1) * 18), 0);
    }
    for (var k = 0; k < 900; k++) add(39.4 + Math.pow(rnd(), 0.7) * 9, rnd() * 0.18, Math.abs((rnd() + rnd() - 1) * 22), 1);
  }
  var minorPos = null, minorT = NaN;
  function minorPositions() {
    // they barely move in an hour of simulated time, so positions are reused
    if (minorPos && Math.abs(simTime - minorT) < 3600e3) return minorPos;
    if (!minorPos) minorPos = new Float64Array(MINOR.length * 3);
    var days = Eph.julianDay(simDate) - 2451545.0, el = { a: 0, e: 0, I: 0, w: 0, node: 0 };
    for (var i = 0; i < MINOR.length; i++) {
      var m = MINOR[i];
      el.a = m.a; el.e = m.e; el.I = m.I; el.w = m.w; el.node = m.node;
      var M = (m.M0 + m.n * days) % TAU;
      var p = Eph.orbitPoint(el, Eph.solveKepler(M < 0 ? M + TAU : M, m.e));
      minorPos[i * 3] = p[0]; minorPos[i * 3 + 1] = p[1]; minorPos[i * 3 + 2] = p[2];
    }
    minorT = simTime;
    return minorPos;
  }
  function drawMinor(aBelt, aKuiper) {
    if (!MINOR) buildMinor();
    var pos = minorPositions(), P = [0, 0, 0], q = [0, 0, 0];
    // fainter as the belt packs into fewer characters
    var beltK = Math.min(1, 4 / view.span), kuiperK = Math.min(1, 70 / view.span);
    for (var i = 0; i < MINOR.length; i++) {
      var m = MINOR[i], al = m.belt ? aKuiper : aBelt;
      if (al < 0.01) continue;
      q[0] = pos[i * 3]; q[1] = pos[i * 3 + 1]; q[2] = pos[i * 3 + 2];
      project(q, P);
      if (P[0] < -2 || P[1] < -2 || P[0] > W + 2 || P[1] > H + 2) continue;
      var v = tune.belt * al * (0.45 + 0.9 * m.m) * (m.belt ? kuiperK : beltK);
      splat(P[0], P[1], v * 0.95, v * 0.88, v * 0.78);
    }
  }

  // the Sun's glow, in screen space, which goes with the Sun when the Sun
  // is behind the camera
  function drawStarGlows() {
    for (var i = 0; i < bodies.length; i++) if (bodies[i].S.kind === 'star' && bodies[i].vis) drawGlow(bodies[i]);
  }
  function drawGlow(b) {
    var rd = b.rd, w1 = Math.max(0.10 * rd, 0.45 * ch), w2 = Math.max(0.6 * rd, 2.2 * ch), al = b.alpha, gc = b.S.glowCol || [1, 0.8, 0.55];
    var reach = rd + 6 * w2;
    if (al < 0.02 || b.sx + reach < 0 || b.sx - reach > W || b.sy + reach < 0 || b.sy - reach > H) return;
    var c0 = clamp(Math.floor((b.sx - reach) / cw), 0, cols), c1 = clamp(Math.ceil((b.sx + reach) / cw), 0, cols);
    var r0 = clamp(Math.floor((b.sy - reach) / ch), 0, rows), r1 = clamp(Math.ceil((b.sy + reach) / ch), 0, rows);
    for (var r = r0; r < r1; r++) for (var c = c0; c < c1; c++) for (var k = 0; k < 6; k++) {
      var dx = sampleX(c, k) - b.sx, dy = sampleY(r, k) - b.sy, d = Math.sqrt(dx * dx + dy * dy) - rd;
      if (d < 0) d = 0;
      var v = (0.5 * Math.exp(-d / w1) + 0.07 * Math.exp(-d / w2)) * al;
      if (v < 0.004) continue;
      addBase((r * cols + c) * 6 + k, v * gc[0], v * gc[1], v * gc[2]);
    }
  }

  /* ------------------------------------------------------------------------
     The galaxy: its stars from surfaces.js drawn one by one, and the bulge
     and bar as glowing ellipsoids.
     ------------------------------------------------------------------------ */
  function galDir(v) {
    var X = GAL.x, Y = GAL.y, Z = GAL.z;
    return [v[0] * X[0] + v[1] * Y[0] + v[2] * Z[0], v[0] * X[1] + v[1] * Y[1] + v[2] * Z[1], v[0] * X[2] + v[1] * Y[2] + v[2] * Z[2]];
  }
  var galBlobs = null;
  function galSetup() {
    if (galBlobs) return;
    var G = Sf.galaxy, ca = Math.cos(G.barAngle * DEG), sa = Math.sin(G.barAngle * DEG);
    // along the bar (its near end at positive longitude), across it, and up
    var A = galDir([-ca, sa, 0]), Bv = galDir([sa, ca, 0]), Z = GAL.z;
    galBlobs = G.blobs.map(function (o) {
      var s = [o[1] * KPC, o[2] * KPC, o[3] * KPC], S = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      [A, Bv, Z].forEach(function (e, k) {
        for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) S[i * 3 + j] += s[k] * s[k] * e[i] * e[j];
      });
      return { c: GAL.toEcl(-ca * o[0], sa * o[0], 0), S: S, s3: s[0] * s[1] * s[2], sz: s[2], amp: o[4] };
    });
  }
  // the galactocentric x, y (kpc) of where the sample at screen (sx, sy) meets the plane
  function galAt(sx, sy) {
    var a = (sx - view.ax * W) / view.k, b = (view.ay * H - sy) / view.k, R = view.R, U = view.U, B = view.B, C = GAL.centre;
    var P = [view.T[0] + R[0] * a + U[0] * b - C[0], view.T[1] + R[1] * a + U[1] * b - C[1], view.T[2] + R[2] * a + U[2] * b - C[2]];
    var t = -dot(P, GAL.z) / dot(B, GAL.z), Hp = [P[0] + t * B[0], P[1] + t * B[1], P[2] + t * B[2]];
    return [dot(Hp, GAL.x) / KPC, dot(Hp, GAL.y) / KPC];
  }
  function drawGalaxy(al) {
    var tg = performance.now();
    galSetup();
    var gain = tune.galaxy * al, r, c, k, i;
    // the bulge and bar: a Gaussian ellipsoid seen along any line is a
    // Gaussian on the screen, its spread the ellipsoid's projected onto it
    var R = view.R, U = view.U, kk = view.k, P = [0, 0, 0], col = Sf.galaxy.blobColour;
    for (var bi = 0; bi < galBlobs.length; bi++) {
      var G = galBlobs[bi], S = G.S;
      var SR = [S[0] * R[0] + S[1] * R[1] + S[2] * R[2], S[3] * R[0] + S[4] * R[1] + S[5] * R[2], S[6] * R[0] + S[7] * R[1] + S[8] * R[2]];
      var SU = [S[0] * U[0] + S[1] * U[1] + S[2] * U[2], S[3] * U[0] + S[4] * U[1] + S[5] * U[2], S[6] * U[0] + S[7] * U[1] + S[8] * U[2]];
      var rr = dot(R, SR), uu = dot(U, SU), ru = dot(R, SU), det = rr * uu - ru * ru;
      // its peak along the line of sight against its peak seen face-on
      var peak = G.amp * gain * (G.s3 / Math.sqrt(det)) / G.sz;
      var Sxx = rr * kk * kk, Syy = uu * kk * kk, Sxy = -ru * kk * kk, dpx = Sxx * Syy - Sxy * Sxy;
      project(G.c, P);
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
    tg = mark('gblob', tg);
    var Pt = Sf.galaxy.points();
    if (!Pt) return;
    var pos = Pt.pos, pc = Pt.col, X = GAL.x, Y = GAL.y, Z = GAL.z, C = GAL.centre, T = view.T;
    var dC = [C[0] - T[0], C[1] - T[1], C[2] - T[2]], kp = kk * KPC;
    var ox = view.ax * W + kk * dot(dC, R), oy = view.ay * H - kk * dot(dC, U);
    var xx = kp * dot(X, R), xy = kp * dot(Y, R), xz = kp * dot(Z, R), yx = -kp * dot(X, U), yy = -kp * dot(Y, U), yz = -kp * dot(Z, U);
    // The points are in no particular order, so far out every few of them,
    // that much brighter, stand for all of them.
    var sam = rows * 3 / 200, zoomIn = Math.pow(40 * KPC / view.span, 2), zoom = Math.min(zoomIn, 60);
    var stride = clamp(Math.round(3 / Math.sqrt(zoomIn)), 1, 3);
    var pg = tune.galaxyPoints * al * zoom * sam * sam * stride * Pt.colScale;
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
    mark('gpts', tg);
  }

  /* ------------------------------------------------------------------------
     Nebulae and the Pleiades: their gas from surfaces.js projected point by
     point and spread over the four nearest samples, and the stars in them
     each in one sample, the bright ones with a small glow round it. The
     gas keeps its brightness per area as the camera comes closer or goes
     away, so from far off a nebula is a faint smudge, and a soft glow
     round its name takes over from it. A nebula's light runs from
     faint wisps to a core thousands of times brighter, so the gas is added
     up on its own first and its brightness compressed, as a photograph of
     a nebula is.
     ------------------------------------------------------------------------ */
  // its own frame in ecliptic coordinates: u to the right and v up as seen
  // from the Earth with north up, and w toward the Earth
  function nebFrame(b) {
    if (b.nf) return b.nf;
    var a = norm(b.pos), e = norm(cross(SKY_N, a)), n = cross(a, e);
    return (b.nf = { u: [-e[0], -e[1], -e[2]], v: n, w: [-a[0], -a[1], -a[2]] });
  }
  // A cloud of points of light, such as a nebula's gas or a comet's tails,
  // is added up on its own first. Each point is spread over the four
  // nearest samples. Where a nebula has fewer points than samples its sums
  // are blurred by about the distance between points. A comet's points are
  // each spread by cloudSpread instead. The brightness is then compressed
  // toward a maximum before the cloud joins the picture.
  var cloudLo = 0, cloudHi = -1, cloudN = 0;
  function cloudStart() {
    if (!cloudR || cloudR.length !== bR.length) { cloudR = new Float32Array(bR.length); cloudG = new Float32Array(bR.length); cloudB = new Float32Array(bR.length); }
    cloudLo = rows * 3; cloudHi = -1; cloudN = 0;
    sampleMaps();
  }
  // where sample (x, y) of the grid of 2 by 3 samples a cell sits in the
  // per-sample buffers: idxY[y] + idxX[x]
  var idxX = null, idxY = null;
  function sampleMaps() {
    var c2 = cols * 2, r3 = rows * 3, x, y;
    if (idxX && idxX.length === c2 && idxY.length === r3) return;
    idxX = new Int32Array(c2); idxY = new Int32Array(r3);
    for (x = 0; x < c2; x++) idxX[x] = (x >> 1) * 6 + (x & 1);
    for (y = 0; y < r3; y++) idxY[y] = ((y / 3) | 0) * cols * 6 + (y % 3) * 2;
  }
  // a point of light at (x, y) in device pixels
  function cloudAdd(x, y, r, g, b) {
    var c2 = cols * 2, r3 = rows * 3, fx = x * 2 / cw - 0.5, fy = y * 3 / ch - 0.5;
    if (fx < -1 || fy < -1 || fx >= c2 || fy >= r3) return;
    var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    cloudN++;
    if (y0 < cloudLo) cloudLo = y0;
    if (y0 > cloudHi) cloudHi = y0;
    for (var k = 0; k < 4; k++) {
      var xx = x0 + (k & 1), yy = y0 + (k >> 1);
      if (xx < 0 || yy < 0 || xx >= c2 || yy >= r3) continue;
      var w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty), i = (((yy / 3) | 0) * cols + (xx >> 1)) * 6 + (yy % 3) * 2 + (xx & 1);
      cloudR[i] += r * w; cloudG[i] += g * w; cloudB[i] += b * w;
    }
  }
  // A point whose neighbours lie further apart than a sample, such as a
  // grain far down a comet's tail, is spread over about that distance, f
  // samples. It goes into one of a stack of grids, each with half as many
  // samples across as the one before, the one whose spacing is nearest f.
  // A point between two spacings is shared between both grids. At the end
  // the grids are added up from the coarsest down, each spread smoothly
  // over the next finer one. This keeps the cloud smooth where its points
  // are sparse.
  var PYR_N = 6, pyr = { c2: 0, r3: 0, L: [], used: false }, pyrT = null;
  function cloudSpread(x, y, r, g, b, f) {
    if (!(f > 1)) { cloudAdd(x, y, r, g, b); return; }
    var lv = Math.log2(f), l0 = lv | 0, t = lv - l0;
    if (l0 >= PYR_N) { l0 = PYR_N; t = 0; }
    if (pyr.c2 !== cols * 2 || pyr.r3 !== rows * 3) pyrSetup();
    var fx = x * 2 / cw, fy = y * 3 / ch, u = 1 - t;
    if (l0 === 0) cloudAdd(x, y, r * u, g * u, b * u);
    else pyrSplat(pyr.L[l0], l0, fx, fy, r * u, g * u, b * u);
    if (t > 0) pyrSplat(pyr.L[l0 + 1], l0 + 1, fx, fy, r * t, g * t, b * t);
  }
  function pyrSetup() {
    var c2 = cols * 2, r3 = rows * 3, n = 0;
    pyr = { c2: c2, r3: r3, L: [], used: false };
    for (var l = 1; l <= PYR_N; l++) {
      var w = Math.ceil(c2 / (1 << l)), h = Math.ceil(r3 / (1 << l));
      pyr.L[l] = { w: w, h: h, R: new Float32Array(w * h), G: new Float32Array(w * h), B: new Float32Array(w * h), lo: h, hi: -1 };
      n = Math.max(n, w * h);
    }
    pyrT = [new Float32Array(Math.max(c2 * r3, n)), new Float32Array(Math.max(c2 * r3, n)), new Float32Array(Math.max(c2 * r3, n))];
  }
  // a point into grid L, whose samples are 2^l of the finest across;
  // (fx, fy) is where it falls in finest samples
  function pyrSplat(L, l, fx, fy, r, g, b) {
    var s = 1 / (1 << l), px = fx * s - 0.5, py = fy * s - 0.5, x0 = Math.floor(px), y0 = Math.floor(py), tx = px - x0, ty = py - y0;
    if (x0 < -1 || y0 < -1 || x0 >= L.w || y0 >= L.h) return;
    pyr.used = true;
    if (y0 < L.lo) L.lo = y0;
    if (y0 + 1 > L.hi) L.hi = y0 + 1;
    for (var k = 0; k < 4; k++) {
      var xx = x0 + (k & 1), yy = y0 + (k >> 1);
      if (xx < 0 || yy < 0 || xx >= L.w || yy >= L.h) continue;
      var w = ((k & 1) ? tx : 1 - tx) * ((k >> 1) ? ty : 1 - ty), i = yy * L.w + xx;
      L.R[i] += r * w; L.G[i] += g * w; L.B[i] += b * w;
    }
  }
  // Each grid spread over the next finer one, from the coarsest down to
  // the one with half as many samples across as the screen. Along each
  // axis a coarse sample gives 3/8 of its light to each of the two fine
  // samples it covers and 1/8 to each of their outer neighbours.
  function pyrEnd() {
    if (!pyr.used) return;
    pyr.used = false;
    for (var l = PYR_N; l >= 2; l--) {
      var L = pyr.L[l], lo = Math.max(L.lo, 0), hi = Math.min(L.hi, L.h - 1);
      L.lo = L.h; L.hi = -1;
      if (hi < lo) continue;
      var F = pyr.L[l - 1], w2 = F.w, w = L.w, src = [L.R, L.G, L.B], dst = [F.R, F.G, F.B];
      var j0 = Math.max(0, 2 * lo - 1), j1 = Math.min(F.h - 1, 2 * hi + 2), x, y, j;
      for (var p = 0; p < 3; p++) {
        var S = src[p], T = pyrT[p], D = dst[p];
        // across, into rows lo to hi of T at the fine width
        for (y = lo; y <= hi; y++) {
          var so = y * w, to = (y - lo) * w2;
          for (x = 0; x < w2; x++) {
            var m = x >> 1, n = (x & 1) ? m + 1 : m - 1;
            T[to + x] = 0.375 * S[so + m] + (n >= 0 && n < w ? 0.125 * S[so + n] : 0);
          }
          for (x = 0; x < w; x++) S[so + x] = 0;
        }
        // down, into the fine rows
        for (j = j0; j <= j1; j++) {
          var ma = j >> 1, na = (j & 1) ? ma + 1 : ma - 1, ka = ma >= lo && ma <= hi ? 0.375 : 0, kb = na >= lo && na <= hi ? 0.125 : 0;
          var ta = (ma - lo) * w2, tb = (na - lo) * w2, fo = j * w2;
          for (x = 0; x < w2; x++) D[fo + x] += (ka ? ka * T[ta + x] : 0) + (kb ? kb * T[tb + x] : 0);
        }
      }
      F.lo = Math.min(F.lo, j0); F.hi = Math.max(F.hi, j1);
    }
  }
  // per: how many points fall in a sample over the whole cloud; max: the
  // brightness it is compressed toward. The blur goes by how closely the
  // points that reached the screen lie. Closer in than the blur reaches,
  // each point would stand alone as a bright blot, so the cloud dims to the
  // brightness it has spread out and then fades away.
  function cloudEnd(per, max) {
    var r3 = rows * 3, y0 = clamp(cloudLo, 0, r3 - 1), y1 = clamp(cloudHi + 1, 0, r3 - 1), i;
    var e0 = clamp(Math.floor(cloudLo / 3), 0, rows) * cols * 6, e1 = clamp(Math.floor((cloudHi + 1) / 3) + 1, 0, rows) * cols * 6, lit = 0;
    for (i = e0; i < e1; i++) if (cloudR[i] + cloudG[i] + cloudB[i] > 0) lit++;
    var near = lit ? cloudN / lit : 0;
    if (near < 12 && y1 >= y0) cloudBlur(Math.min(6, Math.round(Math.sqrt(12 / Math.max(near, 0.01)))), y0, y1);
    var fill = clamp(per * 169 / 12, 0, 1), keep = fill * smoothstep(0.04, 0.3, fill), iM = 1 / max;
    // the rows of cells the cloud reached, into the picture and cleared
    for (i = e0; i < e1; i++) {
      var L = (cloudR[i] + cloudG[i] + cloudB[i]) * keep / 3;
      if (L <= 0) { cloudR[i] = cloudG[i] = cloudB[i] = 0; continue; }
      var q = keep / (1 + L * iM);
      bR[i] += cloudR[i] * q; bG[i] += cloudG[i] * q; bB[i] += cloudB[i] * q;
      cloudR[i] = cloudG[i] = cloudB[i] = 0;
    }
  }
  // A comet's cloud, whose points were spread by cloudSpread, into the
  // picture. Its light runs over a far wider range than a nebula's: it is
  // millions of times brighter by the nucleus than at the ends of the
  // tails. The finest of the grids is spread over the samples together
  // with the points added to them directly, the cube root of the
  // brightness is compressed toward max, and gain scales the result. The
  // faintest light, just at the edge of what a character can show, fades
  // out, so it does not scatter single characters over the sky.
  function cometEnd(max, gain) {
    pyrEnd();
    var L = pyr.L[1], has = !!L && L.hi >= L.lo, lo = has ? Math.max(L.lo, 0) : 0, hi = has ? Math.min(L.hi, L.h - 1) : -1;
    var r3 = rows * 3, c2 = cols * 2, y0 = cloudLo, y1 = cloudHi + 1, iM = 1 / max, x, y;
    if (has) { y0 = Math.min(y0, 2 * lo - 1); y1 = Math.max(y1, 2 * hi + 2); }
    y0 = Math.max(y0, 0); y1 = Math.min(y1, r3 - 1);
    var w = has ? L.w : 0, LR = has ? L.R : null, LG = has ? L.G : null, LB = has ? L.B : null;
    for (y = y0; y <= y1; y++) {
      var m = y >> 1, n = (y & 1) ? m + 1 : m - 1, ka = has && m >= lo && m <= hi ? 0.375 : 0, kb = has && n >= lo && n <= hi ? 0.125 : 0;
      var oa = m * w, ob = n * w, by = idxY[y];
      for (x = 0; x < c2; x++) {
        var i = by + idxX[x], r = cloudR[i], g = cloudG[i], b = cloudB[i];
        if (ka + kb > 0) {
          var mx = x >> 1, nx = (x & 1) ? mx + 1 : mx - 1, kn = nx >= 0 && nx < w ? 0.125 : 0;
          if (nx < 0 || nx >= w) nx = mx;
          var a0 = ka * 0.375, a1 = ka * kn, b0 = kb * 0.375, b1 = kb * kn;
          var p00 = oa + mx, p01 = oa + nx, p10 = ob + mx, p11 = ob + nx;
          r += a0 * LR[p00] + a1 * LR[p01] + (kb ? b0 * LR[p10] + b1 * LR[p11] : 0);
          g += a0 * LG[p00] + a1 * LG[p01] + (kb ? b0 * LG[p10] + b1 * LG[p11] : 0);
          b += a0 * LB[p00] + a1 * LB[p01] + (kb ? b0 * LB[p10] + b1 * LB[p11] : 0);
        }
        var Ls = (r + g + b) / 3;
        if (Ls > 0) {
          var L1 = Math.cbrt(Ls), o = gain * L1 / (1 + L1 * iM), q = o / Ls * smoothstep(0.015, 0.05, o);
          bR[i] += r * q; bG[i] += g * q; bB[i] += b * q;
        }
        cloudR[i] = cloudG[i] = cloudB[i] = 0;
      }
    }
    if (has) {
      for (y = lo; y <= hi; y++) for (x = 0; x < w; x++) LR[y * w + x] = LG[y * w + x] = LB[y * w + x] = 0;
      L.lo = L.h; L.hi = -1;
    }
  }
  // two passes of a box blur of radius rad samples, across and down, over
  // the sample rows y0 to y1 of the cloud's sums
  var blurLine = null;
  function cloudBlur(rad, y0, y1) {
    var c2 = cols * 2, r3 = rows * 3, n = Math.max(c2, r3), bufs = [cloudR, cloudG, cloudB], blurX = idxX, blurY = idxY, x, y, k, p;
    if (!blurLine || blurLine.length < n * 2) blurLine = new Float32Array(n * 2);
    var src = blurLine, tmp = blurLine.subarray(n), inv = 1 / (2 * rad + 1);
    // two box passes over len values in src, through tmp and back
    function box(len) {
      for (var pass = 0; pass < 2; pass++) {
        var a = pass ? tmp : src, o = pass ? src : tmp, sum = 0, i;
        for (i = -rad; i <= rad; i++) sum += a[i < 0 ? 0 : i >= len ? len - 1 : i];
        for (i = 0; i < len; i++) {
          o[i] = sum * inv;
          sum += a[i + rad + 1 < len ? i + rad + 1 : len - 1] - a[i - rad > 0 ? i - rad : 0];
        }
      }
    }
    for (p = 0; p < 3; p++) {
      var B = bufs[p], len = y1 - y0 + 1;
      for (y = y0; y <= y1; y++) {
        var by = blurY[y];
        for (x = 0; x < c2; x++) src[x] = B[by + blurX[x]];
        box(c2);
        for (x = 0; x < c2; x++) B[by + blurX[x]] = src[x];
      }
      for (x = 0; x < c2; x++) {
        var bx = blurX[x];
        for (k = 0; k < len; k++) src[k] = B[blurY[y0 + k] + bx];
        box(len);
        for (k = 0; k < len; k++) B[blurY[y0 + k] + bx] = src[k];
      }
    }
  }
  function drawNebula(b) {
    var al = b.alpha, rp = b.rp, gc = b.S.glowCol;
    if (al < 0.02) return;
    var far = 1 - smoothstep(1.5 * ch, 6 * ch, rp), r, c, k;
    if (far > 0.01) {
      // the glow: a soft spot the size of the dot
      var wg = Math.max(0.45 * b.rd, 0.5 * ch), reach = 3.5 * wg, amp = 0.45 * far * al;
      var c0 = clamp(Math.floor((b.sx - reach) / cw), 0, cols), c1 = clamp(Math.ceil((b.sx + reach) / cw), 0, cols);
      var r0 = clamp(Math.floor((b.sy - reach) / ch), 0, rows), r1 = clamp(Math.ceil((b.sy + reach) / ch), 0, rows);
      for (r = r0; r < r1; r++) for (c = c0; c < c1; c++) for (k = 0; k < 6; k++) {
        var dx = sampleX(c, k) - b.sx, dy = sampleY(r, k) - b.sy, v = amp * Math.exp(-(dx * dx + dy * dy) / (2 * wg * wg));
        if (v > 0.004) addBase((r * cols + c) * 6 + k, v * gc[0], v * gc[1], v * gc[2]);
      }
    }
    if (far > 0.99) return;
    var M = Sf.nebula.points(b.key);
    if (!M) { queueNebula(b.key); return; }
    var f = nebFrame(b), R = view.R, U = view.U, i, o;
    var ux = rp * dot(f.u, R), vx = rp * dot(f.v, R), wx = rp * dot(f.w, R), uy = -rp * dot(f.u, U), vy = -rp * dot(f.v, U), wy = -rp * dot(f.w, U);
    // with many points to a sample, every few of them, that much brighter, stand for all of them
    var area = Math.PI * rp * rp * 6 / (cw * ch), stride = clamp(Math.floor(M.n / (area * 6)), 1, 12);
    var a = al * (1 - far), G = a * tune.nebula * M.gain * area * stride;
    var pos = M.pos, col = M.col, cx = b.sx, cy = b.sy, isx = 2 / cw, isy = 3 / ch, c2 = cols * 2, r3 = rows * 3;
    cloudStart();
    for (i = 0; i < M.n; i += stride) {
      o = i * 3;
      var pu = pos[o], pv = pos[o + 1], pw = pos[o + 2];
      cloudAdd(cx + ux * pu + vx * pv + wx * pw, cy + uy * pu + vy * pv + wy * pw, col[o] * G, col[o + 1] * G, col[o + 2] * G);
    }
    cloudEnd(M.n / stride / area, tune.nebulaMax);
    var sg = a * tune.nebulaStars, st = M.stars, gw = 0.5 * ch;
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
  }

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
  // what stays the same across the hole for view V, with samples px ring
  // radii apart
  function holeSetup(b, V, px) {
    holeRays();
    var S = b.S, N = b.N, K = S.r / S.m, M = cross(N, V.B), nR = dot(N, V.R), nU = dot(N, V.U);
    return { K: K, aa: 0.5 * px * K, nB: dot(N, V.B), nR: nR, nU: nU, mR: dot(M, V.R), mU: dot(M, V.U),
             qB: dot(b.Q, V.B), qR: dot(b.Q, V.R), qU: dot(b.Q, V.U), eB: dot(b.E, V.B), eR: dot(b.E, V.R), eU: dot(b.E, V.U),
             mean: b.tex ? b.tex.mean : S.col, v0: S.radial[0], vk: 1 / (S.radial[1] - S.radial[0]) };
  }
  // The hole at (x, y), in ring radii from its middle: its light without the
  // clumps in hr, hg and hb, the light that takes the clumps from the map at
  // (hu, hv) in hf, and the shadow's cover, which it returns.
  var hr = 0, hg = 0, hb = 0, hu = 0, hv = 0, hf = 0;
  function holeAt(Hs, x, y) {
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
  function drawHole(b) {
    var al = b.alpha, rp = b.rp, gc = b.S.glowCol, r, c, k;
    if (al < 0.02) return;
    var far = 1 - smoothstep(1.5 * ch, 5 * ch, rp);
    if (far > 0.01) {
      // the glow: a soft spot the size of the dot
      var wg = Math.max(0.4 * b.rd, 0.45 * ch), reach = 3.5 * wg, amp = 0.55 * far * al;
      var g0 = clamp(Math.floor((b.sx - reach) / cw), 0, cols), g1 = clamp(Math.ceil((b.sx + reach) / cw), 0, cols);
      var h0 = clamp(Math.floor((b.sy - reach) / ch), 0, rows), h1 = clamp(Math.ceil((b.sy + reach) / ch), 0, rows);
      for (r = h0; r < h1; r++) for (c = g0; c < g1; c++) for (k = 0; k < 6; k++) {
        var dx = sampleX(c, k) - b.sx, dy = sampleY(r, k) - b.sy, v = amp * Math.exp(-(dx * dx + dy * dy) / (2 * wg * wg));
        if (v > 0.004) addBase((r * cols + c) * 6 + k, v * gc[0], v * gc[1], v * gc[2]);
      }
    }
    if (far > 0.99) return;
    if (!b.tex) b.tex = Sf.texture(b.key);
    // the map's level: about one texel a sample round the ring
    b.lvl = clamp(Math.floor(Math.log2(b.tex.w * ch / (3 * TAU * rp)) + 0.35 + tune.mipBias), 0, b.tex.levels.length - 1);
    // While the camera moves or the clock runs fast, a hole more than a
    // dozen rows tall is sampled down the middle of each cell only, as a
    // large body is, and drawn in full once both stop.
    var coarse = quick() && rp > 6 * ch, kStep = coarse ? 2 : 1;
    if (coarse) coarseDrawn = true;
    var A = al * (1 - far), inv = 1 / rp, Hs = holeSetup(b, view, ch / 3 * inv), ext = HOLE_REACH * rp + Math.max(cw, ch);
    var c0 = clamp(Math.floor((b.sx - ext) / cw), 0, cols), c1 = clamp(Math.ceil((b.sx + ext) / cw), 0, cols);
    var r0 = clamp(Math.floor((b.sy - ext) / ch), 0, rows), r1 = clamp(Math.ceil((b.sy + ext) / ch), 0, rows);
    for (r = r0; r < r1; r++) for (c = c0; c < c1; c++) {
      var cell = r * cols + c, occ = cOcc[cell], wrote = 0;
      for (k = 0; k < 6; k += kStep) {
        var i = cell * 6 + k, x = ((coarse ? (c + 0.5) * cw : sampleX(c, k)) - b.sx) * inv, y = (b.sy - sampleY(r, k)) * inv;
        if (x * x + y * y > HOLE_REACH * HOLE_REACH) continue;
        var sh = holeAt(Hs, x, y) * A;
        var f = hf * A;
        if (sh < 0.002 && f === 0 && hr + hg + hb < 0.003) continue;
        // what lies behind keeps its texture unless the shadow hides it
        if (dK[i] && (sh > 0 || f > 0)) { if (sh > 0.999) dK[i] = 0; else freeze(i); }
        bR[i] = bR[i] * (1 - sh) + hr * A; bG[i] = bG[i] * (1 - sh) + hg * A; bB[i] = bB[i] * (1 - sh) + hb * A;
        if (f > 0) { dK[i] = b.i + 1; dU[i] = hu; dV[i] = hv; dF[i] = f; }
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

  // move a sample's live texture term into its static part
  function freeze(i) {
    var b = bodies[dK[i] - 1];
    surface(b, dU[i], dV[i]);
    var f = dF[i];
    bR[i] += sr * f; bG[i] += sg * f; bB[i] += sb * f;
    dK[i] = 0;
  }

  function rasterBody(b) {
    var rd = b.rd, inv = 1 / rd, cx = b.sx, cy = b.sy, Rg = b.ring, S = b.S;
    var ext = b.ext;
    var c0 = clamp(Math.floor((cx - ext) / cw), 0, cols), c1 = clamp(Math.ceil((cx + ext) / cw), 0, cols);
    var r0 = clamp(Math.floor((cy - ext) / ch), 0, rows), r1 = clamp(Math.ceil((cy + ext) / ch), 0, rows);
    if (c0 >= c1 || r0 >= r1) return;

    // camera and light in the body frame (Q, E, N)
    var Q = b.Q, Eb = b.E, N = b.N, R = view.R, U = view.U, B = view.B;
    var Rx = dot(R, Q), Ry = dot(R, Eb), Rz = dot(R, N);
    var Ux = dot(U, Q), Uy = dot(U, Eb), Uz = dot(U, N);
    var Bx = dot(B, Q), By = dot(B, Eb), Bz = dot(B, N);
    var star = S.kind === 'star';
    var Ld = star ? [0, 0, 1] : lightDir(b);
    var Lx = dot(Ld, Q), Ly = dot(Ld, Eb), Lz = dot(Ld, N);
    // ellipsoid: scale its axes to a unit sphere (a planet's polar axis, or
    // all three for Halley's elongated nucleus)
    var sh = S.shape, kx = sh ? 1 / sh[0] : 1, ky = sh ? 1 / sh[1] : 1, ci = 1 / ((sh ? sh[2] : 1) * (1 - b.f));
    var rx = Rx * kx, ry = Ry * ky, rz = Rz * ci, ux = Ux * kx, uy = Uy * ky, uz = Uz * ci, bx = Bx * kx, by = By * ky, bz = Bz * ci;
    var A = bx * bx + by * by + bz * bz;
    var RB = rx * bx + ry * by + rz * bz, UB = ux * bx + uy * by + uz * bz;
    var RR = rx * rx + ry * ry + rz * rz, UU = ux * ux + uy * uy + uz * uz, RU = rx * ux + ry * uy + rz * uz;
    var sampleR = Math.max(cw * 0.5, ch / 3) * inv, aa = 1.25 * sampleR;
    // light direction across the screen, for the limb glow
    var lsx = dot(Ld, R), lsy = dot(Ld, U), lsl = Math.sqrt(lsx * lsx + lsy * lsy) || 1;
    lsx /= lsl; lsy /= lsl;
    var glowAmt = S.glow && b.rp > 24 ? S.glow : 0, gW = 0.014;
    var hz = S.haze || 0, hc = S.hazeCol || [1, 1, 1];
    var limbK = S.limb != null ? S.limb : 0.58;
    var expo = S.exposure || 1;
    var ringLight = Rg ? clamp(0.45 + Math.abs(Lz) * 1.6, 0, 1.05) : 0;
    var litFace = Rg ? (Bz >= 0) === (Lz >= 0) : false;
    var Bh = Math.sqrt(Bx * Bx + By * By) || 1;
    // the ring plane, seen at all, and what stays the same across it: where
    // a ray meets it, how much a sample's footprint stretches along it, and
    // the light's path through the planet for its shadow on the rings
    var ringOn = !!Rg && Math.abs(Bz) > 1e-4, iBz = 1 / Bz, iBh = 1 / Bh, stretch = 1 / (Bz * Bz) - 1;
    var in2 = Rg ? Rg.inner * Rg.inner : 0, out2 = Rg ? Rg.outer * Rg.outer : 0, ia3 = 1 / (Lx * Lx + Ly * Ly + Lz * ci * Lz * ci);
    var alpha = b.alpha;
    // texture or flat colour
    var useTex = b.rp >= 3 && !b.model;
    if (useTex && !b.tex) b.tex = Sf.texture(b.key);
    if (useTex && S.clouds && !b.clouds) b.clouds = Sf.texture(S.clouds);
    b.dyn = useTex;
    var mean = dotColour(b);
    if (useTex) {
      var perHalfTurn = Math.PI * rd / (ch / 3);
      b.lvl = clamp(Math.floor(Math.log2(b.tex.h / perHalfTurn) + 0.35 + tune.mipBias), 0, b.tex.levels.length - 1);
    }
    // eclipses: shadows of moons on their planet and of the planet on its moons,
    // kept only when the shadow cone actually reaches this body. Seen from a
    // body that moves (the Earth and the Moon carry their velocity), the
    // sunlight comes in tilted by up to 20" (aberration), which moves an
    // eclipse's shadow on the Earth by about 40 km.
    var shd = [], vel = b.vel;
    (SHADOWS[b.key] || []).forEach(function (k) {
      var o = byKey[k], C = o.pos, dC = Math.sqrt(dot(C, C)), A = [C[0] / dC, C[1] / dC, C[2] / dC];
      if (vel) A = norm([A[0] - vel[0] / LIGHT_AU_DAY, A[1] - vel[1] / LIGHT_AU_DAY, A[2] - vel[2] / LIGHT_AU_DAY]);
      var ku = (SUN_R - o.R) / dC, kp = (SUN_R + o.R) / dC;
      var rel = [b.pos[0] - C[0], b.pos[1] - C[1], b.pos[2] - C[2]], sAx = dot(rel, A);
      var perp = Math.sqrt(Math.max(0, dot(rel, rel) - sAx * sAx));
      if (sAx > 0 && perp < o.R + sAx * kp + b.R * 1.5) shd.push({ C: C, A: A, R: o.R, ku: ku, kp: kp });
    });
    if (!shd.length) shd = null;
    // While the camera moves or the clock runs fast, a body more than a
    // dozen rows tall is sampled down the middle of each cell only, and each
    // sample stands in for the one beside it. That halves the cost of a
    // planet that fills the screen, and the full picture is drawn again once
    // both stop.
    var coarse = quick() && rd > 6 * ch, kStep = coarse ? 2 : 1;
    if (coarse) coarseDrawn = true;

    for (var r = r0; r < r1; r++) {
      for (var c = c0; c < c1; c++) {
        var cell = r * cols + c, occ = cOcc[cell], wrote = 0;
        for (var k = 0; k < 6; k += kStep) {
          var i = cell * 6 + k;
          var x = ((coarse ? (c + 0.5) * cw : sampleX(c, k)) - cx) * inv, y = (cy - sampleY(r, k)) * inv;
          // ray against the ellipsoid
          var bq = x * RB + y * UB;
          var cq = x * x * RR + 2 * x * y * RU + y * y * UU - 1;
          var disc = bq * bq - A * cq;
          var rho = Math.sqrt(Math.max(0, 1 - disc / A));
          var cov = 0, th = -1e9, P = 0, Pr = 0, Pg = 0, Pb = 0, LF = 0, u = 0, v = 0;
          if (rho < 1 + aa) {
            cov = clamp((1 - rho) / aa + 0.5, 0, 1) * alpha;
            var tq = disc > 0 ? (-bq + Math.sqrt(disc)) / A : -bq / A;
            var hx = x * rx + y * ux + tq * bx, hy = x * ry + y * uy + tq * by, hzz = x * rz + y * uz + tq * bz;
            if (disc <= 0) { var hl = 1 / Math.sqrt(hx * hx + hy * hy + hzz * hzz); hx *= hl; hy *= hl; hzz *= hl; }
            th = tq;
            var nx = hx * kx, ny = hy * ky, nz = hzz * ci, nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
            nx *= nl; ny *= nl; nz *= nl;
            var mu0 = nx * Lx + ny * Ly + nz * Lz, mu = Math.max(nx * Bx + ny * By + nz * Bz, 0);
            u = (Math.atan2(hy, hx) / TAU) + 0.5;
            v = 0.5 - Math.asin(clamp(hzz, -1, 1)) / Math.PI;
            var hazeAdd = 0;
            if (star) {
              LF = (1 - 0.62 * (1 - Math.sqrt(mu))) * expo;
            } else {
              var lit;
              if (S.kind === 'rock') {
                var ls = mu0 > 0 ? 2 * mu0 / (mu0 + mu + 1e-4) : 0;
                lit = smoothstep(-0.03, 0.06, mu0) * (0.55 * Math.min(ls, 1.6) + 0.45 * Math.max(mu0, 0));
              } else if (S.kind === 'gas') {
                lit = smoothstep(-0.07, 0.10, mu0) * litAt(litGas, mu0 > 0 ? mu0 : 0) * (1 - limbK + limbK * Math.sqrt(mu));
              } else {
                lit = smoothstep(-0.05, 0.08, mu0) * litAt(litCloud, mu0 > 0 ? mu0 : 0) * (0.82 + 0.18 * Math.sqrt(mu));
              }
              // shadow of the rings on the clouds, on the day side
              if (Rg && Lz !== 0 && lit > 0) {
                var sx2 = -hzz * (1 - b.f) / Lz;
                if (sx2 > 0) {
                  var qx = hx + sx2 * Lx, qy = hy + sx2 * Ly, rq = Math.sqrt(qx * qx + qy * qy);
                  if (rq > Rg.inner && rq < Rg.outer) lit *= 1 - ringOp(Rg, rq, sampleR * 2) * 0.88;
                }
              }
              // eclipse
              var ecl = 1, red = 0;
              if (shd) {
                var hwx = b.pos[0] + b.R * (hx / kx * Q[0] + hy / ky * Eb[0] + hzz / ci * N[0]);
                var hwy = b.pos[1] + b.R * (hx / kx * Q[1] + hy / ky * Eb[1] + hzz / ci * N[1]);
                var hwz = b.pos[2] + b.R * (hx / kx * Q[2] + hy / ky * Eb[2] + hzz / ci * N[2]);
                for (var si = 0; si < shd.length; si++) {
                  var sd = shd[si], wx = hwx - sd.C[0], wy = hwy - sd.C[1], wz = hwz - sd.C[2];
                  var sa = wx * sd.A[0] + wy * sd.A[1] + wz * sd.A[2];
                  if (sa <= 0) continue;
                  var pp = Math.sqrt(Math.max(0, wx * wx + wy * wy + wz * wz - sa * sa));
                  var ru = sd.R - sa * sd.ku, rpn = sd.R + sa * sd.kp;
                  ecl *= smoothstep(Math.max(ru, 0) - sd.R * 0.02, rpn, pp);
                  // sunlight bent through the Earth's air lights the Moon red
                  // inside the umbra, dimmest at the middle and brighter
                  // toward the edge. It is far brighter here than in the sky,
                  // so that a totally eclipsed Moon still gets characters.
                  if (b.key === 'moon' && ru > 0) {
                    var uu = pp / ru;
                    red = Math.max(red, uu < 1 ? 0.22 + 0.25 * uu * uu : 0.47 * (1 - smoothstep(1, 1.5, uu)));
                  }
                }
              }
              if (hz) { var om = 1 - mu; hazeAdd = hz * om * om * om * smoothstep(-0.25, 0.45, mu0) * ecl; }
              LF = (lit * ecl + 0.012) * expo;
              if (red) { Pr += 1.0 * red * smoothstep(-0.1, 0.2, mu0 + 0.3); Pg += 0.28 * red; Pb += 0.12 * red; }
            }
            Pr += hc[0] * hazeAdd; Pg += hc[1] * hazeAdd; Pb += hc[2] * hazeAdd;
            P = 1;
          }
          // ring plane
          var rA = 0, rr_ = 0, rg_ = 0, rb_ = 0, tr = -1e9;
          if (ringOn) {
            tr = -(x * Rz + y * Uz) * iBz;
            var px = x * Rx + y * Ux + tr * Bx, py = x * Ry + y * Uy + tr * By, rr2 = px * px + py * py;
            // a ring behind a sample the planet covers completely is not seen
            if (rr2 > in2 && rr2 < out2 && !(P && cov >= 1 && tr <= th)) {
              var rr = Math.sqrt(rr2), cphi = (px * Bx + py * By) * iBh / rr;
              ringSpan(Rg, rr, Math.min(sampleR * Math.sqrt(1 + cphi * cphi * stretch), 0.6));
              var op = spanMean(Rg.cOp);
              if (op > 0.0005) {
                // the planet's shadow across the rings
                var b3 = px * Lx + py * Ly, sh = 1;
                if (b3 < 0) sh = smoothstep(0.965, 1.02, Math.sqrt(Math.max(0, rr2 - b3 * b3 * ia3)));
                var lt = ringLight * (0.10 + 0.90 * sh) * alpha;
                rA = op * alpha;
                if (litFace) { rr_ = spanMean(Rg.cR) * lt; rg_ = spanMean(Rg.cG) * lt; rb_ = spanMean(Rg.cB) * lt; }
                else { var uu = spanMean(Rg.cU) * lt; rr_ = uu * Rg.meanCol[0]; rg_ = uu * Rg.meanCol[1]; rb_ = uu * Rg.meanCol[2]; }
              }
            }
          }
          // a thin bright rim of atmosphere just past the lit limb, too faint
          // to count past 12 of its widths
          var glow = 0;
          if (glowAmt && rho > 1 && rho < 1 + 12 * gW) {
            var ll = (x * lsx + y * lsy) / rho + 0.1;
            if (ll > 0) glow = Math.exp(-(rho - 1) / gW) * Math.min(ll, 1) * glowAmt * alpha;
          }
          if (!cov && !rA && glow < 0.002) continue;

          // what lies behind keeps its texture unless this body hides it completely
          if (dK[i] && (cov > 0 || rA > 0)) { if (P && cov >= 1) dK[i] = 0; else freeze(i); }
          var ringFront = rA > 0 && (!P || tr > th);
          // underlay: what lies behind this body, then a ring behind the planet
          var Ur = bR[i], Ug = bG[i], Ub = bB[i];
          if (rA > 0 && !ringFront) { Ur = Ur * (1 - rA) + rr_; Ug = Ug * (1 - rA) + rg_; Ub = Ub * (1 - rA) + rb_; }
          Ur += glow * hc[0]; Ug += glow * hc[1]; Ub += glow * hc[2];
          var fa = ringFront ? rA : 0, keep = 1 - fa;
          if (P) {
            bR[i] = (Ur * (1 - cov) + Pr * cov) * keep + (ringFront ? rr_ : 0);
            bG[i] = (Ug * (1 - cov) + Pg * cov) * keep + (ringFront ? rg_ : 0);
            bB[i] = (Ub * (1 - cov) + Pb * cov) * keep + (ringFront ? rb_ : 0);
            var f = LF * cov * keep;
            if (useTex) { dK[i] = b.i + 1; dU[i] = u; dV[i] = v; dF[i] = f; }
            else { bR[i] += mean[0] * f; bG[i] += mean[1] * f; bB[i] += mean[2] * f; }
          } else {
            bR[i] = Ur * keep + (ringFront ? rr_ : 0);
            bG[i] = Ug * keep + (ringFront ? rg_ : 0);
            bB[i] = Ub * keep + (ringFront ? rb_ : 0);
          }
          var o2 = Math.max(cov, rA);
          if (o2 > occ) occ = o2;
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
  }

  /* ------------------------------------------------------------------------
     Spacecraft: a model (surfaces.js) ray-cast at its real size, in metres
     in the model's frame. Each sample casts four rays once the camera is
     still (one while it moves). A ray keeps every part it passes, nearest
     last, so a boom thinner than a sample covers only part of it. Parts
     shade one another from the Sun, and a faint light from the camera's side
     keeps the shaded side readable.
     ------------------------------------------------------------------------ */
  // while the camera moves or the clock runs faster or slower than real,
  // every frame is drawn anew, so the large things in it are drawn at half
  // their samples. A stopped clock (warp 0) counts as still.
  function quick() { return camMoving || (warp !== 1 && warp !== 0); }
  var coarseDrawn = false, cellAt = new Int32Array(0), cellPos = new Int32Array(0), cellIds = new Int16Array(0);
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
  // in sr, sg, sb. Only the hits that show are shaded.
  function craftRay(parts, ids, i0, i1, ox, oy, oz, d, L, px) {
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
    sr = r; sg = g; sb = b;
    return acc;
  }

  function rasterCraft(b) {
    var M = b.model, grow = smoothstep(ch * 0.5, ch * 2, b.rp), al = b.alpha, dotA = 1 - smoothstep(ch * 1.5, ch * 4, b.rp);
    // far off it is a dot, which fades once the model has grown big enough to read
    if (dotA > 0) {
      var rd = b.rd;
      b.rd = Math.min(rd, b.minR * ch); b.alpha = al * dotA;
      rasterBody(b);
      b.rd = rd; b.alpha = al;
    }
    if (grow <= 0) return;
    // screen, light and the camera in the model's frame; m: metres per device pixel
    var m = AU_KM * 1000 / (view.k * b.shrink), Q = b.Q, Eb = b.E, N = b.N;
    var R = [dot(view.R, Q) * m, dot(view.R, Eb) * m, dot(view.R, N) * m], U = [dot(view.U, Q) * m, dot(view.U, Eb) * m, dot(view.U, N) * m];
    var d = [dot(view.B, Q), dot(view.B, Eb), dot(view.B, N)];
    var Ls = lightDir(b), L = [dot(Ls, Q), dot(Ls, Eb), dot(Ls, N)];
    var ext = b.reach * view.k * b.shrink + Math.max(cw, ch);
    var c0 = clamp(Math.floor((b.sx - ext) / cw), 0, cols), c1 = clamp(Math.ceil((b.sx + ext) / cw), 0, cols);
    var r0 = clamp(Math.floor((b.sy - ext) / ch), 0, rows), r1 = clamp(Math.ceil((b.sy + ext) / ch), 0, rows);
    var fine = !quick(), n = fine ? 4 : 1, ax = cw / 8, ay = ch / 12;
    var px = (fine ? Math.max(cw / 4, ch / 6) : Math.max(cw / 2, ch / 3)) * m;
    if (!fine) coarseDrawn = true;
    var parts = M.parts, A = al * grow;
    // the parts that can reach each cell, from their outlines on the screen,
    // so most cells cast no rays at all
    var gw = c1 - c0, gh = r1 - r0, pad = 0.5 * Math.sqrt(cw * cw + ch * ch) + px / m;
    if (gw <= 0 || gh <= 0) return;
    if (cellAt.length < gw * gh + 1) cellAt = new Int32Array(gw * gh + 1);
    cellAt.fill(0, 0, gw * gh + 1);
    var outl = parts.map(function (P) {
      var a = P.p || P.bs, z = P.q || P.bs, rr = (P.p ? P.r : P.bs[3]) / m + pad;
      var ax0 = b.sx + (a[0] * R[0] + a[1] * R[1] + a[2] * R[2]) / (m * m), ay0 = b.sy - (a[0] * U[0] + a[1] * U[1] + a[2] * U[2]) / (m * m);
      var ax1 = b.sx + (z[0] * R[0] + z[1] * R[1] + z[2] * R[2]) / (m * m), ay1 = b.sy - (z[0] * U[0] + z[1] * U[1] + z[2] * U[2]) / (m * m);
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
    for (var r = r0; r < r1; r++) {
      for (var c = c0; c < c1; c++) {
        var cell = r * cols + c, occ = cOcc[cell], gc = (r - r0) * gw + c - c0, i0 = cellAt[gc], i1 = cellAt[gc + 1];
        if (i0 === i1) continue;
        for (var k = 0; k < 6; k++) {
          var i = cell * 6 + k, x0 = sampleX(c, k) - b.sx, y0 = b.sy - sampleY(r, k), cov = 0, cr = 0, cg = 0, cb = 0;
          for (var j = 0; j < n; j++) {
            var x = fine ? x0 + ((j & 1) ? ax : -ax) : x0, y = fine ? y0 + ((j & 2) ? ay : -ay) : y0;
            cov += craftRay(parts, cellIds, i0, i1, x * R[0] + y * U[0], x * R[1] + y * U[1], x * R[2] + y * U[2], d, L, px);
            cr += sr; cg += sg; cb += sb;
          }
          cov *= A / n;
          if (cov < 0.002) continue;
          if (dK[i]) freeze(i);
          var f = A / n;
          bR[i] = bR[i] * (1 - cov) + cr * f; bG[i] = bG[i] * (1 - cov) + cg * f; bB[i] = bB[i] * (1 - cov) + cb * f;
          if (cov > occ) occ = cov;
        }
        cOcc[cell] = occ;
      }
    }
  }

  var rebuildAt = 0, lastSig = null;
  var prof = stats.prof = {};
  function mark(k, t0) { var t1 = performance.now(); prof[k] = (prof[k] || 0) * 0.8 + (t1 - t0) * 0.2; return t1; }
  function rebuild() {
    stats.rebuilds++;
    var tp = performance.now();
    bR.fill(0); bG.fill(0); bB.fill(0); dK.fill(0); cOcc.fill(0);
    var F = byKey[cam.focus];
    layoutBodies();
    tp = mark('clear', tp);

    // orbits, the belts and the Moon's path fade in as the view widens
    var sc = Math.log(spanClose(F)), z = cam.z, sys = sysShown(z);
    var aOrb = smoothstep(sc + Math.log(1.3), sc + Math.log(6), z) * sys;
    if (aOrb > 0.01) {
      for (var p = 0; p < Eph.PLANETS.length; p++) {
        var key = Eph.PLANETS[p], el = Eph.orbit(key, simDate);
        var v = (key === cam.focus ? tune.orbitFocus : tune.orbit) * aOrb;
        if (key === cam.focus) drawOrbit(el, v * accentRGB[0] / 255, v * accentRGB[1] / 255, v * accentRGB[2] / 255);
        else drawOrbit(el, v * 0.78, v * 0.80, v * 0.86);
      }
    }
    // Halley's orbit and Parker Solar Probe's when in focus or under the pointer
    var aSys = smoothstep(Math.log(3), Math.log(12), z) * sys;
    for (var sk in Eph.SMALL) {
      if ((sk !== cam.focus && byKey[sk] !== hover) || byKey[sk].off) continue;
      var sv = tune.orbit * Math.max(aSys, aOrb) * 1.5, sc3 = sk === cam.focus ? accentRGB : colourOf(byKey[sk]);
      if (sv > tune.orbit * 0.03) drawSmallOrbit(Eph.SMALL[sk], sv * sc3[0] / 255, sv * sc3[1] / 255, sv * sc3[2] / 255);
    }
    var pv = (cam.focus === 'pluto' || byKey.pluto === hover ? 1.5 : 0.55) * tune.orbit * Math.max(aSys, cam.focus === 'pluto' ? aOrb : 0);
    if (pv > 0.004) {
      var plEl = Eph.orbit('pluto', simDate), pc3 = cam.focus === 'pluto' ? accentRGB : colourOf(byKey.pluto);
      if (cam.focus === 'pluto' || byKey.pluto === hover) drawOrbit(plEl, pv * pc3[0] / 255, pv * pc3[1] / 255, pv * pc3[2] / 255);
      else drawOrbit(plEl, pv * 0.75, pv * 0.78, pv * 0.86);
    }
    // the orbits of the stars round Sagittarius A*, while one of them or the
    // hole is in focus or under the pointer, until they are too small to see
    var aHole = smoothstep(Math.log(20), Math.log(120), z) * (1 - smoothstep(Math.log(2e5), Math.log(1e6), z));
    for (var hk in Eph.SGRA_STARS) {
      var hs = byKey[hk], hp = byKey[hs.parent];
      if (aHole < 0.01 || (cam.focus !== hk && cam.focus !== hp.key && hover !== hs && hover !== hp)) continue;
      var hv = tune.orbit * aHole * (cam.focus === hk ? 1.5 : 1), hc = cam.focus === hk ? accentRGB : colourOf(hs);
      drawCurve(Eph.sgraOrbit(hk, simDate), 0, TAU, 128, hv * hc[0] / 255, hv * hc[1] / 255, hv * hc[2] / 255);
    }
    var aMoon = smoothstep(Math.log(0.0012), Math.log(0.003), z) * (1 - smoothstep(Math.log(0.03), Math.log(0.08), z));
    if (aMoon > 0.01) drawMoonOrbit(aMoon);
    drawMoonOrbits();
    if (sys > 0.01) drawComets(sys);
    tp = mark('orbits', tp);
    var aBelt = smoothstep(Math.log(0.25), Math.log(1.4), z) * sys, aKuip = smoothstep(Math.log(6), Math.log(30), z) * sys;
    if (aBelt > 0.01 || aKuip > 0.01) drawMinor(aBelt, aKuip);
    tp = mark('minor', tp);
    var aGal = galShown(z);
    if (aGal > 0.01) { drawFar(aGal); tp = mark('far', tp); drawGalaxy(aGal); }
    tp = mark('galaxy', tp);
    drawStarGlows();

    // bodies, far to near
    var order = bodies.filter(function (b) { return b.vis; }).sort(function (a, b) { return a.depth - b.depth; });
    coarseDrawn = false;
    for (var i = 0; i < order.length; i++) {
      var b = order[i];
      b.W0 = b.W; b.rot = 0;
      if (b.model) rasterCraft(b); else if (b.S.kind === 'nebula') drawNebula(b); else if (b.S.kind === 'hole') drawHole(b); else rasterBody(b);
    }
    tp = mark('bodies', tp);

    buildStarCells();
    tp = mark('stars', tp);
    // the whole screen once, finding on the way which cells hold anything
    // and which need re-shading each frame
    if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);
    drawn = 0; nDyn = 0;
    for (var c = 0; c < nC; c++) {
      var has = 0, dyn = 0, o = c * 6;
      for (var k = 0; k < 6; k++) {
        if (dK[o + k]) dyn = 1;
        if (bR[o + k] + bG[o + k] + bB[o + k] > 0.003) has = 1;
      }
      cHas[c] = has || dyn;
      if (dyn) dynList[nDyn++] = c;
      drawCell(c);
    }
    stats.cells = drawn;
    mark('cells', tp);
    rebuildAt = performance.now();
    hudDirty = true;
    var Fb = byKey[cam.focus];
    stats.phase = Fb.S.kind === 'star' || Fb.S.kind === 'nebula' ? 1 : (1 + dot(lightDir(Fb), view.B)) / 2;
  }

  // a cheap fingerprint of the view, to tell when the cache is stale
  function signature() {
    // the target is measured from the body in focus: a spacecraft framed a
    // few metres wide moves many frame widths a second
    var F = byKey[cam.focus].pos;
    var s = [cam.z, cam.psi + cam.roll * 1.37, view.pitch, view.ax, view.ay, view.B[0], view.B[1], view.B[2], view.R[0], view.R[1], view.R[2],
             (view.T[0] - F[0]) / view.span, (view.T[1] - F[1]) / view.span, (view.T[2] - F[2]) / view.span];
    for (var i = 0; i < bodies.length; i++) {
      project(bodies[i].pos, tmp3); pullIn(tmp3);
      var near = tmp3[0] > -W && tmp3[0] < 2 * W && tmp3[1] > -H && tmp3[1] < 2 * H;
      s.push(near ? tmp3[0] * 0.25 : 0, near ? tmp3[1] * 0.25 : 0);
    }
    return s;
  }
  function sigChanged(a, b) {
    if (!a || !b || a.length !== b.length) return true;
    for (var i = 0; i < a.length; i++) {
      var tol = i < 11 ? 1e-5 : i < 14 ? 1e-4 : 0.05;
      if (Math.abs(a[i] - b[i]) > tol) return true;
    }
    return false;
  }

  /* ------------------------------------------------------------------------
     Glyph analysis
     ------------------------------------------------------------------------ */
  function glyphFont() { return fontWeight + ' ' + (fontPx * dpr) + 'px ' + fontFamily; }

  function analyseGlyphs() {
    var c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    var g = c.getContext('2d', { willReadFrequently: true });
    g.font = glyphFont();
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    var raw = new Float32Array(NG * 6), cov = new Float32Array(NG);
    var max = 0, i, k;
    for (i = 0; i < NG; i++) {
      g.clearRect(0, 0, cw, ch);
      g.fillStyle = '#fff';
      g.fillText(GLYPHS[i], cw / 2, ch / 2 + ch * 0.04);
      var d = g.getImageData(0, 0, cw, ch).data;
      for (k = 0; k < 6; k++) {
        var gx = k & 1, gy = k >> 1;
        var xa = Math.floor(gx * cw / 2), xb = Math.floor((gx + 1) * cw / 2);
        var ya = Math.floor(gy * ch / 3), yb = Math.floor((gy + 1) * ch / 3);
        var sum = 0, n = 0;
        for (var yy = ya; yy < yb; yy++) for (var xx = xa; xx < xb; xx++) { sum += d[(yy * cw + xx) * 4 + 3]; n++; }
        var v = n ? sum / n / 255 : 0;
        raw[i * 6 + k] = v; cov[i] += v / 6;
      }
    }
    shapeIdx = [];
    for (i = 0; i < NG; i++) if (SHAPE_SET.indexOf(GLYPHS[i]) >= 0) shapeIdx.push(i);
    SHAPE = new Float32Array(shapeIdx.length * 6);
    for (i = 0; i < shapeIdx.length; i++) for (k = 0; k < 6; k++) {
      var sv = raw[shapeIdx[i] * 6 + k]; SHAPE[i * 6 + k] = sv; if (sv > max) max = sv;
    }
    for (i = 0; i < SHAPE.length; i++) SHAPE[i] /= max;
    var ramp = [];
    for (i = 0; i < NG; i++) if (RAMP_SET.indexOf(GLYPHS[i]) >= 0) ramp.push(i);
    var maxCov = 0;
    for (i = 0; i < ramp.length; i++) if (cov[ramp[i]] > maxCov) maxCov = cov[ramp[i]];
    for (var m = 0; m < 256; m++) {
      var target = Math.pow(m / 255, tune.rampGamma), best = 0, bd = 1e9;
      for (i = 0; i < ramp.length; i++) {
        var dd = Math.abs(cov[ramp[i]] / maxCov - target);
        if (dd < bd) { bd = dd; best = ramp[i]; }
      }
      rampLUT[m] = best;
    }
    LUT.fill(-1);
  }

  function matchGlyph(key) {
    var cached = LUT[key];
    if (cached >= 0) return cached;
    var v0 = (key & 7) / Q7, v1 = ((key >> 3) & 7) / Q7, v2 = ((key >> 6) & 7) / Q7;
    var v3 = ((key >> 9) & 7) / Q7, v4 = ((key >> 12) & 7) / Q7, v5 = ((key >> 15) & 7) / Q7;
    var best = 0, bd = 1e9;
    for (var i = 0; i < shapeIdx.length; i++) {
      var o = i * 6;
      var e0 = SHAPE[o] - v0, e1 = SHAPE[o + 1] - v1, e2 = SHAPE[o + 2] - v2;
      var e3 = SHAPE[o + 3] - v3, e4 = SHAPE[o + 4] - v4, e5 = SHAPE[o + 5] - v5;
      var d = e0 * e0 + e1 * e1 + e2 * e2 + e3 * e3 + e4 * e4 + e5 * e5;
      if (d < bd) { bd = d; best = shapeIdx[i]; }
    }
    LUT[key] = best;
    return best;
  }

  function resetAtlas() {
    pages = [];
    rowReady.fill(0);
  }
  function ensureRow(row) {
    if (rowReady[row]) return;
    var p = row >> 5, pg = pages[p];
    if (!pg) { pg = pages[p] = document.createElement('canvas'); pg.width = cw * NG; pg.height = ch * 32; }
    var g = pg.getContext('2d');
    g.font = glyphFont();
    g.textBaseline = 'middle';
    g.textAlign = 'center';
    g.fillStyle = rgbStr(rowRGB(row));
    var y = (row & 31) * ch;
    for (var i = 0; i < NG; i++) {
      g.save();
      g.beginPath(); g.rect(i * cw, y, cw, ch); g.clip();
      g.fillText(GLYPHS[i], i * cw + cw / 2, y + ch / 2 + ch * 0.04);
      g.restore();
    }
    rowReady[row] = 1;
  }

  /* ------------------------------------------------------------------------
     Stars on the celestial sphere, with the Milky Way along the real
     galactic plane. They turn with the camera.
     ------------------------------------------------------------------------ */
  var STARS = null, starAt = null, starCells = [];
  function eqToEcl(ra, dec) {
    ra *= DEG; dec *= DEG;
    var x = Math.cos(dec) * Math.cos(ra), y = Math.cos(dec) * Math.sin(ra), z = Math.sin(dec), e = 23.4392911 * DEG;
    return [x, Math.cos(e) * y + Math.sin(e) * z, -Math.sin(e) * y + Math.cos(e) * z];
  }
  function buildStars() {
    STARS = [];
    var s = 0x9e3779b9;
    function rnd() { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return s / 4294967296; }
    var GNP = eqToEcl(192.85948, 27.12825), GC = eqToEcl(266.405, -28.936);
    function gi(chr) { return GLYPHS.indexOf(chr); }
    var tries = 0;
    while (STARS.length < 5200 && tries++ < 60000) {
      var z = rnd() * 2 - 1, a = rnd() * TAU, q = Math.sqrt(1 - z * z), d = [q * Math.cos(a), q * Math.sin(a), z];
      var bLat = Math.asin(clamp(dot(d, GNP), -1, 1)) / DEG, gcA = Math.acos(clamp(dot(d, GC), -1, 1)) / DEG;
      var band = Math.exp(-Math.pow(bLat / 10, 2)), bulge = Math.exp(-Math.pow(gcA / 22, 2));
      var dust = band * (0.55 + 0.45 * Sf.fbm(a * 3, z * 9, 256, 3)) + bulge * 0.8;
      var p = rnd(), st = null;
      if (p < 0.16 + dust * 0.22) {
        var m = Math.pow(rnd(), 3.2);
        var glyph = m > 0.82 ? '*' : m > 0.55 ? '+' : m > 0.25 ? (rnd() < 0.5 ? "'" : '.') : (rnd() < 0.7 ? '.' : '`');
        var hue = rnd();
        st = { d: d, g: gi(glyph), row: hue < 0.7 ? 0 : hue < 0.86 ? ROW_STAR_B : ROW_STAR_W,
               a: 0.25 + 0.75 * m, tw: 0.5 + rnd() * 2.5, ph: rnd() * TAU, amp: m > 0.25 ? 0.35 : 0.15 };
      } else if (dust > 0.3 && rnd() < dust * 0.5) {
        st = { d: d, g: gi(rnd() < 0.6 ? '.' : ','), row: ROW_STAR_W, a: 0.06 + dust * 0.10, tw: 0, ph: 0, amp: 0 };
      }
      if (st && st.g > 0) STARS.push(st);
    }
  }
  // Over the galaxy a sky of its own twinkles in the empty space round it.
  // These stars are made like the ones above but spread evenly, since the
  // band of the Milky Way is not there to see from outside it, and brighter,
  // as the characters over the galaxy are smaller. They thin out toward the
  // middle of the galaxy's disc, each from its own distance, so the sky
  // and the disc run into each other with no edge between them.
  var GSTARS = null;
  function buildGalStars() {
    GSTARS = [];
    var s = 0x51f15e7d;
    function rnd() { s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return s / 4294967296; }
    function gi(chr) { return GLYPHS.indexOf(chr); }
    for (var i = 0; i < 7000; i++) {
      var z = rnd() * 2 - 1, a = rnd() * TAU, q = Math.sqrt(1 - z * z), m = Math.pow(rnd(), 1.9), hue = rnd();
      var glyph = m > 0.8 ? '*' : m > 0.5 ? '+' : m > 0.22 ? (rnd() < 0.5 ? "'" : '.') : (rnd() < 0.7 ? '.' : '`');
      var st = { d: [q * Math.cos(a), q * Math.sin(a), z], g: gi(glyph), row: hue < 0.7 ? 0 : hue < 0.86 ? ROW_STAR_B : ROW_STAR_W,
                 a: 0.5 + 0.6 * m, tw: 0.5 + rnd() * 2.5, ph: rnd() * TAU, amp: m > 0.22 ? 0.4 : 0.2, cut: rnd() };
      if (st.g > 0) GSTARS.push(st);
    }
  }
  // how much of each sky shows: the one above fades out as the galaxy comes
  // in, and the galaxy's own fades in
  var starFade = 1, gStarFade = 0;
  function starOf(k) { return k <= STARS.length ? STARS[k - 1] : GSTARS[k - 1 - STARS.length]; }
  function placeStars(list, base, offDisc) {
    var f = 0.95 * H, R = view.R, U = view.U, B = view.B, mask = offDisc && Math.abs(dot(B, GAL.z)) > 0.05;
    for (var i = 0; i < list.length; i++) {
      var d = list[i].d, zc = -(d[0] * B[0] + d[1] * B[1] + d[2] * B[2]);
      if (zc < 0.1) continue;
      var x = W / 2 + f * (d[0] * R[0] + d[1] * R[1] + d[2] * R[2]) / zc;
      var y = H / 2 - f * (d[0] * U[0] + d[1] * U[1] + d[2] * U[2]) / zc;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (mask) { var gp = galAt(x, y); if (smoothstep(4, 19, Math.sqrt(gp[0] * gp[0] + gp[1] * gp[1])) < list[i].cut) continue; }
      var cell = ((y / ch) | 0) * cols + ((x / cw) | 0);
      var cur = starAt[cell];
      if (cur && starOf(cur).a >= list[i].a) continue;
      if (!cur) starCells.push(cell);
      starAt[cell] = base + i + 1;
    }
  }
  function buildStarCells() {
    if (!STARS) buildStars();
    starAt.fill(0);
    starCells = [];
    starFade = starsShown(cam.z);
    gStarFade = galShown(cam.z);
    if (starFade >= 0.01) placeStars(STARS, 0, false);
    if (gStarFade >= 0.01) { if (!GSTARS) buildGalStars(); placeStars(GSTARS, STARS.length, true); }
  }
  function starState(cell) {
    var si = starAt[cell];
    if (!si) return 0;
    var st = starOf(si), fade = si <= STARS.length ? starFade : gStarFade;
    var a = st.a * fade * (1 - st.amp + (reduced ? st.amp : st.amp * Math.sin(t * st.tw + st.ph)));
    var aq = Math.round(clamp(a, 0, 1) * 63);
    return aq ? (st.g | (st.row << 7) | (aq << 15)) : 0;
  }

  /* ------------------------------------------------------------------------
     Other galaxies, far behind the Milky Way once it is in view. They are
     made up, a deep field of every kind: spirals with two or three arms,
     barred spirals, patchy spirals with no clear arms, lenticulars with a
     smooth disc, ring galaxies, ellipticals and irregulars. Each has its own
     colours, and the young ones have pink knots where stars are forming.
     Seen edge-on, a disc shows a dark lane of dust along its middle. Some
     sit in small groups round a large elliptical. Like the stars they are
     placed by direction, so they turn with the camera, and the Milky Way's
     disc hides those behind it.
     ------------------------------------------------------------------------ */
  // types
  var SPIRAL = 0, BARRED = 1, ELLIPTICAL = 2, IRREGULAR = 3, LENTICULAR = 4, RING = 5, PATCHY = 6;
  var FAR = null;
  // A few large ones are set where the empty sky beside the Milky Way is
  // when the camera first looks down on it: [across, up] from the middle of
  // the screen in units of its focal length, size in radians, how far the
  // disc tips from face-on in degrees, which way its axis leans, and type.
  var FAR_SET = [[-0.56, 0.28, 0.13, 28, 40, SPIRAL], [0.62, 0.3, 0.11, 84, 160, SPIRAL], [-0.62, -0.36, 0.085, 52, 250, BARRED],
                 [-0.36, 0.42, 0.05, 0, 0, ELLIPTICAL], [0.4, 0.42, 0.045, 40, 100, IRREGULAR]];
  function buildFar() {
    FAR = [];
    var s = 0x7a3c19e1, X = GAL.x, Y = GAL.y, Z = GAL.z, i, j, k, tries;
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
  var FAR_KNOT = [1.0, 0.42, 0.68];
  // A disc with axis n, seen by a camera with right R and up U, shows as an
  // ellipse whose long axis lies at pa on the screen. L is that axis in
  // space, and M the way across the disc that its short axis shows.
  function farAxes(n, R, U) {
    var pa = Math.atan2(-dot(n, U), dot(n, R)) + Math.PI / 2, c = Math.cos(pa), s = Math.sin(pa);
    var L = [c * R[0] - s * U[0], c * R[1] - s * U[1], c * R[2] - s * U[2]], M = cross(n, L);
    if (-s * dot(M, R) - c * dot(M, U) < 0) M = [-M[0], -M[1], -M[2]];
    return { pa: pa, L: L, M: M };
  }
  // Each one's face-on look is worked out once, the first time it is on
  // screen: its light on a small grid across its disc, and its pink knots
  // on another. The bulge is added on the screen instead, so it stays round
  // however the disc is tipped.
  var FAR_N = 40;
  function farSprite(G) {
    var n = FAR_N, I = new Float32Array(n * n), K = new Float32Array(n * n), sd = G.seed, ty = G.type;
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) {
      var u = (x + 0.5) / n * 2.2 - 1.1, v = (y + 0.5) / n * 2.2 - 1.1, rr = Math.sqrt(u * u + v * v), L = 0, kn = 0;
      if (rr > 1.1) continue;
      var th = Math.atan2(v, u), wind = th - G.tw * Math.log(rr + 0.04);
      var grain = Sf.noise2(u * 9 + sd, v * 9 + sd + 40, 256);
      if (ty === ELLIPTICAL) L = 1.6 * Math.exp(-6 * Math.pow(rr, 0.7));
      else if (ty === LENTICULAR) L = 1.1 * Math.exp(-rr / 0.22);
      else if (ty === IRREGULAR) {
        L = Math.exp(-rr / 0.3) * clamp(0.4 + 1.2 * Sf.noise2(u * 5 + sd, v * 5 + sd, 256), 0, 1.4);
        kn = smoothstep(0.2, 0.55, grain) * Math.exp(-rr / 0.45);
      } else if (ty === RING) {
        var ring = Math.exp(-Math.pow((rr - 0.62) / 0.09, 2)) * (0.7 + 0.6 * Sf.noise2((th / TAU) * 10 + sd, sd, 10));
        L = 0.95 * ring + 0.12 * Math.exp(-rr / 0.3);
        kn = ring * smoothstep(0.15, 0.5, grain);
      } else if (ty === PATCHY) {
        var p = 0.5 + 0.5 * Sf.noise2((wind / TAU) * 14 + sd, rr * 5 + sd, 14);
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
  function drawFar(al) {
    if (!FAR) buildFar();
    var f = 0.95 * H, R = view.R, U = view.U, B = view.B, bz = Math.abs(dot(B, GAL.z)), n = FAR_N, sc = n / 2.2;
    for (var gi = 0; gi < FAR.length; gi++) {
      var G = FAR[gi], d = G.d, zc = -dot(d, B);
      if (zc < 0.2) continue;
      var cx = W / 2 + f * dot(d, R) / zc, cy = H / 2 - f * dot(d, U) / zc, rp = f * G.size / zc;
      if (rp < 2.5 || cx + rp < 0 || cx - rp > W || cy + rp < 0 || cy - rp > H) continue;
      // behind the Milky Way's disc it is hidden, as by the disc's own light and dust
      var hide = 1;
      if (bz > 0.05) { var gp = galAt(cx, cy); hide = smoothstep(12, 17, Math.sqrt(gp[0] * gp[0] + gp[1] * gp[1])); }
      var a = al * hide * G.bright;
      if (a < 0.01) continue;
      if (!G.img) G.img = farSprite(G);
      var ty = G.type, round = ty === ELLIPTICAL, disc = ty === SPIRAL || ty === BARRED || ty === PATCHY || ty === LENTICULAR;
      // The disc's axis seen from the camera sets how flat it looks and which
      // way it lies. Its picture is laid on the disc's own axes, so its arms
      // stay put on it as the camera turns, rather than turning with the
      // long axis of the ellipse, which swings round fast on a disc seen
      // nearly face on.
      var nz = Math.abs(dot(G.n, B)), Ax = farAxes(G.n, R, U);
      var q = round ? G.q : ty === IRREGULAR ? Math.max(nz, 0.45) : Math.max(nz, 0.1);
      var pa = Ax.pa, ca = Math.cos(pa) / rp, sa = Math.sin(pa) / rp, iq = 1 / q;
      var l1 = dot(Ax.L, G.e1), l2 = dot(Ax.L, G.e2), m1 = dot(Ax.M, G.e1), m2 = dot(Ax.M, G.e2);
      // seen nearly edge-on, a disc's dust shows as a dark lane along it
      var lane = disc && q < 0.45 ? 0.85 * (1 - q / 0.45) : 0, bulge = ty === LENTICULAR ? 1.7 : ty === RING ? 0.7 : disc ? 1.4 : 0;
      var ext = rp * 1.15, I = G.img.I, K = G.img.K, core = G.core, arm = G.arm;
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

  /* ------------------------------------------------------------------------
     Drawing the grid on the GPU. Each cell's glyph, colour row and opacity
     are kept in a texture one texel per cell, and one pass of a fragment
     shader draws every character from a texture of the glyphs and one of
     the palette. That costs the same however many characters change. A
     browser without WebGL gets the 2D canvas, which draws changed cells one
     at a time from an atlas of glyph images.
     ------------------------------------------------------------------------ */
  var gl = null, glProg = null, glTex = null, glBytes = null, glDirty = false, glLoc = null;
  var GL_VS = 'attribute vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }';
  var GL_FS = [
    'precision highp float;',
    'uniform sampler2D uState, uGlyphs, uPal;',
    'uniform vec2 uCell, uGrid; uniform float uH, uNG;',
    'void main() {',
    '  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y), cell = floor(p / uCell);',
    '  vec4 s = texture2D(uState, (cell + 0.5) / uGrid);',
    '  if (s.b == 0.0) { gl_FragColor = vec4(0.0); return; }',
    '  vec2 local = p - cell * uCell;',
    '  float glyph = floor(s.r * 255.0 + 0.5);',
    '  float m = texture2D(uGlyphs, vec2((glyph * uCell.x + local.x) / (uNG * uCell.x), local.y / uCell.y)).a;',
    '  vec3 col = texture2D(uPal, vec2((floor(s.g * 255.0 + 0.5) + 0.5) / 256.0, 0.5)).rgb;',
    '  float a = m * s.b * (255.0 / 252.0);',
    '  gl_FragColor = vec4(col * a, a);',
    '}'].join('\n');
  function glStart() {
    var g = null;
    try { g = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false }); } catch (e) { g = null; }
    if (!g) return false;
    var hp = g.getShaderPrecisionFormat(g.FRAGMENT_SHADER, g.HIGH_FLOAT);
    if (!hp || hp.precision < 20) return false;
    function sh(type, src) { var o = g.createShader(type); g.shaderSource(o, src); g.compileShader(o); return g.getShaderParameter(o, g.COMPILE_STATUS) ? o : null; }
    var vs = sh(g.VERTEX_SHADER, GL_VS), fs = sh(g.FRAGMENT_SHADER, GL_FS);
    if (!vs || !fs) return false;
    var pr = g.createProgram();
    g.attachShader(pr, vs); g.attachShader(pr, fs); g.linkProgram(pr);
    if (!g.getProgramParameter(pr, g.LINK_STATUS)) return false;
    g.useProgram(pr);
    var buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    var ap = g.getAttribLocation(pr, 'aPos');
    g.enableVertexAttribArray(ap); g.vertexAttribPointer(ap, 2, g.FLOAT, false, 0, 0);
    glTex = [0, 1, 2].map(function (unit) {
      var t = g.createTexture();
      g.activeTexture(g.TEXTURE0 + unit); g.bindTexture(g.TEXTURE_2D, t);
      [g.TEXTURE_MIN_FILTER, g.TEXTURE_MAG_FILTER].forEach(function (k) { g.texParameteri(g.TEXTURE_2D, k, g.NEAREST); });
      [g.TEXTURE_WRAP_S, g.TEXTURE_WRAP_T].forEach(function (k) { g.texParameteri(g.TEXTURE_2D, k, g.CLAMP_TO_EDGE); });
      return t;
    });
    glLoc = {};
    ['uState', 'uGlyphs', 'uPal', 'uCell', 'uGrid', 'uH', 'uNG'].forEach(function (n) { glLoc[n] = g.getUniformLocation(pr, n); });
    g.uniform1i(glLoc.uState, 0); g.uniform1i(glLoc.uGlyphs, 1); g.uniform1i(glLoc.uPal, 2);
    g.disable(g.BLEND);
    gl = g; glProg = pr;
    return true;
  }
  // the palette's colours, one texel a row
  function glPalette() {
    var d = new Uint8Array(256 * 4);
    for (var r = 0; r < 256; r++) {
      var c = rowRGB(r);
      d[r * 4] = Math.round(c[0]); d[r * 4 + 1] = Math.round(c[1]); d[r * 4 + 2] = Math.round(c[2]); d[r * 4 + 3] = 255;
    }
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, glTex[2]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, d);
    glDirty = true;
  }
  // a new grid: the glyphs drawn white at its size, and an empty state texture
  function glGrid() {
    var c = document.createElement('canvas');
    c.width = cw * NG; c.height = ch;
    var g = c.getContext('2d');
    g.font = glyphFont(); g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillStyle = '#fff';
    for (var i = 0; i < NG; i++) {
      g.save(); g.beginPath(); g.rect(i * cw, 0, cw, ch); g.clip();
      g.fillText(GLYPHS[i], i * cw + cw / 2, ch / 2 + ch * 0.04);
      g.restore();
    }
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, glTex[1]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    glBytes = new Uint8Array(cols * rows * 4);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, glTex[0]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, glBytes);
    gl.uniform2f(glLoc.uCell, cw, ch); gl.uniform2f(glLoc.uGrid, cols, rows); gl.uniform1f(glLoc.uH, H); gl.uniform1f(glLoc.uNG, NG);
    glPalette();
  }
  function glPresent() {
    glDirty = false;
    gl.viewport(0, 0, W, H);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, glTex[0]);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, cols, rows, gl.RGBA, gl.UNSIGNED_BYTE, glBytes);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ------------------------------------------------------------------------
     Drawing cells
     ------------------------------------------------------------------------ */
  var cellState = null, drawn = 0;
  var v6 = new Float32Array(6);

  // A cell's state packs its glyph in bits 0-6, its palette row in bits 7-14
  // and its opacity in bits 15-20. On the 2D canvas, while the camera moves,
  // most cells that change keep their glyph and colour and move one step of
  // opacity out of 63. Those are left as they are, which saves most of the
  // canvas calls, and the picture drawn once the camera stops puts them
  // right. On the GPU a changed cell costs nothing extra, so all are drawn.
  function putCell(cell, state) {
    var old = cellState[cell];
    if (old === state) return;
    if (!gl && camMoving && old && state && ((old ^ state) & 0x7fff) === 0 && Math.abs((old >> 15) - (state >> 15)) === 1) { coarseDrawn = true; return; }
    cellState[cell] = state;
    if (gl) {
      var o = cell * 4;
      glBytes[o] = state & 127; glBytes[o + 1] = (state >> 7) & 255; glBytes[o + 2] = ((state >> 15) & 63) * 4;
      glDirty = true;
      if (state) drawn++;
      return;
    }
    var c = cell % cols, r = (cell / cols) | 0, x = c * cw, y = r * ch;
    ctx.clearRect(x, y, cw, ch);
    if (state) {
      var row = (state >> 7) & 255;
      ensureRow(row);
      ctx.globalAlpha = ((state >> 15) & 63) / 63;
      ctx.drawImage(pages[row >> 5], (state & 127) * cw, (row & 31) * ch, cw, ch, x, y, cw, ch);
      drawn++;
    }
  }

  // A cell's opacity, in 64 levels, is round(alphaGain * mean ^ alphaPow * 63)
  // of its mean brightness. The brightness at which each level starts is
  // worked out once, so a cell finds its level by bisection with no Math.pow.
  var aStart = new Float64Array(65), aGain = NaN, aPow = NaN;
  function alphaLevel(mean) {
    if (tune.alphaGain !== aGain || tune.alphaPow !== aPow) {
      aGain = tune.alphaGain; aPow = tune.alphaPow;
      for (var j = 1; j < 64; j++) aStart[j] = Math.pow((j - 0.5) / 63 / aGain, 1 / aPow);
      aStart[64] = Infinity;
    }
    var lo = 0, hi = 64;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (mean >= aStart[mid]) lo = mid; else hi = mid; }
    return lo;
  }

  function drawCell(cell) {
    if (!cHas[cell]) {
      putCell(cell, cOcc[cell] < 0.35 ? starState(cell) : 0);
      return;
    }
    var o = cell * 6, sumL = 0, maxL = 0, minL = 9, ar = 0, ag = 0, ab = 0;
    for (var k = 0; k < 6; k++) {
      var i = o + k, r = bR[i], g = bG[i], b = bB[i];
      var kk = dK[i];
      if (kk) {
        // a sample that stands in for the one before it has its colour already
        if (!(k & 1) || dK[i - 1] !== kk || dU[i] !== dU[i - 1] || dV[i] !== dV[i - 1]) surface(bodies[kk - 1], dU[i], dV[i]);
        var f = dF[i];
        r += sr * f; g += sg * f; b += sb * f;
      }
      var l = tone(0.2126 * r + 0.7152 * g + 0.0722 * b);
      v6[k] = l; sumL += l;
      if (l > maxL) maxL = l;
      if (l < minL) minL = l;
      ar += r; ag += g; ab += b;
    }
    var state = 0;
    if (maxL >= 0.035) {
      var gl, mean = sumL / 6, spread = maxL - minL;
      if (spread > tune.edge && spread > tune.edgeRel * maxL) {
        var key = 0;
        for (k = 0; k < 6; k++) {
          var vr = v6[k] / maxL, q = maxL * (tune.contrast === 2 ? vr * vr : Math.pow(vr, tune.contrast));
          key |= Math.round(clamp(q, 0, 1) * Q7) << (k * 3);
        }
        gl = matchGlyph(key);
      } else {
        gl = rampLUT[clamp(Math.round(mean * 255), 0, 255)];
      }
      if (gl) {
        var aq = alphaLevel(mean);
        if (aq) state = gl | (rowFor(ar, ag, ab) << 7) | (aq << 15);
      }
    }
    if (!state && cOcc[cell] < 0.35) state = starState(cell);
    putCell(cell, state);
  }

  function frame() {
    var t0 = performance.now();
    drawn = 0;
    if (ctx) ctx.setTransform(1, 0, 0, 1, 0, 0);
    // spin
    for (var i = 0; i < bodies.length; i++) { var b = bodies[i]; b.rot = (b.W - b.W0) / 360; }
    for (var d = 0; d < nDyn; d++) drawCell(dynList[d]);
    // twinkle
    if (!reduced) {
      for (var s = 0; s < starCells.length; s++) {
        var cell = starCells[s];
        if (!cHas[cell] && cOcc[cell] < 0.35) putCell(cell, starState(cell));
      }
    }
    if (ctx) ctx.globalAlpha = 1;
    stats.cells = drawn;
    return performance.now() - t0;
  }

  /* ------------------------------------------------------------------------
     HUD: labels and trackers on their own canvas, snapped to the grid
     ------------------------------------------------------------------------ */
  var labels = {
    gc: 'GALACTIC CENTRE', fromCentre: 'FROM THE CENTRE', ly: 'LY', armPerseus: 'PERSEUS ARM', armScutum: 'SCUTUM-CENTAURUS ARM',
    armSagittarius: 'SAGITTARIUS ARM', armLocal: 'ORION ARM', armOuter: 'OUTER ARM', armNorma: 'NORMA ARM',
    sun: 'SUN', mercury: 'MERCURY', venus: 'VENUS', earth: 'EARTH', moon: 'MOON', mars: 'MARS',
    jupiter: 'JUPITER', saturn: 'SATURN', uranus: 'URANUS', neptune: 'NEPTUNE',
    au: 'AU', fromSun: 'FROM THE SUN'
  };
  var hudDirty = true, hover = null, hudOcc = null, fmt = function (x, d) { return x.toFixed(d); };
  var fmtInt = function (x) { return String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };

  // bare: no backing behind the characters, for text on a backing of its own
  function hudText(str, col, row, color, alpha, mark, bare) {
    if (row < 0 || row >= rows) return;
    for (var i = 0; i < str.length; i++) {
      var cc = col + i;
      if (cc < 0 || cc >= cols || str[i] === ' ') continue;
      if (!bare) {
        hctx.globalAlpha = alpha * 0.92;
        hctx.fillStyle = HUD_BG;
        hctx.fillRect(cc * cw, row * ch, cw, ch);
      }
      hctx.globalAlpha = alpha;
      hctx.fillStyle = color;
      hctx.fillText(str[i], cc * cw + cw / 2, row * ch + ch / 2 + ch * 0.04);
      if (mark && hudOcc) hudOcc[row * cols + cc] = 1;
    }
  }
  function hudFree(col, row, len) {
    if (row < 0 || row >= rows || col < 0 || col + len > cols) return false;
    for (var i = 0; i < len; i++) if (hudOcc[row * cols + col + i]) return false;
    return true;
  }

  // The HUD is laid out on a grid of its own, at a size that keeps its
  // labels readable whatever size the map's characters are.
  var mapGrid = { cw: 1, ch: 1, cols: 1, rows: 1 };
  function drawHud() {
    var g = [fontPx, cw, ch, cols, rows];
    mapGrid.cw = cw; mapGrid.ch = ch; mapGrid.cols = cols; mapGrid.rows = rows;
    fontPx = hudGrid.px; cw = hudGrid.cw; ch = hudGrid.ch; cols = hudGrid.cols; rows = hudGrid.rows;
    try { drawHudOnGrid(); } finally { fontPx = g[0]; cw = g[1]; ch = g[2]; cols = g[3]; rows = g[4]; }
  }
  // how much of the map cell under HUD cell (c, r) the bodies cover
  function mapOcc(c, r) {
    var mc = Math.floor((c + 0.5) * cw / mapGrid.cw), mr = Math.floor((r + 0.5) * ch / mapGrid.ch);
    return mc < 0 || mr < 0 || mc >= mapGrid.cols || mr >= mapGrid.rows ? 0 : cOcc[mr * mapGrid.cols + mc];
  }
  function drawHudOnGrid() {
    hctx.setTransform(1, 0, 0, 1, 0, 0);
    hctx.clearRect(0, 0, W, H);
    siteHits = []; siteTrack = null;
    if (!hudOcc || hudOcc.length !== cols * rows) hudOcc = new Uint8Array(cols * rows);
    hudOcc.fill(0);
    hctx.font = glyphFont();
    hctx.textBaseline = 'middle';
    hctx.textAlign = 'center';
    exploreHud(1, rgbStr(accentRGB), rgbStr(dimRGB));
    hctx.globalAlpha = 1;
  }

  // a place on a body's surface as it is turned now: its outward normal in
  // n and its point on the screen in P
  function surfaceAt(b, lat, lon, n, P) {
    var la = lat * DEG, lo = lon * DEG, x = Math.cos(la) * Math.cos(lo), y = Math.cos(la) * Math.sin(lo), z = Math.sin(la), zf = 1 - b.f;
    var Q = b.Q, E = b.E, N = b.N;
    for (var i = 0; i < 3; i++) n[i] = x * Q[i] + y * E[i] + z * N[i];
    return project([b.pos[0] + b.R * (x * Q[0] + y * E[0] + z * zf * N[0]), b.pos[1] + b.R * (x * Q[1] + y * E[1] + z * zf * N[1]),
                    b.pos[2] + b.R * (x * Q[2] + y * E[2] + z * zf * N[2])], P);
  }

  // landings on the body in focus, once it is big on the screen: a mark on
  // each one on the side facing the camera, and its name and year beside it
  // where there is room. Sites in the night are drawn fainter. The one
  // picked and the one under the pointer are drawn in full and named first.
  // Each mark and label is kept in siteHits as [index, first column, last
  // column, row], for the pointer to find.
  var sites = {}, sitePicked = -1, sitePickedOn = null, siteHover = -1, siteHits = [], siteTrack = null;
  function siteHud(b, A, accent, dim) {
    var list = sites[b.key];
    if (!list || b.rd < ch * 10 || b.alpha < 0.5) return;
    var Ls = lightDir(b), n = [0, 0, 0], P = [0, 0, 0], shown = [], i;
    for (i = 0; i < list.length; i++) {
      var s = list[i];
      surfaceAt(b, s[2], s[3], n, P);
      var facing = dot(n, view.B);
      if (facing < 0.15) continue;
      var col = Math.floor(P[0] / cw), row = Math.floor(P[1] / ch);
      if (col < 1 || col >= cols - 1 || row < 1 || row >= rows - 1) continue;
      var on = (i === sitePicked && sitePickedOn === b.key) || i === siteHover;
      var a = A * smoothstep(0.15, 0.35, facing) * (on || dot(n, Ls) > 0 ? 1 : 0.55);
      hudText('x', col, row, accent, a, true);
      shown.push([s, col, row, a, on, i]);
      if (!siteTrack) siteTrack = { lat: s[2], lon: s[3], col: col, row: row };
    }
    shown.sort(function (p, q) { return q[4] - p[4]; });
    for (i = 0; i < shown.length; i++) {
      var m = shown[i], name = m[0][0].toUpperCase(), yr = String(m[0][1]), len = name.length + 1 + yr.length, hit = [m[5], m[1], m[1], m[2]];
      siteHits.push(hit);
      // a cell of backing either side, so the label stands clear of the surface
      var c = hudFree(m[1] + 1, m[2], len + 2) ? m[1] + 2 : hudFree(m[1] - len - 2, m[2], len + 2) ? m[1] - len - 1 : -1;
      if (c < 0) continue;
      hctx.globalAlpha = m[3] * 0.92;
      hctx.fillStyle = HUD_BG;
      hctx.fillRect((c - 1) * cw, m[2] * ch, (len + 2) * cw, ch);
      for (var j = -1; j <= len; j++) hudOcc[m[2] * cols + c + j] = 1;
      hudText(name, c, m[2], m[4] ? accent : dim, m[3], false, true);
      hudText(yr, c + name.length + 1, m[2], m[4] ? accent : dim, m[3] * (m[4] ? 0.8 : 0.6), false, true);
      hit[1] = Math.min(m[1], c); hit[2] = Math.max(m[1], c + len - 1);
    }
  }
  // the marks turn with their body, so the HUD is drawn again whenever the
  // first of them has moved by a cell
  function sitesMoved() {
    if (!siteTrack) return false;
    var P = surfaceAt(byKey[cam.focus], siteTrack.lat, siteTrack.lon, [0, 0, 0], [0, 0, 0]);
    return Math.floor(P[0] / hudGrid.cw) !== siteTrack.col || Math.floor(P[1] / hudGrid.ch) !== siteTrack.row;
  }
  // the site whose mark or label is nearest a point in CSS pixels, within reach, or -1
  function siteAt(xCss, yCss, reach) {
    var hx = xCss * dpr, hy = yCss * dpr, best = -1, bd = reach * dpr;
    for (var i = 0; i < siteHits.length; i++) {
      var h = siteHits[i];
      var dx = Math.max(h[1] * hudGrid.cw - hx, 0, hx - (h[2] + 1) * hudGrid.cw), dy = Math.max(h[3] * hudGrid.ch - hy, 0, hy - (h[3] + 1) * hudGrid.ch);
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bd) { bd = d; best = h[0]; }
    }
    return best;
  }

  // a body's distance from the Sun, in light-years for the stars and Proxima's planets
  function fromSun(b) {
    return (b.dist > 20000 ? fmt(b.dist / LY, b.dist < 100 * LY ? 2 : 0) + ' ' + labels.ly : fmt(b.dist, b.dist < 10 ? 3 : 2) + ' ' + labels.au) + ' ' + labels.fromSun;
  }
  var RANK = { sun: 10, jupiter: 9, saturn: 8, uranus: 7, neptune: 7, earth: 6, venus: 5, mars: 5, mercury: 4, moon: 1, pluto: 4,
               alphacena: 9, proxima: 8.5, alphacenb: 8, proximab: 3, proximad: 2.5,
               siriusa: 8.5, betelgeuse: 8.5, vega: 8, arcturus: 8, polaris: 8, rigel: 8, siriusb: 6,
               alcyone: 6.5, atlas: 6.2, electra: 6.2, maia: 6.1, merope: 6.1, taygeta: 6, pleione: 5.8, celaeno: 5.6, asterope: 5.5,
               pleiades: 8.2, orionnebula: 8.2, carina: 8.2, eagle: 7.8, crab: 7.8, helix: 7.6, ringnebula: 7.6, sgra: 8.5, s2: 6.5 };
  var CLS_RANK = { comet: 3, craft: 3, moon: 1.5 };
  bodies.forEach(function (b) { if (RANK[b.key] == null) RANK[b.key] = (CLS_RANK[b.S.cls] || 1) + (b.S.r > 1300 ? 0.5 : 0); });
  // Over the galaxy: the Sun in the explorer's corner brackets with its
  // distance from the centre, the centre, and the arms by name. Each name
  // has a preferred place and moves to the next place that is on the
  // screen and clear of the other names and the explorer's panels, so it
  // stays in sight as the view moves. An arm's name moves along its arm.
  // Norma is the inner end of the Norma-Outer arm.
  // [label, arm, preferred beta, then the range of beta it may move over]
  var ARM_LABELS = [['armLocal', 'local', 24, -15, 40], ['armPerseus', 'perseus', -42, -90, 190], ['armScutum', 'scutum', -75, -185, 80],
                    ['armSagittarius', 'sagittarius', 95, -75, 95], ['armOuter', 'outer', 35, -25, 250], ['armNorma', 'outer', 372, 340, 400]];
  var armSpots = null;
  function armCandidates() {
    armSpots = ARM_LABELS.map(function (l) {
      var list = [l[2]];
      for (var d = 6; l[2] - d >= l[3] || l[2] + d <= l[4]; d += 6) {
        if (l[2] + d <= l[4]) list.push(l[2] + d);
        if (l[2] - d >= l[3]) list.push(l[2] - d);
      }
      return list.map(function (b) { var p = Sf.galaxy.armPoint(l[1], b); return GAL.toEcl(p[0], p[1], 0); });
    });
  }
  // the panels the explorer draws over the sky, in CSS pixels, as cells of the HUD's grid
  var covered = [], coverKey = '', coverMask = null, gutter = 0;
  function coverCells() {
    if (!covered.length) return null;
    if (coverMask && coverMask.length === cols * rows) return coverMask;
    coverMask = new Uint8Array(cols * rows);
    covered.forEach(function (q) {
      var c0 = clamp(Math.floor(q[0] * dpr / cw), 0, cols), c1 = clamp(Math.ceil(q[2] * dpr / cw), 0, cols);
      var r0 = clamp(Math.floor(q[1] * dpr / ch), 0, rows), r1 = clamp(Math.ceil(q[3] * dpr / ch), 0, rows);
      for (var r = r0; r < r1; r++) for (var c = c0; c < c1; c++) coverMask[r * cols + c] = 1;
    });
    return coverMask;
  }
  function galaxyHud(A, accent, dim) {
    var gs = galShown(cam.z), a = A * smoothstep(0.25, 0.65, gs), an = A * smoothstep(0.12, 0.45, gs);
    if (an < 0.05) return;
    var mask = coverCells(), P = [0, 0, 0], i, k, c, r;
    // free of other names, inside the screen and off the panels
    function clear(c0, r0, len) {
      if (!hudFree(c0, r0, len)) return false;
      if (mask) for (var j = 0; j < len; j++) if (mask[r0 * cols + c0 + j]) return false;
      return true;
    }
    var col = Math.round(SUN.sx / cw), row = Math.round(SUN.sy / ch);
    if (a >= 0.05 && col > 3 && col < cols - 4 && row > 1 && row < rows - 2) {
      hudText('+--', col - 3, row - 1, accent, a * 0.85, true); hudText('--+', col + 1, row - 1, accent, a * 0.85, true);
      hudText('o', col, row, accent, a, true);
      hudText('+--', col - 3, row + 1, accent, a * 0.85, true); hudText('--+', col + 1, row + 1, accent, a * 0.85, true);
      var name = labels.sun, far = fmtInt(Math.round(GAL.R0 * 3261.56 / 100) * 100) + ' ' + labels.ly + ' ' + labels.fromCentre;
      var len = name.length + 2 + far.length;
      // above or below the brackets, starting at their left edge or ending at their right
      var spots = [[col - 3, row - 2], [col - 3, row + 2], [col + 4 - len, row - 2], [col + 4 - len, row + 2]], pick = null;
      for (k = 0; k < spots.length && !pick; k++) {
        c = clamp(spots[k][0], 1, cols - len - 1); r = spots[k][1];
        if (r >= 1 && r < rows - 1 && clear(c - 1, r, len + 2)) pick = [c, r];
      }
      if (!pick) pick = [clamp(col - 3, 1, cols - len - 1), row - 2 >= 1 ? row - 2 : row + 2];
      hudText(name, pick[0], pick[1], accent, a, true);
      hudText(far, pick[0] + name.length + 2, pick[1], dim, a * 0.9, true);
    }
    // the centre, named just past the edge of the bulge: below it, above it, or to a side
    project(GAL.centre, P);
    var gl = labels.gc, off = Math.ceil(1.6 * KPC * view.k / ch) + 1, sideW = Math.ceil(2.4 * KPC * view.k / cw) + 2;
    var gcx = Math.round(P[0] / cw), gcy = Math.round(P[1] / ch);
    var gspots = [[gcx - (gl.length >> 1), gcy + off], [gcx - (gl.length >> 1), gcy - off], [gcx + sideW, gcy], [gcx - sideW - gl.length, gcy]];
    // with the centre near the top or bottom of the screen, further toward the middle
    for (k = 1; k <= 4; k++) gspots.push([gcx - (gl.length >> 1), gcy + off + k * 2], [gcx - (gl.length >> 1), gcy - off - k * 2]);
    for (k = 0; k < gspots.length; k++) {
      c = gspots[k][0]; r = gspots[k][1];
      if (c >= 1 && c + gl.length < cols - 1 && r >= 1 && r < rows - 1 && clear(c - 1, r, gl.length + 2)) { hudText(gl, c, r, dim, an * 0.95, true); break; }
    }
    // each arm by name, at the first of its places that is clear
    if (!armSpots) armCandidates();
    for (i = 0; i < ARM_LABELS.length; i++) {
      var t = labels[ARM_LABELS[i][0]], cand = armSpots[i], done = false;
      for (k = 0; k < cand.length && !done; k++) {
        project(cand[k], P);
        var c0 = Math.round(P[0] / cw - t.length / 2), r0 = Math.round(P[1] / ch);
        for (var dr = 0; dr <= 2 && !done; dr++) {
          var rr = r0 + (dr === 1 ? -1 : dr === 2 ? 1 : 0);
          if (c0 >= 1 && c0 + t.length < cols - 1 && rr >= 1 && rr < rows - 1 && clear(c0 - 1, rr, t.length + 2)) {
            hudText(t, c0, rr, dim, an * 0.95, true);
            done = true;
          }
        }
      }
    }
  }

  function exploreHud(A, accent, dim) {
    galaxyHud(A, accent, dim);
    var F = byKey[cam.focus], i, j, b;
    var list = bodies.filter(function (b) { return b.vis && b.sx > -b.rd && b.sx < W + b.rd && b.sy > -b.rd && b.sy < H + b.rd; })
      .sort(function (a, b) { return (b === F) - (a === F) || (b === hover) - (a === hover) || RANK[b.key] - RANK[a.key]; });
    // labels keep off the small bodies themselves
    for (i = 0; i < list.length; i++) {
      b = list[i];
      if (b.rd > ch * 3) continue;
      var rr0 = b.rd * (b.ring && b.key !== 'jupiter' ? b.ring.outer : 1);
      for (var yy = Math.floor((b.sy - b.rd) / ch); yy <= Math.floor((b.sy + b.rd) / ch); yy++)
        for (var xx = Math.floor((b.sx - rr0) / cw); xx <= Math.floor((b.sx + rr0) / cw); xx++)
          if (yy >= 0 && yy < rows && xx >= 0 && xx < cols) hudOcc[yy * cols + xx] = 1;
    }
    siteHud(F, A, accent, dim);
    var placed = [];
    for (i = 0; i < list.length; i++) {
      b = list[i];
      var isF = b === F, isH = b === hover;
      var rr = b.rd * (b.ring && b.key !== 'jupiter' ? b.ring.outer * 0.98 : 1);
      var col = Math.round(b.sx / cw), row = Math.round(b.sy / ch);
      var name = labels[b.key] || b.key.toUpperCase();
      var color = isF ? accent : isH ? rgbStr(colourOf(b)) : dim, al = A * (isF || isH ? 1 : 0.8) * b.alpha;
      if (al < 0.05) continue;
      if (b.rd > ch * 3 && isF) {
        // the body in focus, framed by corner brackets. A black hole's brackets take in the bright part of its disc.
        var fr = b.S.kind === 'hole' ? 1.5 : 1, hw = Math.max(rr * 1.06 * fr, cw * 3), hh = Math.max(b.rd * 1.06 * fr, ch * 1.5);
        var cL = Math.round((b.sx - hw) / cw), cR = Math.round((b.sx + hw) / cw);
        var rT = Math.round((b.sy - hh) / ch), rB = Math.round((b.sy + hh) / ch);
        // nothing goes under the controls at the top, and the name keeps a
        // row clear of them: above the brackets where it fits, else below
        var top = barRows(), low = rows - 1 - Math.ceil(inset.bottom * dpr / ch);
        if (rT > Math.max(top, 1)) { hudText('+--', cL, rT, accent, A * 0.85, true); hudText('--+', cR - 2, rT, accent, A * 0.85, true); }
        if (rB < rows - 1) { hudText('+--', cL, rB, accent, A * 0.85, true); hudText('--+', cR - 2, rB, accent, A * 0.85, true); }
        // the name and its distance keep the controls' gutter from either side
        var dist = b !== SUN ? fromSun(b) : '', len = name.length + (dist ? dist.length + 2 : 0), side = Math.max(1, Math.round(gutter * dpr / cw));
        var tr = rT - 1 >= nameRow() ? rT - 1 : rB + 1 < low ? rB + 1 : clamp(nameRow(), 1, rows - 3), tc = Math.max(side, Math.min(cL, cols - len - side));
        hudText(name, tc, tr, accent, A, true);
        if (dist) hudText(dist, tc + name.length + 2, tr, dim, A * 0.9, true);
        placed.push(b);
        continue;
      }
      // a dot: named beside it, unless a more important dot is right there
      var crowded = false;
      if (!isF && !isH) {
        for (j = 0; j < placed.length; j++) {
          var o = placed[j], d = Math.sqrt(Math.pow(o.sx - b.sx, 2) + Math.pow(o.sy - b.sy, 2));
          if (d < Math.max(ch * 2.2, (o.rd + b.rd) * 1.4)) { crowded = true; break; }
        }
      }
      if (crowded) continue;
      var off = Math.ceil(rr / cw) + 2;
      var tag = isF || isH ? '[ ' + name + ' ]' : name;
      var c1 = col + off, c2 = col - off - tag.length + 1;
      if (hudFree(c1, row, tag.length)) hudText(tag, c1, row, color, al, true);
      else if (hudFree(c2, row, tag.length)) hudText(tag, c2, row, color, al, true);
      else if (hudFree(c1 - 1, row - 1, tag.length)) hudText(tag, c1 - 1, row - 1, color, al, true);
      else if (hudFree(c1 - 1, row + 1, tag.length)) hudText(tag, c1 - 1, row + 1, color, al, true);
      placed.push(b);
    }
  }

  /* ------------------------------------------------------------------------
     Loop / lifecycle
     ------------------------------------------------------------------------ */
  var needsDraw = true;

  function refineTextures() {
    // the largest body on screen gets the next few rows of its full-size map
    var best = null, key = null;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (!b.vis || !b.tex || b.rd < 30) continue;
      var todo = !b.tex.ready ? b.key : b.clouds && !b.clouds.ready ? b.S.clouds : null;
      if (todo && (!best || b.rd > best.rd)) { best = b; key = todo; }
    }
    if (best) { Sf.refine(key, 7); return true; }
    return false;
  }

  // Frames are paced in whole display refreshes: while the camera moves,
  // every refresh if frames are cheap enough and every other one if not;
  // when it is still, only as often as the spin and the stars need.
  var refresh = 1000 / 60, lastRaf = 0, msMove = 6;
  function loop(now) {
    requestAnimationFrame(loop);
    if (lastRaf) { var rd = now - lastRaf; if (rd > 4 && rd < 40) refresh += (rd - refresh) * 0.05; }
    lastRaf = now;
    if (document.hidden || !W || !H) { lastNow = 0; return; }
    var moving = !!cam.fly || cam.z !== cam.zGoal || cam.psi !== cam.psiGoal || cam.th !== cam.thGoal || cam.roll !== cam.rollGoal ||
                 cam.ax !== cam.axGoal || cam.ay !== cam.ayGoal || cam.offTh !== 0 || cam.offG !== 0 || swingDue() || cam.ov !== 0 || cam.o !== cam.oGoal || cam.offT[0] !== 0 || cam.top !== cam.topGoal ||
                 cam.gpsi !== cam.gpsiGoal || cam.gtop !== cam.gtopGoal;
    camMoving = moving;
    // drawn on the GPU, a frame leaves the browser little to do, so it can take more of a refresh
    var interval = moving ? (msMove < refresh * (gl ? 0.75 : 0.6) ? refresh : 2 * refresh) : Math.max(frameInterval, refresh);
    // With reduced motion the stars hold still and only the real-time turn
    // is left, so a still view at real speed is drawn once a second.
    if (reduced && !moving && (warp === 1 || warp === 0)) interval = Math.max(interval, 1000);
    interval = Math.max(1, Math.round(interval / refresh)) * refresh;
    if (now - lastFrame < interval - refresh * 0.5 && !needsDraw) return;
    var dt = lastNow ? Math.min((now - lastNow) / 1000, 0.1) : 0;
    lastNow = now; lastFrame = now;
    var t0 = performance.now();
    if (!reduced) t += dt;
    if (warp === 1) simTime = Date.now() + simOffset;
    else simTime += dt * 1000 * warp;
    if (running && !reduced && warp !== 0) { lapseSec += dt; cloudT += dt * CLOUD_RATE; stepClouds(); }
    updateWorld();
    stepCamera(dt);
    var gs = galShown(cam.z), fine = gs > (galFine ? 0.2 : 0.35);
    if (fine !== galFine) { galFine = fine; setGrid(fine ? fineFont() : baseFont); }
    // detail is added only while the camera holds still
    if (!moving) { var tr = performance.now(); refineTextures(); mark('refine', tr); }
    // a spacecraft drawn with one ray a sample while moving gets four once
    // still, and a large body drawn at half its samples gets all of them
    if (!moving && coarseDrawn) needsRebuild = true;
    var St = byKey[cam.focus].tex;
    stats.ready = St ? (St.ready ? 1 : St.progress) : 0;
    var sig = signature();
    if (needsRebuild || sigChanged(sig, lastSig) || now - rebuildAt > (warp !== 1 && warp !== 0 ? 0 : 10000)) {
      lastSig = sig; needsRebuild = false;
      rebuild();
    } else {
      frame();
    }
    if (gl && glDirty) { var tg0 = performance.now(); glPresent(); mark('present', tg0); }
    if (hudDirty || sitesMoved()) { var th0 = performance.now(); drawHud(); hudDirty = false; mark('hud', th0); }
    needsDraw = false;
    stats.frames = (stats.frames || 0) + 1;
    stats.ms = performance.now() - t0;
    if (moving) msMove = msMove * 0.85 + stats.ms * 0.15;
    else msAvg = msAvg * 0.9 + stats.ms * 0.1;
    frameInterval = Math.max(minInterval, Math.min(1000 / 8, msAvg * 2.5));
    fpsAcc++;
    if (now - fpsT > 1000) { stats.fps = Math.round(fpsAcc * 1000 / (now - fpsT)); fpsAcc = 0; fpsT = now; }
  }
  var needsRebuild = true, camMoving = false;

  // The galaxy has finer detail than anything else on the map, so while it
  // fills the screen the characters are drawn at three fifths of their
  // usual size. The labels are on a grid of their own and keep their size.
  var baseFont = 10, galFine = false, hudGrid = { px: 10, cw: 1, ch: 1, cols: 1, rows: 1 };
  // The characters grow with the reader's text size setting: fontScale is
  // the root font size over the usual 16px.
  var fontScale = 1;
  // A large screen would get far more characters than the galaxy needs and
  // draw slowly, so the finer grid stops at about 85,000 of them. A cell is
  // about 0.6 by 1.22 of the font size.
  function fineFont() {
    var cap = Math.sqrt(W * H / (0.732 * 85000)) / dpr;
    return Math.max(5 * fontScale, Math.round(baseFont * 1.2) / 2, Math.ceil(cap * 2) / 2);
  }
  // the font and cell the glyphs were last analysed for, which a new
  // window size alone does not change
  var analysedFor = '';
  function setGrid(px) {
    fontPx = px;
    mctx.font = glyphFont();
    cw = Math.max(2, Math.round(mctx.measureText('M').width));
    ch = Math.round(fontPx * dpr * 1.22);
    SX = cw / 2; SY = ch / 3;
    cols = Math.ceil(W / cw); rows = Math.ceil(H / ch);
    cellState = new Int32Array(cols * rows);
    starAt = new Int32Array(cols * rows);
    allocCache();
    var glyphKey = glyphFont() + ' ' + cw + 'x' + ch;
    if (glyphKey !== analysedFor) { analysedFor = glyphKey; analyseGlyphs(); }
    if (gl) glGrid();
    else { resetAtlas(); ctx.clearRect(0, 0, W, H); }
    needsRebuild = true;
    needsDraw = true;
    hudDirty = true;
  }
  // The size the canvases are drawn at, in CSS pixels: the window's width,
  // and the taller of the window's height and the large viewport's, the
  // window with a phone's toolbars put away. Safari's toolbars sliding away
  // then leave the canvases the size they are. An in-app browser that
  // resizes the page itself as its bars come and go still resizes them.
  var tallProbe = null;
  function viewSize() {
    if (!tallProbe && document.body) {
      tallProbe = document.createElement('div');
      tallProbe.setAttribute('aria-hidden', 'true');
      tallProbe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
      document.body.appendChild(tallProbe);
    }
    return [window.innerWidth, Math.max(window.innerHeight, tallProbe ? tallProbe.offsetHeight : 0)];
  }
  // A resize that changes nothing the canvases depend on, which phones send
  // as their toolbars come and go, is skipped. force measures again anyway,
  // for a font that has just loaded.
  var sizedFor = '';
  function resize(force) {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var size = viewSize(), cssW = size[0], cssH = size[1];
    var rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    var key = cssW + 'x' + cssH + '@' + dpr + '/' + rem;
    if (key === sizedFor && force !== true) return;
    sizedFor = key;
    if (force === true) analysedFor = '';
    fontScale = rem / 16;
    W = Math.round(cssW * dpr); H = Math.round(cssH * dpr);
    if (W > 0 && H > 0) aspect = W / H;        // a 0 x 0 window keeps the last shape and draws nothing
    [canvas, hudCanvas].forEach(function (cv) {
      cv.width = W; cv.height = H;
      cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
    });
    // 8, 9 or 10px by the window's width in em
    var em = cssW / rem;
    baseFont = fontOverride || (em < 40 ? 8 : em < 68.75 ? 9 : 10) * fontScale;
    setGrid(baseFont);
    // the labels are at least 11px, and larger with a larger text size
    var hudPx = fontOverride || Math.max(baseFont, 11 * fontScale);
    mctx.font = fontWeight + ' ' + (hudPx * dpr) + 'px ' + fontFamily;
    var hcw = Math.max(2, Math.round(mctx.measureText('M').width)), hch = Math.round(hudPx * dpr * 1.22);
    hudGrid = { px: hudPx, cw: hcw, ch: hch, cols: Math.ceil(W / hcw), rows: Math.ceil(H / hch) };
    coverMask = null;
    if (galFine) setGrid(fineFont());
  }

  /* ------------------------------------------------------------------------
     Picking: the body nearest a screen point, within reach
     ------------------------------------------------------------------------ */
  function pick(xCss, yCss, reach) {
    var x = xCss * dpr, y = yCss * dpr, best = null, bd = 1e9, inner = null, id = 1e9;
    reach = (reach || 28) * dpr;
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      if (!b.vis || b.alpha < 0.3) continue;
      var rr = b.rd * (b.ring && b.key === 'saturn' ? 1.3 : 1);
      var d = Math.sqrt(Math.pow(b.sx - x, 2) + Math.pow(b.sy - y, 2)) - rr;
      if (d >= reach) continue;
      // the Pleiades' stars lie inside the cluster's disc, so the one
      // nearest the pointer is picked before the cluster
      if (b.S.host && byKey[b.S.host].S.kind === 'nebula') { if (d < id) { id = d; inner = b; } continue; }
      if (d < bd) { bd = d; best = b; }
    }
    best = inner || best;
    // over the galaxy the Sun is a mark in the HUD
    if (!best && !SUN.vis && galShown(cam.z) > 0.25 && Math.sqrt(Math.pow(SUN.sx - x, 2) + Math.pow(SUN.sy - y, 2)) < reach + 3 * cw) best = SUN;
    return best ? best.key : null;
  }

  /* ------------------------------------------------------------------------
     Icon: one body in pixels rather than characters, small enough for a
     browser tab. It is lit, ringed, shadowed and eclipsed as on the screen,
     and seen from the explorer's camera, from the Earth, or the way the
     explorer first frames it. Each pixel is the mean of n x n rays.
     ------------------------------------------------------------------------ */
  function basis(psi, th, roll) {
    var ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(psi), sp = Math.sin(psi), c = Math.cos(roll), s = Math.sin(roll);
    var R = [sp, -cp, 0], U = [st * cp, st * sp, ct];
    return { R: [R[0] * c + U[0] * s, R[1] * c + U[1] * s, R[2] * c + U[2] * s],
             U: [U[0] * c - R[0] * s, U[1] * c - R[1] * s, U[2] * c - R[2] * s], B: [-ct * cp, -ct * sp, st] };
  }
  // from the Earth, as in the sky: north up and east to the left
  var SKY_N = [0, Math.sin(23.4393 * DEG), Math.cos(23.4393 * DEG)];
  function earthView(b) {
    var e = byKey.earth.pos, B = norm([e[0] - b.pos[0], e[1] - b.pos[1], e[2] - b.pos[2]]), k = dot(SKY_N, B);
    var U = norm([SKY_N[0] - k * B[0], SKY_N[1] - k * B[1], SKY_N[2] - k * B[2]]);
    return { R: cross(U, B), U: U, B: B };
  }
  function niceView(b) { var psi = niceHeading(b), th = nicePitch(b, psi); return basis(psi, th, niceRoll(b, psi, th)); }

  var craftIds = new Int16Array(64);
  for (var ci0 = 0; ci0 < craftIds.length; ci0++) craftIds[ci0] = ci0;

  // a nebula's points summed into the icon's pixels; false until they are made
  function drawNebulaIcon(cv, b, V, fill) {
    var M = Sf.nebula.points(b.key), S = cv.width, half = S / 2, k = half * fill, c2 = cv.getContext('2d');
    if (!M) { queueNebula(b.key); return false; }
    if (!toneLUT[TONE_N]) buildTone();
    var f = nebFrame(b), ux = k * dot(f.u, V.R), vx = k * dot(f.v, V.R), wx = k * dot(f.w, V.R), uy = -k * dot(f.u, V.U), vy = -k * dot(f.v, V.U), wy = -k * dot(f.w, V.U);
    var acc = new Float32Array(S * S * 3), g = 0.5 * Math.PI * k * k * M.gain, i, o, p;
    for (i = 0; i < M.n; i++) {
      o = i * 3;
      var x = (half + ux * M.pos[o] + vx * M.pos[o + 1] + wx * M.pos[o + 2]) | 0, y = (half + uy * M.pos[o] + vy * M.pos[o + 1] + wy * M.pos[o + 2]) | 0;
      if (x < 0 || y < 0 || x >= S || y >= S) continue;
      p = (y * S + x) * 3;
      acc[p] += M.col[o] * g; acc[p + 1] += M.col[o + 1] * g; acc[p + 2] += M.col[o + 2] * g;
    }
    var img = c2.createImageData(S, S), out = img.data;
    for (i = 0; i < S * S; i++) {
      var r = tone(acc[i * 3]), gg = tone(acc[i * 3 + 1]), bl = tone(acc[i * 3 + 2]), a = Math.max(r, gg, bl);
      if (a < 0.02) continue;
      out[i * 4] = Math.min(255, r / a * 255); out[i * 4 + 1] = Math.min(255, gg / a * 255); out[i * 4 + 2] = Math.min(255, bl / a * 255); out[i * 4 + 3] = Math.min(255, a * 255);
    }
    c2.putImageData(img, 0, 0);
    return true;
  }

  // a black hole's ring in the icon's pixels, its clumps from its map once
  // that is made; false until then
  function drawHoleIcon(cv, b, V, n, fill) {
    var S = cv.width, half = S / 2, k = half * fill / 1.6, exact = true;    // pixels per ring radius
    if (!Sf.has(b.key)) Sf.prepare(b.key, 6);
    if (Sf.has(b.key)) b.tex = Sf.texture(b.key); else exact = false;
    var Hs = holeSetup(b, V, 1 / (k * n)), T = b.tex;
    var bd = T && { rot: 0, tex: T, clouds: null, lvl: clamp(Math.floor(Math.log2(T.w / (TAU * k * n)) + 0.35), 0, T.levels.length - 1) };
    if (!toneLUT[TONE_N]) buildTone();
    var c2 = cv.getContext('2d'), img = c2.createImageData(S, S), out = img.data, inv = 1 / (n * n), m = Hs.mean;
    for (var py0 = 0; py0 < S; py0++) {
      for (var px0 = 0; px0 < S; px0++) {
        var r = 0, g = 0, bl = 0;
        for (var j = 0; j < n * n; j++) {
          holeAt(Hs, (px0 + ((j % n) + 0.5) / n - half) / k, (half - py0 - (((j / n) | 0) + 0.5) / n) / k);
          r += hr; g += hg; bl += hb;
          if (!hf) continue;
          if (bd) { surface(bd, hu, hv); r += sr * hf; g += sg * hf; bl += sb * hf; }
          else { r += m[0] * hf; g += m[1] * hf; bl += m[2] * hf; }
        }
        // the light itself is the cover, and the shadow lets the tile show through
        r = tone(r * inv); g = tone(g * inv); bl = tone(bl * inv);
        var a = Math.max(r, g, bl), o = (py0 * S + px0) * 4;
        if (a < 0.02) { out[o + 3] = 0; continue; }
        out[o] = Math.min(255, r / a * 255); out[o + 1] = Math.min(255, g / a * 255); out[o + 2] = Math.min(255, bl / a * 255); out[o + 3] = Math.min(255, a * 255);
      }
    }
    c2.putImageData(img, 0, 0);
    return exact;
  }

  function drawIcon(cv, b, V, n, fill) {
    if (b.S.kind === 'nebula') return drawNebulaIcon(cv, b, V, fill);
    if (b.S.kind === 'hole') return drawHoleIcon(cv, b, V, n, fill);
    var S = cv.width, half = S / 2, Rg = b.ring, Sb = b.S, exact = true;
    var k = half * fill / (Rg && b.key === 'saturn' ? Rg.outer : 1);   // pixels per body radius
    var step = 1 / (k * n);                                            // ray spacing in body radii
    var Q = b.Q, Eb = b.E, N = b.N, R = V.R, U = V.U, B = V.B;
    var Rx = dot(R, Q), Ry = dot(R, Eb), Rz = dot(R, N), Ux = dot(U, Q), Uy = dot(U, Eb), Uz = dot(U, N);
    var Bx = dot(B, Q), By = dot(B, Eb), Bz = dot(B, N);
    var star = Sb.kind === 'star', Ld = star ? [0, 0, 1] : lightDir(b);
    var Lx = dot(Ld, Q), Ly = dot(Ld, Eb), Lz = dot(Ld, N);
    var ray;

    if (b.model) {
      // a spacecraft, in metres in its own frame
      var M = b.model, parts = M.parts, mR = [Rx * M.r, Ry * M.r, Rz * M.r], mU = [Ux * M.r, Uy * M.r, Uz * M.r];
      var d = [Bx, By, Bz], L = [Lx, Ly, Lz], foot = step * M.r;
      if (craftIds.length < parts.length) { craftIds = new Int16Array(parts.length); for (var q = 0; q < parts.length; q++) craftIds[q] = q; }
      ray = function (x, y) {
        return craftRay(parts, craftIds, 0, parts.length, x * mR[0] + y * mU[0], x * mR[1] + y * mU[1], x * mR[2] + y * mU[2], d, L, foot);
      };
    } else {
      var sh = Sb.shape, kx = sh ? 1 / sh[0] : 1, ky = sh ? 1 / sh[1] : 1, ci = 1 / ((sh ? sh[2] : 1) * (1 - b.f));
      var rx = Rx * kx, ry = Ry * ky, rz = Rz * ci, ux = Ux * kx, uy = Uy * ky, uz = Uz * ci, bx = Bx * kx, by = By * ky, bz = Bz * ci;
      var A = bx * bx + by * by + bz * bz;
      var RB = rx * bx + ry * by + rz * bz, UB = ux * bx + uy * by + uz * bz;
      var RR = rx * rx + ry * ry + rz * rz, UU = ux * ux + uy * uy + uz * uz, RU = rx * ux + ry * uy + rz * uz;
      var hz = Sb.haze || 0, hc = Sb.hazeCol || [1, 1, 1], limbK = Sb.limb != null ? Sb.limb : 0.58, expo = Sb.exposure || 1;
      var ringLight = Rg ? clamp(0.45 + Math.abs(Lz) * 1.6, 0, 1.05) : 0;
      var litFace = Rg ? (Bz >= 0) === (Lz >= 0) : false, Bh = Math.sqrt(Bx * Bx + By * By) || 1;
      // the map, or the flat colour until the map is made
      var tex = null, clouds = null;
      if (!Sf.has(b.key)) Sf.prepare(b.key, 6);
      if (Sf.has(b.key)) tex = b.tex = Sf.texture(b.key); else exact = false;
      if (tex && Sb.clouds) {
        if (!Sf.has(Sb.clouds)) Sf.prepare(Sb.clouds, 6);
        if (Sf.has(Sb.clouds)) clouds = b.clouds = Sf.texture(Sb.clouds); else exact = false;
      }
      var mean = dotColour(b);
      var bd = tex && { rot: 0, tex: tex, clouds: clouds,
                        lvl: clamp(Math.floor(Math.log2(tex.h / (Math.PI * k * n)) + 0.35), 0, tex.levels.length - 1) };
      // eclipses, as in rasterBody
      var shd = [], vel = b.vel;
      (SHADOWS[b.key] || []).forEach(function (key) {
        var o = byKey[key], C = o.pos, dC = Math.sqrt(dot(C, C)), Ax = [C[0] / dC, C[1] / dC, C[2] / dC];
        if (vel) Ax = norm([Ax[0] - vel[0] / LIGHT_AU_DAY, Ax[1] - vel[1] / LIGHT_AU_DAY, Ax[2] - vel[2] / LIGHT_AU_DAY]);
        var rel = [b.pos[0] - C[0], b.pos[1] - C[1], b.pos[2] - C[2]], sAx = dot(rel, Ax);
        var perp = Math.sqrt(Math.max(0, dot(rel, rel) - sAx * sAx)), kp = (SUN_R + o.R) / dC;
        if (sAx > 0 && perp < o.R + sAx * kp + b.R * 1.5) shd.push({ C: C, A: Ax, R: o.R, ku: (SUN_R - o.R) / dC, kp: kp });
      });

      ray = function (x, y) {
        var cov = 0, r = 0, g = 0, bl = 0, th = -1e9;
        var bq = x * RB + y * UB, cq = x * x * RR + 2 * x * y * RU + y * y * UU - 1, disc = bq * bq - A * cq;
        if (disc > 0) {
          var tq = (-bq + Math.sqrt(disc)) / A;
          var hx = x * rx + y * ux + tq * bx, hy = x * ry + y * uy + tq * by, hzz = x * rz + y * uz + tq * bz;
          var nx = hx * kx, ny = hy * ky, nz = hzz * ci, nl = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
          nx *= nl; ny *= nl; nz *= nl;
          var mu0 = nx * Lx + ny * Ly + nz * Lz, mu = Math.max(nx * Bx + ny * By + nz * Bz, 0), LF, haze = 0;
          th = tq;
          if (star) LF = (1 - 0.62 * (1 - Math.sqrt(mu))) * expo;
          else {
            var lit;
            if (Sb.kind === 'rock') {
              var ls = mu0 > 0 ? 2 * mu0 / (mu0 + mu + 1e-4) : 0;
              lit = smoothstep(-0.03, 0.06, mu0) * (0.55 * Math.min(ls, 1.6) + 0.45 * Math.max(mu0, 0));
            } else if (Sb.kind === 'gas') {
              lit = smoothstep(-0.07, 0.10, mu0) * Math.pow(Math.max(mu0, 0) * 0.92 + 0.08, 0.92) * (1 - limbK + limbK * Math.sqrt(mu));
            } else {
              lit = smoothstep(-0.05, 0.08, mu0) * Math.pow(Math.max(mu0, 0) * 0.95 + 0.05, 0.9) * (0.82 + 0.18 * Math.sqrt(mu));
            }
            if (Rg && Lz !== 0) {
              var s2 = -hzz * (1 - b.f) / Lz;
              if (s2 > 0) {
                var qx = hx + s2 * Lx, qy = hy + s2 * Ly, rq = Math.sqrt(qx * qx + qy * qy);
                if (rq > Rg.inner && rq < Rg.outer) { ringAvg(Rg, rq, step * 2); lit *= 1 - ra.op * 0.88; }
              }
            }
            var ecl = 1, red = 0;
            for (var si = 0; si < shd.length; si++) {
              var sd = shd[si];
              var wx = b.pos[0] + b.R * (hx / kx * Q[0] + hy / ky * Eb[0] + hzz / ci * N[0]) - sd.C[0];
              var wy = b.pos[1] + b.R * (hx / kx * Q[1] + hy / ky * Eb[1] + hzz / ci * N[1]) - sd.C[1];
              var wz = b.pos[2] + b.R * (hx / kx * Q[2] + hy / ky * Eb[2] + hzz / ci * N[2]) - sd.C[2];
              var sa = wx * sd.A[0] + wy * sd.A[1] + wz * sd.A[2];
              if (sa <= 0) continue;
              var pp = Math.sqrt(Math.max(0, wx * wx + wy * wy + wz * wz - sa * sa)), ru = sd.R - sa * sd.ku;
              ecl *= smoothstep(Math.max(ru, 0) - sd.R * 0.02, sd.R + sa * sd.kp, pp);
              if (b.key === 'moon' && ru > 0) {
                var uu = pp / ru;
                red = Math.max(red, uu < 1 ? 0.22 + 0.25 * uu * uu : 0.47 * (1 - smoothstep(1, 1.5, uu)));
              }
            }
            haze = hz * Math.pow(1 - mu, 3) * smoothstep(-0.25, 0.45, mu0) * ecl;
            LF = (lit * ecl + 0.012) * expo;
            if (red) { r += 1.0 * red * smoothstep(-0.1, 0.2, mu0 + 0.3); g += 0.28 * red; bl += 0.12 * red; }
          }
          if (bd) { surface(bd, Math.atan2(hy, hx) / TAU + 0.5, 0.5 - Math.asin(clamp(hzz, -1, 1)) / Math.PI); r += sr * LF; g += sg * LF; bl += sb * LF; }
          else { r += mean[0] * LF; g += mean[1] * LF; bl += mean[2] * LF; }
          r += hc[0] * haze; g += hc[1] * haze; bl += hc[2] * haze;
          cov = 1;
        }
        // the rings in front of the planet, or where it is not
        if (Rg && Math.abs(Bz) > 1e-4) {
          var tr = -(x * Rz + y * Uz) / Bz, px = x * Rx + y * Ux + tr * Bx, py = x * Ry + y * Uy + tr * By, rr = Math.sqrt(px * px + py * py);
          if (rr > Rg.inner && rr < Rg.outer && (!cov || tr > th)) {
            var cphi = (px * Bx + py * By) / (rr * Bh);
            ringAvg(Rg, rr, Math.min(step * Math.sqrt(1 + cphi * cphi * (1 / (Bz * Bz) - 1)), 0.6));
            if (ra.op > 0.0005) {
              var a3 = Lx * Lx + Ly * Ly + Lz * ci * Lz * ci, b3 = px * Lx + py * Ly, shade = 1;
              if (b3 < 0) shade = smoothstep(0.965, 1.02, Math.sqrt(Math.max(0, px * px + py * py - b3 * b3 / a3)));
              var lt = ringLight * (0.10 + 0.90 * shade), rA = ra.op, cr, cg, cb;
              if (litFace) { cr = ra.r * lt; cg = ra.g * lt; cb = ra.b * lt; }
              else { var un = ra.u * lt; cr = un * Rg.meanCol[0]; cg = un * Rg.meanCol[1]; cb = un * Rg.meanCol[2]; }
              r = r * (1 - rA) + cr; g = g * (1 - rA) + cg; bl = bl * (1 - rA) + cb;
              cov += (1 - cov) * rA;
            }
          }
        }
        sr = r; sg = g; sb = bl;
        return cov;
      };
    }

    // n x n rays a pixel, toned as on the screen and laid on transparency
    if (!toneLUT[TONE_N]) buildTone();
    var c2 = cv.getContext('2d'), img = c2.createImageData(S, S), out = img.data, inv = 1 / (n * n);
    for (var py0 = 0; py0 < S; py0++) {
      for (var px0 = 0; px0 < S; px0++) {
        var cov = 0, r = 0, g = 0, bl = 0;
        for (var j = 0; j < n * n; j++) {
          var x = (px0 + ((j % n) + 0.5) / n - half) / k, y = (half - py0 - (((j / n) | 0) + 0.5) / n) / k;
          cov += ray(x, y); r += sr; g += sg; bl += sb;
        }
        cov *= inv;
        var o = (py0 * S + px0) * 4;
        if (cov < 0.004) { out[o + 3] = 0; continue; }
        var a = 255 / cov;
        out[o] = Math.min(255, tone(r * inv) * a); out[o + 1] = Math.min(255, tone(g * inv) * a); out[o + 2] = Math.min(255, tone(bl * inv) * a);
        out[o + 3] = cov * 255;
      }
    }
    c2.putImageData(img, 0, 0);
    return exact;
  }

  var onFocus = null, resizeTimer = 0, lastZoomAt = 0;

  // A nebula's points are made over idle time once it is wanted, a few
  // milliseconds at a time, less while the camera moves.
  var nebQueue = [];
  function queueNebula(key) {
    if (Sf.nebula.points(key) || nebQueue.indexOf(key) >= 0) return;
    nebQueue.push(key);
    if (nebQueue.length > 1) return;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 8; } }); }, 30); };
    var step = function (deadline) {
      var budget = Math.max(1, Math.min(camMoving ? 3 : 8, deadline && deadline.timeRemaining ? deadline.timeRemaining() - 1 : 4));
      if (Sf.nebula.prepare(nebQueue[0], budget)) { nebQueue.shift(); needsRebuild = true; needsDraw = true; }
      if (nebQueue.length) idle(step, { timeout: 300 });
    };
    idle(step, { timeout: 300 });
  }

  // The galaxy's stars are made over idle time once the explorer starts, a
  // few milliseconds at a time, less while the camera moves.
  var galQueued = false;
  function queueGalaxy() {
    if (galQueued) return;
    galQueued = true;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 8; } }); }, 30); };
    var step = function (deadline) {
      var budget = Math.max(1, Math.min(camMoving ? 3 : 8, deadline && deadline.timeRemaining ? deadline.timeRemaining() - 1 : 4));
      var had = !!Sf.galaxy.points(), done = Sf.galaxy.prepare(budget);
      if (!had && Sf.galaxy.points() && galShown(cam.z) > 0) { needsRebuild = true; needsDraw = true; }
      if (!done) idle(step, { timeout: 500 });
    };
    idle(step, { timeout: 500 });
  }

  // the camera straight at the way the explorer frames the body in focus,
  // with no flight
  function placeCamera() {
    var F = byKey[cam.focus], psi = niceHeading(F), th = nicePitch(F, psi);
    cam.z = cam.zGoal = Math.log(spanClose(F));
    cam.o = cam.oGoal = pitchBlend(F, cam.z);
    cam.psi = cam.psiGoal = psi; cam.th = cam.thGoal = th; cam.roll = cam.rollGoal = niceRoll(F, psi, th);
    cam.ax = cam.axGoal = freeCentreX(); cam.ay = cam.ayGoal = freeCentre();
  }
  function hoverOrbit(b) { return !!b && (b.key === 'pluto' || !!Eph.SMALL[b.key] || b.key === 'sgra' || !!Eph.SGRA_STARS[b.key]); }
  var Orrery = {
    init: function (el, hudEl, opts) {
      canvas = el; hudCanvas = hudEl;
      mctx = document.createElement('canvas').getContext('2d');
      if (!glStart()) {
        gl = null;
        ctx = canvas.getContext('2d');
        // A canvas that has handed out a WebGL context cannot give a 2D one,
        // so when WebGL failed after that point a fresh copy takes its place.
        if (!ctx) {
          var fresh = canvas.cloneNode(false);
          canvas.replaceWith(fresh);
          canvas = fresh;
          ctx = canvas.getContext('2d');
        }
      }
      canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); });
      canvas.addEventListener('webglcontextrestored', function () { if (glStart()) { setGrid(fontPx); } });
      hctx = hudCanvas.getContext('2d');
      opts = opts || {};
      if (opts.font) fontFamily = opts.font;
      if (opts.fontWeight) fontWeight = String(opts.fontWeight);
      if (opts.fontPx) fontOverride = opts.fontPx;
      if (opts.accent) accentRGB = hexToRgb(opts.accent);
      if (opts.background) HUD_BG = opts.background;
      if (opts.tune) for (var tk in opts.tune) tune[tk] = opts.tune[tk];
      if (opts.fps) minInterval = 1000 / opts.fps;
      if (opts.time != null) { simTime = +opts.time; simOffset = simTime - Date.now(); }
      reduced = !!opts.reducedMotion;
      if (opts.focus && byKey[opts.focus]) cam.focus = opts.focus;
      if (opts.insets) { inset.top = opts.insets[0] || 0; inset.bottom = opts.insets[1] || 0; inset.right = opts.insets[2] || 0; }
      buildTone();
      var all = " .'`,+*" + SHAPE_SET + RAMP_SET, uniq = '';
      for (var gi = 0; gi < all.length; gi++) if (uniq.indexOf(all[gi]) < 0) uniq += all[gi];
      GLYPHS = uniq; NG = GLYPHS.length;
      ROW_STAR_B = rowFor(190, 210, 255);
      ROW_STAR_W = rowFor(255, 236, 214);
      updateWorld();
      resize();
      placeCamera();
      computeView();
      queueGalaxy();
      window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
      });
      // a window moved to a screen of another pixel density may get no resize
      (function watchDensity() {
        if (!window.matchMedia) return;
        var mq = window.matchMedia('(resolution: ' + (window.devicePixelRatio || 1) + 'dppx)');
        if (!mq.addEventListener) return;
        mq.addEventListener('change', function () { resize(); watchDensity(); }, { once: true });
      })();
      requestAnimationFrame(loop);
      // make every body's coarse map while the page is idle, so the first
      // flight to a planet does not stall on it
      var pending = [], idle = window.requestIdleCallback || function (f) { return setTimeout(f, 120); };
      MAJOR.forEach(function (k) { pending.push(k); if (Sf.BODIES[k].clouds) pending.push(Sf.BODIES[k].clouds); });
      var step = function (deadline) {
        while (pending.length && Sf.has(pending[0])) pending.shift();
        if (!pending.length) return;
        if (!camMoving) {
          var budget = deadline && deadline.timeRemaining ? Math.max(1, Math.min(6, deadline.timeRemaining() - 1)) : 4;
          if (Sf.prepare(pending[0], budget)) pending.shift();
        }
        idle(step, { timeout: 1000 });
      };
      setTimeout(function () { idle(step, { timeout: 1000 }); }, 1500);
    },

    // wheel / pinch: positive zooms out. Zooming in near a body hands it the focus.
    zoom: function (delta, xCss, yCss) {
      if (cam.fly) endFly();
      // The first notch of a scroll picks the body under the pointer. The
      // rest of the same gesture keeps it while it comes to the centre.
      var now = performance.now(), fresh = now - lastZoomAt > 450;
      lastZoomAt = now;
      if (delta < 0 && xCss != null && fresh) {
        var k = pick(xCss, yCss, 70);
        if (!k && !byKey[cam.focus].vis) k = 'sun';
        if (k && k !== cam.focus) {
          setFocus(k);
          // diving in from above: swing round to the body's lit side on the way down
          if (view.o > 0.6 && k !== 'sun') startSwing(byKey[k]);
        }
      }
      // out past the planets the Sun takes the focus, and for a body as far
      // as the nearest stars, once the view has slid to the Sun
      var Fz = byKey[cam.focus];
      if (delta > 0 && cam.focus !== 'sun' && cam.zGoal > Math.log(Math.max(2000, Fz.dist / 0.3))) setFocus('sun');
      // a little quicker once the view looks straight down at the system
      var lim = zLimits(byKey[cam.focus]);
      cam.zGoal = clamp(cam.zGoal + delta * (1 + 0.7 * cam.oGoal) * zoomRate(byKey[cam.focus]), lim[0], lim[1]);
      needsDraw = true;
    },
    // drag: heading and pitch (close up) or the tilt of the system view
    rotate: function (dxCss, dyCss) {
      if (cam.fly) endFly();
      swing = null;
      var s = 0.0055;
      if (view.turn > 0.5) {
        cam.gpsiGoal -= dxCss * s;
        // a nebula may be seen from any side, the galaxy only from above
        var nebula = byKey[cam.focus].S.kind === 'nebula' && galShown(cam.z) < 0.05;
        cam.gtopGoal = clamp(cam.gtopGoal + dyCss * s, nebula ? -89 * DEG : 25 * DEG, nebula ? 89 * DEG : 90 * DEG);
        if (reduced) { cam.gpsi = cam.gpsiGoal; cam.gtop = cam.gtopGoal; }
        needsDraw = true;
        return;
      }
      cam.psiGoal -= dxCss * s;
      if (view.o > 0.5) cam.topGoal = clamp(cam.topGoal + dyCss * s, 15 * DEG, 90 * DEG);
      else cam.thGoal = clamp(cam.thGoal + dyCss * s, -70 * DEG, 75 * DEG);
      if (reduced) { cam.psi = cam.psiGoal; cam.th = cam.thGoal; cam.top = cam.topGoal; }
      needsDraw = true;
    },
    // the camera straight at its framing of the body in focus, with no flight
    frameFocus: function () {
      cam.fly = null; swing = null; cam.offT = [0, 0, 0]; cam.offTh = 0; cam.offG = 0;
      placeCamera();
      needsDraw = true;
    },
    flyTo: function (key) {
      if (key === 'milkyway') return Orrery.galaxy();
      if (byKey[key] && (key !== cam.focus || !cam.fly)) { flyTo(key); needsDraw = true; }
    },
    // the whole galaxy, looking down on it with its centre up the screen
    galaxy: function () {
      cam.gpsiGoal = cam.gpsi + wrapAngle(-cam.gpsi); cam.gtopGoal = 90 * DEG; cam.grollGoal = cam.groll + wrapAngle(-cam.groll);
      flyTo('sun', { z1: Math.log(galaxySpan()), keep: true });
      needsDraw = true;
    },
    // how far the galaxy has come in, 0 to 1
    get galaxyShown() { return galShown(cam.z); },
    overview: function () {
      levelGalaxy();
      flyTo('sun', { z1: Math.log(66), keep: true });
      needsDraw = true;
    },
    pick: function (x, y, reach) { return pick(x, y, reach || 18); },
    // the landing on the body in focus whose mark or name is at a point, or -1
    pickSite: function (x, y, reach) { return siteAt(x, y, reach || 10); },
    // what is under the pointer: a landing ('site'), a body's key, or null
    hover: function (x, y) {
      var si = x == null ? -1 : siteAt(x, y, 10);
      var k = x == null || si >= 0 ? null : pick(x, y, 18), b = k ? byKey[k] : null;
      if (si !== siteHover) { siteHover = si; hudDirty = true; needsDraw = true; }
      if (b !== hover) {
        // a minor body's orbit, Pluto's or a star's round Sagittarius A* is drawn
        // while it, or for those stars the hole, is under the pointer
        if (hoverOrbit(b) || hoverOrbit(hover)) { needsRebuild = true; needsDraw = true; }
        hover = b; hudDirty = true;
      }
      return si >= 0 ? 'site' : k;
    },
    // the landing on the body in focus shown in the info panel, or -1
    setSite: function (i) {
      sitePicked = i == null ? -1 : i; sitePickedOn = cam.focus;
      hudDirty = true; needsDraw = true;
    },
    // how many seconds of the clock pass each second: 1 is real time, a
    // negative number runs it backwards and 0 stops it
    setWarp: function (w) {
      if (w === 1 && warp !== 1) simOffset = simTime - Date.now();
      warp = w; needsDraw = true;
    },
    resetTime: function () { simTime = Date.now(); simOffset = 0; needsRebuild = true; },
    // jump the clock to a moment (ms since 1970, UTC), from which time runs on
    setTime: function (ms) { simTime = ms; simOffset = ms - Date.now(); needsRebuild = true; needsDraw = true; },
    get warp() { return warp; },
    get live() { return liveClock(); },
    // measure the font again, for when it arrives after init
    remeasure: function () { if (canvas) resize(true); },
    // the size the canvases are drawn at now, and the size they would be
    // drawn at for the window as it is (see viewSize), in CSS pixels
    get size() { return [W / dpr, H / dpr]; },
    viewSize: viewSize,
    get date() { return new Date(simTime); },
    get focus() { return cam.focus; },
    get zoomLevel() { return { z: cam.z, o: view.o, w: view.w, span: view.span }; },
    // live numbers for the info panel
    info: function (key) {
      var b = byKey[key || cam.focus], e = byKey.earth;
      var d = [b.pos[0] - e.pos[0], b.pos[1] - e.pos[1], b.pos[2] - e.pos[2]], de = Math.sqrt(dot(d, d));
      var out = { key: b.key, cls: b.S.cls, parent: b.parent, dist: b.dist, distEarth: de, lightMin: de * AU_KM / 299792.458 / 60, radius: b.S.r,
                  lon: (Math.atan2(b.pos[1], b.pos[0]) / DEG + 360) % 360, W: (((b.Wtrue != null ? b.Wtrue : b.W) % 360) + 360) % 360 };
      if (b.parent) {
        var P = byKey[b.parent], dp = [b.pos[0] - P.pos[0], b.pos[1] - P.pos[1], b.pos[2] - P.pos[2]];
        out.distParent = Math.sqrt(dot(dp, dp)) * AU_KM;
      }
      if (b.S.cls === 'comet' || b.S.cls === 'craft' || Eph.SGRA_STARS[b.key]) {
        // speed relative to the Sun, from positions a day apart, or round
        // Sagittarius A*, which holds still, from positions a minute apart, as
        // an orbit there can take an hour and a half
        var h = atCentre(b) ? 30e3 : 43200e3;
        var s0 = Eph.system(new Date(simTime - h)).bodies[b.key].pos, s1 = Eph.system(new Date(simTime + h)).bodies[b.key].pos;
        out.speed = Math.sqrt(Math.pow(s1[0] - s0[0], 2) + Math.pow(s1[1] - s0[1], 2) + Math.pow(s1[2] - s0[2], 2)) * AU_KM / (h / 500);
      }
      return out;
    },
    // one body drawn into a square canvas, for the browser tab. opts.key is
    // the body (the one in focus by default); opts.from is 'camera' for the
    // explorer's own view, 'earth', or 'nice' for how the explorer first frames
    // it; opts.rays is rays per pixel across, and opts.fill the share of the
    // canvas the body and its rings span. Returns false while its map is
    // still being made, so the caller can draw it again later.
    icon: function (cv, opts) {
      opts = opts || {};
      var b = byKey[opts.key || cam.focus];
      if (!b) return false;
      // a hidden tab draws no frames, so a live clock is brought up to now here
      if (warp === 1) { simTime = Date.now() + simOffset; updateWorld(); }
      var V = opts.from === 'earth' && b.key !== 'earth' ? earthView(b) : opts.from === 'nice' || !canvas ? niceView(b) : view;
      return drawIcon(cv, b, V, opts.rays || 3, opts.fill || 0.9);
    },
    onFocus: function (fn) { onFocus = fn; },
    get scene() { return cam; },
    get stats() { return stats; },
    get running() { return running; },
    get grid() { return { cols: cols, rows: rows, cw: cw / dpr, ch: ch / dpr }; },
    get rotation() { var b = byKey[cam.focus], w = b.Wtrue != null ? b.Wtrue : b.W; return ((w % 360) + 360) % 360; },
    setRunning: function (on) { running = !!on; needsDraw = true; },
    // the space the controls take at the top, bottom and right, CSS pixels
    setInsets: function (top, bottom, right) {
      right = right || 0;
      if (inset.top === top && inset.bottom === bottom && inset.right === right) return;
      inset.top = top; inset.bottom = bottom; inset.right = right;
      cam.ayGoal = freeCentre(); cam.axGoal = freeCentreX();
      needsDraw = true;
    },
    // the accent colour of the HUD and of the focused body's orbit
    setAccent: function (hex) {
      var c = hexToRgb(hex);
      if (c[0] === accentRGB[0] && c[1] === accentRGB[1] && c[2] === accentRGB[2]) return;
      accentRGB = c; hudDirty = true; needsRebuild = true; needsDraw = true;
      if (gl) glPalette();
    },
    setLabels: function (l) { for (var k in l) labels[k] = l[k]; if (l.num) fmt = l.num; if (l.int) fmtInt = l.int; hudDirty = true; needsDraw = true; },
    // landings to mark, by body: [name, year, latitude, east longitude]
    setSites: function (s) { sites = s || {}; hudDirty = true; needsDraw = true; },
    // each body's own colour as hex, by key
    setColours: function (c) {
      colours = {};
      for (var k in c) colours[k] = hexToRgb(c[k]);
      hudDirty = true; needsRebuild = true; needsDraw = true;
    },
    setReducedMotion: function (on) { reduced = !!on; needsDraw = true; },
    // how far the controls keep from the sides of the screen, CSS pixels
    setGutter: function (px) { if (px !== gutter) { gutter = px; hudDirty = true; needsDraw = true; } },
    // the boxes the explorer's panels cover, as [left, top, right, bottom] in CSS pixels
    setCovered: function (boxes) {
      var k = JSON.stringify(boxes || []);
      if (k === coverKey) return;
      coverKey = k; covered = boxes || []; coverMask = null; hudDirty = true; needsDraw = true;
    },
    finishTexture: function (key) {
      var k = key || cam.focus, c = Sf.BODIES[k].clouds;
      Sf.texture(k); while (Sf.refine(k, 1000) < 1);
      if (c) { Sf.texture(c); while (Sf.refine(c, 1000) < 1); }
      needsRebuild = true;
    },
    redraw: function () { needsRebuild = true; needsDraw = true; },
    _debug: { cam: cam, view: view, bodies: byKey, tune: tune, cache: function () { return { dU: dU, dV: dV, dK: dK, dF: dF, bR: bR, bG: bG, bB: bB, cols: cols, cw: cw, ch: ch }; } }
  };

  window.Orrery = Orrery;
})();
