import { Renderer } from './renderer.js';
/** Pixels the bake and the frame pass work at, before the canvas scales them up. */
const BUDGET = { desktop: 0.8e6, touch: 0.4e6, floor: 0.2e6 };
/** The moment shown as a still frame when the reader prefers reduced motion. */
const STILL_TIME = 12;
/** Pixels in the first bake strip. Later strips double while each one finishes within a frame. */
const FIRST_STRIP = 32768;
/** A first bake slower than this skips the refining passes. */
const SLOW_BAKE_MS = 1500;
/** Shortest gap between drawn frames, in ms: about 30 fps, then about 20 once the GPU falls behind. */
const GAP = { full: 30, slow: 46 };
/** Frames judged before deciding whether the GPU keeps up, and how many of them may be late. */
const JUDGE = { frames: 40, late: 8 };
/**
 * The corridor scene, filling the element it is given. It draws only while
 * the element is on screen and the tab is visible. With reduced motion it
 * draws a single still frame.
 *
 * Nothing is sent to the GPU while it is still busy with the last strip or
 * frame. When frames keep arriving late it lowers the frame rate, then the
 * resolution, and on the slowest GPUs it settles on a still frame. It never
 * raises them again.
 */
export class Backdrop {
    host;
    files;
    canvas = document.createElement('canvas');
    renderer;
    raf = 0;
    onScreen = true;
    still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    budget = matchMedia('(pointer: coarse)').matches ? BUDGET.touch : BUDGET.desktop;
    strip = FIRST_STRIP;
    t0 = performance.now();
    bakeStart = 0;
    resizeTimer = 0;
    gap = GAP.full;
    lastDraw = 0;
    /** Set when a frame came due while the GPU was still busy. */
    waited = false;
    judged = { frames: 0, late: 0 };
    constructor(host, files) {
        this.host = host;
        this.files = files;
        this.canvas.className = 'backdrop__canvas';
        host.append(this.canvas);
        new ResizeObserver(() => {
            window.clearTimeout(this.resizeTimer);
            this.resizeTimer = window.setTimeout(() => this.resize(), this.renderer?.hasImage ? 250 : 0);
        }).observe(host);
        new IntersectionObserver(([entry]) => {
            this.onScreen = entry.isIntersecting;
            this.wake();
        }).observe(host);
        this.canvas.addEventListener('webglcontextlost', (e) => {
            e.preventDefault();
            this.host.classList.remove('is-ready');
            this.renderer = undefined;
        });
        this.canvas.addEventListener('webglcontextrestored', () => this.start());
    }
    start() {
        try {
            this.renderer = new Renderer(this.canvas, readColours(), this.files);
        }
        catch (err) {
            console.warn('[backdrop]', err);
            return;
        }
        this.resize();
        this.wake();
    }
    resize() {
        const r = this.renderer;
        const { width, height } = this.host.getBoundingClientRect();
        if (!r || width < 1 || height < 1)
            return;
        const dpr = window.devicePixelRatio || 1;
        const scale = Math.min(dpr, Math.sqrt(this.budget / (width * height)));
        const out = Math.min(dpr, 2, scale * 1.5);
        const size = {
            w: Math.round(width * scale),
            h: Math.round(height * scale),
            outW: Math.round(width * out),
            outH: Math.round(height * out),
        };
        try {
            r.resize(size);
        }
        catch (err) {
            this.fail(err);
        }
        if (r.baking)
            this.bakeStart = 0;
        this.wake();
    }
    wake() {
        if (!this.raf && this.renderer && this.onScreen)
            this.raf = requestAnimationFrame(this.tick);
    }
    tick = (now) => {
        this.raf = 0;
        const r = this.renderer;
        if (!r || !this.onScreen)
            return;
        try {
            r.prepare();
            if (!r.canBake)
                return this.wake();
            const due = r.hasImage && now - this.lastDraw >= this.gap;
            if (!r.idle()) {
                if (due)
                    this.waited = true;
                return this.wake();
            }
            if (due) {
                this.draw(r, now);
                if (this.still && !r.baking)
                    return;
            }
            else if (r.baking) {
                this.bakeStrip(r, now);
            }
            this.wake();
        }
        catch (err) {
            this.fail(err);
        }
    };
    draw(r, now) {
        if (!r.baking && !this.still && this.lastDraw && now - this.lastDraw < 250)
            this.judge(this.waited);
        this.waited = false;
        this.lastDraw = now;
        r.render(this.still ? STILL_TIME : (now - this.t0) / 1000);
        this.host.classList.add('is-ready');
    }
    /** Bake the next strip, sized from how long the last one took to finish. */
    bakeStrip(r, now) {
        const last = r.lastWork;
        if (last.kind === 'strip') {
            if (last.ms < 22)
                this.strip = Math.min(this.strip * 2, r.pixels);
            else if (last.ms > 40)
                this.strip = Math.max(this.strip * 0.5, 2048);
        }
        this.bakeStart ||= now;
        const first = !r.baked;
        r.bakeStrip(this.strip);
        if (first && r.baked && now - this.bakeStart > SLOW_BAKE_MS)
            r.settle();
    }
    /** Count late frames, and draw less once too many are late. */
    judge(late) {
        this.judged.frames++;
        if (late)
            this.judged.late++;
        if (this.judged.frames < JUDGE.frames)
            return;
        const tooSlow = this.judged.late > JUDGE.late;
        this.judged = { frames: 0, late: 0 };
        if (!tooSlow)
            return;
        if (this.gap === GAP.full) {
            this.gap = GAP.slow;
        }
        else if (this.budget > BUDGET.floor) {
            this.budget = Math.max(BUDGET.floor, this.budget * 0.6);
            this.resize();
        }
        else {
            this.still = true;
        }
    }
    fail(err) {
        console.warn('[backdrop]', err);
        this.host.classList.remove('is-ready');
        this.renderer?.dispose();
        this.renderer = undefined;
    }
}
/** The accent and the page background from the active palette. */
function readColours() {
    const style = getComputedStyle(document.documentElement);
    return { accent: toLinear(rgb(style.getPropertyValue('--accent'))), bg: rgb(style.getPropertyValue('--bg')) };
}
function rgb(hex) {
    const m = hex.trim().match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!m)
        return [0, 0, 0];
    return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}
function toLinear(c) {
    return c.map((v) => Math.pow(v, 2.2));
}
