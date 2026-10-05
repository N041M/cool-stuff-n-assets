// Runs the scramble on the bar when the page loads, on any label when it is
// clicked, on the dates the first time they scroll into view, on everything on
// screen after a language switch, and on the copy button's "Copied".
(function () {
  "use strict";

  const root = document.documentElement;
  const Scramble = window.Scramble;
  if (!Scramble) return;
  const reply = document.querySelector("[data-reply]");

  const REPLY = {
    en: "Each character resolves at its own time, in a sweep from left to right, until the whole line holds still.",
    cs: "Každý znak se rozluští ve svůj čas, postupně zleva doprava, až celý řádek stojí.",
  };

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

  // Run again repeats what the page load did for the bar, or what scrolling
  // into view did for the dates.
  document.querySelectorAll("[data-replay]").forEach(function (button) {
    button.addEventListener("click", function () {
      Scramble.all(button.getAttribute("data-replay"));
    });
  });

  Scramble.installClickHandler();
  Scramble.all(".top [data-scramble], .hero [data-scramble]");

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
