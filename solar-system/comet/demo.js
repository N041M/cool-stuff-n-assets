// The demo page. It draws Halley's Comet on a date with window.Comet
// (comet.js and comet-glyphs.js) and the glyph renderer, seen from the north
// of the ecliptic with x to the right and y up. While the comet has tails the
// view frames its head and tails. Further out it shows the whole orbit.
(function () {
  "use strict";

  const CM = window.Comet, GR = window.GlyphRenderer;
  const canvas = document.getElementById("sky");
  if (!CM || !CM.draw || !GR || !canvas) return;
  const bar = document.querySelector(".bar");
  const dateEl = document.getElementById("date");
  const sunTag = document.getElementById("sun-tag"), cometTag = document.getElementById("comet-tag");

  const jdOf = (ms) => ms / 864e5 + 2440587.5;
  const msOf = (jd) => (jd - 2440587.5) * 864e5;

  // Halley's orbit in comet.js passes perihelion on 9 February 1986. As a
  // plain ellipse it comes back on 8 February 2062, half a year after the
  // predicted perihelion of 28 July 2061. For dates after the aphelion
  // between the two passes the page uses the same orbit with the 2061 date.
  const LAST = CM.HALLEY;
  const NEXT = Object.assign({}, CM.HALLEY, { T: jdOf(Date.UTC(2061, 6, 28, 12)) });
  const orbitFor = (jd) => (jd < (LAST.T + NEXT.T) / 2 ? LAST : NEXT);
  const DATES = { 1986: () => LAST.T, now: () => jdOf(Date.now()), 2061: () => NEXT.T };

  // The time an orbit takes, days, from Kepler's third law with the
  // Gaussian gravitational constant.
  const periodOf = (el) => 2 * Math.PI / 0.01720209895 * Math.pow(el.q / (1 - el.e), 1.5);

  // The nucleus's pole and prime meridian, which turn the jets.
  const FRAME = { N: [0, 0, 1], Q: [1, 0, 0], E: [0, 1, 0] };
  const FONT_PX = 10;
  const ORBIT = [0.2, 0.2, 0.22], SUN = [1.0, 0.63, 0.29], NUCLEUS = CM.colours.coma;

  const font = getComputedStyle(document.documentElement).getPropertyValue("--font").trim();
  const G = GR.create(canvas, { font: font, weight: 400 });

  let jd = DATES[1986](), started = false;

  function pad(n) { return String(n).padStart(2, "0"); }
  function showDate() {
    const d = new Date(msOf(jd));
    const text = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    dateEl.textContent = text;
    dateEl.dateTime = text;
  }

  // Where the view is centred (AU) and how many device pixels make an AU.
  // While the comet has tails the view is 0.6 times the ion tail's length
  // across, with the head toward the Sun's side, so the tails run across
  // the view. Without tails it holds the whole orbit.
  function framing(el, pos, comet) {
    if (comet.tail > 0.05) {
      const span = 0.6 * comet.length, d = Math.hypot(comet.dir[0], comet.dir[1]) || 1;
      return { cx: pos[0] + 0.3 * span * comet.dir[0] / d, cy: pos[1] + 0.3 * span * comet.dir[1] / d, k: Math.min(G.W, G.H) / span };
    }
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const period = periodOf(el);
    for (let i = 0; i < 2000; i++) {
      const p = CM.position(el, el.T + period * (i / 2000 - 0.5));
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, k: 0.84 * Math.min(G.W / (x1 - x0), G.H / (y1 - y0)) };
  }

  // A soft round glow of light at (x, y), device pixels.
  function glow(x, y, radius, peak, col) {
    const reach = radius * 12;
    const c0 = Math.max(0, Math.floor((x - reach) / G.cw)), c1 = Math.min(G.cols, Math.ceil((x + reach) / G.cw));
    const r0 = Math.max(0, Math.floor((y - reach) / G.ch)), r1 = Math.min(G.rows, Math.ceil((y + reach) / G.ch));
    for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) for (let k = 0; k < 6; k++) {
      const dx = G.sampleX(c, k) - x, dy = G.sampleY(r, k) - y, q = 1 + (dx * dx + dy * dy) / (radius * radius);
      const v = peak / (q * Math.sqrt(q));
      if (v > 0.004) G.add((r * G.cols + c) * 6 + k, v * col[0], v * col[1], v * col[2]);
    }
  }

  // The orbit as a line, split until each piece is straight to a third of
  // a device pixel, so it runs through the nucleus at any scale.
  function drawOrbit(el, toScreen) {
    const period = periodOf(el);
    const t0 = el.T - period / 2, n = 256;
    function piece(ta, a, tb, b, depth) {
      const tm = (ta + tb) / 2, m = toScreen(CM.position(el, tm));
      const ex = b[0] - a[0], ey = b[1] - a[1], len = Math.hypot(ex, ey) || 1;
      const off = Math.abs((m[0] - a[0]) * ey - (m[1] - a[1]) * ex) / len;
      const x0 = Math.min(a[0], b[0], m[0]) - 2 * off, x1 = Math.max(a[0], b[0], m[0]) + 2 * off;
      const y0 = Math.min(a[1], b[1], m[1]) - 2 * off, y1 = Math.max(a[1], b[1], m[1]) + 2 * off;
      const seen = x1 >= 0 && y1 >= 0 && x0 <= G.W && y0 <= G.H;
      if (seen && off > 0.33 && depth < 40) {
        piece(ta, a, tm, m, depth + 1);
        piece(tm, m, tb, b, depth + 1);
      } else if (seen) {
        G.line(a[0], a[1], b[0], b[1], ORBIT[0], ORBIT[1], ORBIT[2]);
      }
    }
    let ta = t0, a = toScreen(CM.position(el, ta));
    for (let i = 1; i <= n; i++) {
      const tb = t0 + period * i / n, b = toScreen(CM.position(el, tb));
      piece(ta, a, tb, b, 0);
      ta = tb; a = b;
    }
  }

  function render() {
    const el = orbitFor(jd), pos = CM.position(el, jd), comet = CM.at(el, jd, pos);
    const f = framing(el, pos, comet), W2 = G.W / 2, H2 = G.H / 2;
    const toScreen = (p) => [W2 + (p[0] - f.cx) * f.k, H2 - (p[1] - f.cy) * f.k];
    const sun = toScreen([0, 0, 0]), head = toScreen(pos);
    G.clear();
    drawOrbit(el, toScreen);
    glow(sun[0], sun[1], 0.35 * G.ch, 3, SUN);
    if (comet.coma < 0.01) glow(head[0], head[1], 0.3 * G.ch, 5, NUCLEUS);
    CM.draw(G, { elements: el, jd: jd, pos: pos, x: head[0], y: head[1], scale: f.k, frame: FRAME, key: "halley", gain: 0.003 });
    G.compose();
    G.present();
    // The names sit beside the Sun and the head, away from the orbit. While
    // the comet has tails its name sits on the Sun's side, clear of the coma.
    const tails = comet.tail > 0.05, out = tails ? -1 : 1;
    place(sunTag, sun, -comet.u[0], comet.u[1], 14);
    place(cometTag, head, out * comet.u[0], -out * comet.u[1], tails ? 32 : 14);
  }

  // A name gap CSS pixels from a point (device pixels) in the direction
  // (dx, dy), kept inside the window, or hidden while the point is off the
  // canvas.
  function place(tag, p, dx, dy, gap) {
    const x = p[0] / G.dpr, y = p[1] / G.dpr, w = G.W / G.dpr, h = G.H / G.dpr;
    tag.hidden = !(x >= 0 && y >= 0 && x <= w && y <= h);
    if (tag.hidden) return;
    const d = Math.hypot(dx, dy) || 1, tw = tag.offsetWidth;
    const left = dx < 0 ? x + gap * dx / d - tw : x + gap * dx / d;
    tag.style.left = Math.min(Math.max(4, left), window.innerWidth - tw - 4) + "px";
    tag.style.top = (G.canvas.getBoundingClientRect().top + y + gap * dy / d) + "px";
  }

  function size(remeasure) {
    const top = bar.getBoundingClientRect().height;
    G.resize(window.innerWidth, Math.max(1, window.innerHeight - top), window.devicePixelRatio || 1, FONT_PX, remeasure === true);
  }

  function go(key) {
    jd = DATES[key]();
    document.querySelectorAll("[data-go]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-go") === key));
    });
    showDate();
    if (started) render();
  }
  document.querySelectorAll("[data-go]").forEach(function (b) {
    b.addEventListener("click", function () { go(b.getAttribute("data-go")); });
  });

  let resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () { if (started) { size(); render(); } }, 150);
  });

  // The glyphs are measured in IBM Plex Mono, so the first picture waits up
  // to 1.5 s for the font to load.
  showDate();
  function start() {
    if (started) return;
    started = true;
    size(true);
    render();
  }
  if (document.fonts && document.fonts.load) {
    document.fonts.load('11px "IBM Plex Mono"').then(start, start);
    setTimeout(start, 1500);
  } else {
    start();
  }
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
