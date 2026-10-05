import { fromHTML, pad, qs, qsa, stamp } from './dom.js';

/** Runs a Web Animation and resolves when it ends, or at once when the sequence is skipped. */
export function play(el, frames, opts, seq) {
  if (seq && seq.skipped) return Promise.resolve();
  const anim = el.animate(frames, opts);
  return new Promise((resolve) => {
    anim.finished.then(
      () => resolve(),
      () => resolve(),
    );
    if (seq) {
      seq.onSkip(() => {
        anim.cancel();
        resolve();
      });
    }
  });
}

/** Cancels every scripted animation on the glass and leaves the CSS animations running. */
export function clearScripted(root) {
  const css = (a) =>
    (typeof CSSAnimation !== 'undefined' && a instanceof CSSAnimation) ||
    (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition);
  root
    .getAnimations({ subtree: true })
    .filter((a) => !css(a))
    .forEach((a) => a.cancel());
}

/**
 * Tube power-on. The dark glass lifts for a moment as the tube charges. A
 * point in the centre draws out into a line, and the line opens into an
 * overexposed raster that settles to black. The promise resolves once the
 * raster fills the glass, so the first log lines appear under the glare.
 */
export async function powerOn(glass, seq) {
  const beam = qs(glass, '.crt__beam');
  const raster = qs(glass, '.crt__raster');
  const noise = qs(glass, '.crt__noise');

  void play(raster, [{ opacity: 0, transform: 'none' }, { opacity: 0.05, transform: 'none', offset: 0.3 }, { opacity: 0, transform: 'none' }], { duration: 170 }, seq);
  await seq.wait(200);

  await play(
    beam,
    [
      { transform: 'scale(0, 1)', opacity: 0 },
      { transform: 'scale(0.012, 1)', opacity: 1, offset: 0.16 },
      { transform: 'scale(1, 1)', opacity: 1 },
    ],
    { duration: 230, easing: 'cubic-bezier(.45,.05,.2,1)', fill: 'forwards' },
    seq,
  );
  await seq.wait(70);

  void play(beam, [{ transform: 'scale(1, 1)', opacity: 1 }, { transform: 'scale(1, 8)', opacity: 0 }], { duration: 150, easing: 'ease-out', fill: 'forwards' }, seq);
  void play(noise, [{ opacity: 0.55 }, { opacity: 0.2, offset: 0.35 }, { opacity: 0.05 }], { duration: 1400, easing: 'ease-out' }, seq);
  void play(
    raster,
    [
      { transform: 'scaleY(0.006)', opacity: 1 },
      { transform: 'scaleY(1)', opacity: 0.92, offset: 0.26 },
      { transform: 'scaleY(1)', opacity: 0.32, offset: 0.55 },
      { transform: 'scaleY(1)', opacity: 0 },
    ],
    { duration: 900, easing: 'cubic-bezier(.2,.7,.2,1)' },
    seq,
  );
  await seq.wait(230);
}

/** The filter that degauss() drives. It goes in the glass markup once. */
export const WAVE_FILTER = `
<svg class="crt__defs" width="0" height="0" aria-hidden="true" focusable="false">
  <filter id="crt-wave" x="-5%" y="0" width="110%" height="100%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.0015 0.01" numOctaves="2" seed="7" result="noise"/>
    <feColorMatrix in="noise" type="matrix" values="1 0 0 0 0  0 0 0 0 0.5  0 0 0 0 0  0 0 0 0 1" result="bands"/>
    <feDisplacementMap in="SourceGraphic" in2="bands" scale="0" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>`;

/**
 * Degauss. For a moment the picture bends sideways in rolling horizontal
 * waves and blooms, then it settles flat. Each row shifts by its own amount,
 * so nothing moves as a block.
 */
