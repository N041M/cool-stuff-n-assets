// The demo page. It loads the terminal font, builds the screen in .crt, wires
// the three buttons in the bar and powers the screen on.
import { prefersReducedMotion } from './dom.js';
import { Screen } from './screen.js';

const buttons = {
  on: document.querySelector('[data-power-on]'),
  off: document.querySelector('[data-power-off]'),
  wave: document.querySelector('[data-degauss]'),
};

let screen;
let autoStart = 0;

// A button with nothing to do in the current state gets aria-disabled. The
// disabled attribute would take keyboard focus away from a button just pressed.
function sync(state) {
  window.clearTimeout(autoStart);
  const off = state === 'standby' || state === 'shutdown' || state === 'collapse';
  const dark = state === 'shutdown' || state === 'collapse';
  buttons.off.setAttribute('aria-disabled', String(off));
  buttons.wave.setAttribute('aria-disabled', String(dark));
}

buttons.on.addEventListener('click', () => screen && screen.powerOn());
buttons.off.addEventListener('click', () => screen && screen.powerOff());
buttons.wave.addEventListener('click', () => screen && screen.degauss());

// The glass stays empty until the font has loaded, or for 1.5 s at most, so
// the picture never appears in a fallback font. The screen then waits in
// standby for a moment before it powers on. Under reduced motion it shows the
// finished terminal at once.
const font = document.fonts ? document.fonts.load('1em VT323') : Promise.resolve();
const timeout = new Promise((resolve) => window.setTimeout(resolve, 1500));
Promise.race([font, timeout])
  .catch(() => {})
  .then(() => {
    screen = new Screen(document.querySelector('.crt'), { onChange: sync });
    sync(screen.state);
    if (prefersReducedMotion()) screen.powerOn();
    else autoStart = window.setTimeout(() => screen.powerOn(), 700);
  });
