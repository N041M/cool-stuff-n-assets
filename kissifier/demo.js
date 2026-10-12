(function () {
  "use strict";

  const SIZE = 800; // longest side of the uploaded image, in pixels
  const MARGIN = 160;
  const PAPER = "#f0e2c8";

  const $ = (selector) => document.querySelector(selector);
  const view = $("[data-view]");
  const stage = $("[data-stage]");
  const status = $("[data-status]");
  const counts = document.querySelectorAll("[data-count]");
  const swatches = document.querySelectorAll("[data-ink]");
  const wheel = $("[data-wheel]");
  const brightness = $("[data-brightness]");
  const hexOut = $("[data-hex]");
  const ink = document.createElement("canvas");
  const worker = new Worker("render-worker.js");

  let shape = null;
  let recipe = null;
  let print = null;
  let name = "print";
  let color = "#7a1e1e";
  let hsv = toHsv(color);
  let job = 0;

  const seed = () => (Math.random() * 2 ** 32) >>> 0;
  const say = (text) => { status.textContent = text; };

  // ---------- shape ----------

  // A transparent image gives its shape by alpha. In an opaque one the shape is whatever differs
  // from the colour along the image's edges.
  function mask(img) {
    const iw = img.naturalWidth || img.width || SIZE, ih = img.naturalHeight || img.height || SIZE;
    const k = SIZE / Math.max(iw, ih);
    const w = Math.round(iw * k), h = Math.round(ih * k);
    const W = w + 2 * MARGIN, H = h + 2 * MARGIN;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, MARGIN, MARGIN, w, h);
    const px = ctx.getImageData(0, 0, W, H).data;
    const inside = (i) => {
      const x = i % W, y = (i - x) / W;
      return x >= MARGIN && x < MARGIN + w && y >= MARGIN && y < MARGIN + h;
    };
    const alpha = new Float32Array(W * H);
    let clear = 0;
    for (let i = 0; i < alpha.length; i++) if (inside(i) && px[4 * i + 3] < 128) clear++;
    if (clear > 0.01 * w * h) {
      for (let i = 0; i < alpha.length; i++) alpha[i] = px[4 * i + 3] / 255;
      return { alpha, W, H };
    }
    const border = [[], [], []];
    for (let i = 0; i < alpha.length; i++) {
      if (!inside(i)) continue;
      const x = i % W, y = (i - x) / W;
      if (x === MARGIN || x === MARGIN + w - 1 || y === MARGIN || y === MARGIN + h - 1) {
        for (let c = 0; c < 3; c++) border[c].push(px[4 * i + c]);
      }
    }
    const bg = border.map((values) => values.sort((a, b) => a - b)[values.length >> 1]);
    for (let i = 0; i < alpha.length; i++) {
      if (!inside(i)) continue;
      const d = Math.hypot(px[4 * i] - bg[0], px[4 * i + 1] - bg[1], px[4 * i + 2] - bg[2]);
      alpha[i] = Math.min(1, Math.max(0, (d - 40) / 80));
    }
    return { alpha, W, H };
  }

  function start(img, label) {
    const { alpha, W, H } = mask(img);
    const next = Kissifier.shape(alpha, W, H);
    if (!next) {
      say("No shape found in that image.");
      return;
    }
    shape = next;
    name = label;
    recipe = Kissifier.newRecipe(seed());
    update();
  }

  function load(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      start(img, file.name.replace(/\.[^.]+$/, ""));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      say("That file could not be read as an image.");
    };
    img.src = url;
  }

  // ---------- recipe and render ----------

  // Raising a slider adds features and keeps the ones already there. Lowering it removes the
  // newest ones.
  function update() {
    for (const slider of counts) {
      const kind = slider.dataset.count, want = Number(slider.value), list = recipe[kind];
      if (want < list.length) list.length = want;
      if (want > list.length) Kissifier.addFeatures(shape, recipe, { [kind]: want - list.length }, seed());
    }
    const id = ++job;
    stage.classList.add("busy");
    say("Rendering…");
    worker.postMessage({ id, alpha: shape.A, width: shape.W, height: shape.H, recipe, color: "#000000" });
  }

  worker.onmessage = ({ data }) => {
    if (data.id !== job) return;
    stage.classList.remove("busy");
    print = data;
    paint();
    say("");
  };

  // The ink colour only changes the pixels' colour, so a new colour needs no new render.
  function paint() {
    if (!print) return;
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(color.slice(k, k + 2), 16));
    const d = print.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
    ink.width = view.width = print.width;
    ink.height = view.height = print.height;
    ink.getContext("2d").putImageData(new ImageData(d, print.width, print.height), 0, 0);
    const ctx = view.getContext("2d");
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, view.width, view.height);
    ctx.drawImage(ink, 0, 0);
  }

  // ---------- colour ----------

  function toHsv(hex) {
    const [r, g, b] = [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16) / 255);
    const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
    const h = !d ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: max ? d / max : 0, v: max };
  }

  function toHex({ h, s, v }) {
    const f = (n) => {
      const k = (n + h / 60) % 6;
      return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
    };
    return "#" + [f(5), f(3), f(1)].map((c) => c.toString(16).padStart(2, "0")).join("");
  }

  // Hue runs around the wheel and saturation out from its centre, at full brightness.
  function drawWheel() {
    const n = wheel.width, c = n / 2;
    const ctx = wheel.getContext("2d");
    const img = ctx.createImageData(n, n);
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const dx = x + 0.5 - c, dy = y + 0.5 - c, s = Math.hypot(dx, dy) / c;
        if (s > 1) continue;
        const hex = toHex({ h: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, s, v: 1 });
        const i = 4 * (y * n + x);
        for (let k = 0; k < 3; k++) img.data[i + k] = parseInt(hex.slice(1 + 2 * k, 3 + 2 * k), 16);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const a = hsv.h * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * hsv.s * c, c + Math.sin(a) * hsv.s * c, 6, 0, 2 * Math.PI);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#17181b";
    ctx.stroke();
  }

  function setInk(hex, fromHsv) {
    color = hex;
    if (!fromHsv) hsv = toHsv(hex);
    brightness.value = Math.round(hsv.v * 100);
    hexOut.textContent = hex;
    for (const swatch of swatches) swatch.setAttribute("aria-pressed", String(swatch.dataset.ink === hex));
    drawWheel();
    paint();
  }

  function pick(e) {
    const rect = wheel.getBoundingClientRect();
    const dx = (e.clientX - rect.left) / rect.width - 0.5, dy = (e.clientY - rect.top) / rect.height - 0.5;
    hsv = { h: (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360, s: Math.min(1, 2 * Math.hypot(dx, dy)), v: hsv.v };
    setInk(toHex(hsv), true);
  }

  wheel.addEventListener("pointerdown", (e) => {
    wheel.setPointerCapture(e.pointerId);
    pick(e);
  });
  wheel.addEventListener("pointermove", (e) => {
    if (wheel.hasPointerCapture(e.pointerId)) pick(e);
  });
  brightness.addEventListener("input", () => {
    hsv = { ...hsv, v: brightness.value / 100 };
    setInk(toHex(hsv), true);
  });
  for (const swatch of swatches) swatch.addEventListener("click", () => setInk(swatch.dataset.ink));

  // ---------- controls ----------

  for (const slider of counts) {
    slider.addEventListener("input", () => { slider.nextElementSibling.textContent = slider.value; });
    slider.addEventListener("change", () => { if (shape) update(); });
  }

  $("[data-new]").addEventListener("click", () => {
    if (!shape) return;
    recipe = Kissifier.newRecipe(seed());
    update();
  });

  $("[data-download]").addEventListener("click", () => {
    if (!print) return;
    ink.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${name}-kiss.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  });

  $("[data-file]").addEventListener("change", (e) => load(e.target.files[0]));
  stage.addEventListener("dragover", (e) => {
    e.preventDefault();
    stage.classList.add("over");
  });
  stage.addEventListener("dragleave", () => stage.classList.remove("over"));
  stage.addEventListener("drop", (e) => {
    e.preventDefault();
    stage.classList.remove("over");
    load(e.dataTransfer.files[0]);
  });

  // The page opens on a kiss outline traced from a photo, so there is a print before anything
  // is uploaded.
  drawWheel();
  const kiss = new Image();
  kiss.onload = () => start(kiss, "kiss");
  kiss.src = "kiss.png";
})();
