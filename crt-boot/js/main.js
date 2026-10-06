// The demo page. It loads the terminal font, builds the screen in .crt, wires
// the three buttons in the bar, powers the screen on and runs the Read me
// panel. It also sets up the single-feature views.
import { prefersReducedMotion } from './dom.js';
import { Screen } from './screen.js';

const buttons = {
  on: document.querySelector('[data-power-on]'),
  off: document.querySelector('[data-power-off]'),
  wave: document.querySelector('[data-degauss]'),
};

// A single-feature view, set from ?feature= by the script in the head of
// demo.html. The bar names the view and links back to the full page, and
// demo.css hides the buttons the view leaves out.
const FEATURES = { on: 'Power on', off: 'Power off', degauss: 'Degauss' };
const feature = document.documentElement.getAttribute('data-feature');
if (FEATURES[feature]) {
  const brand = document.querySelector('.brand');
  const full = document.createElement('a');
  full.href = 'demo.html';
  full.textContent = brand.textContent;
  brand.replaceChildren(full, ' / ' + FEATURES[feature]);
  document.title = brand.textContent;
}

let screen;
let autoStart = 0;
let offWhenOn = false;

// A button with nothing to do in the current state gets aria-disabled. The
// disabled attribute would take keyboard focus away from a button just pressed.
// In the Power off view, Power off is always ready.
function sync(state) {
  window.clearTimeout(autoStart);
  const off = state === 'standby' || state === 'shutdown' || state === 'collapse';
  const dark = state === 'shutdown' || state === 'collapse';
  buttons.off.setAttribute('aria-disabled', String(off && feature !== 'off'));
  buttons.wave.setAttribute('aria-disabled', String(dark));
  if (offWhenOn && state === 'on') {
    offWhenOn = false;
    window.setTimeout(() => screen.powerOff(), 400);
  }
}

// Shows the finished terminal without the boot.
function onAtOnce() {
  screen.powerOn();
  screen.skip();
}

buttons.on.addEventListener('click', () => screen && screen.powerOn());
buttons.off.addEventListener('click', () => {
  if (!screen) return;
  // In the Power off view a press with the screen off puts the terminal back
  // at once and then powers it off, so the fold can be watched again.
  const s = screen.state;
  if (feature === 'off' && (s === 'standby' || s === 'shutdown' || s === 'collapse')) {
    offWhenOn = true;
    onAtOnce();
  } else {
    screen.powerOff();
  }
});
buttons.wave.addEventListener('click', () => screen && screen.degauss());

// The glass stays empty until the font has loaded, or for 1.5 s at most, so
// the picture never appears in a fallback font. The screen then waits in
// standby for a moment before it powers on. Under reduced motion it shows the
// finished terminal at once. The Power off and Degauss views start with the
// terminal on.
const font = document.fonts ? document.fonts.load('1em VT323') : Promise.resolve();
const timeout = new Promise((resolve) => window.setTimeout(resolve, 1500));
Promise.race([font, timeout])
  .catch(() => {})
  .then(() => {
    screen = new Screen(document.querySelector('.crt'), { onChange: sync });
    sync(screen.state);
    if (feature === 'off' || feature === 'degauss') onAtOnce();
    else if (prefersReducedMotion()) screen.powerOn();
    else autoStart = window.setTimeout(() => screen.powerOn(), 700);
  });

// The Read me panel: open and close it, close it with Escape, and copy a
// code block to the clipboard. Keys pressed inside the panel stay in it, so
// Escape there closes the panel and does not skip the boot.
(function () {
  const panel = document.getElementById('readme');
  const open = document.querySelector('[data-readme-open]');
  if (!panel || !open) return;
  function show(on) {
    panel.hidden = !on;
    open.setAttribute('aria-expanded', String(on));
    if (on) panel.querySelector('[data-readme-close]').focus();
    else open.focus();
  }
  open.addEventListener('click', () => show(panel.hidden));
  panel.querySelector('[data-readme-close]').addEventListener('click', () => show(false));
  panel.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') show(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) show(false);
  });
  panel.querySelectorAll('[data-copy-code]').forEach((button) => {
    button.addEventListener('click', () => {
      const text = button.parentElement.querySelector('code').textContent;
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(
        () => {
          button.textContent = 'Copied';
          window.setTimeout(() => {
            button.textContent = 'Copy';
          }, 1500);
        },
        () => {},
      );
    });
  });
})();
