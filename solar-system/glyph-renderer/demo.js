// The demo page: a ring drawn in characters by glyph-renderer.js with a scene
// function of its own, turning slowly. It stands still when the system asks
// for reduced motion.
(function () {
  'use strict';

  const GR = window.GlyphRenderer;
  const canvas = document.getElementById('art');
  if (!GR || !canvas) return;

  const bar = document.querySelector('.bar');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const g = GR.create(canvas, { font: getComputedStyle(document.body).fontFamily });

  function unit(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }

  // The ring is a torus. RING is the radius of its middle circle and TUBE the
  // radius of the tube, in the ring's own units. Its axis is y.
  const RING = 1, TUBE = 0.42, OUTER = RING + TUBE;
  // A warm light from the upper left and a faint cool one from the lower
  // right. The screen's x is to the right, y up and z toward the viewer.
  const KEY = unit([-0.6, 0.62, 0.5]), KEY_RGB = [0.85, 0.72, 0.55];
  const FILL = unit([0.7, -0.5, 0.2]), FILL_RGB = [0.16, 0.22, 0.38];
  // The ring turns once in 40 seconds about the screen's vertical, and its
  // axis leans toward the viewer so that the hole shows.
  const TURN = Math.PI * 2 / 40, LEAN = 1.05;

  // The matrix from the screen's space into the ring's, and the lights and
  // the way to the viewer in the ring's space, for the current pose.
  let m = [1, 0, 0, 0, 1, 0, 0, 0, 1], key = KEY, fill = FILL, half = KEY, dx = 0, dy = 0, dz = -1;
  // Where the ring's middle is on the canvas and its size, in CSS pixels.
  let cx = 0, cy = 0, scale = 1;

  function apply(v) {
    return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  }
  // The ring is leaned by `lean` about the screen's x axis and then turned
  // by `turn` about the screen's y axis. The matrix undoes both.
  function pose(turn, lean) {
    const ct = Math.cos(turn), st = Math.sin(turn), cl = Math.cos(lean), sl = Math.sin(lean);
    m = [ct, 0, -st, sl * st, cl, sl * ct, cl * st, -sl, cl * ct];
    key = apply(KEY); fill = apply(FILL);
    const view = apply([0, 0, 1]);
    half = unit([key[0] + view[0], key[1] + view[1], key[2] + view[2]]);
    dx = -view[0]; dy = -view[1]; dz = -view[2];
  }

  // The distance from a point to the ring's surface.
  function distance(x, y, z) { return Math.hypot(Math.hypot(x, z) - RING, y) - TUBE; }

  // How much of the key light reaches a point on the surface, 0 to 1, with a
  // soft edge to the shadow the ring casts on itself.
  function shadow(x, y, z) {
    let lit = 1, t = 0.02;
    for (let i = 0; i < 40 && t < 3; i++) {
      const d = distance(x + key[0] * t, y + key[1] * t, z + key[2] * t);
      if (d < 0.001) return 0;
      lit = Math.min(lit, 8 * d / t);
      t += d;
    }
    return lit;
  }

  // The scene: the light at a point of the canvas, in CSS pixels. A ray goes
  // from the viewer through the point, steps along until it meets the ring,
  // and the surface there is shaded by the two lights.
  function scene(sx, sy, out) {
    const X = (sx - cx) / scale, Y = (cy - sy) / scale, r2 = X * X + Y * Y;
    if (r2 >= OUTER * OUTER) return;
    const front = Math.sqrt(OUTER * OUTER - r2), o = apply([X, Y, front]);
    let t = 0, x = 0, y = 0, z = 0, hit = false;
    for (let i = 0; i < 80 && t < 2 * front; i++) {
      x = o[0] + dx * t; y = o[1] + dy * t; z = o[2] + dz * t;
      const d = distance(x, y, z);
      if (d < 0.0015) { hit = true; break; }
      t += d;
    }
    if (!hit) return;
    const k = RING / (Math.hypot(x, z) || 1), n = unit([x - x * k, y, z - z * k]);
    const nk = n[0] * key[0] + n[1] * key[1] + n[2] * key[2];
    const nf = Math.max(0, n[0] * fill[0] + n[1] * fill[1] + n[2] * fill[2]);
    const lit = nk > 0 ? shadow(x + n[0] * 0.01, y + n[1] * 0.01, z + n[2] * 0.01) : 0;
    const diffuse = Math.max(0, nk) * lit;
    const shine = lit * Math.pow(Math.max(0, n[0] * half[0] + n[1] * half[1] + n[2] * half[2]), 40) * 0.8;
    for (let c = 0; c < 3; c++) out[c] = 0.04 + KEY_RGB[c] * diffuse + FILL_RGB[c] * nf + shine;
  }

  // The canvas fills the window, and the ring sits in the middle of the part
  // below the bar.
  function size(force) {
    const w = window.innerWidth, h = window.innerHeight, top = bar.getBoundingClientRect().bottom;
    g.resize(w, h, Math.min(window.devicePixelRatio || 1, 2), w < 640 ? 9 : 10, force === true);
    cx = w / 2;
    cy = top + (h - top) / 2;
    scale = 0.4 * Math.min(w, h - top) / OUTER;
  }

  // In a frame on another page (?embed), the ring stops turning while the frame is
  // off screen.
  let onScreen = true;
  function watchScreen(el) {
    if (!document.documentElement.hasAttribute('data-embed') || !window.IntersectionObserver) return;
    new IntersectionObserver(function (entries) { onScreen = entries[entries.length - 1].isIntersecting; }).observe(el);
  }

  // While it turns, the ring is drawn at most 30 times a second, and less
  // often where a picture takes long to draw.
  let turning = false, angle = 0.6, last = 0, raf = 0, cost = 10;
  function render() {
    const t0 = performance.now();
    pose(angle, LEAN + 0.25 * Math.sin(angle * 0.7));
    g.draw(scene);
    cost = cost * 0.8 + (performance.now() - t0) * 0.2;
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!onScreen) { last = 0; return; }
    if (last && now - last < Math.max(30, cost * 2.5)) return;
    angle += TURN * Math.min(0.25, last ? (now - last) / 1000 : 0);
    last = now;
    render();
  }
  function setTurning(on) {
    turning = on;
    cancelAnimationFrame(raf);
    raf = 0; last = 0;
    if (on) raf = requestAnimationFrame(frame);
    else render();
  }

  function start() {
    size();
    watchScreen(g.canvas);
    setTurning(!motion.matches);
    let timer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { size(); if (!turning) render(); }, 100);
    });
    if (motion.addEventListener) motion.addEventListener('change', function (e) { setTurning(!e.matches); });
  }

  // The renderer measures its characters, so it waits up to 1.5 s for the
  // font. A font that arrives later is measured again.
  let started = false;
  function go() { if (!started) { started = true; start(); } }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('11px "IBM Plex Mono"').then(function () {
      if (started) { size(true); if (!turning) render(); } else go();
    }, go);
    setTimeout(go, 1500);
  } else {
    go();
  }
})();

// The Read me panel: open and close it, close it with Escape, and copy a
// code block to the clipboard.
(function () {
  const panel = document.getElementById('readme');
  const open = document.querySelector('[data-readme-open]');
  if (!panel || !open) return;
  function show(on) {
    panel.hidden = !on;
    open.setAttribute('aria-expanded', String(on));
    if (on) panel.querySelector('[data-readme-close]').focus();
    else open.focus();
  }
  open.addEventListener('click', function () { show(panel.hidden); });
  panel.querySelector('[data-readme-close]').addEventListener('click', function () { show(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) show(false); });
  panel.querySelectorAll('[data-copy-code]').forEach(function (button) {
    button.addEventListener('click', function () {
      const text = button.parentElement.querySelector('code').textContent;
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(function () {
        button.textContent = 'Copied';
        setTimeout(function () { button.textContent = 'Copy'; }, 1500);
      }, function () {});
    });
  });
})();