export function degauss(glass, target, seq, ms = 950) {
  const map = glass.querySelector('#crt-wave feDisplacementMap');
  const noise = glass.querySelector('#crt-wave feTurbulence');
  if (!map || !noise || seq.skipped) return Promise.resolve();
  return new Promise((resolve) => {
    const start = performance.now();
    let raf = 0;
    let over = false;
    const done = () => {
      if (over) return;
      over = true;
      cancelAnimationFrame(raf);
      target.style.filter = '';
      map.setAttribute('scale', '0');
      resolve();
    };
    seq.onSkip(done);
    const step = (now) => {
      const t = (now - start) / ms;
      if (t >= 1 || seq.skipped) {
        done();
        return;
      }
      const k = Math.pow(1 - t, 2);
      // The bands drift and stretch as the field collapses.
      const fy = 0.009 + 0.005 * Math.sin(now / 95);
      noise.setAttribute('baseFrequency', `0.0012 ${fy.toFixed(4)}`);
      map.setAttribute('scale', (64 * k * (0.75 + 0.25 * Math.sin(now / 41))).toFixed(1));
      target.style.filter = `url(#crt-wave) brightness(${(1 + 1.4 * k).toFixed(2)})`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  });
}

/** The terminal is drawn onto the glass from the top down, behind a bright scan line. */
export async function rasterDraw(glass, seq, delay = 0) {
  const screen = qs(glass, '.crt__screen');
  const sweep = qs(glass, '.crt__sweep');
  const h = glass.clientHeight;
  const opts = { duration: 480, delay, easing: 'linear', fill: 'backwards' };
  void play(sweep, [{ transform: 'translateY(0)', opacity: 1 }, { transform: `translateY(${h}px)`, opacity: 1 }], opts, seq);
  await play(screen, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], opts, seq);
}

/**
 * Tube power-off. The picture flares once and folds into a bright line across
 * the middle, and the line pulls in to a point. The promise resolves when the
 * point has formed. afterglow() fades it.
 */
export async function powerOff(glass, seq) {
  const tube = qs(glass, '.crt__tube');
  const beam = qs(glass, '.crt__beam');
  const dot = qs(glass, '.crt__dot');
  const raster = qs(glass, '.crt__raster');

  void play(raster, [{ opacity: 0, transform: 'none' }, { opacity: 0.28, transform: 'none', offset: 0.3 }, { opacity: 0, transform: 'none' }], { duration: 180 }, seq);
  await play(
    tube,
    [
      { transform: 'scaleY(1)', filter: 'brightness(1)', opacity: 1 },
      { transform: 'scaleY(0.012)', filter: 'brightness(3.5)', opacity: 1 },
    ],
    { duration: 180, easing: 'cubic-bezier(.75,0,.9,.35)', fill: 'forwards' },
    seq,
  );
  void play(tube, [{ opacity: 1 }, { opacity: 0 }], { duration: 50, fill: 'forwards' }, seq);
  await play(
    beam,
    [
      { transform: 'scale(1, 1.4)', opacity: 1 },
      { transform: 'scale(0.01, 1)', opacity: 1 },
    ],
    { duration: 210, easing: 'cubic-bezier(.65,0,.85,.45)', fill: 'forwards' },
    seq,
  );
  void play(beam, [{ opacity: 1 }, { opacity: 0 }], { duration: 60, fill: 'forwards' }, seq);
  dot.getAnimations().forEach((a) => a.cancel());
  void play(dot, [{ opacity: 1, transform: 'scale(1)' }], { duration: 1, fill: 'forwards' }, seq);
}

/** The point left by powerOff() fades the way phosphor does, quickly at first and then slowly. */
export function afterglow(glass, ms, seq) {
  return play(
    qs(glass, '.crt__dot'),
    [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0.45, transform: 'scale(0.75)', offset: 0.25 },
      { opacity: 0, transform: 'scale(0.4)' },
    ],
    { duration: ms, easing: 'ease-out', fill: 'forwards' },
    seq,
  );
}

/** The name the screen shows for itself. */
export const UNIT = 'UNIT 01';

/** The modules the log loads. Their load times are made up on each run. */
export const MODULES = [
  { id: 'DSK0', name: 'DISK DRIVER', kb: 48 },
  { id: 'KBD0', name: 'KEYBOARD', kb: 12 },
  { id: 'VID0', name: 'DISPLAY', kb: 96 },
  { id: 'NET0', name: 'NETWORK', kb: 64 },
  { id: 'SND0', name: 'SOUND', kb: 36 },
  { id: 'CLK0', name: 'REAL-TIME CLOCK', kb: 8 },
  { id: 'SER0', name: 'SERIAL PORTS', kb: 16 },
  { id: 'PWR0', name: 'POWER MANAGER', kb: 24 },
];

