// The shader header, the noise texture, the sprites and the light volume, set
// up for the renderer.
import { CANDLES, flameCentre, flameHeight, frameView, OPTIC } from './scene.js';
export const HEADER = '#version 300 es\nprecision highp float;\nprecision highp int;\nprecision highp sampler3D;\n';
export const NOISE_SIZE = 32;
/** Texels in the daylight volume: about 15 cm across, 12 cm up and 15 cm along the hall. */
export const VOLUME = [40, 80, 224];
const DUST_MOTES = 900;
export const SPRITE_ATTRIBUTES = ['aCorner', 'aPos', 'aInfo'];
export function setView(gl, p, w, h, aspect) {
    const view = frameView(aspect);
    gl.uniform2f(p.u('uRes'), w, h);
    gl.uniform3fv(p.u('uCamPos'), view.pos);
    gl.uniformMatrix3fv(p.u('uCamBasis'), false, view.basis);
    gl.uniform4fv(p.u('uLens'), view.lens);
    gl.uniform1i(p.u('uZero'), 0);
}
export function createTexture3D(gl, dims, internal, format, data) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage3D(gl.TEXTURE_3D, 0, internal, dims[0], dims[1], dims[2], 0, format, gl.UNSIGNED_BYTE, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
        gl.texParameteri(gl.TEXTURE_3D, wrap, gl.CLAMP_TO_EDGE);
    return tex;
}
/** Smooth value noise is built in the shader from this 32³ grid of random values. */
export function createNoise(gl) {
    const data = new Uint8Array(NOISE_SIZE ** 3);
    let s = 0x2545f491;
    for (let i = 0; i < data.length; i++) {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        data[i] = s & 255;
    }
    const tex = createTexture3D(gl, [NOISE_SIZE, NOISE_SIZE, NOISE_SIZE], gl.R8, gl.RED, data);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
        gl.texParameteri(gl.TEXTURE_3D, wrap, gl.REPEAT);
    return tex;
}
/** Bake the daylight in the air into the light volume, one slice per draw. */
export function bakeVolume(gl, p, light, vao) {
    p.use();
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.viewport(0, 0, VOLUME[0], VOLUME[1]);
    gl.uniform3f(p.u('uVolRes'), ...VOLUME);
    gl.uniform1i(p.u('uZero'), 0);
    gl.bindVertexArray(vao);
    for (let z = 0; z < VOLUME[2]; z++) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, light, 0, z);
        gl.uniform1f(p.u('uSlice'), z);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fb);
}
/** One instance per flame, one per reflection of a flame, the servitor's optic and the dust. */
export function createSprites(gl) {
    const data = [];
    const lit = CANDLES.filter((c) => c.lit);
    for (const kind of [0, 1]) {
        lit.forEach((c, i) => {
            const f = flameCentre(c);
            const bright = c.kind === 3 /* Kind.Cup */ ? 0.55 : 1;
            data.push(f[0], f[1], f[2], flameHeight(c), c.group, ((i * 0.618034) % 1) + 0.01, kind, bright);
        });
    }
    data.push(OPTIC[0], OPTIC[1], OPTIC[2], 0.012, 0, 0.3, 2, 1);
    let s = 0x9e3779b9;
    const rand = () => {
        s ^= s << 13;
        s ^= s >>> 17;
        s ^= s << 5;
        return (s >>> 0) / 4294967296;
    };
    for (let i = 0; i < DUST_MOTES; i++) {
        data.push(rand() * 5.6 - 2.8, rand() * 6.5, -0.8 - rand() * 11, 0.004, 0, rand(), 3, 1);
    }
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    for (const loc of [1, 2]) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 32, (loc - 1) * 16);
        gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return [vao, data.length / 8];
}
