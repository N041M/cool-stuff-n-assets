import { afterglow, clearScripted, degauss, MODULES, play, powerOff, powerOn, rasterDraw, Telemetry, UNIT, WAVE_FILTER } from './boot.js';
import { clock, pad, prefersReducedMotion, qs, stamp } from './dom.js';
import { easeInOutCubic, Sequence, tween } from './sequence.js';

/** The picture the screen shows once it is on. */
const TERMINAL = `
<div class="tui">
  <header class="tui__head">
    <span class="tui__title">${UNIT} <span class="tui__sep">//</span> TERMINAL</span>
    <span class="tui__meta"><span class="hide-sm">TTY1</span><span class="tui__clock">--:--:--</span></span>
  </header>
  <div class="tui__body">
    <p>SYSTEM READY · 1024 MB · ${pad(MODULES.length)} MODULES</p>
    <p class="tui__dim">LAST START <span class="tui__start">----</span></p>
    <p>&nbsp;</p>
    <p><span class="tui__prompt">&gt;</span> STATUS</p>
    <dl class="tui__specs">
      <div><dt>DSK0</dt><dd>41% USED</dd></div>
      <div><dt>NET0</dt><dd>LINK UP</dd></div>
      <div><dt>CLK0</dt><dd>SYNCED</dd></div>
      <div><dt>PWR0</dt><dd>MAINS</dd></div>
    </dl>
    <p><span class="tui__prompt">&gt;</span><i class="caret" aria-hidden="true"></i></p>
  </div>
  <footer class="tui__status">
    <span class="tui__prompt">READY</span>
    <span class="hide-sm">80×25</span>
    <span class="tui__fill"></span>
    <span>9600 BAUD</span>
  </footer>
</div>`;

/**
 * The CRT screen. In standby it waits, lit, in its slot on the page. Powering
 * on grows it until it fills the window, opens the tube, prints the start-up
 * log and redraws the glass as the terminal. Powering off folds the picture to
 * a point and shrinks the glass back into its slot.
 *
 * The states are standby, expand, power, telemetry, draw, on, shutdown and
 * collapse. The current one is on the glass as data-state, and the one before
 * it as data-prev.
 */
