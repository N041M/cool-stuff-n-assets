// The demo page: one spacecraft model at a time, drawn in characters by
// spacecraft-glyphs.js and ../glyph-renderer/glyph-renderer.js, turning
// slowly on a turntable. Previous and Next switch the model. It stands still
// when the system asks for reduced motion.
(function () {
  'use strict';

  const GR = window.GlyphRenderer, SC = window.Spacecraft;
  const canvas = document.getElementById('craft');
  if (!GR || !SC || !SC.draw || !canvas) return;

  const bar = document.querySelector('.bar');
  const nameEl = document.getElementById('name');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const g = GR.create(canvas, { font: getComputedStyle(document.body).fontFamily });

  const NAMES = { voyager: 'Voyager', newhorizons: 'New Horizons', pioneer: 'Pioneer', parker: 'Parker Solar Probe', jwst: 'James Webb Space Telescope' };
  const KEYS = Object.keys(SC.models);

  function unit(v) { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  // The way to the Sun in each model's own frame. A model's z axis is up on
  // the turntable. The dishes and Parker's heat shield face the Sun from
  // above, and JWST has the Sun under its sunshield.
  function sunFor(M) { return M.point === 'out' ? unit([0.35, -0.4, -0.85]) : unit([0.4, -0.45, 0.8]); }

  // The turntable turns once in 40 seconds about the model's z axis. The
  // camera starts on the side the model is best seen from and looks down on
  // it from at least 25 degrees above.
  const TURN = Math.PI * 2 / 40, LOW = 25 * Math.PI / 180;
  let index = 0, model = SC.models[KEYS[0]], sun = sunFor(model), turn = 0, height = 0;

  function choose(i) {
    index = (i + KEYS.length) % KEYS.length;
    model = SC.models[KEYS[index]];
    sun = sunFor(model);
    const v = unit(model.view);
    turn = Math.atan2(v[1], v[0]);
    height = Math.max(LOW, Math.asin(Math.min(0.94, v[2])));
    nameEl.textContent = NAMES[KEYS[index]] || KEYS[index];
  }

  // Where the model's middle is on the canvas and how many metres a device
  // pixel spans, set by size().
  let mx = 0, my = 0, metres = 1;
  function size(force) {
    const w = window.innerWidth, h = window.innerHeight, ratio = Math.min(window.devicePixelRatio || 1, 2);
    const top = bar.getBoundingClientRect().bottom, bottom = h - nameEl.getBoundingClientRect().top;
    g.resize(w, h, ratio, w < 640 ? 9 : 10, force === true);
    mx = w / 2 * ratio;
    my = (top + (h - top - bottom) / 2) * ratio;
    metres = 1 / (Math.min(w, h - top - bottom) * ratio);
  }

  // The camera in the model's frame: its right (R), up (U) and the way back
  // toward it (B). Each of the model's axes and the way to the Sun are then
  // given in the camera's space, as Spacecraft.draw takes them.
  function render(fine) {
    const ca = Math.cos(turn), sa = Math.sin(turn), ch = Math.cos(height), sh = Math.sin(height);
    const B = [ch * ca, ch * sa, sh], U = [-sh * ca, -sh * sa, ch], R = [-sa, ca, 0];
    g.clear();
    SC.draw(g, {
      model: model, x: mx, y: my, metres: 2.1 * model.r * metres,
      frame: { Q: [R[0], U[0], B[0]], E: [R[1], U[1], B[1]], N: [R[2], U[2], B[2]] },
      light: [dot(sun, R), dot(sun, U), dot(sun, B)],
      fine: fine
    });
    g.compose();
    g.present();
  }

  // In a frame on another page (?embed), the model stops turning while the frame is
  // off screen.
  let onScreen = true;
  function watchScreen(el) {
    if (!document.documentElement.hasAttribute('data-embed') || !window.IntersectionObserver) return;
    new IntersectionObserver(function (entries) { onScreen = entries[entries.length - 1].isIntersecting; }).observe(el);
  }

  // While it turns, the model is drawn at most 30 times a second, and less
  // often where a picture takes long to draw. Each sample casts four rays,
  // or one from then on if that takes longer than 35 ms a picture.
  let turning = false, last = 0, raf = 0, cost = 10, fine = true;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!onScreen) { last = 0; return; }
    if (last && now - last < Math.max(30, cost * 2.5)) return;
    turn += TURN * Math.min(0.25, last ? (now - last) / 1000 : 0);
    last = now;
    const t0 = performance.now();
    render(fine);
    cost = cost * 0.8 + (performance.now() - t0) * 0.2;
    if (fine && cost > 35) { fine = false; cost = 10; }
  }
  function setTurning(on) {
    turning = on;
    cancelAnimationFrame(raf);
    raf = 0; last = 0;
    if (on) raf = requestAnimationFrame(frame);
    else render(true);
  }

  function start() {
    choose(0);
    size();
    watchScreen(g.canvas);
    setTurning(!motion.matches);
    document.querySelectorAll('[data-step]').forEach(function (button) {
      button.addEventListener('click', function () {
        choose(index + Number(button.getAttribute('data-step')));
        if (!turning) render(true);
      });
    });
    let timer = 0;
    window.addEventListener('resize', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { size(); if (!turning) render(true); }, 100);
    });
    if (motion.addEventListener) motion.addEventListener('change', function (e) { setTurning(!e.matches); });
  }

  // The renderer measures its characters, so it waits up to 1.5 s for the
  // font. A font that arrives later is measured again.
  let started = false;
  function go() { if (!started) { started = true; start(); } }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('11px "IBM Plex Mono"').then(function () {
      if (started) { size(true); if (!turning) render(true); } else go();
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
