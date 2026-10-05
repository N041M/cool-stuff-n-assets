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

  // The drive starts once its font has loaded.
  (function waitForStart() {
    if (!Drive.seed) return requestAnimationFrame(waitForStart);
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

  document.querySelector("[data-hop]").addEventListener("click", function () {
    Drive.hop();
  });

  // Hiding the setup leaves the speed, Hop and this button. The road moves up
  // into the space the setup took.
  const setup = document.getElementById("setup");
  const toggle = document.querySelector("[data-toggle-setup]");
  toggle.addEventListener("click", function () {
    setup.hidden = !setup.hidden;
    toggle.setAttribute("aria-expanded", String(!setup.hidden));
    toggle.textContent = setup.hidden ? "Show setup" : "Hide setup";
    Drive.refresh();
  });

  document.querySelectorAll("[data-set-style]").forEach(function (button) {
    button.addEventListener("click", function () {
      Drive.setStyle(button.getAttribute("data-set-style"));
      press("data-set-style", Drive.style);
      showSeed();
    });
  });

  document.querySelectorAll("[data-set-theme]").forEach(function (button) {
    button.addEventListener("click", function () {
      const choice = button.getAttribute("data-set-theme");
      if (choice === "system") root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", choice);
      press("data-set-theme", choice);
    });
  });
})();