export class Screen {
  constructor(glass, { onChange } = {}) {
    this.glass = glass;
    this.onChange = onChange || (() => {});
    this.telemetry = new Telemetry();
    this.state = 'standby';
    /** The running power-on or power-off. Skipping it jumps to its end. */
    this.seq = undefined;
    /** The running degauss. */
    this.wave = undefined;
    /** Bumped by every power-on and power-off, so a run that has been replaced stops where it is. */
    this.gen = 0;

    glass.innerHTML = `
<div class="crt__tube">
  <div class="crt__screen">${TERMINAL}</div>
  <div class="crt__boot"></div>
  <button type="button" class="crt__standby" tabindex="-1" aria-label="Power on">
    <span class="sb__corner sb__corner--tl">CH-01 · ${UNIT}</span>
    <span class="sb__corner sb__corner--tr sb__clock"></span>
    <span class="sb__corner sb__corner--bl">${pad(MODULES.length)} MODULES ON DISK</span>
    <span class="sb__corner sb__corner--br">STANDBY</span>
    <span class="sb__main">
      <span class="sb__title">${UNIT} <span class="tui__sep">//</span> TERMINAL</span>
      <span class="sb__ready">READY FOR USE</span>
      <span class="sb__hint">PRESS TO START<i class="caret"></i></span>
    </span>
  </button>
</div>
<div class="crt__raster" aria-hidden="true"></div>
<div class="crt__beam" aria-hidden="true"></div>
<div class="crt__dot" aria-hidden="true"></div>
<div class="crt__sweep" aria-hidden="true"></div>
<button type="button" class="crt__skip">SKIP <kbd>ESC</kbd></button>
<div class="crt__fx" aria-hidden="true"><i class="crt__noise"></i><i class="crt__lines"></i><i class="crt__roll"></i><i class="crt__vignette"></i><i class="crt__glare"></i><i class="crt__scratches"></i></div>
<p class="crt__status" aria-live="polite"></p>
${WAVE_FILTER}`;
    glass.dataset.state = 'standby';

    this.tube = qs(glass, '.crt__tube');
    this.standby = qs(glass, '.crt__standby');
    this.status = qs(glass, '.crt__status');
    this.sbClock = qs(glass, '.sb__clock');
    this.tuiClock = qs(glass, '.tui__clock');
    this.tuiStart = qs(glass, '.tui__start');
    qs(glass, '.crt__boot').append(this.telemetry.el);

    this.standby.addEventListener('click', () => this.powerOn());
    qs(glass, '.crt__skip').addEventListener('click', () => this.skip());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.skip();
    });

    /** The corner radius of the glass in its slot, measured before it grows. */
    this.radius = this.measureRadius();
    this.tick();
    window.setInterval(() => this.tick(), 1000);
  }

  /**
   * Powers the screen on from standby. When the screen is already on or
   * starting, it powers off and on again, which replays the boot.
   */
  powerOn() {
    const s = this.state;
    if (s === 'standby' || s === 'collapse') void this.run();
    else if (s === 'shutdown') void this.run({ instant: true });
    else void this.restart();
  }

  /** Folds the picture to a point and puts the glass back in its slot. */
  powerOff() {
    const s = this.state;
    if (s === 'standby' || s === 'shutdown' || s === 'collapse') return;
    void this.shutdown();
  }

  /** Bends the picture in rolling waves for a moment. A degauss that is still running starts again. */
  degauss() {
    if (this.state === 'shutdown' || this.state === 'collapse' || prefersReducedMotion()) return;
    this.startWave();
  }

  /** Jumps to the end of the running power-on or power-off. */
  skip() {
    if (this.seq) this.seq.skip();
  }

  async run({ instant = false, skipped = false } = {}) {
    const gen = ++this.gen;
    const live = () => gen === this.gen;
    const from = this.state;
    if (this.seq) this.seq.skip();
    this.stopWave();
    this.telemetry.stop();
    const seq = (this.seq = new Sequence());
    if (skipped) seq.skip();
    const reduced = prefersReducedMotion();
    const grow = !instant && !reduced;
    this.tuiStart.textContent = stamp();
    this.announce('Starting up');

    // The standby picture drops out before the glass grows.
    if (grow && from === 'standby') {
      await play(this.standby, [{ opacity: 1 }, { opacity: 0.15 }, { opacity: 0.9 }, { opacity: 0 }], { duration: 180, easing: 'steps(4)', fill: 'forwards' }, seq);
      if (!live()) return;
    }

    if (this.state === 'standby') this.radius = this.measureRadius();
    const slot = this.slotRect();
    this.glass.classList.add('is-full');
    const clip = this.clipper(slot, gen);
    if (grow) clip(0);
    else this.glass.style.clipPath = '';
    this.setState('expand');
    clearScripted(this.glass);
    if (grow) await tween(720, clip, easeInOutCubic, seq);
    if (!live()) return;
    this.glass.style.clipPath = '';

    if (reduced) {
      this.finish(gen);
      return;
    }

    this.setState('power');
    await powerOn(this.glass, seq);
    if (!live()) return;

    if (!seq.skipped) {
      this.setState('telemetry');
      this.startWave(seq);
      await this.telemetry.run(seq);
      if (!live()) return;
    }

    if (!seq.skipped) {
      // One blank frame between the log and the terminal.
      const draw = rasterDraw(this.glass, seq, 90);
      this.setState('draw');
      this.tick();
      await draw;
      if (!live()) return;
    }
    this.finish(gen);
  }

  /** Jumps to the finished terminal at the end of the boot, on Skip, or at once under reduced motion. */
  finish(gen) {
    if (gen !== this.gen) return;
    const seq = this.seq;
    this.seq = undefined;
    if (seq) seq.skip();
    this.telemetry.stop();
    clearScripted(this.glass);
    this.glass.classList.add('is-full');
    this.glass.style.clipPath = '';
    this.setState('on');
    this.tick();
    this.announce('Screen on');
  }

  async shutdown() {
    const gen = ++this.gen;
    const reduced = prefersReducedMotion();
    if (this.seq) this.seq.skip();
    const seq = (this.seq = new Sequence());
    this.telemetry.stop();
    this.stopWave();
    this.glass.style.clipPath = '';
    this.setState('shutdown');
    clearScripted(this.glass);
    if (!reduced) await powerOff(this.glass, seq);
    if (gen !== this.gen) return;

    this.setState('collapse');
    if (!reduced) {
      // The glass shrinks back into its slot while the point fades.
      const glow = afterglow(this.glass, 520, seq);
      await seq.wait(140);
      if (gen !== this.gen) return;
      const clip = this.clipper(this.slotRect(), gen);
      await tween(560, (k) => clip(1 - k), easeInOutCubic, seq);
      await glow;
    }
    if (gen !== this.gen) return;

    this.seq = undefined;
    clearScripted(this.glass);
    this.glass.classList.remove('is-full');
    this.glass.style.clipPath = '';
    this.setState('standby');
    this.tick();
    this.announce('Screen off');
    // Back in standby, the waiting picture flickers on.
    if (!reduced) {
      void play(this.standby, [{ opacity: 0 }, { opacity: 0.7, offset: 0.25 }, { opacity: 0.1, offset: 0.45 }, { opacity: 1 }], { duration: 360, easing: 'steps(2)' });
    }
  }

  /** Powers off and straight back on without leaving the full window. */
  async restart() {
    const gen = ++this.gen;
    const reduced = prefersReducedMotion();
    if (this.seq) this.seq.skip();
    const seq = (this.seq = new Sequence());
    this.telemetry.stop();
    this.stopWave();
    this.glass.style.clipPath = '';
    this.setState('shutdown');
    clearScripted(this.glass);
    if (!reduced) {
      await powerOff(this.glass, seq);
      if (gen !== this.gen) return;
      // The glass stays dark while the point fades.
      this.setState('expand');
      await afterglow(this.glass, 700, seq);
      if (gen !== this.gen) return;
      clearScripted(this.glass);
      await seq.wait(300);
      if (gen !== this.gen) return;
    }
    void this.run({ instant: true, skipped: seq.skipped });
  }

  startWave(link) {
    this.stopWave();
    const wave = (this.wave = new Sequence());
    if (link) link.onSkip(() => wave.skip());
    void degauss(this.glass, this.tube, wave).then(() => {
      if (this.wave === wave) this.wave = undefined;
    });
  }

  stopWave() {
    const wave = this.wave;
    this.wave = undefined;
    if (wave) wave.skip();
  }

  setState(state) {
    this.glass.dataset.prev = this.state;
    this.state = state;
    this.glass.dataset.state = state;
    this.onChange(state);
  }

  /** Where the glass sits in standby. */
  slotRect() {
    return this.glass.parentElement.getBoundingClientRect();
  }

  measureRadius() {
    return parseFloat(getComputedStyle(this.glass).borderTopLeftRadius) || 24;
  }

  /**
   * Returns a setter that clips the full glass between the slot `from` (0) and
   * the whole glass (1). The glass must already have is-full. The setter does
   * nothing once a newer run has started.
   */
  clipper(from, gen) {
    const full = this.glass.getBoundingClientRect();
    const f = {
      t: from.top - full.top,
      r: full.right - from.right,
      b: full.bottom - from.bottom,
      l: from.left - full.left,
    };
    return (k) => {
      if (gen !== this.gen) return;
      if (k >= 1) {
        this.glass.style.clipPath = '';
        return;
      }
      const i = (v) => (v * (1 - k)).toFixed(2);
      this.glass.style.clipPath = `inset(${i(f.t)}px ${i(f.r)}px ${i(f.b)}px ${i(f.l)}px round ${i(this.radius)}px)`;
    };
  }

  tick() {
    const now = new Date();
    if (this.state === 'standby') this.sbClock.textContent = stamp(now);
    if (this.state === 'draw' || this.state === 'on') this.tuiClock.textContent = clock(now);
  }

  announce(text) {
    this.status.textContent = text;
  }
}
