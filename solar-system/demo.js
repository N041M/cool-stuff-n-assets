// The explorer's controls. The sky is drawn by window.Orrery (js/orrery.js),
// and this file drives it with the gestures, the buttons, the body list, the
// clock and the tab's icon.
(function () {
  'use strict';

  const OR = window.Orrery, INFO = window.BODY_INFO;
  if (!OR || !INFO) return;

  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const root = document.documentElement;
  const stage = $('stage'), bodiesEl = $('bodies'), controls = $('controls'), top = $('top');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motion.matches;
  // the same query as the narrow layout in demo.css, and a screen with room
  // for the body list beside the sky
  const narrow = window.matchMedia('(max-width: 719px)');
  const roomy = window.matchMedia('(min-width: 720px) and (min-height: 600px)');

  // Each body's colour, for its name, its orbit and the HUD while it is in
  // focus. A moon without one of its own takes its planet's, and a star of
  // the Pleiades the cluster's.
  const COLOUR = {
    sun: '#ffc24a', mercury: '#d6a47c', venus: '#ecc76a', earth: '#5ea9ff', moon: '#a7b6d1', mars: '#ec6f45',
    jupiter: '#dd8f5f', saturn: '#f0a14a', uranus: '#7dd9d5', neptune: '#6d8dff', pluto: '#f0b49c',
    io: '#e3d24f', europa: '#d9a779', titan: '#e9a246', enceladus: '#b9e2ff', triton: '#e6b7b0', halley: '#8fc3ff', jwst: '#f2c14e',
    proxima: '#ff7a52', alphacena: '#ffe0a0', alphacenb: '#ffba74', siriusa: '#bcd2ff', siriusb: '#a8c2ff', vega: '#c4d6ff',
    arcturus: '#ffad66', polaris: '#ffe2a8', betelgeuse: '#ff8a52', rigel: '#9fbaff', pleiades: '#8aaeff',
    helix: '#ff8a78', orionnebula: '#ff8cc0', ringnebula: '#b4e88e', eagle: '#6fd6c2', crab: '#ffa45c', carina: '#ff9e86',
    sgra: '#ffa23e', s2: '#a9c1ff'
  };
  function colourOf(key) {
    const S = OR.BODIES;
    for (let k = key; k; k = S[k] ? S[k].parent || S[k].host : null) if (COLOUR[k]) return COLOUR[k];
    return '#f0a14a';
  }

  const B = INFO.bodies;
  const nameOf = (k) => (B[k] ? B[k].name : k);
  const listName = (k) => (B[k] ? B[k].short || B[k].name : k);

  /* ------------------------------------------------------------------------
     Views. ?embed (set on the root by the script in demo.html) shows the sky
     and its controls in a frame on the documentation page. ?focus=<key>
     opens on any body. ?feature=<id> shows one feature with only the groups
     of controls it keeps.
     ------------------------------------------------------------------------ */
  const params = new URLSearchParams(window.location.search);
  const embed = root.hasAttribute('data-embed');
  // Every view keeps the Glyphs button.
  const FEATURES = {
    flights: { name: 'Flights', keep: ['panels', 'view', 'glyphs'] },
    // Saturn in June 2017, with its rings tilted furthest toward the Sun
    rings: { name: 'Rings', focus: 'saturn', time: Date.UTC(2017, 5, 15), keep: ['view', 'glyphs'] },
    // the total eclipse of the Moon of 7 September 2025, from before the
    // middle to the end, run at a minute a second over and over
    eclipse: { name: 'Eclipse', focus: 'moon', time: Date.UTC(2025, 8, 7, 16, 55), until: Date.UTC(2025, 8, 7, 20, 0), warp: 60, keep: ['time', 'glyphs'] },
    renderer: { name: 'Renderer', keep: ['renderer', 'glyphs'] }
  };
  const featureId = root.getAttribute('data-feature');
  const feature = Object.prototype.hasOwnProperty.call(FEATURES, featureId) ? FEATURES[featureId] : null;
  if (!feature) root.removeAttribute('data-feature');
  const focusParam = params.get('focus');
  const startFocus = OR.BODIES[focusParam] ? focusParam : feature && feature.focus ? feature.focus : 'saturn';
  if (feature) {
    const brand = $('brand'), full = document.createElement('a');
    full.href = 'demo.html';
    full.textContent = 'Solar system';
    brand.textContent = '';
    brand.append(full, ' / ' + feature.name);
    document.title = 'Solar system / ' + feature.name;
    controls.querySelectorAll('.group').forEach((g) => { g.hidden = !feature.keep.some((c) => g.classList.contains(c)); });
    // Now would leave the moment the view opens on
    if (feature.time != null) $('now').hidden = true;
  }

  /* ------------------------------------------------------------------------
     Start the sky
     ------------------------------------------------------------------------ */
  // The space the controls take at the top and the bottom of the screen, in
  // CSS pixels. On a narrow screen the body list lies across the bottom too.
  // On a large screen it lies over the sky.
  function insets() {
    const vh = window.innerHeight;
    const topH = top.getBoundingClientRect().bottom;
    let bottom = vh;
    const els = narrow.matches ? [controls, bodiesEl] : [controls];
    for (const e of els) {
      const r = e.getBoundingClientRect();
      if (r.height && r.top > vh / 2) bottom = Math.min(bottom, r.top);
    }
    return [Math.round(topH), Math.round(vh - bottom), 0];
  }

  const sky = $('sky'), hud = $('hud');
  root.style.setProperty('--controls-h', controls.offsetHeight + 'px');
  OR.init(sky, hud, {
    font: getComputedStyle(document.body).fontFamily,
    fontWeight: 400,
    focus: startFocus,
    accent: colourOf(startFocus),
    background: '#050608',
    fps: 30,
    reducedMotion: reduced,
    time: feature && feature.time != null ? feature.time : null,
    insets: insets()
  });
  // the numbers in the HUD's labels
  const INT = new Intl.NumberFormat('en-GB');
  const labels = { num: (x, d) => x.toFixed(d), int: (x) => INT.format(Math.round(x)) };
  Object.keys(B).forEach((k) => { labels[k] = B[k].label; });
  OR.setLabels(labels);
  OR.setColours(Object.fromEntries(Object.keys(OR.BODIES).map((k) => [k, colourOf(k)])));
  if (!feature) OR.setSites(Object.fromEntries(Object.keys(B).filter((k) => B[k].sites)
    .map((k) => [k, B[k].sites.map((s) => [s.name, +s.t.slice(0, 4), s.at[0], s.at[1]])])));
  // The glyphs are measured again once the font has loaded.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('400 16px "IBM Plex Mono"').then(() => { OR.remeasure(); measure(); }, () => {});
  }
  motion.addEventListener && motion.addEventListener('change', (e) => { reduced = e.matches; OR.setReducedMotion(reduced); });

  // The sky frames the body in focus in the part of the screen the controls
  // leave free, and keeps the galaxy's names off them.
  let measureKey = '';
  function measure() {
    const h = controls.offsetHeight;
    root.style.setProperty('--controls-h', h + 'px');
    const box = (e) => { const r = e.getBoundingClientRect(); return r.width && r.height ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null; };
    const boxes = [top, controls, bodiesEl].map(box).filter(Boolean);
    const ins = insets(), key = JSON.stringify([boxes, ins]);
    if (key === measureKey) return;
    measureKey = key;
    OR.setCovered(boxes);
    // the bar's side padding is the page's gutter, in CSS pixels
    OR.setGutter(parseFloat(getComputedStyle(top).paddingLeft) || 16);
    OR.setInsets(ins[0], Math.max(0, Math.round(OR.size[1] - window.innerHeight)) + ins[1], ins[2]);
  }
  window.addEventListener('resize', measure);
  narrow.addEventListener && narrow.addEventListener('change', measure);
  roomy.addEventListener && roomy.addEventListener('change', () => { if (!roomy.matches) setBodies(false); measure(); });

  /* ------------------------------------------------------------------------
     The body list holds the planets with their moons under them, Pluto and
     Halley, the stars, the nebulae, the galactic centre and the spacecraft,
     then the whole system and the whole galaxy.
     ------------------------------------------------------------------------ */
  const fly = (k) => '<button type="button" data-fly="' + k + '" style="--hue:' + colourOf(k) + '">' + esc(listName(k)) + '</button>';
  let html = '';
  INFO.groups.forEach((g) => {
    html += '<p class="label head">' + esc(g.name) + '</p>';
    g.items.forEach((it) => {
      if (!Array.isArray(it)) { html += fly(it); return; }
      html += fly(it[0]) + '<div class="kids">' + it[1].map(fly).join('') + '</div>';
    });
  });
  html += '<p class="label head">Views</p><button type="button" data-fly="all">Whole system</button><button type="button" data-fly="milkyway">Whole galaxy</button>';
  bodiesEl.innerHTML = html;
  const flyBtns = [...bodiesEl.querySelectorAll('[data-fly]')];
  const openBodies = $('open-bodies');

  function setBodies(open, refocus) {
    bodiesEl.hidden = !open;
    openBodies.setAttribute('aria-expanded', String(open));
    if (open) {
      const on = flyBtns.find((b) => b.getAttribute('aria-current') === 'true');
      if (on) on.scrollIntoView({ block: 'nearest' });
    } else if (refocus) openBodies.focus({ preventScroll: true });
    measure();
  }
  openBodies.addEventListener('click', () => setBodies(bodiesEl.hidden));
  flyBtns.forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.fly;
    if (k === 'all') OR.overview(); else OR.flyTo(k);
    // where the list covers the sky, it closes
    if (!roomy.matches) setBodies(false);
  }));

  const said = $('said');
  function say(text) { said.textContent = text; }

  OR.onFocus((key) => {
    root.style.setProperty('--accent', colourOf(key));
    OR.setAccent(colourOf(key));
    say(nameOf(key));
    flyBtns.forEach((b) => b.setAttribute('aria-current', String(b.dataset.fly === key)));
    update(true);
  });

  /* ------------------------------------------------------------------------
     The clock and time
     ------------------------------------------------------------------------ */
  // seconds of the clock a second, from a month a second backwards to a month forwards
  const WARPS = [-2592000, -604800, -86400, -3600, -60, 1, 60, 3600, 86400, 604800, 2592000];
  const UNITS = [[2592000, '30 days'], [604800, 'week'], [86400, 'day'], [3600, 'h'], [60, 'min']];
  let warpIdx = WARPS.indexOf(1), paused = false;
  const pauseBtn = $('pause');
  function rateLabel() {
    if (paused) return 'Paused';
    const w = WARPS[warpIdx];
    if (w === 1) return OR.live ? 'Live' : 'Real time';
    const u = UNITS.find((x) => Math.abs(w) >= x[0]);
    return (w > 0 ? '+' : '−') + '1 ' + u[1] + '/s';
  }
  function setWarp(i) {
    warpIdx = clamp(i, 0, WARPS.length - 1);
    paused = false;
    OR.setWarp(WARPS[warpIdx]);
    showClock();
  }
  function setPaused(on) {
    paused = on;
    OR.setWarp(on ? 0 : WARPS[warpIdx]);
    showClock();
  }
  document.querySelectorAll('[data-warp]').forEach((b) => b.addEventListener('click', () => setWarp(warpIdx + Number(b.dataset.warp))));
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  $('now').addEventListener('click', () => { warpIdx = WARPS.indexOf(1); paused = false; OR.setWarp(1); OR.resetTime(); showClock(); update(true); });

  const dateEl = $('date'), rateEl = $('rate');
  function showClock() {
    const iso = OR.date.toISOString();
    const text = iso.slice(0, 10) + ' ' + iso.slice(11, 16) + ' UTC';
    if (dateEl.textContent !== text) dateEl.textContent = text;
    const r = rateLabel();
    if (rateEl.textContent !== r) rateEl.textContent = r;
    pauseBtn.classList.toggle('is-paused', paused);
    pauseBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    pauseBtn.title = paused ? 'Play' : 'Pause';
  }
  // a view that opens on a moment may run its clock at a rate of its own
  if (feature && feature.warp) setWarp(WARPS.indexOf(feature.warp));

  /* ------------------------------------------------------------------------
     Keeping the clock up to date
     ------------------------------------------------------------------------ */
  let lastUpdate = 0;
  function update(now) {
    const t = performance.now();
    // a few times a second while the clock runs fast, once a second at real time
    if (!now && t - lastUpdate < (paused || WARPS[warpIdx] === 1 ? 1000 : 250)) return;
    lastUpdate = t;
    showClock();
  }
  // In a frame on another page, the sky stops drawing while the frame is
  // off screen.
  let onScreen = true;
  if (embed && window.IntersectionObserver) {
    new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1].isIntersecting;
      OR.setPaused(!onScreen);
    }).observe(stage);
  }
  (function tick() {
    // a view with an end goes back to its start once the clock passes the end
    if (feature && feature.until && OR.warp > 0 && OR.date.getTime() > feature.until) { OR.setTime(feature.time); update(true); }
    if (onScreen) update(false);
    requestAnimationFrame(tick);
  })();


  // The body in focus is framed in the space the controls leave.
  OR.setAccent(colourOf(OR.focus));
  root.style.setProperty('--accent', colourOf(OR.focus));
  flyBtns.forEach((b) => b.setAttribute('aria-current', String(b.dataset.fly === OR.focus)));
  if (featureId === 'flights' && roomy.matches) setBodies(true);
  update(true);
  OR.frameFocus();

  /* ------------------------------------------------------------------------
     The renderer switch: WebGL, or the 2D canvas that browsers without
     WebGL get. The pressed button shows the renderer in use, and WebGL is
     turned off where the browser has none.
     ------------------------------------------------------------------------ */
  const rendererBtns = [...document.querySelectorAll('[data-renderer]')];
  function showRenderer() {
    rendererBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.renderer === OR.renderer)));
  }
  if (OR.renderer === '2d') rendererBtns.forEach((b) => { if (b.dataset.renderer === 'webgl') b.disabled = true; });
  rendererBtns.forEach((b) => b.addEventListener('click', () => { OR.setRenderer(b.dataset.renderer); showRenderer(); }));
  showRenderer();

  // The Glyphs button draws the sky without the characters and back.
  const glyphsBtn = $('glyphs');
  glyphsBtn.addEventListener('click', () => {
    OR.setGlyphs(!OR.glyphs);
    glyphsBtn.setAttribute('aria-pressed', String(OR.glyphs));
  });

  /* ------------------------------------------------------------------------
     Buttons that turn and zoom. Holding one down repeats it.
     ------------------------------------------------------------------------ */
  const STEP = 36;
  function act(b) {
    if (b.dataset.zoom) OR.zoom(0.3 * Number(b.dataset.zoom));
    else if (b.dataset.turn) OR.rotate(STEP * Number(b.dataset.turn), 0);
    else if (b.dataset.tilt) OR.rotate(0, STEP * Number(b.dataset.tilt));
  }
  document.querySelectorAll('[data-zoom], [data-turn], [data-tilt]').forEach((b) => {
    let hold = 0, repeated = false;
    const stop = () => { clearTimeout(hold); clearInterval(hold); hold = 0; };
    b.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      repeated = false;
      stop();
      hold = setTimeout(() => { repeated = true; act(b); hold = setInterval(() => act(b), 120); }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, stop));
    b.addEventListener('click', () => { if (!repeated) act(b); repeated = false; });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  /* ------------------------------------------------------------------------
     On the sky, the wheel zooms toward the body near the pointer,
     a drag turns the view, a touch swipe turns sideways and zooms up and
     down, two fingers pinch to zoom and move together to tilt, and a tap or
     a click flies to a body.
     ------------------------------------------------------------------------ */
  stage.addEventListener('wheel', (e) => {
    // in a frame, the wheel scrolls the page round it unless Ctrl or Cmd is
    // held, as it is for a trackpad's pinch
    if (embed && !e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
    if (e.ctrlKey) dy *= 5;
    OR.zoom(clamp(dy * 0.003, -0.8, 0.8), e.clientX, e.clientY);
  }, { passive: false });

  const pointers = new Map();
  let drag = null, pinch = 0, pinchMid = null, fling = 0;
  // A quick sideways swipe goes on turning the view after the finger lifts,
  // slowing to a stop within a second.
  function startFling(v) {
    if (reduced || Math.abs(v) < 0.25) return;
    let last = performance.now();
    const id = ++fling;
    const step = (now) => {
      if (id !== fling || OR.scene.fly) return;
      const dt = Math.min(now - last, 50);
      last = now;
      v *= Math.exp(-dt / 220);
      if (Math.abs(v) < 0.02) return;
      OR.rotate(v * dt, 0);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  stage.addEventListener('pointerdown', (e) => {
    fling++;
    // a pointer that has already gone cannot be captured
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* nothing to capture */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x0: e.clientX, y0: e.clientY, moved: 0, touch: e.pointerType !== 'mouse' };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMid = (a.y + b.y) / 2;
      drag = null;
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') stage.classList.toggle('is-pick', !!OR.hover(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y), mid = (a.y + b.y) / 2;
      if (dist > 0) OR.zoom(Math.log(pinch / dist), (a.x + b.x) / 2, mid);
      if (pinchMid != null) OR.rotate(0, (mid - pinchMid) * 0.6);
      pinch = dist; pinchMid = mid;
      return;
    }
    if (!drag) return;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    // a fingertip wanders a little during a tap, so a touch has to go further before it drags
    if (!drag.on && (drag.touch ? Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 10 : drag.moved < 6)) return;
    drag.on = true;
    stage.classList.add('is-drag');
    if (drag.touch) {
      OR.rotate(dx, 0);
      OR.zoom(-dy * 0.008, drag.x0, drag.y0);
      const now = performance.now(), dt = now - (drag.t || now);
      if (dt > 0) drag.vx = drag.vx == null ? dx / dt : drag.vx * 0.6 + (dx / dt) * 0.4;
      drag.t = now;
    } else OR.rotate(dx, dy);
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (drag && !drag.on && e.type === 'pointerup') {
      // a fingertip gets more reach than a mouse
      const k = OR.pick(e.clientX, e.clientY, drag.touch ? 30 : 18);
      if (k) OR.flyTo(k);
    }
    if (drag && drag.touch && drag.on && e.type === 'pointerup' && performance.now() - drag.t < 80) startFling(drag.vx || 0);
    if (pointers.size < 2) { pinch = 0; pinchMid = null; }
    if (!pointers.size) { drag = null; stage.classList.remove('is-drag'); }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', () => { if (!pointers.size) { OR.hover(null); stage.classList.remove('is-pick'); } });

  const KEY_BODIES = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const readme = $('readme');
  window.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    // keys pressed in the Read me panel are its own
    if (readme && e.target.closest && e.target.closest('#readme')) return;
    const k = e.key;
    if (k === 'Escape') {
      if (!bodiesEl.hidden && !roomy.matches) setBodies(false, true);
      else return;
    } else if ((k === 'Enter' || k === ' ') && e.target.closest && e.target.closest('button, a')) return;
    else if (k === '+' || k === '=' || k === 'ArrowUp') OR.zoom(-0.3);
    else if (k === '-' || k === '_' || k === 'ArrowDown') OR.zoom(0.3);
    else if (k === 'ArrowLeft') OR.rotate(-STEP, 0);
    else if (k === 'ArrowRight') OR.rotate(STEP, 0);
    else if (/^[0-8]$/.test(k)) OR.flyTo(KEY_BODIES[+k]);
    else if (k === 'm' || k === 'M') OR.flyTo('moon');
    else if (k === 'Home') OR.overview();
    else return;
    e.preventDefault();
  });

  /* ------------------------------------------------------------------------
     The tab's icon is the body in focus, ray-cast from the explorer's own
     camera, inside corner brackets in the body's colour. In a background
     tab it is drawn again every minute at the current time. Browsers that
     keep the first icon they load show the one in the page's head.
     ------------------------------------------------------------------------ */
  (function tabIcon() {
    // a frame has no tab of its own
    if (embed) return;
    const SIZE = 32, ARM = 7, LINE = 2, INSET = 2;
    const tile = document.createElement('canvas'), body = document.createElement('canvas');
    tile.width = tile.height = body.width = body.height = SIZE;
    const c = tile.getContext('2d');
    let link = null, drawnSig = '', drawnAt = 0;
    function draw() {
      c.clearRect(0, 0, SIZE, SIZE);
      c.fillStyle = '#050608';
      c.beginPath();
      if (c.roundRect) c.roundRect(0, 0, SIZE, SIZE, 6); else c.rect(0, 0, SIZE, SIZE);
      c.fill();
      const exact = OR.icon(body, { fill: 0.86 });
      c.drawImage(body, 0, 0);
      c.fillStyle = colourOf(OR.focus);
      for (const [x, y, sx, sy] of [[INSET, INSET, 1, 1], [SIZE - INSET, INSET, -1, 1], [INSET, SIZE - INSET, 1, -1], [SIZE - INSET, SIZE - INSET, -1, -1]]) {
        c.fillRect(sx > 0 ? x : x - ARM, sy > 0 ? y : y - LINE, ARM, LINE);
        c.fillRect(sx > 0 ? x : x - LINE, sy > 0 ? y : y - ARM, LINE, ARM);
      }
      if (!link) {
        document.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.head.append(link);
      }
      link.href = tile.toDataURL('image/png');
      return exact;
    }
    // the icon depends on the body, the direction the camera looks from
    // and the hour on the clock
    function signature() {
      const s = OR.scene, z = OR.zoomLevel;
      return [OR.focus, s.psi, s.th, s.top, s.roll, z.o].map((v) => (typeof v === 'number' ? Math.round(v * 20) : v)).join() +
        ',' + Math.round(OR.date.getTime() / 3.6e6);
    }
    // timers in a background tab run at most once a second, and after a few
    // minutes once a minute, which is all the icon needs there
    function tick() {
      const now = Date.now(), sig = document.hidden ? '' : signature();
      if (document.hidden ? now - drawnAt < 60e3 : sig === drawnSig && now - drawnAt < 10e3) return;
      drawnSig = draw() ? sig : '';
      drawnAt = now;
    }
    tick();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
  })();
})();

// The Read me panel: open and close it, close it with Escape, and copy a
// code block to the clipboard. The Escape that closes it goes no further,
// so it does not also close the explorer's panels.
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
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) { e.stopPropagation(); show(false); }
  });
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
