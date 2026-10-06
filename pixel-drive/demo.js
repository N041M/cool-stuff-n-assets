// The controls on the demo page. Each one calls window.Drive, which
// js/engine.js sets up.
(function () {
  "use strict";

  const Drive = window.Drive;
  if (!Drive) return;
  const root = document.documentElement;
  const form = document.querySelector("[data-jump]");

  // Forced weather holds for as long as the drive stays at that jump.
  const WEATHER = {
    clear: { cover: 0.05, precip: 0, fog: 0 },
    cloudy: { cover: 0.85, precip: 0, fog: 0.1 },
    rain: { cover: 0.95, precip: 0.8, temp: 10, wet: 1 },
    snow: { cover: 0.95, precip: 0.7, temp: -4, snow: 1 },
    fog: { cover: 0.5, precip: 0, fog: 0.75 },
  };

  // Each scene starts where it can happen. The UFO only comes at night in
  // clear air.
  const SCENES = {
    pitch: { place: "village", pitch: true },
    jested: { place: "village", region: "hills", jested: true },
    ufo: { place: "country", hour: 23, weather: WEATHER.clear, ufo: true },
  };

  // The single-feature views, opened with ?feature=<id>. Each one hides the
  // panel and the theme switch and starts the drive where the feature shows.
  const FEATURES = {
    ascii: { name: "Character look", style: "ascii" },
    pitch: { name: "Football pitch", jump: Object.assign({ hour: 15 }, SCENES.pitch) },
    jested: { name: "Ještěd", jump: Object.assign({ hour: 16 }, SCENES.jested) },
    ufo: { name: "UFO", ufo: SCENES.ufo },
    rain: { name: "Rain", jump: { place: "country", hour: 11, weather: WEATHER.rain } },
    snow: { name: "Snow", jump: { place: "village", hour: 10, weather: WEATHER.snow } },
    fog: { name: "Fog", jump: { place: "forest", hour: 9, weather: WEATHER.fog } },
    sprint: { name: "Highway sprint", sprint: { place: "highway", hour: 13 } },
  };
  const featureId = new URLSearchParams(window.location.search).get("feature");
  const feature = Object.prototype.hasOwnProperty.call(FEATURES, featureId) ? FEATURES[featureId] : null;

  // A view shows its name after the demo's name, which links to the full
  // page. The panel is hidden before the drive starts, so the road is laid
  // out without it.
  if (feature) {
    const brand = document.querySelector("[data-brand]");
    const full = document.createElement("a");
    full.href = "demo.html";
    full.textContent = "Pixel drive";
    brand.textContent = "";
    brand.append(full, " / " + feature.name);
    document.title = "Pixel drive / " + feature.name;
    document.querySelectorAll("[data-full]").forEach(function (el) { el.hidden = true; });
    document.querySelectorAll("[data-view]:not([data-shoo])").forEach(function (el) { el.hidden = false; });
    if (feature.style) Drive.setStyle(feature.style);
  }

  function press(attr, value) {
    document.querySelectorAll("[" + attr + "]").forEach(function (b) {
      b.setAttribute("aria-pressed", String(b.getAttribute(attr) === value));
    });
  }

  function showSeed() {
    document.querySelector("[data-seed]").textContent = String(Drive.seed);
    const q = new URLSearchParams({ seed: Drive.seed });
    if (Drive.style === "ascii") q.set("drive", "ascii");
    document.querySelector("[data-link]").href = "?" + q.toString();
  }

  // The UFO comes down over a pasture in the middle distance once the
  // pasture is just right of the middle of the screen. The demo tries routes
  // until one has such a pasture ahead, so the UFO comes within seconds.
  function jumpToUfo(o) {
    const E = Drive.engine;
    for (let i = 0; i < 200; i++) {
      Drive.jump(Object.assign({}, o, { seed: Math.floor(Math.random() * 4294967295) }));
      const ahead = E.planes.mid.objs.some(function (obj) {
        const x = E.screenXsp(E.planes.mid.d, obj.u) / E.Wsp;
        return obj.ufo && x > 0.5 && x < 1;
      });
      if (ahead) return;
    }
  }

  // The sprint comes once per stretch of highway, when the car is a quarter
  // of the way in and the road around it is clear. The view picks a route
  // that starts the car just past the quarter, and runs the drive at four
  // times its speed until the sprint begins, which takes about three
  // seconds. A route whose road does not clear in eight seconds is swapped
  // for another.
  function jumpToSprint(o) {
    const E = Drive.engine;
    for (let i = 0; i < 200; i++) {
      Drive.jump(Object.assign({}, o, { seed: Math.floor(Math.random() * 4294967295) }));
      const seg = E.route.segAt(E.carWorldX());
      const f = (E.carWorldX() - seg.x0) / (seg.x1 - seg.x0);
      if (seg.place === "highway" && f > 0.26 && f < 0.4) break;
    }
    if (E.still) return;
    Drive.setRate(4);
    const t0 = performance.now();
    (function wait() {
      if (E.pace > 1.3) return Drive.setRate(1);
      if (performance.now() - t0 > 8000) return jumpToSprint(o);
      setTimeout(wait, 100);
    })();
  }

  // ?embed folds the setup down to the speed and Hop, so the scene shows in
  // a small frame. The panel's own button opens it again.
  const embed = root.hasAttribute("data-embed");
  const setup = document.getElementById("setup");
  const toggle = document.querySelector("[data-toggle-setup]");
  function showSetup(on) {
    setup.hidden = !on;
    toggle.setAttribute("aria-expanded", String(on));
    toggle.textContent = on ? "Hide setup" : "Show setup";
  }
  if (embed && !feature) showSetup(false);

  // The drive starts once its font has loaded.
  (function waitForStart() {
    if (!Drive.seed) return requestAnimationFrame(waitForStart);
    if (feature && feature.jump) Drive.jump(feature.jump);
    if (feature && feature.ufo) jumpToUfo(feature.ufo);
    if (feature && feature.sprint) jumpToSprint(feature.sprint);
    if (feature || embed) Drive.refresh();
    press("data-set-style", Drive.style);
    showSeed();
  })();

  function chosen() {
    const o = {};
    if (form.place.value) o.place = form.place.value;
    if (form.hour.value) o.hour = Number(form.hour.value);
    if (form.weather.value) o.weather = WEATHER[form.weather.value];
    return o;
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    Drive.jump(chosen());
    showSeed();
  });

  document.querySelectorAll("[data-scene]").forEach(function (button) {
    button.addEventListener("click", function () {
      const scene = button.getAttribute("data-scene");
      const o = Object.assign(chosen(), SCENES[scene]);
      if (scene === "ufo") jumpToUfo(o);
      else Drive.jump(o);
      showSeed();
    });
  });

  document.querySelector("[data-new]").addEventListener("click", function () {
    Drive.jump(Object.assign(chosen(), { seed: Math.floor(Math.random() * 4294967295) }));
    showSeed();
  });

  document.querySelectorAll("[data-set-rate]").forEach(function (button) {
    button.addEventListener("click", function () {
      Drive.setRate(Number(button.getAttribute("data-set-rate")));
      press("data-set-rate", String(Drive.rate));
    });
  });

  document.querySelectorAll("[data-hop]").forEach(function (button) {
    button.addEventListener("click", function () {
      Drive.hop();
    });
  });

  // Send away does what a click on the UFO does. It shows while a UFO is
  // coming down or hovering, in the panel on the full page and in the bar in
  // a view.
  const K = window.DriveKit;
  function liveUfo() {
    const mid = Drive.engine.planes && Drive.engine.planes.mid;
    if (!mid || !K.Ufo) return null;
    return mid.actors.find(function (a) {
      return a instanceof K.Ufo && !a.gone && a.stage !== "up" && a.stage !== "away";
    }) || null;
  }
  const shoo = document.querySelector(feature ? "[data-shoo][data-view]" : "[data-shoo]:not([data-view])");
  shoo.addEventListener("click", function () {
    const ufo = liveUfo();
    if (ufo) ufo.shoo();
    shoo.hidden = true;
  });
  setInterval(function () {
    const on = !!liveUfo();
    if (shoo.hidden === on) {
      shoo.hidden = !on;
      if (!feature) Drive.refresh();
    }
  }, 500);

  // Hiding the setup leaves the speed, Hop and this button. The road moves up
  // into the space the setup took.
  toggle.addEventListener("click", function () {
    showSetup(setup.hidden);
    Drive.refresh();
  });

  document.querySelectorAll("[data-set-style]").forEach(function (button) {
    button.addEventListener("click", function () {
      Drive.setStyle(button.getAttribute("data-set-style"));
      press("data-set-style", Drive.style);
      showSeed();
    });
  });

  // The page opens dark. The drive redraws when data-theme changes.
  document.querySelectorAll("[data-set-theme]").forEach(function (button) {
    button.addEventListener("click", function () {
      const choice = button.getAttribute("data-set-theme");
      root.setAttribute("data-theme", choice);
      press("data-set-theme", choice);
    });
  });
})();

// The Read me panel: open and close it, close it with Escape, and copy a
// code block to the clipboard. The drive listens for clicks and pointer moves
// on the window, so those stop at the panel and the car does not hop.
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
  ["click", "pointerdown", "pointermove", "pointerup"].forEach(function (type) {
    panel.addEventListener(type, function (e) { e.stopPropagation(); });
  });
})();
