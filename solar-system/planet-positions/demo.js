// The demo page. It draws the Sun and the planets on their orbits on a date,
// seen from the north of the ecliptic, from window.Ephemeris (ephemeris.js).
// The x axis points to the right and the y axis up.
(function () {
  "use strict";

  const Eph = window.Ephemeris;
  const canvas = document.getElementById("map");
  if (!Eph || !canvas) return;
  const g = canvas.getContext("2d");
  const dateEl = document.getElementById("date");

  const NAMES = {
    mercury: "Mercury", venus: "Venus", earth: "Earth", mars: "Mars",
    jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune",
  };
  // How far from the Sun each scale reaches, AU: past the aphelion of Mars
  // and of Neptune.
  const REACH = { inner: 1.72, all: 30.6 };
  // A planet is named once its orbit is this many CSS pixels across, so the
  // names of the inner planets do not pile up round the Sun.
  const NAME_MIN = 44;

  const style = getComputedStyle(document.documentElement);
  const token = (name) => style.getPropertyValue(name).trim();
  const C = { orbit: token("--orbit"), planet: token("--ink"), name: token("--ink-2"), sun: token("--accent"), font: token("--font") };

  let scale = "all";
  let date = new Date();
  // The day of the month the steps keep to, so that 31 January steps to
  // 28 February and then to 31 March.
  let day = date.getDate();

  function pad(n) { return String(n).padStart(2, "0"); }
  function showDate() {
    const text = date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
    dateEl.textContent = text;
    dateEl.dateTime = text;
  }

  function draw() {
    const box = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    const w = Math.round(box.width * dpr), h = Math.round(box.height * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, box.width, box.height);

    const cx = box.width / 2, cy = box.height / 2;
    const k = Math.max(1, Math.min(box.width, box.height) / 2 - 32) / REACH[scale];   // CSS px per AU
    const X = (p) => cx + p[0] * k, Y = (p) => cy - p[1] * k;

    g.lineWidth = 1;
    g.strokeStyle = C.orbit;
    Eph.PLANETS.forEach(function (name) {
      const path = Eph.orbitPath(name, date, 360);
      g.beginPath();
      path.forEach(function (p, i) { if (i) g.lineTo(X(p), Y(p)); else g.moveTo(X(p), Y(p)); });
      g.closePath();
      g.stroke();
    });

    g.fillStyle = C.sun;
    g.beginPath();
    g.arc(cx, cy, 4, 0, Math.PI * 2);
    g.fill();

    g.font = "400 11px " + C.font;
    g.textBaseline = "middle";
    Eph.PLANETS.forEach(function (name) {
      const p = Eph.planetPosition(name, date), x = X(p), y = Y(p);
      if (x < 0 || y < 0 || x > box.width || y > box.height) return;
      g.fillStyle = C.planet;
      g.beginPath();
      g.arc(x, y, 2.5, 0, Math.PI * 2);
      g.fill();
      if (2 * Eph.orbit(name, date).a * k < NAME_MIN) return;
      // The name sits beside the planet on the side away from the Sun. Where
      // that would run off the map it sits above or below the planet.
      const text = NAMES[name], tw = g.measureText(text).width;
      let tx = x >= cx ? x + 8 : x - 8 - tw, ty = y;
      if (tx < 4 || tx + tw > box.width - 4) {
        tx = Math.min(Math.max(4, x - tw / 2), box.width - 4 - tw);
        ty = y < cy ? y - 12 : y + 12;
      }
      g.fillStyle = C.name;
      g.fillText(text, tx, ty);
    });
  }

  function setScale(s) {
    scale = s;
    document.querySelectorAll("[data-scale]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute("data-scale") === s));
    });
    draw();
  }

  // n months back or forward, or back to now for 0
  function step(n) {
    if (n === 0) {
      date = new Date();
      day = date.getDate();
    } else {
      const y = date.getFullYear(), m = date.getMonth() + n, last = new Date(y, m + 1, 0).getDate();
      date = new Date(y, m, Math.min(day, last), date.getHours(), date.getMinutes(), date.getSeconds());
    }
    showDate();
    draw();
  }

  document.querySelectorAll("[data-scale]").forEach(function (b) {
    b.addEventListener("click", function () { setScale(b.getAttribute("data-scale")); });
  });
  document.querySelectorAll("[data-step]").forEach(function (b) {
    b.addEventListener("click", function () { step(Number(b.getAttribute("data-step"))); });
  });

  let queued = false;
  function redraw() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; draw(); });
  }
  if (window.ResizeObserver) new ResizeObserver(redraw).observe(canvas);
  else window.addEventListener("resize", redraw);
  // The names are drawn again once the font has loaded.
  if (document.fonts && document.fonts.load) document.fonts.load('11px "IBM Plex Mono"').then(redraw, function () {});

  showDate();
  draw();
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
