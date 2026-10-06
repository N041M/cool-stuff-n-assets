// The trail of glyphs the pointer leaves, and a ripple sent out from a point.
// It draws on a canvas of its own, so it runs over any page.
//
// The window is divided into character cells. The pointer charges the cells
// it passes over, and a charged cell shows a glyph in the accent colour that
// flickers and fades out over about half a second. CursorTrail.pulse(x, y)
// sends a ring of glyphs out from a point. Elements with the class `ko` keep
// the trail off their text. Nothing is drawn when the system asks for reduced
// motion.
//
// The trail draws on <canvas id="trail"> when the page has one, and otherwise
// adds a canvas over the whole page. Two data attributes on that canvas change
// how it draws:
//   data-parallax  the share of the page scroll the grid moves with, 0 by
//                  default. The glyph field in page-background/ uses 0.5.
//   data-fill      "true" paints each glyph's cell in --bg first, so the
//                  trail covers whatever is under it.
(function () {
  "use strict";

  const root = document.documentElement;
  const reducedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkMQ = window.matchMedia("(prefers-color-scheme: dark)");

  let canvas = document.getElementById("trail");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "trail";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = "position:fixed;inset:0;width:100%;height:100vh;height:100lvh;display:block;pointer-events:none;z-index:2147483000";
    (document.body || root).appendChild(canvas);
  }
  if (!canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const parallax = Number(canvas.getAttribute("data-parallax")) || 0;
  const fill = canvas.getAttribute("data-fill") === "true";

  function hash2(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function hash3(a, b, c) {
    return hash2((a | 0) + Math.imul(c | 0, 1442695041), (b | 0) ^ Math.imul(c | 0, -2048144777));
  }

  // Every glyph here is in IBM Plex Mono. The atlas has the glyphs in three
  // rows of the accent colour at falling opacity. A cell's code is its glyph
  // index shifted left by 2, or'd with its row.
  const GLYPHS = Array.from("<>/\\|-=+*#%&");
  const LEVELS = [1, 0.62, 0.34];

  // Cells are 7 × 14 CSS px, and the glyphs are set in them in 11px IBM Plex
  // Mono, whose advance is 6.6 px. A window with more than MAX_CELLS cells
  // gets bigger cells and bigger type.
  const MAX_CELLS = 17000;
  const FPS = 30;

  let dpr = 1, vw = 0, vh = 0;
  let fontPx = 11, cw = 7, ch = 14, cwD = 7, chD = 14;
  let cols = 0, rows = 0, N = 0;
  let atlas = null;
  let colors = { bg: "#fbfaf8", accent: "#c8352b" };
  let mask, E, RA, prevCode;
  let koEls = [];
  let frac = 0, fracD = 0, lastRowOff = -1, lastFracD = -1, fullRedraw = true;
  let reduced = reducedMQ.matches;
  let started = false, running = false;
  let raf = 0, lastDraw = 0, lastT = 0, lastScroll = -1;
  const pulses = [];

  function readColors() {
    const cs = getComputedStyle(root);
    colors = {
      bg: cs.getPropertyValue("--bg").trim() || colors.bg,
      accent: cs.getPropertyValue("--accent").trim() || colors.accent,
    };
  }

  function buildAtlas() {
    atlas = document.createElement("canvas");
    atlas.width = GLYPHS.length * cwD;
    atlas.height = LEVELS.length * chD;
    const a = atlas.getContext("2d");
    a.font = fontPx * dpr + 'px "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    a.textBaseline = "alphabetic";
    a.fillStyle = colors.accent;
    const baseline = Math.round(fontPx * dpr);
    for (let row = 0; row < LEVELS.length; row++) {
      a.globalAlpha = LEVELS[row];
      for (let i = 0; i < GLYPHS.length; i++) a.fillText(GLYPHS[i], i * cwD, row * chD + baseline);
    }
  }

  function setup() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    vw = rect.width;
    vh = rect.height;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    let scale = 1;
    for (;;) {
      fontPx = 11 * scale;
      cwD = Math.max(1, Math.round(((fontPx * 7) / 11) * dpr));
      chD = Math.max(1, Math.round(((fontPx * 14) / 11) * dpr));
      cols = Math.ceil(canvas.width / cwD);
      rows = Math.ceil(canvas.height / chD) + 1;
      if (cols * rows <= MAX_CELLS || scale >= 2) break;
      scale += 0.25;
    }
    cw = cwD / dpr;
    ch = chD / dpr;
    N = cols * rows;
    mask = new Uint8Array(N);
    E = new Float32Array(N);
    RA = new Float32Array(N);
    for (let i = 0; i < N; i++) RA[i] = hash2(i, 7);
    prevCode = new Int32Array(N);
    fullRedraw = true;
    koEls = Array.from(document.querySelectorAll(".ko"));
    readColors();
    buildAtlas();
  }

  // ------------------------------------------------------------- knockout ---

  // A .ko element's own cells are 1 and a ragged margin around it is 2. The
  // trail never shows on 1 and shows on about half the cells of 2.
  function buildMask() {
    mask.fill(0);
    const padX = cw * 1.5;
    const padY = ch * 0.6;
    for (let n = 0; n < koEls.length; n++) {
      const rects = koEls[n].getClientRects();
      for (let k = 0; k < rects.length; k++) {
        const rc = rects[k];
        if (rc.width === 0 || rc.bottom < -ch || rc.top > vh + ch) continue;
        const c0 = Math.max(0, Math.floor((rc.left - padX) / cw));
        const c1 = Math.min(cols - 1, Math.floor((rc.right + padX) / cw));
        const r0 = Math.max(0, Math.floor((rc.top - padY + frac) / ch));
        const r1 = Math.min(rows - 1, Math.floor((rc.bottom + padY + frac) / ch));
        const ic0 = Math.floor(rc.left / cw), ic1 = Math.floor(rc.right / cw);
        const ir0 = Math.floor((rc.top + frac) / ch), ir1 = Math.floor((rc.bottom + frac) / ch);
        for (let r = r0; r <= r1; r++) {
          const inRow = r >= ir0 && r <= ir1;
          for (let c = c0; c <= c1; c++) {
            const idx = r * cols + c;
            if (inRow && c >= ic0 && c <= ic1) mask[idx] = 1;
            else if (mask[idx] === 0) mask[idx] = 2;
          }
        }
      }
    }
  }

  // --------------------------------------------------------------- energy ---

  // Charges the cells within `radius` px of a point, most at the middle.
  function inject(px, py, radius, amount) {
    const c0 = Math.max(0, Math.floor((px - radius) / cw));
    const c1 = Math.min(cols - 1, Math.floor((px + radius) / cw));
    const r0 = Math.max(0, Math.floor((py - radius + frac) / ch));
    const r1 = Math.min(rows - 1, Math.floor((py + radius + frac) / ch));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const d = Math.hypot((c + 0.5) * cw - px, (r + 0.5) * ch - frac - py) / radius;
        if (d < 1) {
          const idx = r * cols + c;
          const v = amount * (1 - d);
          if (v > E[idx]) E[idx] = v;
        }
      }
    }
  }

  // A pulse is a ring that grows at 950 px a second and fades out over 1.4 s.
  function applyPulses(t) {
    for (let p = pulses.length - 1; p >= 0; p--) {
      const pulse = pulses[p];
      const age = t - pulse.t0;
      if (age > 1.4) {
        pulses.splice(p, 1);
        continue;
      }
      const R = age * 950;
      const strength = 0.95 * (1 - age / 1.4);
      for (let r = 0; r < rows; r++) {
        const dy = (r + 0.5) * ch - frac - pulse.y;
        for (let c = 0; c < cols; c++) {
          const d = Math.abs(Math.hypot((c + 0.5) * cw - pulse.x, dy) - R);
          if (d < 34) {
            const idx = r * cols + c;
            const v = strength * (1 - d / 34);
            if (v > E[idx]) E[idx] = v;
          }
        }
      }
    }
  }

  // ----------------------------------------------------------------- draw ---

  // Draws the cells whose glyph changed. Returns whether anything is still
  // charged, so the loop knows when it can stop.
  function draw(t, dt) {
    const off = (window.scrollY || 0) * parallax;
    const rowOff = Math.floor(off / ch);
    frac = off - rowOff * ch;
    fracD = Math.round(frac * dpr);
    buildMask();

    const decay = Math.pow(0.87, dt * 30);
    for (let i = 0; i < N; i++) if (E[i] > 0.001) E[i] *= decay; else E[i] = 0;
    if (pulses.length) applyPulses(t);

    const full = fullRedraw || rowOff !== lastRowOff || fracD !== lastFracD;
    fullRedraw = false;
    lastRowOff = rowOff;
    lastFracD = fracD;
    if (full) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      prevCode.fill(-1);
    }

    let live = pulses.length > 0;
    for (let r = 0; r < rows; r++) {
      const yD = r * chD - fracD;
      const base = r * cols;
      for (let c = 0; c < cols; c++) {
        const idx = base + c;
        const e = E[idx];
        if (e > 0) live = true;
        const m = mask[idx];
        let code = -1;
        if (e > 0.06 && m !== 1 && !(m === 2 && RA[idx] < 0.55)) {
          const g = (hash3(c, r, Math.floor(t * 14 + RA[idx] * 10)) * GLYPHS.length) | 0;
          code = (g << 2) | (e > 0.55 ? 0 : e > 0.28 ? 1 : 2);
        }
        if (code === prevCode[idx]) continue;
        prevCode[idx] = code;
        ctx.clearRect(c * cwD, yD, cwD, chD);
        if (code < 0) continue;
        if (fill) {
          ctx.fillStyle = colors.bg;
          ctx.fillRect(c * cwD, yD, cwD, chD);
        }
        ctx.drawImage(atlas, (code >> 2) * cwD, (code & 3) * chD, cwD, chD, c * cwD, yD, cwD, chD);
      }
    }
    return live;
  }

  // The loop only runs while something is charged, and stops once the last
  // glyph has faded.
  function frame(now) {
    const scrollNow = window.scrollY;
    if (scrollNow === lastScroll && now - lastDraw < 1000 / FPS - 2) {
      raf = requestAnimationFrame(frame);
      return;
    }
    lastScroll = scrollNow;
    const t = now / 1000;
    const dt = lastT ? Math.min(0.1, t - lastT) : 1 / FPS;
    lastT = t;
    lastDraw = now;
    if (draw(t, dt)) raf = requestAnimationFrame(frame);
    else {
      running = false;
      lastT = 0;
    }
  }

  function wake() {
    if (running || !started || reduced) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(raf);
    running = false;
    lastT = 0;
    pulses.length = 0;
    if (E) E.fill(0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    fullRedraw = true;
  }

  function start() {
    if (started) return;
    started = true;
    setup();
  }

  // --------------------------------------------------------------- events ---

  let resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (started) setup();
    }, 120);
  });

  function onTheme() {
    if (!started) return;
    readColors();
    buildAtlas();
    fullRedraw = true;
  }
  new MutationObserver(onTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  darkMQ.addEventListener("change", onTheme);
  reducedMQ.addEventListener("change", function () {
    reduced = reducedMQ.matches;
    if (reduced) stop();
  });

  // The pointer charges every cell along its path, in steps of 10 px, so a
  // fast stroke leaves an unbroken trail.
  let lastPX = null, lastPY = null;
  window.addEventListener("pointermove", function (e) {
    if (!started || reduced) return;
    const x = e.clientX, y = e.clientY;
    if (lastPX === null) inject(x, y, 24, 0.9);
    else {
      const dx = x - lastPX, dy = y - lastPY;
      const steps = Math.min(12, Math.ceil(Math.hypot(dx, dy) / 10));
      for (let i = 1; i <= steps; i++) inject(lastPX + (dx * i) / steps, lastPY + (dy * i) / steps, 24, 0.9);
    }
    lastPX = x;
    lastPY = y;
    wake();
  }, { passive: true });
  document.addEventListener("pointerleave", function () { lastPX = lastPY = null; });
  window.addEventListener("blur", function () { lastPX = lastPY = null; });

  function pulse(x, y) {
    if (!started || reduced) return;
    pulses.push({ x: x, y: y, t0: performance.now() / 1000 });
    wake();
  }

  window.CursorTrail = {
    pulse: pulse,
    // Looks for .ko elements again, for a page that adds them later.
    refresh: function () {
      if (started) koEls = Array.from(document.querySelectorAll(".ko"));
    },
  };
  // The drive in pixel-drive/ calls the ripple Field.pulse when its car is
  // clicked.
  if (!window.Field || !window.Field.pulse) window.Field = Object.assign(window.Field || {}, { pulse: pulse });

  const fontReady = document.fonts && document.fonts.load
    ? document.fonts.load('11px "IBM Plex Mono"')
    : Promise.resolve();
  Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(start, start);
})();
