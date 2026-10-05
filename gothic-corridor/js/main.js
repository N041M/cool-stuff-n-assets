import { Backdrop } from './backdrop.js';
const SHADERS = [
    'common.glsl',
    'hall.glsl',
    'servitor.glsl',
    'bake.frag',
    'quad.vert',
    'volume.frag',
    'motion.glsl',
    'smoke.glsl',
    'air.frag',
    'censer.glsl',
    'frame.frag',
    'sprite.vert',
    'sprite.frag',
    'bloom.frag',
    'grade.glsl',
    'final.frag',
];
const scene = document.querySelector('.scene');
try {
    const files = Object.fromEntries(await Promise.all(SHADERS.map(async (name) => {
        const res = await fetch(`shaders/${name}`);
        if (!res.ok)
            throw new Error(`${name}: HTTP ${res.status}`);
        return [name, await res.text()];
    })));
    new Backdrop(scene, files).start();
}
catch (err) {
    console.warn('[backdrop]', err);
    scene.classList.add('is-still');
}
