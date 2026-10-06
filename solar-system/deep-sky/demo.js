// The deep-sky objects one at a time, drawn with the glyph renderer.
// Previous and Next step through the Milky Way, the nebulae, the Pleiades
// and Sagittarius A*. The points of each object are made a few
// milliseconds at a time, and a status line shows until the ones on the
// screen are ready. The galaxy turns slowly, a nebula sways a little either way to
// show its depth, and the gas round the black hole goes round. When the
// system asks for reduced motion, every object stands still.
(function () {
  "use strict";

  const GR = window.GlyphRenderer;
  const DS = window.DeepSky;
  const canvas = document.getElementById("sky");
  const nameEl = document.querySelector("[data-target]");
  const statusEl = document.querySelector("[data-status]");
  const bar = document.querySelector(".bar");
  if (!GR || !DS || !canvas) return;

  const TAU = Math.PI * 2;
  const DEG = Math.PI / 180;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  // A nebula's reach is how far its gas and stars go from its middle, in
  // units of its radius, so that each one fills about the same room.
  const TARGETS = [
    { key: "galaxy", name: "Milky Way" },
    { key: "helix", name: "Helix Nebula", reach: 0.95 },
    { key: "orionnebula", name: "Orion Nebula", reach: 0.95 },
    { key: "ringnebula", name: "Ring Nebula", reach: 0.95 },
    { key: "eagle", name: "Eagle Nebula", reach: 1.25 },
    { key: "crab", name: "Crab Nebula", reach: 0.75 },
    { key: "carina", name: "Carina Nebula", reach: 1.35 },
    { key: "pleiades", name: "Pleiades", reach: 1.2 },
    { key: "hole", name: "Sagittarius A*" },
  ];

  // The galaxy is seen from 40 degrees off its north pole, from beyond the
  // Sun, and turns once in four minutes.
  const GALAXY_TILT = 40 * DEG;
  const GALAXY_TURN = TAU / 240;
  // A nebula sways 20 degrees either way over 30 seconds.
  const SWAY = 20 * DEG;
  const SWAY_PERIOD = 30;
  // The black hole's disc is tipped 78 degrees from face-on, so its far
  // side shows over the shadow, and its gas goes round once a minute.
  const HOLE_TILT = 78 * DEG;
  const HOLE_SPIN = 1 / 60;
  const HOLE_FRAME = {
    N: [0, Math.sin(HOLE_TILT), Math.cos(HOLE_TILT)],
    Q: [1, 0, 0],
    E: [0, Math.cos(HOLE_TILT), -Math.sin(HOLE_TILT)],
  };
  // Pictures are drawn at up to 30 frames a second.
  const FRAME_MS = 1000 / 30;

  let g = null;
  let index = 0;
  let baseFont = 10;
  let dirty = true;
  let still = motion.matches;
  let clock = 0;    // seconds the object on the screen has been moving
  let spin = 0;     // turns the black hole's gas has gone round
  let lastFrame = 0;

  /* The black hole's map: the colour of its disc laid flat, east longitude
     across and from its inner edge at the top to its outer edge at the
     bottom. It is made a few rows at a time, like the other objects' points. */
  const MAP_W = DS.hole.mapSize[0];
  const MAP_H = DS.hole.mapSize[1];
  const holeMap = new Float32Array(MAP_W * MAP_H * 3);
  let mapRows = 0;
  let holeReady = false;
  function prepareHole(ms) {
    const t0 = performance.now(), out = [0, 0, 0];
    while (mapRows < MAP_H) {
      const lat = 90 - ((mapRows + 0.5) / MAP_H) * 180, cl = Math.cos(lat * DEG), sl = Math.sin(lat * DEG);
      for (let x = 0; x < MAP_W; x++) {
        const lon = ((x + 0.5) / MAP_W) * 360 - 180;
        DS.hole.map(lon, lat, cl * Math.cos(lon * DEG), cl * Math.sin(lon * DEG), sl, out);
        holeMap.set(out, (mapRows * MAP_W + x) * 3);
      }
      mapRows++;
      if (performance.now() - t0 > ms) return false;
    }
    // The first setup traces the paths of light round the hole.
    DS.hole.setup(HOLE_FRAME, g.view, 0.01);
    holeReady = true;
    return true;
  }
  // The map's colour at (u, v), with u going round, into out.
  function sampleMap(u, v, out) {
    let fx = u * MAP_W - 0.5;
    fx -= Math.floor(fx / MAP_W) * MAP_W;
    const fy = Math.min(Math.max(v * MAP_H - 0.5, 0), MAP_H - 1);
    const x0 = fx | 0, x1 = x0 + 1 === MAP_W ? 0 : x0 + 1, tx = fx - x0;
    const y0 = fy | 0, y1 = Math.min(y0 + 1, MAP_H - 1), ty = fy - y0;
    const a = (y0 * MAP_W + x0) * 3, b = (y0 * MAP_W + x1) * 3, c = (y1 * MAP_W + x0) * 3, d = (y1 * MAP_W + x1) * 3;
    for (let k = 0; k < 3; k++) {
      const top = holeMap[a + k] + (holeMap[b + k] - holeMap[a + k]) * tx;
      const bottom = holeMap[c + k] + (holeMap[d + k] - holeMap[c + k]) * tx;
      out[k] = top + (bottom - top) * ty;
    }
  }

  function ready(t) {
    if (t.key === "galaxy") return !!DS.galaxy.points();
    if (t.key === "hole") return holeReady;
    return !!DS.nebula.points(t.key);
  }
  function prepare(t, ms) {
    if (t.key === "galaxy") return DS.galaxy.prepare(ms);
    if (t.key === "hole") return prepareHole(ms);
    return DS.nebula.prepare(t.key, ms);
  }

  // The points are made a few milliseconds at a time: the object on the
  // screen first, in steps of 12 ms between frames, then the next one over
  // idle time, so that Next usually finds it ready.
  const idle = window.requestIdleCallback || function (f) { return setTimeout(function () { f(null); }, 30); };
  let working = false;
  function work(deadline) {
    let t = null;
    for (let i = 0; i < 2 && !t; i++) {
      const c = TARGETS[(index + i) % TARGETS.length];
      if (!ready(c)) t = c;
    }
    if (!t) { working = false; return; }
    const shown = t === TARGETS[index];
    const budget = shown ? 12 : deadline && deadline.timeRemaining ? Math.max(1, Math.min(8, deadline.timeRemaining() - 1)) : 4;
    if (prepare(t, budget) && shown) {
      statusEl.hidden = true;
      dirty = true;
    }
    if (shown) setTimeout(work, 0);
    else idle(work, { timeout: 300 });
  }
  function startWork() {
    if (working) return;
    working = true;
    idle(work, { timeout: 300 });
  }

  /* ----------------------------------------------------------------------
     Drawing
     ---------------------------------------------------------------------- */
  // The middle of the window below the bar, and the size of the largest
  // square that fits there, in device pixels.
  function room() {
    const top = bar.getBoundingClientRect().height * g.dpr;
    return { x: g.W / 2, y: top + (g.H - top) / 2, size: Math.min(g.W, g.H - top) };
  }
  // A camera that looks along -z with x to the right and y up, at one
  // device pixel to a unit, as the renderer's own camera starts.
  function flatView() {
    const v = g.view;
    v.T = [0, 0, 0]; v.R = [1, 0, 0]; v.U = [0, 1, 0]; v.B = [0, 0, 1];
    v.k = 1; v.span = g.H; v.ax = 0.5; v.ay = 0.5;
  }

  function drawGalaxy(r) {
    // The camera looks at the centre from beyond the Sun, tipped from the
    // north pole, and goes round the pole as the galaxy turns.
    const az = Math.PI + clock * GALAXY_TURN;
    const st = Math.sin(GALAXY_TILT), ct = Math.cos(GALAXY_TILT), ca = Math.cos(az), sa = Math.sin(az);
    const v = g.view;
    v.T = [0, 0, 0];
    v.B = [st * ca, st * sa, ct];
    v.U = [-ct * ca, -ct * sa, st];
    v.R = [v.U[1] * v.B[2] - v.U[2] * v.B[1], v.U[2] * v.B[0] - v.U[0] * v.B[2], v.U[0] * v.B[1] - v.U[1] * v.B[0]];
    // 32 kiloparsecs across the room
    v.k = r.size / 32;
    v.span = g.H / v.k;
    v.ax = 0.5;
    v.ay = r.y / g.H;
    DS.drawGalaxy(g);
  }

  function drawNebula(t, r) {
    const a = SWAY * Math.sin((TAU * clock) / SWAY_PERIOD), c = Math.cos(a), s = Math.sin(a);
    flatView();
    DS.drawNebula(g, { key: t.key, x: r.x, y: r.y, radius: (r.size * 0.46) / t.reach, frame: { u: [c, 0, -s], v: [0, 1, 0], w: [s, 0, c] } });
  }

  function drawHole(r) {
    flatView();
    DS.drawHole(g, { x: r.x, y: r.y, radius: (r.size * 0.47) / DS.hole.reach, frame: HOLE_FRAME, map: function () { return 1; } });
  }

  // The galaxy has finer detail than the rest, so its characters are three
  // fifths of the usual size, as long as there are no more than about
  // 85,000 of them on the screen.
  function fontFor(t) {
    if (t.key !== "galaxy") return baseFont;
    const cap = Math.sqrt((window.innerWidth * window.innerHeight) / (0.732 * 85000));
    return Math.max(5, Math.round(baseFont * 1.2) / 2, Math.ceil(cap * 2) / 2);
  }

  function build() {
    dirty = false;
    const t = TARGETS[index], px = fontFor(t);
    if (g.fontPx !== px) g.setFont(px);
    const r = room();
    g.clear();
    if (t.key === "galaxy") drawGalaxy(r);
    else if (t.key === "hole") { if (holeReady) drawHole(r); }
    else drawNebula(t, r);
    g.compose();
    g.present();
  }

  // In a frame on another page (?embed), the picture stops while the frame
  // is off screen.
  let onScreen = true;
  function watchScreen(el) {
    if (!document.documentElement.hasAttribute("data-embed") || !window.IntersectionObserver) return;
    new IntersectionObserver(function (entries) { onScreen = entries[entries.length - 1].isIntersecting; }).observe(el);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (!onScreen) return;
    if (now - lastFrame < FRAME_MS) return;
    const dt = Math.min(now - lastFrame, 100) / 1000;
    lastFrame = now;
    const t = TARGETS[index];
    const moving = !still && ready(t);
    if (moving) clock += dt;
    if (t.key === "hole") {
      if (dirty) build();
      else if (moving) {
        // The gas goes round under a still camera, so only the cells that
        // show the disc's map are shaded again.
        spin += dt * HOLE_SPIN;
        g.update();
        g.present();
      }
    } else if (dirty || moving) {
      build();
    }
  }

  // The characters are 8, 9 or 10 px by the window's width, and grow with
  // the reader's text size setting.
  function size(remeasure) {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const em = window.innerWidth / rem;
    baseFont = ((em < 40 ? 8 : em < 68.75 ? 9 : 10) * rem) / 16;
    g.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2), fontFor(TARGETS[index]), remeasure === true);
    dirty = true;
  }

  function show(i) {
    index = (i + TARGETS.length) % TARGETS.length;
    const t = TARGETS[index];
    nameEl.textContent = t.name;
    statusEl.hidden = ready(t);
    clock = 0;
    dirty = true;
    startWork();
  }

  function start() {
    g = GR.create(canvas, { font: getComputedStyle(document.body).fontFamily });
    // The black hole's disc is shaded from its map, turned by the spin.
    g.setSampler(function (id, u, v, out) { sampleMap(u - spin, v, out); });
    size();
    show(0);
    watchScreen(g.canvas);
    requestAnimationFrame(frame);
    document.querySelector("[data-prev]").addEventListener("click", function () { show(index - 1); });
    document.querySelector("[data-next]").addEventListener("click", function () { show(index + 1); });
    if (motion.addEventListener) {
      motion.addEventListener("change", function () { still = motion.matches; dirty = true; });
    }
    let resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(size, 150);
    });
  }

  // The page starts once IBM Plex Mono has loaded, or after 1.5 s without
  // it. A font that arrives later is measured again.
  let fontLoaded = false;
  const fontLoad = document.fonts && document.fonts.load
    ? document.fonts.load('400 11px "IBM Plex Mono"').then(function () { fontLoaded = true; }, function () {})
    : Promise.resolve();
  Promise.race([fontLoad, new Promise(function (r) { setTimeout(r, 1500); })]).then(function () {
    const lateFont = !fontLoaded;
    start();
    if (lateFont) fontLoad.then(function () { if (fontLoaded) size(true); });
  });
})();

// The Read me panel: open and close it, close it with Escape, and copy a
// code block to the clipboard.
(function () {
  const panel = document.getElementById("readme");
  const open = document.querySelector("[data-readme-open]");
  if (!panel || !open) return;
  function show(on) {
    panel.hidden = !on;
    open.setAttribute("aria-expanded", String(on));
    if (on) panel.querySelector("[data-readme-close]").focus();
    else open.focus();
  }
  open.addEventListener("click", function () { show(panel.hidden); });
  panel.querySelector("[data-readme-close]").addEventListener("click", function () { show(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) show(false); });
  panel.querySelectorAll("[data-copy-code]").forEach(function (button) {
    button.addEventListener("click", function () {
      const text = button.parentElement.querySelector("code").textContent;
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = "Copy"; }, 1500);
      }, function () {});
    });
  });
})();
