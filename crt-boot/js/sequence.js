/**
 * A cancellable timeline. Once skip() is called, every pending wait resolves
 * at once and later waits resolve immediately. An async sequence can then stop
 * early and let its caller jump to the final state.
 */
export class Sequence {
  constructor() {
    this.skipped = false;
    this.pending = new Set();
    this.skipHandlers = [];
  }

  wait(ms) {
    if (this.skipped || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const entry = { id: 0, resolve };
      entry.id = window.setTimeout(() => {
        this.pending.delete(entry);
        resolve();
      }, ms);
      this.pending.add(entry);
    });
  }

  onSkip(fn) {
    if (this.skipped) fn();
    else this.skipHandlers.push(fn);
  }

  skip() {
    if (this.skipped) return;
    this.skipped = true;
    for (const entry of this.pending) {
      clearTimeout(entry.id);
      entry.resolve();
    }
    this.pending.clear();
    const handlers = this.skipHandlers;
    this.skipHandlers = [];
    handlers.forEach((fn) => fn());
  }
}

/** Animates a number from 0 to 1 over `ms` and calls `fn` with the eased value each frame. */
export function tween(ms, fn, ease = easeInOutCubic, seq) {
  return new Promise((resolve) => {
    if (ms <= 0 || (seq && seq.skipped)) {
      fn(1);
      resolve();
      return;
    }
    const start = performance.now();
    const step = (now) => {
      if (seq && seq.skipped) {
        fn(1);
        resolve();
        return;
      }
      const t = Math.min(1, (now - start) / ms);
      fn(ease(t));
      if (t < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
