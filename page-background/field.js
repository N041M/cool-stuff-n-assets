// The glyph field behind the page.
//
// A fixed canvas is divided into character cells, and every cell draws one
// glyph from a pre-rendered atlas. The page shows a plot with a dotted grid,
// ridgeline traces and heavy dashes that come and go. The footer sits on
// water, and a numbered ruler hangs under the top bar. Elements with the class
// `ko` are cut out of the field so their text stays readable.
//
// The pointer's trail is drawn separately, by cursor-trail/.
//
// The whole field scrolls at PARALLAX times the page speed. Cells are worked
// out in scene rows, and the grid is drawn shifted by the leftover fraction of
// a row, so it glides with the page instead of jumping a row at a time.
(function () {
  "use strict";

  const canvas = document.getElementById("field");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const root = document.documentElement;
  const reducedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkMQ = window.matchMedia("(prefers-color-scheme: dark)");

  // ---------------------------------------------------------------- noise ---

  function mulberry32(a) {
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const perm = new Uint8Array(512);
  const perm12 = new Uint8Array(512);
  (function () {
    const rand = mulberry32(20260925);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
      perm12[i] = perm[i] % 12;
    }
  })();

  const GRAD = new Int8Array([
    1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
    1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
    0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
  ]);
  const F3 = 1 / 3;
  const G3 = 1 / 6;

  // 3D simplex noise (after Stefan Gustavson), roughly in [-1, 1].
  function noise3(xin, yin, zin) {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let n = 0;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      const g = perm12[ii + perm[jj + perm[kk]]] * 3;
      t0 *= t0;
      n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0 + GRAD[g + 2] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      const g = perm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3;
      t1 *= t1;
      n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1 + GRAD[g + 2] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      const g = perm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3;
      t2 *= t2;
      n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2 + GRAD[g + 2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      const g = perm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3;
      t3 *= t3;
      n += t3 * t3 * (GRAD[g] * x3 + GRAD[g + 1] * y3 + GRAD[g + 2] * z3);
    }
    return 32 * n;
  }

  function hash2(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function hash3(a, b, c) {
    return hash2((a | 0) + Math.imul(c | 0, 1442695041), (b | 0) ^ Math.imul(c | 0, -2048144777));
  }

  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  // --------------------------------------------------------------- glyphs ---

  // Most of these glyphs are in IBM Plex Mono. The box-drawing characters,
  // ≈ and ■ are not, so the browser takes them from the next monospace font
  // it has. Cells are 7 × 14 CSS px with the glyphs set in 11px type. A large
  // window or a slow machine gets bigger cells and bigger type.
  const SETS = {
    digits: "0123456789",
    water: "─═-—~≈─",
    energy: "<>/\\|-=+*#%&",
  };
  const EXTRA = "/\\-─═■·_|━•¯┊╷";
  const GLYPHS = Array.from(new Set(Array.from(Object.values(SETS).join("") + EXTRA)));
  const GI = new Map(GLYPHS.map(function (g, i) { return [g, i]; }));
  const S = {};
  for (const key in SETS) S[key] = Int16Array.from(Array.from(SETS[key]), function (g) { return GI.get(g); });
  function G(g) {
    return GI.get(g);
  }
  const G_SLASH = G("/"), G_BACK = G("\\"), G_DASH = G("-"), G_H = G("─"), G_HH = G("═");
  const G_SQ = G("■"), G_HEAVY = G("━"), G_BULLET = G("•");
  const G_MACRON = G("¯"), G_US = G("_"), G_PIPE = G("|"), G_GRID = G("┊"), G_TICK = G("╷");

  // Atlas rows 0–6 are ink at falling opacity. A cell's code is its glyph
  // index shifted left by 7, or'd with its row.
  const FG_LEVELS = [1, 0.8, 0.6, 0.44, 0.32, 0.22, 0.13];

  function pick(set, h) {
    return set[(h * set.length) | 0];
  }

  // ---------------------------------------------------------------- state ---

  const MAX_CELLS = 17000;
  const FPS = 30;
  const PARALLAX = 0.5;
  // Plot layer: a dotted grid line every GRID columns, and ridgeline traces
  // TRACE_ROWS rows apart with heavy dashes and dots placed on them.
  const GRID = 6;
  const TRACE_ROWS = 5;
  const SLOT = 7;

  let dpr = 1, vw = 0, vh = 0;
  let fontPx = 11, cw = 7, ch = 14, cwD = 7, chD = 14;
  let cols = 0, rows = 0, N = 0;
  let atlas = null;
  let colors = { bg: "#fbfaf8", fg: "#17181b" };
  let mask, RA;
  // What each cell showed last frame, so a frame only redraws what changed.
  let prevCode;
  let fullRedraw = true, lastRowOff = -1, lastFracD = -1;
  let traceBuf = new Float32Array(0);
  let traceK0 = 0, traceCount = 0, traceGap = 70, traceAmp = 180;
  // Sub-row shift of the grid in CSS px and device px, and where the footer's
  // water starts in scene px.
  let frac = 0, fracD = 0, seaTop = Infinity;
  let shoreEl = null, koEls = [];
  // Where the top bar ends, so the ruler can hang just below it. Without a
  // top bar there is no ruler.
  let barEl = null, barBottom = 0;
  let reduced = reducedMQ.matches;
  let started = false;
  let raf = 0, lastDraw = 0, lastScroll = -1;

  function readColors() {
    const cs = getComputedStyle(root);
    colors = {
      bg: cs.getPropertyValue("--bg").trim() || colors.bg,
      fg: cs.getPropertyValue("--fg").trim() || colors.fg,
    };
  }

  function buildAtlas() {
    atlas = document.createElement("canvas");
    atlas.width = GLYPHS.length * cwD;
    atlas.height = 7 * chD;
    const a = atlas.getContext("2d");
    a.font = fontPx * dpr + 'px "IBM Plex Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace';
    a.textBaseline = "alphabetic";
    const baseline = Math.round(fontPx * dpr);
    a.fillStyle = colors.fg;
    for (let row = 0; row < 7; row++) {
      a.globalAlpha = FG_LEVELS[row];
      for (let i = 0; i < GLYPHS.length; i++) a.fillText(GLYPHS[i], i * cwD, row * chD + baseline);
    }
  }

  function measureLayout() {
    shoreEl = document.querySelector("[data-shore]");
    koEls = Array.from(document.querySelectorAll(".ko"));
    barEl = document.querySelector(".top");
    barBottom = barEl ? Math.round(barEl.getBoundingClientRect().bottom) : 0;
    // The water reaches the shore spacer exactly when the page is scrolled to
    // the end, and stays below it before that.
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    seaTop = shoreEl
      ? shoreEl.getBoundingClientRect().top + window.scrollY - maxScroll * (1 - PARALLAX)
      : Infinity;
  }

  function setup() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    vw = rect.width;
    vh = rect.height;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    let scale = scaleFloor;
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
    RA = new Float32Array(N);
    for (let i = 0; i < N; i++) RA[i] = hash2(i, 7);
    prevCode = new Int32Array(N);
    fullRedraw = true;
    readColors();
    buildAtlas();
    measureLayout();
  }

  // ------------------------------------------------------------- knockout ---

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

  // Samples every visible trace at each column edge, in scene pixels. A trace
  // sits on its baseline and rises above it by up to traceAmp, so neighbouring
  // traces cross each other.
  function computeTraces(t, sceneTop) {
    traceGap = ch * TRACE_ROWS;
    traceAmp = traceGap * 2.6;
    traceK0 = Math.floor(sceneTop / traceGap) - 1;
    const k1 = Math.ceil((sceneTop + vh + ch + traceAmp) / traceGap) + 1;
    traceCount = k1 - traceK0 + 1;
    const stride = cols + 1;
    if (traceBuf.length < traceCount * stride) traceBuf = new Float32Array(traceCount * stride);
    for (let n = 0; n < traceCount; n++) {
      const k = traceK0 + n;
      const baseY = k * traceGap;
      const amp = traceAmp * (0.55 + 0.45 * hash2(k, 3));
      for (let c = 0; c <= cols; c++) {
        const x = c * cw;
        const n1 = noise3(x / 260, k * 0.61, t * 0.04);
        const n2 = noise3(x / 95, k * 1.37 + 7, t * 0.06);
        const env2 = 0.6 + 0.4 * noise3(x / 700, k * 0.23, 5.5);
        const h = env2 * (0.6 * Math.max(0, n1) + 0.4 * Math.pow(n2 * 0.5 + 0.5, 3));
        traceBuf[n * stride + c] = baseY - amp * h;
      }
    }
  }

  // ----------------------------------------------------------------- plot ---

  function plotCell(c, r, sy, t) {
    const top = sy - ch / 2, bot = sy + ch / 2;
    const kLo = Math.max(traceK0, Math.ceil(top / traceGap));
    const kHi = Math.min(traceK0 + traceCount - 1, Math.floor((bot + traceAmp) / traceGap));
    const stride = cols + 1;
    let curve = -1;
    for (let k = kLo; k <= kHi; k++) {
      const row = (k - traceK0) * stride;
      // Dashes and dots sit on the trace at the centre of a slot. Each slot
      // re-rolls every ~9 s, so marks come and go slowly.
      const shift = mod(k * 3, SLOT);
      const slot = Math.floor((c + shift) / SLOT);
      const hb = hash3(slot, k, Math.floor(t / 9 + hash2(slot, k)));
      if (hb < 0.12) {
        const center = slot * SLOT - shift + (SLOT >> 1);
        if (center >= 0 && center < cols) {
          const cy = (traceBuf[row + center] + traceBuf[row + center + 1]) / 2;
          if (cy >= top && cy < bot) {
            if (hb < 0.07) {
              const half = 1 + ((hash2(slot, k + 77) * 4) | 0);
              if (Math.abs(c - center) <= half) return G_HEAVY << 7;
            } else if (c === center) return (G_BULLET << 7) | 1;
          }
        }
      }
      if (curve < 0) {
        const yA = traceBuf[row + c], yB = traceBuf[row + c + 1];
        if (Math.max(yA, yB) >= top && Math.min(yA, yB) < bot) {
          const slope = (yB - yA) / cw;
          const lvl = (k & 3) === 0 ? 4 : 5;
          let g;
          if (Math.abs(slope) < 0.35) {
            const d = (yA + yB) / 2 - top;
            g = d < ch / 3 ? G_MACRON : d < (2 * ch) / 3 ? G_DASH : G_US;
          } else if (Math.abs(slope) < 2.2) g = slope < 0 ? G_SLASH : G_BACK;
          else g = G_PIPE;
          curve = (g << 7) | lvl;
        }
      }
    }
    if (curve >= 0) return curve;
    if (c % GRID === 0) return (G_GRID << 7) | 6;
    if (hash3(c, r, Math.floor(t * 0.35 + hash2(c, r + 7000) * 8)) < 0.002) return (pick(S.energy, hash2(r, c)) << 7) | 5;
    return -1;
  }

  // A numbered ruler hanging under the top bar. Its ticks line up with the
  // grid's dotted columns.
  function drawRuler() {
    if (!barEl) return;
    const yD = Math.round(barBottom * dpr);
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, yD, canvas.width, chD);
    for (let c = 0; c < cols; c++) {
      const m = c % GRID;
      let g = -1;
      if (m === 0) g = G_TICK;
      else if (m === 1 || m === 2) g = GI.get(String(Math.floor(c / GRID) + 1).padStart(2, "0")[m - 1]);
      if (g >= 0) ctx.drawImage(atlas, g * cwD, 3 * chD, cwD, chD, c * cwD, yD, cwD, chD);
    }
    const r = Math.floor((barBottom + frac) / ch);
    for (let c = 0; c < cols && r >= 0 && r < rows; c++) prevCode[r * cols + c] = -9;
  }

  function waterCell(x, dy, t) {
    const ri = Math.floor(dy / ch);
    if (ri === 0) {
      const wc = Math.floor((x + t * 6) / cw);
      return ((hash2(wc >> 2, 3) < 0.85 ? G_H : G_HH) << 7) | 1;
    }
    const sway = Math.sin(t * 0.9 + ri * 0.7) * cw * 1.2;
    const wc = Math.floor((x + t * (4 + ri * 2.5) + sway) / cw);
    const segLen = 2 + ((hash2(ri, 71) * 8) | 0);
    const hs = hash2(Math.floor(wc / segLen), ri + 131);
    const dens = Math.min(0.7, 0.16 + ri * 0.05);
    if (hs < dens) {
      if (hash2(wc, ri + 7) < 0.03) return (G_SQ << 7) | 1;
      return (S.water[((hs / dens) * S.water.length) | 0] << 7) | (ri < 3 ? 3 : ri < 7 ? 2 : 1);
    }
    return -1;
  }

  // ----------------------------------------------------------------- draw ---

  function draw(t) {
    const scrollY = window.scrollY || 0;
    const sceneOff = scrollY * PARALLAX;
    const rowOff = Math.floor(sceneOff / ch);
    frac = sceneOff - rowOff * ch;
    fracD = Math.round(frac * dpr);
    computeTraces(t, rowOff * ch);
    buildMask();

    // A scrolled grid, a resize or a theme change redraws everything. Otherwise
    // only cells whose glyph changed are drawn.
    const full = fullRedraw || rowOff !== lastRowOff || fracD !== lastFracD;
    fullRedraw = false;
    lastRowOff = rowOff;
    lastFracD = fracD;
    ctx.globalAlpha = 1;
    if (full) ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < rows; r++) {
      const sr = r + rowOff;
      const sy = (sr + 0.5) * ch;
      const yD = r * chD - fracD;
      const base = r * cols;
      for (let c = 0; c < cols; c++) {
        const idx = base + c;
        const m = mask[idx];
        const x = (c + 0.5) * cw;
        let code;
        if (m === 1 || (m === 2 && RA[idx] < 0.55)) code = -1;
        else if (sy > seaTop) code = waterCell(x, sy - seaTop, t);
        else code = plotCell(c, sr, sy, t);
        if (!full && code === prevCode[idx]) continue;
        prevCode[idx] = code;
        ctx.fillStyle = colors.bg;
        ctx.fillRect(c * cwD, yD, cwD, chD);
        if (code >= 0) ctx.drawImage(atlas, (code >> 7) * cwD, (code & 127) * chD, cwD, chD, c * cwD, yD, cwD, chD);
      }
    }
    drawRuler();
  }

  // Draw time is averaged over 60 frames. A machine that cannot keep up gets
  // bigger cells, which means fewer of them.
  let costSum = 0, costFrames = 0, lastCost = 0;
  let scaleFloor = 1;

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const scrollNow = window.scrollY;
    if (scrollNow === lastScroll && now - lastDraw < 1000 / FPS - 2) return;
    lastScroll = scrollNow;
    lastDraw = now;
    const t0 = performance.now();
    draw(now / 1000);
    costSum += performance.now() - t0;
    if (++costFrames === 60) {
      lastCost = costSum / 60;
      if (lastCost > 16 && scaleFloor < 2) {
        scaleFloor += 0.25;
        setup();
      }
      costSum = 0;
      costFrames = 0;
    }
  }

  // A fixed moment for reduced motion, redrawn only when something changes.
  const STILL_T = 62;
  let stillQueued = false;
  function drawStill() {
    if (stillQueued) return;
    stillQueued = true;
    requestAnimationFrame(function () {
      stillQueued = false;
      fullRedraw = true;
      draw(STILL_T);
    });
  }

  function start() {
    if (started) return;
    started = true;
    setup();
    if (reduced) drawStill();
    else raf = requestAnimationFrame(frame);
  }

  function restartLoop() {
    cancelAnimationFrame(raf);
    reduced = reducedMQ.matches;
    if (reduced) drawStill();
    else raf = requestAnimationFrame(frame);
  }

  // --------------------------------------------------------------- events ---

  let resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!started) return;
      setup();
      if (reduced) drawStill();
    }, 120);
  });

  window.addEventListener("scroll", function () {
    if (started && reduced) drawStill();
  }, { passive: true });

  if (window.ResizeObserver) {
    new ResizeObserver(function () {
      if (!started) return;
      measureLayout();
      if (reduced) drawStill();
    }).observe(document.body);
  }

  function onTheme() {
    if (!started) return;
    readColors();
    buildAtlas();
    fullRedraw = true;
    if (reduced) drawStill();
  }
  new MutationObserver(onTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  darkMQ.addEventListener("change", onTheme);
  reducedMQ.addEventListener("change", restartLoop);
  document.addEventListener("langchange", function () {
    if (!started) return;
    requestAnimationFrame(measureLayout);
  });

  // A page that moves or adds .ko elements, or changes its height, can call
  // Field.refresh() so the field measures the page again.
  window.Field = Object.assign(window.Field || {}, {
    refresh: function () {
      if (!started) return;
      measureLayout();
      if (reduced) drawStill();
    },
  });

  const fontReady = document.fonts && document.fonts.load
    ? document.fonts.load('11px "IBM Plex Mono"')
    : Promise.resolve();
  Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(start, start);
})();
