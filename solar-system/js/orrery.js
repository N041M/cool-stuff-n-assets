/* ==========================================================================
   ORRERY // the solar system, live, drawn in characters
   --------------------------------------------------------------------------
   The Sun, the eight planets and their moons sit where they really are on
   the clock (planet-positions), with their real sizes, oblateness, axial
   tilts and rotation. The camera is orthographic, except that a body far
   behind the one in view is drawn at the size it looks from there. Close
   to a body it looks at it from a low angle above the ecliptic. Zooming
   out pitches it up until it looks straight down on the plane of the
   planets, and the target slides from the body to the Sun, so one zoom
   runs from a single planet to the whole system and back. Further out the
   camera turns to the plane of the galaxy and the target slides on to the
   galactic centre, out to the whole Milky Way.

   The picture is drawn by the glyph renderer (glyph-renderer), which
   samples every character cell at six points (2 x 3). This file ray-casts
   the bodies into those samples as ellipsoids with their maps
   (planet-surfaces), ring planes, ring and planet shadows and eclipses.
   It rasterises the orbits, the asteroid and Kuiper belts and the Sun's
   glow into the same samples. The spacecraft (spacecraft), Halley's coma
   and tails (comet), the galaxy, the nebulae and the black hole
   (deep-sky), and the background stars and other galaxies (night-sky) are
   drawn into them by their own components.

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

  var Sf = window.Surfaces, Eph = window.Ephemeris, GR = window.GlyphRenderer;
  var NS = window.NightSky, DS = window.DeepSky, CM = window.Comet, SC = window.Spacecraft;
  var AU_KM = Eph.AU_KM, LIGHT_AU_DAY = 299792.458 * 86400 / AU_KM;
  var SUN_R = Sf.BODIES.sun.r / AU_KM;
  var GAL = Eph.GALAXY, KPC = GAL.KPC_AU, LY = 63241.077, GC_DIST = Math.sqrt(dot(GAL.centre, GAL.centre));
  // the galaxy's frame in the ecliptic coordinates the camera works in, for deep-sky
  var GAL_FRAME = { x: GAL.x, y: GAL.y, z: GAL.z, centre: GAL.centre, unit: KPC, toScene: GAL.toEcl };
  // the black hole's disc is mapped the way the planets are
  Sf.define('sgra', { size: DS.hole.mapSize, gen: DS.hole.map });

  /* ------------------------------------------------------------------------
     Bodies
     ------------------------------------------------------------------------ */
  // Every body, from the components that describe it: the Sun, the planets,
  // the moons and the stars from planet-surfaces, the spacecraft from
  // spacecraft, and the nebulae and the black hole from deep-sky. Bodies
  // at the same depth are drawn in this order, and their names give way to
  // one another in it, so it is kept as it is.
  var BODIES = (function () {
    var S = Sf.BODIES, keys = Object.keys(S), out = {}, cut = keys.indexOf('halley') + 1, i;
    for (i = 0; i < cut; i++) out[keys[i]] = S[keys[i]];
    // JWST stays by the Earth
    Object.keys(SC.fleet).forEach(function (k) {
      var M = SC.models[SC.fleet[k]];
      out[k] = { r: M.r / 1000, f: 0, kind: 'rock', cls: 'craft', col: M.col, model: M, host: k === 'jwst' ? 'earth' : null };
    });
    Object.keys(DS.nebula.catalogue).forEach(function (k) {
      var n = DS.nebula.catalogue[k];
      out[k] = { r: n.radius, f: 0, kind: 'nebula', cls: 'nebula', col: n.colour, glowCol: n.colour };
    });
    for (i = cut; i < keys.length; i++) if (keys[i] !== 's2') out[keys[i]] = S[keys[i]];
    var H = DS.hole;
    out.sgra = { r: H.radius, m: H.mass, f: 0, kind: 'hole', radial: H.radial, col: H.colour, cls: 'hole', glowCol: H.glow };
    out.s2 = S.s2;
    return out;
  })();
  var MAJOR = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  var KEYS = Object.keys(BODIES);
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
    return LAPSE[k] || BODIES[k].kind === 'star' ? tune.lapse : TURN[k] ? 86400 * 360 / Math.abs(Eph.rotationRate(k)) / TURN[k] : 1;
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
    var S = BODIES[k];
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
     The colours of the HUD and of the bodies
     ------------------------------------------------------------------------ */
  var accentRGB = [240, 161, 74], dimRGB = [150, 150, 156];
  // each body's own colour, for its name and orbit while it is under the pointer
  var colours = {};
  function colourOf(b) { return colours[b.key] || accentRGB; }

  function hexToRgb(h) {
    h = h.trim().replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbStr(c) { return 'rgb(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ')'; }

  /* ------------------------------------------------------------------------
     The renderer and its grid. The explorer keeps a copy of the grid's size
     and of the sample buffers, which sync() brings up to date whenever the
     grid changes. The HUD swaps the copy for a grid of its own while it
     draws.
     ------------------------------------------------------------------------ */
  var G = null, sky = null, canvas, hudCanvas, hctx, dpr = 1;
  var cw = 0, ch = 0, cols = 0, rows = 0, fontPx = 10, fontOverride = 0;
  var fontFamily = 'monospace', fontWeight = '400';
  var W = 0, H = 0, aspect = 1.6;
  var HUD_BG = '#050608';
  var bR, bG, bB, dK, dU, dV, dF, cOcc;
  var sampleX, sampleY, addBase, splat, line, project, freeze;
  function sync() {
    W = G.W; H = G.H; dpr = G.dpr; cw = G.cw; ch = G.ch; cols = G.cols; rows = G.rows; fontPx = G.fontPx;
    bR = G.red; bG = G.green; bB = G.blue; dK = G.tex; dU = G.texU; dV = G.texV; dF = G.texF; cOcc = G.cover;
  }

  var tune = {
    mipBias: 0,
    orbit: 0.20, orbitFocus: 0.34, belt: 0.22, lapse: 160, galaxy: 2.5, galaxyPoints: 0.0055, nebula: 0.2, nebulaMax: 0.9, nebulaStars: 1.4, comet: 0.002
  };
  // the renderer's tone curve, or the default one before it starts
  function tone(x) { return G ? G.tone(x) : GR.tone(x); }

  var running = true, reduced = false;
  // setPaused(true) stops the drawing, as a hidden tab does
  var paused = false;
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
    var F = SC.orient(b.model, b.pos, earth);
    b.N = F.N; b.Q = F.Q; b.E = F.E;
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
     A body's map at (u, v), between its four nearest texels, into sr, sg
     and sb
     ------------------------------------------------------------------------ */
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
     The Earth's clouds are a map of their own (planet-surfaces) laid over the
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

  /* ------------------------------------------------------------------------
     Rebuild: lay out every static contribution for the current view
     ------------------------------------------------------------------------ */
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
      b.ext = Math.max(b.rd * (b.ring ? b.ring.outer : b.S.kind === 'nebula' ? 1.5 : b.S.kind === 'hole' ? DS.hole.reach : 1.1), b.reach * view.k * b.shrink) + Math.max(cw, ch);
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
     Comets, with their coma and tails from comet. They fade with the rest
     of the solar system's drawing.
     ------------------------------------------------------------------------ */
  function drawComets(fade) {
    var P = [0, 0, 0], jd = Eph.julianDay(simDate);
    for (var ci = 0; ci < bodies.length; ci++) {
      var b = bodies[ci];
      if (b.S.cls !== 'comet' || b.off) continue;
      project(b.pos, P);
      var kk = view.k * pullIn(P);
      CM.draw(G, { elements: Eph.SMALL[b.key], jd: jd, pos: b.pos, x: P[0], y: P[1], scale: kk, frame: b, fade: fade, key: b.key,
                   gain: tune.comet, max: tune.nebulaMax });
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
     The galaxy, from deep-sky, laid in the ecliptic coordinates the camera
     works in
     ------------------------------------------------------------------------ */
  // the galactocentric x, y (kpc) of where the sample at screen (sx, sy) meets the plane
  function galAt(sx, sy) {
    var a = (sx - view.ax * W) / view.k, b = (view.ay * H - sy) / view.k, R = view.R, U = view.U, B = view.B, C = GAL.centre;
    var P = [view.T[0] + R[0] * a + U[0] * b - C[0], view.T[1] + R[1] * a + U[1] * b - C[1], view.T[2] + R[2] * a + U[2] * b - C[2]];
    var t = -dot(P, GAL.z) / dot(B, GAL.z), Hp = [P[0] + t * B[0], P[1] + t * B[1], P[2] + t * B[2]];
    return [dot(Hp, GAL.x) / KPC, dot(Hp, GAL.y) / KPC];
  }
  function drawGalaxy(al) {
    DS.drawGalaxy(G, GAL_FRAME, { alpha: al, gain: tune.galaxy, points: tune.galaxyPoints });
  }

  /* ------------------------------------------------------------------------
     Nebulae and the Pleiades, from deep-sky. Their points are made over
     idle time the first time they are wanted (queueNebula).
     ------------------------------------------------------------------------ */
  // its own frame in ecliptic coordinates: u to the right and v up as seen
  // from the Earth with north up, and w toward the Earth
  function nebFrame(b) {
    if (b.nf) return b.nf;
    var a = norm(b.pos), e = norm(cross(SKY_N, a)), n = cross(a, e);
    return (b.nf = { u: [-e[0], -e[1], -e[2]], v: n, w: [-a[0], -a[1], -a[2]] });
  }
  function drawNebula(b) {
    var drawn = DS.drawNebula(G, { key: b.key, x: b.sx, y: b.sy, radius: b.rp, dot: b.rd, alpha: b.alpha, glow: b.S.glowCol, frame: nebFrame(b),
                                   gain: tune.nebula, max: tune.nebulaMax, stars: tune.nebulaStars });
    if (!drawn) queueNebula(b.key);
  }

  /* ------------------------------------------------------------------------
     The black hole at the galaxy's centre and its disc, from deep-sky. The
     clumps on the disc are shaded from its map each frame, as a planet's
     surface is, so they go round with the gas.
     ------------------------------------------------------------------------ */
  function drawHole(b) {
    DS.drawHole(G, { x: b.sx, y: b.sy, radius: b.rp, dot: b.rd, alpha: b.alpha, glow: b.S.glowCol, frame: b,
                     coarse: quick() && b.rp > 6 * ch, map: function () {
      if (!b.tex) b.tex = Sf.texture(b.key);
      // the map's level: about one texel a sample round the ring
      b.lvl = clamp(Math.floor(Math.log2(b.tex.w * ch / (3 * TAU * b.rp)) + 0.35 + tune.mipBias), 0, b.tex.levels.length - 1);
      return b.i + 1;
    } });
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
    if (coarse) G.coarse = true;

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

  // while the camera moves or the clock runs faster or slower than real,
  // every frame is drawn anew, so the large things in it are drawn at half
  // their samples. A stopped clock (warp 0) counts as still.
  function quick() { return camMoving || (warp !== 1 && warp !== 0); }

  /* ------------------------------------------------------------------------
     Spacecraft: a model from spacecraft ray-cast at its real size
     ------------------------------------------------------------------------ */
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
    // m: metres per device pixel
    SC.draw(G, { model: M, x: b.sx, y: b.sy, metres: AU_KM * 1000 / (view.k * b.shrink), frame: b, light: lightDir(b),
                 reach: b.reach * view.k * b.shrink, alpha: al * grow, fine: !quick() });
  }

  var rebuildAt = 0, lastSig = null;
  var prof = stats.prof = {};
  function mark(k, t0) { var t1 = performance.now(); prof[k] = (prof[k] || 0) * 0.8 + (t1 - t0) * 0.2; return t1; }
  function rebuild() {
    stats.rebuilds++;
    var tp = performance.now();
    G.clear();
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
    if (aGal > 0.01) { NS.drawGalaxies(G, aGal, galAt); tp = mark('far', tp); drawGalaxy(aGal); }
    tp = mark('galaxy', tp);
    drawStarGlows();

    // bodies, far to near
    var order = bodies.filter(function (b) { return b.vis; }).sort(function (a, b) { return a.depth - b.depth; });
    G.coarse = false;
    for (var i = 0; i < order.length; i++) {
      var b = order[i];
      b.W0 = b.W; b.rot = 0;
      if (b.model) rasterCraft(b); else if (b.S.kind === 'nebula') drawNebula(b); else if (b.S.kind === 'hole') drawHole(b); else rasterBody(b);
    }
    tp = mark('bodies', tp);

    buildStarCells();
    tp = mark('stars', tp);
    // the whole screen once, finding on the way which cells need shading again each frame
    sky.time = t; sky.still = reduced;
    G.compose(sky);
    stats.cells = G.drawn;
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
     The background stars, from night-sky. They turn with the camera, and
     over the galaxy a sky of its own takes their place.
     ------------------------------------------------------------------------ */
  function buildStarCells() {
    sky.place({ stars: starsShown(cam.z), galaxyStars: galShown(cam.z), disc: galAt });
  }

  // a frame with the view unchanged: the bodies spin and the stars twinkle
  function frame() {
    var t0 = performance.now();
    // spin
    for (var i = 0; i < bodies.length; i++) { var b = bodies[i]; b.rot = (b.W - b.W0) / 360; }
    sky.time = t; sky.still = reduced;
    G.update(sky, !reduced);
    stats.cells = G.drawn;
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
    hctx.font = G.font(fontPx);
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
      return list.map(function (b) { var p = DS.galaxy.armPoint(l[1], b); return GAL.toEcl(p[0], p[1], 0); });
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
    if (document.hidden || paused || !W || !H) { lastNow = 0; return; }
    var moving = !!cam.fly || cam.z !== cam.zGoal || cam.psi !== cam.psiGoal || cam.th !== cam.thGoal || cam.roll !== cam.rollGoal ||
                 cam.ax !== cam.axGoal || cam.ay !== cam.ayGoal || cam.offTh !== 0 || cam.offG !== 0 || swingDue() || cam.ov !== 0 || cam.o !== cam.oGoal || cam.offT[0] !== 0 || cam.top !== cam.topGoal ||
                 cam.gpsi !== cam.gpsiGoal || cam.gtop !== cam.gtopGoal;
    camMoving = moving; G.moving = moving;
    // drawn on the GPU, a frame leaves the browser little to do, so it can take more of a refresh
    var interval = moving ? (msMove < refresh * (G.gl ? 0.75 : 0.6) ? refresh : 2 * refresh) : Math.max(frameInterval, refresh);
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
    if (!moving && G.coarse) needsRebuild = true;
    var St = byKey[cam.focus].tex;
    stats.ready = St ? (St.ready ? 1 : St.progress) : 0;
    var sig = signature();
    if (needsRebuild || sigChanged(sig, lastSig) || now - rebuildAt > (warp !== 1 && warp !== 0 ? 0 : 10000)) {
      lastSig = sig; needsRebuild = false;
      rebuild();
    } else {
      frame();
    }
    var tg0 = performance.now();
    if (G.present()) mark('present', tg0);
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
  function setGrid(px) {
    G.setFont(px);
    sync();
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
    fontScale = rem / 16;
    // 8, 9 or 10px by the window's width in em
    var em = cssW / rem;
    baseFont = fontOverride || (em < 40 ? 8 : em < 68.75 ? 9 : 10) * fontScale;
    // the sky's canvas and its grid, and the HUD's canvas at the same size
    G.resize(cssW, cssH, dpr, baseFont, force === true);
    sync();
    if (W > 0 && H > 0) aspect = W / H;        // a 0 x 0 window keeps the last shape and draws nothing
    hudCanvas.width = W; hudCanvas.height = H;
    hudCanvas.style.width = cssW + 'px'; hudCanvas.style.height = cssH + 'px';
    needsRebuild = true;
    needsDraw = true;
    hudDirty = true;
    // the labels are at least 11px, and larger with a larger text size
    var hudPx = fontOverride || Math.max(baseFont, 11 * fontScale), hc = G.cellSize(hudPx);
    hudGrid = { px: hudPx, cw: hc[0], ch: hc[1], cols: Math.ceil(W / hc[0]), rows: Math.ceil(H / hc[1]) };
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

  var craftIds = new Int16Array(64), so3 = [0, 0, 0];
  for (var ci0 = 0; ci0 < craftIds.length; ci0++) craftIds[ci0] = ci0;

  // a nebula's points summed into the icon's pixels; false until they are made
  function drawNebulaIcon(cv, b, V, fill) {
    var M = DS.nebula.points(b.key), S = cv.width, half = S / 2, k = half * fill, c2 = cv.getContext('2d');
    if (!M) { queueNebula(b.key); return false; }
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
    var Hs = DS.hole.setup(b, V, 1 / (k * n), b.tex ? b.tex.mean : b.S.col), T = b.tex, ho = { r: 0, g: 0, b: 0, u: 0, v: 0, f: 0 };
    var bd = T && { rot: 0, tex: T, clouds: null, lvl: clamp(Math.floor(Math.log2(T.w / (TAU * k * n)) + 0.35), 0, T.levels.length - 1) };
    var c2 = cv.getContext('2d'), img = c2.createImageData(S, S), out = img.data, inv = 1 / (n * n), m = Hs.mean;
    for (var py0 = 0; py0 < S; py0++) {
      for (var px0 = 0; px0 < S; px0++) {
        var r = 0, g = 0, bl = 0;
        for (var j = 0; j < n * n; j++) {
          DS.hole.at(Hs, (px0 + ((j % n) + 0.5) / n - half) / k, (half - py0 - (((j / n) | 0) + 0.5) / n) / k, ho);
          r += ho.r; g += ho.g; bl += ho.b;
          if (!ho.f) continue;
          if (bd) { surface(bd, ho.u, ho.v); r += sr * ho.f; g += sg * ho.f; bl += sb * ho.f; }
          else { r += m[0] * ho.f; g += m[1] * ho.f; bl += m[2] * ho.f; }
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
        var cov = SC.rayParts(parts, craftIds, 0, parts.length, x * mR[0] + y * mU[0], x * mR[1] + y * mU[1], x * mR[2] + y * mU[2], d, L, foot, so3);
        sr = so3[0]; sg = so3[1]; sb = so3[2];
        return cov;
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
    if (DS.nebula.points(key) || nebQueue.indexOf(key) >= 0) return;
    nebQueue.push(key);
    if (nebQueue.length > 1) return;
    var idle = window.requestIdleCallback || function (f) { return setTimeout(function () { f({ timeRemaining: function () { return 8; } }); }, 30); };
    var step = function (deadline) {
      var budget = Math.max(1, Math.min(camMoving ? 3 : 8, deadline && deadline.timeRemaining ? deadline.timeRemaining() - 1 : 4));
      if (DS.nebula.prepare(nebQueue[0], budget)) { nebQueue.shift(); needsRebuild = true; needsDraw = true; }
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
      var had = !!DS.galaxy.points(), done = DS.galaxy.prepare(budget);
      if (!had && DS.galaxy.points() && galShown(cam.z) > 0) { needsRebuild = true; needsDraw = true; }
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

  // The glyph renderer that draws the sky into a canvas, with WebGL where
  // the browser has it and on a 2D canvas otherwise. A canvas that has
  // already given out a 2D context cannot give a WebGL one, so the renderer
  // takes the 2D path on such a canvas.
  var rendererTune = {}, glyphsOn = true;
  function contextRestored() { sync(); needsRebuild = true; needsDraw = true; hudDirty = true; }
  function makeRenderer(el) {
    G = GR.create(el, { font: fontFamily, weight: fontWeight, view: view, tune: rendererTune, glyphs: glyphsOn });
    canvas = G.canvas;
    sampleX = G.sampleX; sampleY = G.sampleY; addBase = G.add; splat = G.splat; line = G.line; project = G.project; freeze = G.freeze;
    // a sample that shows a body's map is shaded from it as the body turns
    G.setSampler(function (id, u, v, out) { surface(bodies[id - 1], u, v); out[0] = sr; out[1] = sg; out[2] = sb; });
    sky = NS.layer(G);
    // a WebGL context that comes back needs the whole picture again
    canvas.addEventListener('webglcontextrestored', contextRestored);
  }

  var Orrery = {
    // every body by key: its radius (km), kind, class and what it goes round
    BODIES: BODIES,
    init: function (el, hudEl, opts) {
      opts = opts || {};
      hudCanvas = hudEl;
      if (opts.font) fontFamily = opts.font;
      if (opts.fontWeight) fontWeight = String(opts.fontWeight);
      if (opts.fontPx) fontOverride = opts.fontPx;
      // the settings of the explorer's own drawing, and of the renderer's
      if (opts.tune) for (var tk in opts.tune) { if (tk in tune) tune[tk] = opts.tune[tk]; else rendererTune[tk] = opts.tune[tk]; }
      if (opts.renderer === '2d') el.getContext('2d');
      if (opts.glyphs === false) glyphsOn = false;
      makeRenderer(el);
      hctx = hudCanvas.getContext('2d');
      if (opts.accent) accentRGB = hexToRgb(opts.accent);
      if (opts.background) HUD_BG = opts.background;
      if (opts.fps) minInterval = 1000 / opts.fps;
      if (opts.time != null) { simTime = +opts.time; simOffset = simTime - Date.now(); }
      reduced = !!opts.reducedMotion;
      if (opts.focus && byKey[opts.focus]) cam.focus = opts.focus;
      if (opts.insets) { inset.top = opts.insets[0] || 0; inset.bottom = opts.insets[1] || 0; inset.right = opts.insets[2] || 0; }
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
    // Which renderer draws the characters: 'webgl', or '2d' where WebGL is
    // missing or was turned off.
    get renderer() { return G ? (G.gl ? 'webgl' : '2d') : null; },
    // Draws the characters with WebGL ('webgl') or on a 2D canvas ('2d'). A
    // new canvas and renderer take the place of the old ones, and the
    // camera, the focus and the clock carry on. The old canvas's WebGL
    // context is let go at once. Returns the renderer in use, which stays
    // '2d' when WebGL is asked for and the browser has none.
    setRenderer: function (kind) {
      if (!G || (kind === '2d') === !G.gl) return Orrery.renderer;
      var old = canvas, fresh = document.createElement('canvas');
      for (var i = 0; i < old.attributes.length; i++) {
        var a = old.attributes[i];
        if (a.name !== 'width' && a.name !== 'height' && a.name !== 'style') fresh.setAttribute(a.name, a.value);
      }
      if (kind === '2d') fresh.getContext('2d');
      old.removeEventListener('webglcontextrestored', contextRestored);
      if (G.gl) {
        var gl = old.getContext('webgl'), lose = gl && gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
      old.replaceWith(fresh);
      old.width = old.height = 0;
      makeRenderer(fresh);
      resize(true);
      return Orrery.renderer;
    },
    // Whether the sky is drawn in characters. Without them the renderer
    // draws the same light as a picture, on a grid of smaller cells.
    get glyphs() { return glyphsOn; },
    setGlyphs: function (on) {
      glyphsOn = on !== false;
      if (!G || G.glyphs === glyphsOn) return;
      G.setGlyphs(glyphsOn);
      sync();
      coverMask = null;
      needsRebuild = true; needsDraw = true; hudDirty = true;
    },
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
    // Stops drawing while on is true, for a page that scrolls the sky out
    // of view. At real speed the clock keeps up with the wall clock. At any
    // other rate it waits until the drawing starts again.
    setPaused: function (on) { paused = !!on; needsDraw = true; },
    get paused() { return paused; },
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
      var k = key || cam.focus, c = BODIES[k].clouds;
      Sf.texture(k); while (Sf.refine(k, 1000) < 1);
      if (c) { Sf.texture(c); while (Sf.refine(c, 1000) < 1); }
      needsRebuild = true;
    },
    redraw: function () { needsRebuild = true; needsDraw = true; },
    _debug: { cam: cam, view: view, bodies: byKey, tune: tune, cache: function () { return { dU: dU, dV: dV, dK: dK, dF: dF, bR: bR, bG: bG, bB: bB, cols: cols, cw: cw, ch: ch }; } }
  };

  window.Orrery = Orrery;
})();