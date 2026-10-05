// Character scramble.
//
// Text resolves out of random glyphs. Each character gets a resolve time spread
// across 620–800 ms (a left-to-right sweep plus 25% jitter, sometimes reversed),
// and every unresolved character is re-randomised on a 38 ms tick from one of
// three pools. Whitespace never scrambles, so word shapes hold still.
//
// The engine only touches elements that hold exactly one text node, always
// restores the exact original string when a run ends, ignores a second trigger
// while a run is in flight, and does nothing under prefers-reduced-motion.
(function () {
  "use strict";

  // One pool is picked per element per run. Mixing pools inside one word reads
  // as noise rather than as text resolving.
  const POOLS = [
    "ABCDEFGHIKLMNOPRSTUVXYZ0234689",
    "abcdefghikmnoprstuvxyz<>/",
    "#%&*+=-·:;<>/",
  ];

  const TICK_MS = 38;
  const SPREAD_BASE_MS = 620;
  const SPREAD_RANGE_MS = 180;
  const SWEEP_SHARE = 0.75;
  const JITTER_SHARE = 0.25;
  const REVERSE_CHANCE = 0.15;
  const CLICK_DELAY_MS = 40;

  // Streaming variant: a 14-character scrambled window trails the resolved text.
  const STREAM_WINDOW_CHARS = 14;
  const STREAM_ADVANCE_CHARS = 5;
  const REVEAL_TARGET_MS = 1100;

  const reduced = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

  function isMotionEnabled() {
    return !reduced.matches;
  }

  const running = new WeakSet();

  function randomFrom(pool) {
    return pool[(Math.random() * pool.length) | 0];
  }

  function scrambleElement(el, delayMs) {
    if (!el || !isMotionEnabled()) return function () {};
    if (running.has(el)) return function () {};
    running.add(el);

    let interval = null;
    let cancelled = false;

    const stop = function () {
      cancelled = true;
      if (interval !== null) clearInterval(interval);
      interval = null;
      running.delete(el);
    };

    const timeout = setTimeout(function () {
      if (cancelled) return;
      const node = el.firstChild;
      if (!node || node.nodeType !== 3 || el.childNodes.length !== 1) {
        running.delete(el);
        return;
      }
      const orig = node.nodeValue || "";
      if (!orig.trim()) {
        running.delete(el);
        return;
      }

      const pool = POOLS[(Math.random() * POOLS.length) | 0];
      const n = orig.length;
      const total = SPREAD_BASE_MS + Math.random() * SPREAD_RANGE_MS;

      const order = Array.from({ length: n }, function (_, i) { return i; });
      if (Math.random() < REVERSE_CHANCE) order.reverse();
      const resolveAt = new Array(n);
      order.forEach(function (charIndex, k) {
        resolveAt[charIndex] =
          (k / Math.max(1, n - 1)) * total * SWEEP_SHARE + Math.random() * total * JITTER_SHARE;
      });

      const start = performance.now();
      // If something else rewrites the node mid-run, stop instead of finishing
      // over the new text.
      let written = orig;
      interval = setInterval(function () {
        if (node.nodeValue !== written) {
          stop();
          return;
        }
        const elapsed = performance.now() - start;
        let out = "";
        let done = true;
        for (let i = 0; i < n; i++) {
          const c = orig[i];
          if (/\s/.test(c)) {
            out += c;
            continue;
          }
          if (elapsed >= resolveAt[i]) out += c;
          else {
            done = false;
            out += randomFrom(pool);
          }
        }
        node.nodeValue = out;
        written = out;
        if (done) {
          node.nodeValue = orig;
          stop();
        }
      }, TICK_MS);
    }, delayMs || 0);

    return function () {
      clearTimeout(timeout);
      stop();
    };
  }

  // Elements under `root` (root included) that hold exactly one non-empty text
  // node. These are the only elements the engine will animate.
  function leaves(root) {
    const out = [];
    const visit = function (el) {
      if (el.children.length === 0) {
        if (el.childNodes.length === 1 && el.firstChild.nodeType === 3 && el.textContent.trim()) {
          out.push(el);
        }
        return;
      }
      for (const child of el.children) visit(child);
    };
    visit(root);
    return out;
  }

  function isShown(el) {
    return el.getClientRects().length > 0;
  }

  function inViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0;
  }

  // Staggered pass over every shown leaf inside `selector`. Each container's own
  // data-scramble value is its base delay, plus a 40 ms step that cycles every
  // five leaves so a screen does not resolve in lockstep.
  function scrambleAll(selector, opts) {
    if (!isMotionEnabled()) return;
    const onlyVisible = opts && opts.onlyInViewport;
    let idx = 0;
    document.querySelectorAll(selector).forEach(function (container) {
      const base = Number(container.getAttribute("data-scramble")) || 0;
      leaves(container).forEach(function (el) {
        if (!isShown(el)) return;
        if (onlyVisible && !inViewport(el)) return;
        scrambleElement(el, base + (idx % 5) * 40);
        idx++;
      });
    });
  }

  function installClickHandler() {
    document.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("[data-scramble]")) return;
      if (target.children.length !== 0) return;
      scrambleElement(target, CLICK_DELAY_MS);
    });
  }

  function revealAdvanceFor(length) {
    const ticks = Math.max(1, Math.round(REVEAL_TARGET_MS / TICK_MS));
    return Math.max(STREAM_ADVANCE_CHARS, Math.ceil(length / ticks));
  }

  // Reveal a known string through a trailing scrambled window. `onFrame` gets
  // the text to display, and the last frame is always the exact string.
  function streamReveal(text, onFrame, onDone) {
    if (!isMotionEnabled()) {
      onFrame(text);
      if (onDone) onDone();
      return function () {};
    }
    const pool = POOLS[(Math.random() * POOLS.length) | 0];
    const n = text.length;
    const advance = revealAdvanceFor(n);
    let front = 0;
    let interval = null;
    const tick = function () {
      front = Math.min(front + advance, n + STREAM_WINDOW_CHARS);
      const resolved = Math.max(0, Math.min(n, front - STREAM_WINDOW_CHARS));
      let out = text.slice(0, resolved);
      for (let i = resolved; i < Math.min(n, front); i++) {
        const c = text[i];
        out += /\s/.test(c) ? c : randomFrom(pool);
      }
      onFrame(out);
      if (resolved >= n) {
        clearInterval(interval);
        interval = null;
        if (onDone) onDone();
      }
    };
    tick();
    if (front - STREAM_WINDOW_CHARS < n) interval = setInterval(tick, TICK_MS);
    return function () {
      if (interval !== null) clearInterval(interval);
      interval = null;
    };
  }

  window.Scramble = {
    element: scrambleElement,
    all: scrambleAll,
    leaves: leaves,
    installClickHandler: installClickHandler,
    streamReveal: streamReveal,
    isMotionEnabled: isMotionEnabled,
    randomGlyph: function () { return randomFrom(POOLS[2]); },
  };
})();
