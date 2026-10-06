// Runs the scramble on the bar and the text under it when the page loads, on
// any label when it is clicked, on the dates the first time they scroll into
// view, on everything on screen after a language switch, and on the copy
// button's "Copied". With ?feature=<id> in the address the page shows only
// that feature.
(function () {
  "use strict";

  const root = document.documentElement;
  const Scramble = window.Scramble;
  if (!Scramble) return;
  const reply = document.querySelector("[data-reply]");

  const REPLY = {
    en: "Thanks for writing. I am away until Monday and will answer your message then.",
    cs: "Díky za zprávu. Do pondělí jsem pryč a odpovím vám potom.",
  };

  // Single-feature views. Each id names the sections and rows marked with it
  // in data-feature, and every other one is hidden along with the section
  // links and the language switch. The bar links back to the full page.
  const FEATURES = {
    load: "On load",
    click: "On click",
    scroll: "On first sight",
    reveal: "Streamed reveal",
    copy: "Copy button",
  };
  const asked = new URLSearchParams(location.search).get("feature");
  const view = Object.prototype.hasOwnProperty.call(FEATURES, asked) ? asked : null;
  if (view) {
    root.setAttribute("data-view", view);
    document.querySelectorAll("[data-feature]").forEach(function (el) {
      el.hidden = el.getAttribute("data-feature").split(" ").indexOf(view) < 0;
    });
    const brand = document.querySelector(".brand");
    const link = document.createElement("a");
    link.href = "demo.html";
    link.textContent = brand.textContent;
    const name = document.createElement("span");
    name.textContent = FEATURES[view];
    brand.replaceChildren(link, " / ", name);
  }

  // Language. Both languages are in the markup and only the active one is
  // shown, so a switch scrambles whatever is on screen.
  document.querySelectorAll("[data-set-lang]").forEach(function (button) {
    button.addEventListener("click", function () {
      const lang = button.getAttribute("data-set-lang");
      if (lang === root.lang) return;
      root.lang = lang;
      document.querySelectorAll("[data-set-lang]").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.getAttribute("data-set-lang") === lang));
      });
      Scramble.all("[data-scramble]", { onlyInViewport: true });
      if (reply.textContent) reveal();
    });
  });

  // Section links scramble their own text as they scroll the page.
  document.querySelectorAll(".nav a[href^='#']").forEach(function (link) {
    link.addEventListener("click", function () {
      Scramble.leaves(link).forEach(function (el) { if (el.getClientRects().length) Scramble.element(el); });
    });
  });

  // The copy button scrambles "Copied" once the address is on the clipboard.
  document.querySelectorAll("[data-copy]").forEach(function (button) {
    let timer = 0;
    button.addEventListener("click", function () {
      const done = function () {
        button.classList.add("done");
        Scramble.leaves(button.querySelector(".copy-done")).forEach(function (el) { Scramble.element(el); });
        clearTimeout(timer);
        timer = setTimeout(function () { button.classList.remove("done"); }, 2200);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(button.getAttribute("data-copy")).then(done, function () {});
    });
  });

  // The reply streams in behind a window of scrambled characters.
  let cancel = function () {};
  function reveal() {
    cancel();
    cancel = Scramble.streamReveal(REPLY[root.lang === "cs" ? "cs" : "en"], function (text) { reply.textContent = text; });
  }
  document.querySelectorAll("[data-stream]").forEach(function (button) {
    button.addEventListener("click", reveal);
  });

  // Run again repeats what the page load did for the bar and the text under
  // it, or what scrolling into view did for the dates.
  document.querySelectorAll("[data-replay]").forEach(function (button) {
    button.addEventListener("click", function () {
      Scramble.all(button.getAttribute("data-replay"));
    });
  });

  Scramble.installClickHandler();
  if (!view || view === "load") Scramble.all(".top [data-scramble], .hero [data-scramble]");

  // Labels further down resolve the first time they scroll into view.
  const seen = new WeakSet();
  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting || seen.has(e.target)) return;
      seen.add(e.target);
      io.unobserve(e.target);
      Scramble.leaves(e.target).forEach(function (el, i) {
        if (el.getClientRects().length) Scramble.element(el, (i % 5) * 40);
      });
    });
  }, { threshold: 0.6 });
  document.querySelectorAll("main section:not(.hero) [data-scramble]").forEach(function (el) { io.observe(el); });
})();

// The Read me panel: open and close it, close it with Escape, and copy a
// code block to the clipboard. It holds no [data-scramble], so clicks in it
// never scramble anything.
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
