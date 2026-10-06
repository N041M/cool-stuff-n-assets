// The night sky behind the demo page. The camera looks along the ecliptic
// and turns slowly round its pole, so the sky drifts from east to west,
// from left to right, and the stars twinkle. When the system
// asks for reduced motion, the sky stands still and the stars hold their
// brightness.
(function () {
  "use strict";

  const GR = window.GlyphRenderer;
  const NS = window.NightSky;
  const canvas = document.getElementById("sky");
  if (!GR || !NS || !canvas) return;

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  // The camera starts at ecliptic longitude 270 degrees, just east of the
  // middle of the galaxy in Sagittarius, where the Milky Way is brightest.
  // The field of other galaxies round the south galactic pole drifts in
  // from the left after it.
  const START = (270 * Math.PI) / 180;
  // The sky turns once in 15 minutes. This is in radians a second.
  const DRIFT = (2 * Math.PI) / 900;
  // The stars are laid out again four times a second while the sky drifts,
  // and twinkle at up to 30 frames a second in between.
  const LAYOUT_MS = 250;
  const FRAME_MS = 1000 / 30;

  let g = null;
  let sky = null;
  let lon = START;
  // the drift's start: the time and the longitude it set off from
  let started = 0;
  let from = START;
  let laidAt = 0;
  let lastFrame = 0;
  let running = false;

  // Look along the ecliptic at longitude lon with the ecliptic's north pole
  // up, lay the stars out, add the galaxies and draw.
  function draw() {
    const c = Math.cos(lon), s = Math.sin(lon), v = g.view;
    v.B = [-c, -s, 0];
    v.R = [s, -c, 0];
    v.U = [0, 0, 1];
    sky.place();
    g.clear();
    NS.drawGalaxies(g, 1);
    g.compose(sky);
    g.present();
  }

  // The characters are 8, 9 or 10 px by the window's width, and grow with
  // the reader's text size setting.
  function size(remeasure) {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const em = window.innerWidth / rem;
    const px = ((em < 40 ? 8 : em < 68.75 ? 9 : 10) * rem) / 16;
    g.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2), px, remeasure === true);
    draw();
  }

  // In a frame on another page (?embed), the sky stops while the frame is
  // off screen, and its drift carries on from where it stopped.
  let onScreen = true;
  function watchScreen(el) {
    if (!document.documentElement.hasAttribute("data-embed") || !window.IntersectionObserver) return;
    new IntersectionObserver(function (entries) { onScreen = entries[entries.length - 1].isIntersecting; }).observe(el);
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (!onScreen) { started = 0; from = lon; return; }
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now;
    if (!started) started = now - 1;
    sky.time = now / 1000;
    if (now - laidAt >= LAYOUT_MS) {
      laidAt = now;
      lon = from + ((now - started) / 1000) * DRIFT;
      draw();
    } else {
      g.update(sky, true);
      g.present();
    }
  }

  function setMotion() {
    sky.still = motion.matches;
    if (motion.matches) {
      running = false;
      draw();
    } else if (!running) {
      running = true;
      // The drift carries on from where it stopped.
      started = 0;
      from = lon;
      requestAnimationFrame(frame);
    }
  }

  function start() {
    g = GR.create(canvas, { font: getComputedStyle(document.body).fontFamily });
    sky = NS.layer(g);
    size();
    watchScreen(g.canvas);
    setMotion();
    if (motion.addEventListener) {
      motion.addEventListener("change", setMotion);
    }
    let resizeTimer = 0;
    window.addEventListener("resize", function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(size, 150);
    });
  }

  // The sky starts once IBM Plex Mono has loaded, or after 1.5 s without it.
  // A font that arrives later is measured again.
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