/** The width the dotted leaders pad each command to, in characters. */
const LEADER = 34;
/** Lines printed per frame when nothing holds the log. */
const BURST = 4;
const MAX_ROWS = 90;
const SPIN = '|/-\\';

const dots = (cmd) => '.'.repeat(Math.max(3, LEADER - cmd.length));
const lead = (cmd, res) => `${cmd} ${dots(cmd)} ${res}`;
const rnd = (n) => Math.floor(Math.random() * n);
const hex = (n, len) => n.toString(16).toUpperCase().padStart(len, '0');
const bytes = (count) => Array.from({ length: count }, () => hex(rnd(256), 2)).join(' ');
const bits = (count) => Array.from({ length: count }, () => Array.from({ length: 8 }, () => rnd(2)).join('')).join(' ');
const loaded = (i) => `${MODULES[i].kb} KB · OK`;

/**
 * The lines of the log. A step can set `cls` (hi, dim or inv), `hold` (a pause
 * after the line in ms), `stage` (the footer label from this line on) and
 * `module` (print the line with a spinner until that module has loaded).
 * Lines without a hold print several per frame.
 */
function script() {
  const s = [];
  const say = (text, cls, hold = 0, stage) => s.push({ text, cls, hold, stage });
  const line = (cmd, res, hold = 24, stage) => s.push({ text: lead(cmd, res), hold, stage });
  const n = MODULES.length;

  say(`SYSTEM BIOS 4.06 · ${UNIT}`, 'hi', 70, 'POWER-ON SELF TEST');
  say('TERMINAL CONTROLLER REV C · 80×25', 'dim', 50);
  say('');
  line('PROCESSOR', '2 CORES ONLINE');
  line('MATH UNIT', 'PRESENT');
  line('CACHE', '256 KB OK');
  for (let b = 0; b < 16; b++) {
    const from = b * 0x4000000;
    say(`  ${hex(from, 8)}-${hex(from + 0x3ffffff, 8)}  ${bytes(8)}  PASS`, 'dim', 0, b === 0 ? 'MEMORY' : undefined);
  }
  line('MEMORY', '1024 MB VERIFIED', 90);
  line('DISK CONTROLLER', '2 DRIVES');
  line('KEYBOARD', 'DETECTED');
  line('SERIAL PORTS', 'COM1 COM2');
  say('');
  line('NETWORK', 'CARRIER FOUND', 130, 'NETWORK');
  for (let i = 0; i < 12; i++) say(`  RX ${hex(rnd(0x10000), 4)}  ${bytes(12)}`, 'dim');
  line(`HANDSHAKE ${UNIT} <> HOST`, 'ACK', 70);
  say('');
  line('DIAGNOSTICS', 'STARTED', 150, 'DIAGNOSTICS');
  line('  PASS 1 MEMORY', 'OK', 70);
  line('  PASS 2 DISK', 'OK', 70);
  line('  PASS 3 VIDEO', 'OK', 70);
  for (let i = 0; i < 8; i++) say(`  ${bits(6)}`, 'dim');
  line('CHECKSUM', 'MATCH', 200);
  say('');
  line('MOUNT /SYS/MODULES', 'OK', 30, 'MODULES');
  line('INDEX', `${pad(n)} MODULES`, 30);
  MODULES.forEach((m, i) => s.push({ text: `LOAD ${m.id} ${m.name}`, module: i }));
  line('VERIFY SIGNATURES', `${pad(n)}/${pad(n)}`, 50, 'SIGNATURES');
  line('CONVERGENCE', '±0.2 MM');
  line('CLOCK', stamp(), 60);
  say('');
  say('SYSTEM READY', 'inv', 460, 'READY');
  return s;
}

/**
 * The start-up readout. A log scrolls faster than anyone can read, with
 * memory, carrier, module and stack panels beside it. The modules load on a
 * made-up schedule, and the log waits on any module that has not loaded yet.
 */
