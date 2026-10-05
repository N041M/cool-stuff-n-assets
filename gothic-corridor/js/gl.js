/** Small WebGL2 helpers for the backdrop. */
const COMPLETION_STATUS_KHR = 0x91b1;
/** A linked program with cached uniform locations. */
export class Program {
    gl;
    name;
    handle;
    locations = new Map();
    shaders;
    constructor(gl, name, vertex, fragment, 
    /** Attribute names, bound to locations 0, 1, 2… before linking. */
    attributes = []) {
        this.gl = gl;
        this.name = name;
        this.shaders = [shader(gl, gl.VERTEX_SHADER, vertex), shader(gl, gl.FRAGMENT_SHADER, fragment)];
        this.handle = gl.createProgram();
        for (const s of this.shaders)
            gl.attachShader(this.handle, s);
        attributes.forEach((a, i) => gl.bindAttribLocation(this.handle, i, a));
        gl.linkProgram(this.handle);
    }
    /**
     * True once the driver has finished compiling and linking. With
     * KHR_parallel_shader_compile this never blocks. Throws with the driver's
     * log if either step failed.
     */
    ready(parallel) {
        const gl = this.gl;
        if (parallel && !gl.getProgramParameter(this.handle, COMPLETION_STATUS_KHR))
            return false;
        if (!gl.getProgramParameter(this.handle, gl.LINK_STATUS)) {
            const logs = this.shaders.map((s) => gl.getShaderInfoLog(s)).filter(Boolean);
            throw new Error(`${this.name}: ${[...logs, gl.getProgramInfoLog(this.handle)].join('\n')}`);
        }
        return true;
    }
    use() {
        this.gl.useProgram(this.handle);
        return this;
    }
    u(name) {
        let loc = this.locations.get(name);
        if (loc === undefined) {
            loc = this.gl.getUniformLocation(this.handle, name);
            this.locations.set(name, loc);
        }
        return loc;
    }
    dispose() {
        for (const s of this.shaders)
            this.gl.deleteShader(s);
        this.gl.deleteProgram(this.handle);
    }
}
function shader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    return s;
}
export function createTarget(gl, w, h, count, linear, format = gl.RGBA16F) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    const tex = [];
    for (let i = 0; i < count; i++) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texStorage2D(gl.TEXTURE_2D, 1, format, w, h);
        const filter = linear ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
        tex.push(t);
    }
    gl.drawBuffers(tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
        deleteTarget(gl, { fb, tex, w, h });
        throw new Error(`framebuffer incomplete (0x${status.toString(16)})`);
    }
    return { fb, tex, w, h };
}
export function deleteTarget(gl, t) {
    gl.deleteFramebuffer(t.fb);
    for (const tex of t.tex)
        gl.deleteTexture(tex);
}
/** Bind textures to consecutive units and point the named samplers at them. */
export function bindTextures(gl, p, textures) {
    textures.forEach(([name, tex, target], unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(target ?? gl.TEXTURE_2D, tex);
        gl.uniform1i(p.u(name), unit);
    });
}
