// The demo page. It lays one body's map from surfaces.js on a sphere drawn
// on a 2D canvas, seen from a little above the equator, and turns it once a
// minute. A map is made and refined to full size a few milliseconds a frame,
// and the sphere shows the small version until then.
(function () {
  'use strict';

  const S = window.Surfaces;
  if (!S) return;

  // The bodies in the order Previous and Next step through them.
  const NAMES = {
    sun: 'Sun', mercury: 'Mercury', venus: 'Venus', earth: 'Earth', moon: 'Moon',
    mars: 'Mars', phobos: 'Phobos', deimos: 'Deimos',
    jupiter: 'Jupiter', io: 'Io', europa: 'Europa', ganymede: 'Ganymede', callisto: 'Callisto',
    saturn: 'Saturn', mimas: 'Mimas', enceladus: 'Enceladus', tethys: 'Tethys', dione: 'Dione', rhea: 'Rhea', titan: 'Titan', iapetus: 'Iapetus',
    uranus: 'Uranus', miranda: 'Miranda', ariel: 'Ariel', umbriel: 'Umbriel', titania: 'Titania', oberon: 'Oberon',
    neptune: 'Neptune', triton: 'Triton', pluto: 'Pluto', charon: 'Charon', halley: 'Halley’s Comet',
    proxima: 'Proxima Centauri', proximab: 'Proxima b', proximad: 'Proxima d', alphacena: 'Alpha Centauri A', alphacenb: 'Alpha Centauri B',
    siriusa: 'Sirius A', siriusb: 'Sirius B', vega: 'Vega', arcturus: 'Arcturus', polaris: 'Polaris', betelgeuse: 'Betelgeuse', rigel: 'Rigel',
    alcyone: 'Alcyone', atlas: 'Atlas', electra: 'Electra', maia: 'Maia', merope: 'Merope', taygeta: 'Taygeta', pleione: 'Pleione',
    celaeno: 'Celaeno', asterope: 'Asterope', s2: 'S2'
  };
  const KEYS = Object.keys(NAMES).filter((k) => S.BODIES[k]);

  const canvas = document.getElementById('sphere');
  const ctx = canvas.getContext('2d');
  const nameEl = document.getElementById('name');
  const statusEl = document.getElementById('status');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const TILT = 15 * Math.PI / 180;   // the north pole leans this far toward the viewer
  const TURN = 60;                    // seconds for one turn
  const LIGHT = (function (v) { const l = Math.hypot(v[0], v[1], v[2]); return v.map((x) => x / l); })([-0.45, 0.3, 0.84]);

  let index = Math.max(0, KEYS.indexOf('earth'));
  let spin = 0.75;                    // in turns, with longitude 0 facing the viewer
  let size = 0, geo = null, image = null, body = null, dirty = true, lastT = 0;

  /* The disc. For each pixel it holds where the pixel lies on the body
     (u across the map, v down it), how much of the pixel the body covers,
     and how bright it is. A body flattened at the poles gets a disc of its
     own shape. */
  let geoCache = {};
  function geometry(n, f) {
    const id = n + ':' + f;
    if (geoCache[id]) return geoCache[id];
    const R = n / 2 - 1, q = 1 / (1 - f), s = Math.sin(TILT), c = Math.cos(TILT);
    const A = c * c + q * q * s * s, Bv = Math.sqrt((1 - f) * (1 - f) * c * c + s * s);
    const max = n * n;
    const g = { n: n, count: 0, pix: new Int32Array(max), u: new Float32Array(max), v: new Float32Array(max),
                mu: new Float32Array(max), lit: new Float32Array(max), a: new Uint8ClampedArray(max) };
    for (let j = 0; j < n; j++) {
      const y = (n / 2 - j - 0.5) / R;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5 - n / 2) / R;
        const rho = Math.sqrt(x * x + (y / Bv) * (y / Bv)), cover = Math.min(1, (1 - rho) * R + 0.5);
        if (cover <= 0) continue;
        // where the line of sight through the pixel meets the body
        const B = 2 * y * s * c * (q * q - 1), C = x * x + y * y * (s * s + q * q * c * c) - 1;
        const z = (-B + Math.sqrt(Math.max(0, B * B - 4 * A * C))) / (2 * A);
        const X = x, Y = y * s - z * c, Z = y * c + z * s;
        const lat = Math.asin(Math.max(-1, Math.min(1, Z * q))), lon = Math.atan2(Y, X);
        // the surface normal, turned back into the view
        let nx = X, ny = Y, nz = q * q * Z;
        const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
        const vy = ny * s + nz * c, vz = -ny * c + nz * s;
        const k = g.count++;
        g.pix[k] = (j * n + i) * 4;
        g.u[k] = lon / (2 * Math.PI) + 0.5;
        g.v[k] = 0.5 - lat / Math.PI;
        g.mu[k] = Math.max(0, vz);
        g.lit[k] = Math.max(0, nx * LIGHT[0] + vy * LIGHT[1] + vz * LIGHT[2]);
        g.a[k] = cover * 255;
      }
    }
    return (geoCache[id] = g);
  }

  // What changes with the body: which map rows each pixel reads, and its
  // brightness. A star darkens toward its limb, and the rest are lit from
  // the upper left.
  function prepareBody(key) {
    const B = S.BODIES[key], L = S.has(key) ? S.texture(key).levels[0] : { w: 1, h: 1, d: B.col.map((x) => x * 255) };
    const g = geo, n = g.count, w = L.w, h = L.h, row = w * 3;
    const b = { key: key, level: L, col: new Float32Array(n), r0: new Int32Array(n), r1: new Int32Array(n), fy: new Float32Array(n), shade: new Float32Array(n) };
    const star = B.kind === 'star';
    for (let k = 0; k < n; k++) {
      b.col[k] = g.u[k] * w - 0.5 + w;
      const y = g.v[k] * h - 0.5, y0 = Math.floor(y);
      b.r0[k] = Math.max(0, y0) * row;
      b.r1[k] = Math.min(h - 1, y0 + 1) * row;
      b.fy[k] = y0 < 0 ? 0 : y - y0;
      b.shade[k] = star ? 1 - 0.45 * (1 - Math.sqrt(g.mu[k])) : 0.05 + 0.95 * g.lit[k];
    }
    return b;
  }

  function resize() {
    const css = canvas.clientWidth;
    const n = Math.max(64, Math.min(560, Math.round(css * Math.min(window.devicePixelRatio || 1, 2))));
    if (n === size) return;
    size = n;
    canvas.width = canvas.height = n;
    image = ctx.createImageData(n, n);
    geoCache = {};
    geo = null;
    dirty = true;
  }

  function draw() {
    const key = KEYS[index], g = geometry(size, S.BODIES[key].f || 0);
    if (g !== geo) {
      // a disc of another shape: clear the old one and set the new one's edge
      geo = g;
      body = null;
      image.data.fill(0);
      for (let k = 0; k < g.count; k++) image.data[g.pix[k] + 3] = g.a[k];
    }
    if (!body || body.key !== key || (S.has(key) && body.level !== S.texture(key).levels[0])) body = prepareBody(key);
    const b = body, w = b.level.w, d = b.level.d, out = image.data, off = spin * w;
    const pix = g.pix, col = b.col, r0 = b.r0, r1 = b.r1, fys = b.fy, shade = b.shade;
    // each pixel blends the four map pixels round the point it shows
    for (let k = 0, n = g.count; k < n; k++) {
      let x = col[k] - off;
      if (x < 0) x += w;
      let x0 = x | 0;
      const fx = x - x0;
      if (x0 >= w) x0 -= w;
      const x1 = x0 + 1 === w ? 0 : x0 + 1, fy = fys[k], sh = shade[k], o = pix[k];
      const a = r0[k] + x0 * 3, bb = r0[k] + x1 * 3, c = r1[k] + x0 * 3, e = r1[k] + x1 * 3;
      let t = d[a] + (d[bb] - d[a]) * fx, u = d[c] + (d[e] - d[c]) * fx;
      out[o] = (t + (u - t) * fy) * sh;
      t = d[a + 1] + (d[bb + 1] - d[a + 1]) * fx; u = d[c + 1] + (d[e + 1] - d[c + 1]) * fx;
      out[o + 1] = (t + (u - t) * fy) * sh;
      t = d[a + 2] + (d[bb + 2] - d[a + 2]) * fx; u = d[c + 2] + (d[e + 2] - d[c + 2]) * fx;
      out[o + 2] = (t + (u - t) * fy) * sh;
    }
    ctx.putImageData(image, 0, 0);
    dirty = false;
  }

  /* Making the maps. Each frame spends up to 8 ms making and refining the
     current body's map, and then the next body's small map, so that Next
     shows it at once. */
  const BUDGET = 8;
  function work() {
    const key = KEYS[index], next = KEYS[(index + 1) % KEYS.length], t0 = performance.now();
    let left = BUDGET;
    while (left > 1) {
      if (!S.has(key)) S.prepare(key, left);
      else if (!S.texture(key).ready) S.refine(key, left);
      else if (!S.has(next)) S.prepare(next, left);
      else break;
      dirty = true;
      left = BUDGET - (performance.now() - t0);
    }
    statusEl.classList.toggle('is-on', !S.has(key) || !S.texture(key).ready);
  }

  // In a frame on another page (?embed), the sphere stops while the frame is
  // off screen.
  let onScreen = true;
  function watchScreen(el) {
    if (!document.documentElement.hasAttribute('data-embed') || !window.IntersectionObserver) return;
    new IntersectionObserver(function (entries) { onScreen = entries[entries.length - 1].isIntersecting; }).observe(el);
  }

  // The sphere is drawn again when its map has changed, and 30 times a
  // second while it turns. It stands still when the system asks for
  // reduced motion.
  let lastDraw = 0;
  function frame(t) {
    if (!onScreen) { lastT = 0; requestAnimationFrame(frame); return; }
    const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
    lastT = t;
    work();
    if (!motion.matches) spin = (spin + dt / TURN) % 1;
    if (dirty || (!motion.matches && t - lastDraw >= 1000 / 30 - 2)) { draw(); lastDraw = t; }
    requestAnimationFrame(frame);
  }

  function show(i) {
    index = (i + KEYS.length) % KEYS.length;
    const key = KEYS[index];
    nameEl.textContent = NAMES[key];
    canvas.setAttribute('aria-label', 'The map of ' + NAMES[key] + ' on a turning sphere');
    statusEl.classList.toggle('is-on', !S.has(key) || !S.texture(key).ready);
    body = null;
    dirty = true;
  }

  document.getElementById('prev').addEventListener('click', () => show(index - 1));
  document.getElementById('next').addEventListener('click', () => show(index + 1));
  if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener('resize', resize);
  motion.addEventListener && motion.addEventListener('change', () => { dirty = true; });

  resize();
  show(index);
  watchScreen(canvas);
  requestAnimationFrame(frame);
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
