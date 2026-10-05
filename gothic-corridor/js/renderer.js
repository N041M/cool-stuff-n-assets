import { bindTextures, createTarget, deleteTarget, Program } from './gl.js';
import { ember, flicker, frameView, sceneGLSL } from './scene.js';
import { bakeVolume, createNoise, createSprites, createTexture3D, HEADER, SPRITE_ATTRIBUTES, VOLUME } from './shared.js';
/** Samples per pixel the bake averages. The first pass is shown, the rest refine it. */
const BAKE_PASSES = 4;
const BLOOM_LEVELS = 6;
/** The bake goes first so it can start while the rest compile. */
const ORDER = ['bake', 'volume', 'air', 'frame', 'sprite', 'bloom', 'final'];
/**
 * Draws the corridor into a canvas. The static scene is baked once, in
 * strips, then each frame relights it and adds what moves.
 *
 * Every strip and frame ends with a fence. The caller checks `idle()` before
 * sending more, so work never piles up on a GPU that is falling behind.
 *
 * The bake shader compiles first and the bake starts as soon as it is ready.
 * Without parallel compiling, the shaders compile one per call to
 * `prepare()`, so no single frame stalls for long.
 */
export class Renderer {
    canvas;
    gl;
    parallel;
    sources;
    programs = {};
    /** Programs created so far, and how many of them, in order, have linked. */
    started = 0;
    linked = 0;
    vao;
    spriteVao;
    spriteCount;
    noise;
    light;
    size = { w: 0, h: 0, outW: 0, outH: 0 };
    bake;
    air;
    hdr;
    bloom = [];
    bakeRow = 0;
    bakePass = 0;
    frame = 0;
    fence = null;
    sent = { kind: 'frame', at: 0 };
    /** The last strip or frame the GPU finished. */
    lastWork = { kind: 'frame', ms: 0 };
    accent;
    bg;
    constructor(canvas, colours, files) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', {
            alpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: false,
            powerPreference: 'default',
        });
        if (!gl)
            throw new Error('WebGL2 is not available');
        if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
            throw new Error('half-float render targets are not available');
        }
        this.gl = gl;
        this.parallel = !!gl.getExtension('KHR_parallel_shader_compile');
        this.accent = colours.accent;
        this.bg = colours.bg;
        const f = (name) => files[name];
        const scene = sceneGLSL();
        const withScene = (...parts) => [HEADER, scene, f('common.glsl'), ...parts].join('\n');
        const vert = HEADER + f('quad.vert');
        this.sources = {
            bake: [vert, withScene(f('hall.glsl'), f('servitor.glsl'), f('bake.frag'))],
            volume: [vert, withScene(f('volume.frag'))],
            air: [vert, withScene(f('motion.glsl'), f('smoke.glsl'), f('air.frag'))],
            frame: [vert, withScene(f('motion.glsl'), f('censer.glsl'), f('frame.frag'))],
            sprite: [withScene(f('sprite.vert')), withScene(f('sprite.frag')), SPRITE_ATTRIBUTES],
            bloom: [vert, HEADER + f('bloom.frag')],
            final: [vert, HEADER + f('grade.glsl') + f('final.frag')],
        };
        this.vao = gl.createVertexArray();
        this.noise = createNoise(gl);
        this.light = createTexture3D(gl, VOLUME, gl.RGBA8, gl.RGBA, null);
        [this.spriteVao, this.spriteCount] = createSprites(gl);
    }
    /** Move compiling along. Throws if a shader fails to compile. */
    prepare() {
        const gl = this.gl;
        while (this.linked < this.started && this.program(ORDER[this.linked]).ready(this.parallel)) {
            this.linked++;
            if (ORDER[this.linked - 1] === 'volume')
                bakeVolume(gl, this.program('volume'), this.light, this.vao);
        }
        const limit = this.parallel ? ORDER.length : this.linked + 1;
        for (; this.started < limit; this.started++) {
            const name = ORDER[this.started];
            const [vs, fs, attributes] = this.sources[name];
            this.programs[name] = new Program(gl, name, vs, fs, attributes);
        }
    }
    /** True once the bake shader has compiled. */
    get canBake() {
        return this.linked > 0;
    }
    /** True once every shader has compiled. */
    get canDraw() {
        return this.linked === ORDER.length;
    }
    /** True when the GPU has finished the last strip or frame. */
    idle() {
        const gl = this.gl;
        if (!this.fence)
            return true;
        if (gl.getSyncParameter(this.fence, gl.SYNC_STATUS) !== gl.SIGNALED)
            return false;
        gl.deleteSync(this.fence);
        this.fence = null;
        this.lastWork = { kind: this.sent.kind, ms: performance.now() - this.sent.at };
        return true;
    }
    /** True once the first bake pass has finished. */
    get baked() {
        return this.bakePass > 0;
    }
    /** True once there is a picture to show: the first pass is baked and every shader has compiled. */
    get hasImage() {
        return this.baked && this.canDraw;
    }
    /** True while the bake still has passes to run. */
    get baking() {
        return this.bakePass < BAKE_PASSES;
    }
    /** Pixels in the internal resolution. */
    get pixels() {
        return this.size.w * this.size.h;
    }
    /** Keep the passes baked so far and skip the rest, on a GPU too slow to spend time refining. */
    settle() {
        if (this.baked)
            this.bakePass = BAKE_PASSES;
    }
    /** Set the internal and canvas resolution. A new internal size starts the bake again. */
    resize(size) {
        const s = this.size;
        if (size.w === s.w && size.h === s.h && size.outW === s.outW && size.outH === s.outH)
            return;
        const gl = this.gl;
        const internalChanged = size.w !== s.w || size.h !== s.h;
        this.size = size;
        if (!internalChanged)
            return;
        this.deleteTargets();
        this.bake = createTarget(gl, size.w, size.h, 4, false);
        this.air = createTarget(gl, Math.ceil(size.w / 2), Math.ceil(size.h / 2), 1, false);
        this.hdr = createTarget(gl, size.w, size.h, 1, true);
        let w = size.w;
        let h = size.h;
        for (let i = 0; i < BLOOM_LEVELS && w > 2 && h > 2; i++) {
            w = Math.max(1, w >> 1);
            h = Math.max(1, h >> 1);
            this.bloom.push(createTarget(gl, w, h, 1, true));
        }
        this.bakeRow = 0;
        this.bakePass = 0;
    }
    /** Bake the next strip of the current pass, about `pixels` in size. */
    bakeStrip(pixels) {
        const gl = this.gl;
        const t = this.bake;
        if (!t || !this.baking || !this.canBake)
            return;
        const n = Math.min(Math.max(1, Math.ceil(pixels / t.w)), t.h - this.bakeRow);
        const p = this.program('bake').use();
        gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
        gl.viewport(0, 0, t.w, t.h);
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(0, this.bakeRow, t.w, n);
        if (this.bakePass > 0) {
            // running average of the passes so far
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
            gl.blendColor(0, 0, 0, 1 / (this.bakePass + 1));
        }
        this.setView(p, t.w, t.h);
        gl.uniform2f(p.u('uJitter'), halton(this.bakePass, 2) - 0.5, halton(this.bakePass, 3) - 0.5);
        gl.uniform3fv(p.u('uAccent'), this.accent);
        gl.bindVertexArray(this.vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.disable(gl.BLEND);
        gl.disable(gl.SCISSOR_TEST);
        this.bakeRow += n;
        if (this.bakeRow >= t.h) {
            this.bakeRow = 0;
            this.bakePass++;
        }
        this.send('strip');
    }
    /** Draw one frame at `time` seconds. */
    render(time) {
        const gl = this.gl;
        const { bake, air, hdr } = this;
        if (!bake || !air || !hdr || !this.hasImage)
            return;
        const { w, h, outW, outH } = this.size;
        if (this.canvas.width !== outW || this.canvas.height !== outH) {
            this.canvas.width = outW;
            this.canvas.height = outH;
        }
        const flick = [flicker(time, 0), flicker(time, 1), flicker(time, 2), flicker(time, 3)];
        gl.bindVertexArray(this.vao);
        // haze, shafts, smoke and candle glow, at half resolution
        let p = this.program('air').use();
        gl.bindFramebuffer(gl.FRAMEBUFFER, air.fb);
        gl.viewport(0, 0, air.w, air.h);
        this.setView(p, w, h);
        this.setMotion(p, time, flick);
        gl.uniform1i(p.u('uDynamic'), 1);
        bindTextures(gl, p, [
            ['uDay', bake.tex[0]],
            ['uNoise', this.noise, gl.TEXTURE_3D],
            ['uLight', this.light, gl.TEXTURE_3D],
        ]);
        gl.uniform1i(p.u('uFrame'), this.frame++);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // relight the bake, draw the censer, lay the air over it
        p = this.program('frame').use();
        gl.bindFramebuffer(gl.FRAMEBUFFER, hdr.fb);
        gl.viewport(0, 0, w, h);
        this.setView(p, w, h);
        this.setMotion(p, time, flick);
        gl.uniform1i(p.u('uDynamic'), 1);
        bindTextures(gl, p, [
            ['uDay', bake.tex[0]],
            ['uAlbedo', bake.tex[1]],
            ['uCandleD', bake.tex[2]],
            ['uCandleS', bake.tex[3]],
            ['uAir', air.tex[0]],
            ['uNoise', this.noise, gl.TEXTURE_3D],
            ['uLight', this.light, gl.TEXTURE_3D],
        ]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // flames, glows and dust, added on top
        p = this.program('sprite').use();
        this.setView(p, w, h);
        bindTextures(gl, p, [
            ['uDay', bake.tex[0]],
            ['uAlbedo', bake.tex[1]],
        ]);
        gl.uniform1f(p.u('uTime'), time);
        gl.uniform4fv(p.u('uFlicker'), flick);
        gl.uniform3fv(p.u('uAccent'), this.accent);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.bindVertexArray(this.spriteVao);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.spriteCount);
        gl.disable(gl.BLEND);
        gl.bindVertexArray(this.vao);
        // bloom: down the chain, then back up adding each level onto the next
        p = this.program('bloom').use();
        let src = hdr;
        gl.uniform1i(p.u('uMode'), 0);
        this.bloom.forEach((dst, i) => {
            gl.uniform1i(p.u('uFirst'), i === 0 ? 1 : 0);
            this.bloomPass(p, src, dst);
            src = dst;
        });
        gl.uniform1i(p.u('uMode'), 1);
        gl.uniform1i(p.u('uFirst'), 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        for (let i = this.bloom.length - 1; i > 0; i--)
            this.bloomPass(p, this.bloom[i], this.bloom[i - 1]);
        gl.disable(gl.BLEND);
        // tone, grade and grain into the canvas
        p = this.program('final').use();
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, outW, outH);
        bindTextures(gl, p, [
            ['uHdr', hdr.tex[0]],
            ['uBloom', this.bloom[0]?.tex[0] ?? hdr.tex[0]],
        ]);
        gl.uniform2f(p.u('uOut'), outW, outH);
        gl.uniform1f(p.u('uTime'), time);
        gl.uniform1f(p.u('uGrain'), 1);
        gl.uniform3fv(p.u('uBg'), this.bg);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        this.send('frame');
    }
    dispose() {
        const gl = this.gl;
        for (const p of Object.values(this.programs))
            p?.dispose();
        this.deleteTargets();
        gl.deleteTexture(this.noise);
        gl.deleteTexture(this.light);
        if (this.fence)
            gl.deleteSync(this.fence);
        this.fence = null;
    }
    program(name) {
        return this.programs[name];
    }
    send(kind) {
        const gl = this.gl;
        if (this.fence)
            gl.deleteSync(this.fence);
        this.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        this.sent = { kind, at: performance.now() };
    }
    deleteTargets() {
        const gl = this.gl;
        for (const t of [this.bake, this.air, this.hdr, ...this.bloom])
            if (t)
                deleteTarget(gl, t);
        this.bake = this.air = this.hdr = undefined;
        this.bloom = [];
    }
    bloomPass(p, src, dst) {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        bindTextures(gl, p, [['uSrc', src.tex[0]]]);
        gl.uniform2f(p.u('uTexel'), 1 / src.w, 1 / src.h);
        gl.uniform2f(p.u('uDst'), dst.w, dst.h);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    setView(p, w, h) {
        const gl = this.gl;
        const view = frameView(this.size.outW / this.size.outH);
        gl.uniform2f(p.u('uRes'), w, h);
        gl.uniform3fv(p.u('uCamPos'), view.pos);
        gl.uniformMatrix3fv(p.u('uCamBasis'), false, view.basis);
        gl.uniform4fv(p.u('uLens'), view.lens);
        gl.uniform1i(p.u('uZero'), 0);
    }
    setMotion(p, time, flick) {
        const gl = this.gl;
        gl.uniform1f(p.u('uTime'), time);
        gl.uniform4fv(p.u('uFlicker'), flick);
        gl.uniform1f(p.u('uEmber'), ember(time));
        gl.uniform3fv(p.u('uAccent'), this.accent);
    }
}
function halton(i, base) {
    let f = 1;
    let r = 0;
    let n = i;
    while (n > 0) {
        f /= base;
        r += f * (n % base);
        n = Math.floor(n / base);
    }
    return r;
}