export class Telemetry {
  constructor() {
    this.el = fromHTML(this.template());
    this.log = qs(this.el, '.boot__log');
    this.scope = qs(this.el, '.boot__scope');
    this.dump = qs(this.el, '.boot__dump');
    this.rows = qsa(this.el, '.boot__index li').map((li) => ({
      li,
      cells: qs(li, '.boot__cells i'),
      state: qs(li, '.boot__state'),
    }));
    this.out = {
      stage: qs(this.el, '.boot__stage'),
      clock: qs(this.el, '.boot__clock'),
      mem: qs(this.el, '.boot__mem'),
      meter: qs(this.el, '.boot__meter i'),
      count: qs(this.el, '.boot__count'),
      addr: qs(this.el, '.boot__addr'),
      freq: qs(this.el, '.boot__freq'),
      pct: qs(this.el, '.boot__pct'),
      bar: qs(this.el, '.boot__bar i'),
    };
    this.plan = [];
    this.raf = 0;
    this.frameNo = 0;
    this.lastClock = 0;
  }

  run(seq) {
    this.reset();
    const t0 = performance.now();
    // Each module starts a little after the one before and takes 0.5 to 2.2 s.
    this.plan = MODULES.map((m, i) => {
      const start = 300 + i * 70;
      return { start, end: start + 500 + rnd(1700) };
    });
    const steps = script();

    return new Promise((resolve) => {
      let i = 0;
      let holdUntil = 0;
      let pending = null;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.stop();
        resolve();
      };
      seq.onSkip(finish);

      const frame = (now) => {
        if (done) return;
        this.raf = requestAnimationFrame(frame);
        const t = now - t0;
        this.ambient(now, t, i / steps.length);

        if (pending) {
          if (t < this.plan[pending.module].end) {
            pending.row.textContent = `${pending.text} ${dots(pending.text)} ${SPIN[Math.floor(t / 70) % 4]}`;
            return;
          }
          pending.row.textContent = lead(pending.text, loaded(pending.module));
          pending = null;
          holdUntil = now + 28;
        }
        if (now < holdUntil) return;
        if (i >= steps.length) {
          finish();
          return;
        }
        for (let n = 0; n < BURST && i < steps.length; n++) {
          const step = steps[i++];
          if (step.stage) this.out.stage.textContent = step.stage;
          const row = this.print(step);
          if (step.module !== undefined) {
            pending = { row, text: step.text, module: step.module };
            break;
          }
          if (step.hold) {
            holdUntil = now + step.hold;
            break;
          }
        }
      };
      this.raf = requestAnimationFrame(frame);
    });
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  reset() {
    this.stop();
    this.log.replaceChildren();
    this.frameNo = 0;
    this.lastClock = 0;
    this.rows.forEach((row) => {
      row.cells.style.transform = 'scaleX(0)';
      row.state.textContent = 'QUEUED';
      row.li.classList.remove('is-done');
    });
    this.out.stage.textContent = '';
    this.out.count.textContent = `00/${pad(MODULES.length)}`;
    this.out.pct.textContent = '000%';
    this.out.bar.style.transform = 'scaleX(0)';
    this.out.meter.style.transform = 'scaleX(0)';
    this.out.freq.textContent = '--- MHZ';
    const css = getComputedStyle(this.scope);
    this.colors = {
      p: css.getPropertyValue('--p-rgb').trim(),
      bg: css.getPropertyValue('--p-bg-rgb').trim(),
      hi: css.getPropertyValue('--p-hi').trim(),
    };
    const ctx = this.scope.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, this.scope.width, this.scope.height);
  }

  print(step) {
    const row = document.createElement('p');
    row.className = step.cls ? `boot__row is-${step.cls}` : 'boot__row';
    row.textContent = step.text || ' ';
    this.log.append(row);
    while (this.log.childElementCount > MAX_ROWS) this.log.firstElementChild.remove();
    return row;
  }

  /** Updates the clock, the memory sweep, the module list, the carrier trace, the stack dump and the progress bar. */
  ambient(now, t, progress) {
    const o = this.out;
    this.frameNo++;
    if (now - this.lastClock > 500) {
      this.lastClock = now;
      o.clock.textContent = stamp();
    }

    const mem = Math.min(1, t / 1100);
    o.mem.textContent = `0x${hex(Math.floor(mem * 0x3fffffff), 8)}`;
    o.meter.style.transform = `scaleX(${mem})`;

    let count = 0;
    this.rows.forEach((row, i) => {
      const p = this.plan[i];
      if (t >= p.end) {
        count++;
        if (!row.li.classList.contains('is-done')) {
          row.li.classList.add('is-done');
          row.cells.style.transform = 'scaleX(1)';
          row.state.textContent = `${MODULES[i].kb} KB`;
        }
        return;
      }
      const k = Math.max(0, Math.min(0.99, (t - p.start) / (p.end - p.start)));
      row.cells.style.transform = `scaleX(${k})`;
      if (k > 0) row.state.textContent = `LOAD ${pad(Math.round(k * 100), 2)}%`;
    });
    o.count.textContent = `${pad(count)}/${pad(MODULES.length)}`;

    this.drawScope(t, progress);

    if (this.frameNo % 3 === 0) {
      const base = rnd(0x10000) & 0xfff0;
      o.addr.textContent = `0x${hex(base, 4)}`;
      this.dump.textContent = Array.from({ length: 6 }, (_, r) => `${hex(base + r * 16, 4)}  ${bytes(8)}`).join('\n');
    }

    const pct = Math.round(progress * 100);
    o.pct.textContent = `${pad(pct, 3)}%`;
    o.bar.style.transform = `scaleX(${progress})`;
  }

  /** Draws a carrier trace with phosphor persistence. The trace is noisy at first and steadies as the link settles. */
  drawScope(t, progress) {
    const c = this.scope;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(c.clientWidth * dpr);
    const h = Math.round(c.clientHeight * dpr);
    if (!w || !h) return;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const { p, bg, hi } = this.colors;
    ctx.fillStyle = `rgb(${bg} / 0.34)`;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = `rgb(${p} / 0.18)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    const env = Math.min(1, t / 500);
    const jitter = 0.5 * (1 - progress) + 0.06;
    const ph = t / 110;
    ctx.strokeStyle = hi;
    ctx.lineWidth = 1.3 * dpr;
    ctx.shadowColor = `rgb(${p} / 0.9)`;
    ctx.shadowBlur = 6 * dpr;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 2 * dpr) {
      const u = x / w;
      const v = Math.sin(u * 15 + ph) * 0.5 + Math.sin(u * 47 - ph * 1.8) * 0.16 * (1 - progress) + (Math.random() - 0.5) * jitter;
      const y = h / 2 + v * h * 0.36 * env;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
    this.out.freq.textContent = progress > 0.45 ? 'LOCKED 127.4 MHZ' : `${(126 + Math.random() * 3).toFixed(1)} MHZ`;
  }

  template() {
    const index = MODULES.map(
      (m) => `<li><span>${m.id}</span><span class="boot__cells"><i></i></span><span class="boot__state">QUEUED</span></li>`,
    ).join('');
    return `
<div class="boot" aria-hidden="true">
  <header class="boot__head"><span>${UNIT} // SYSTEM START</span><span class="boot__clock"></span></header>
  <div class="boot__main">
    <div class="boot__log"></div>
    <aside class="boot__side">
      <section class="boot__block">
        <h4><span>MEMORY</span><span class="boot__mem">0x00000000</span></h4>
        <div class="boot__meter"><i></i></div>
      </section>
      <section class="boot__block">
        <h4><span>CARRIER</span><span class="boot__freq">--- MHZ</span></h4>
        <canvas class="boot__scope"></canvas>
      </section>
      <section class="boot__block">
        <h4><span>MODULES</span><span class="boot__count">00/${pad(MODULES.length)}</span></h4>
        <ol class="boot__index">${index}</ol>
      </section>
      <section class="boot__block boot__block--dump">
        <h4><span>STACK</span><span class="boot__addr">0x0000</span></h4>
        <pre class="boot__dump"></pre>
      </section>
    </aside>
  </div>
  <footer class="boot__foot"><span class="boot__stage"></span><span class="boot__bar"><i></i></span><span class="boot__pct">000%</span></footer>
</div>`;
  }
}
