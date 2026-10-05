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
const files = Object.fromEntries(await Promise.all(SHADERS.map(async (name) => [name, await (await fetch(`shaders/${name}`)).text()])));
new Backdrop(document.querySelector('.scene'), files).start();
