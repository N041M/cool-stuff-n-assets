# CRT boot

This is the power-on and power-off sequence of a CRT terminal, drawn with HTML, CSS and a little JavaScript. On power-on the glass grows from its place on the page until it fills the window. A point of light opens into a line and then into an overexposed raster. A degauss wave bends the picture while a start-up log scrolls past, and a scan line then draws the terminal onto the glass. On power-off the picture folds to a line and then to a point, and the point fades the way phosphor does.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/crt-boot/. The page is made of JavaScript modules, so it has to come from a server and not straight from the file.

The screen waits in standby for a moment and then powers on by itself. The buttons in the bar work at any point in the sequence.

- **Power on** starts the screen from standby. When the screen is already on or still starting, it powers off and on again and replays the boot.
- **Power off** folds the picture away and puts the glass back in its place on the page.
- **Degauss** bends the picture in rolling waves for about a second. The boot runs one degauss by itself when the log starts.

During the boot, Skip in the corner of the glass and the Escape key jump to the finished terminal. A press on the glass in standby powers it on.

When the system asks for reduced motion, Power on shows the finished terminal at once and Power off goes straight back to standby. The grain, the hum bar, the flicker and the blinking stop, and the page leaves out the Degauss button.

## How it is drawn

1. **Grow.** The glass is fixed to the window, and its `clip-path` is animated from the rectangle of its slot to the whole window.
2. **Power on.** A 2 px beam scales from a point into a line across the middle. A raster layer, a hot radial gradient in `mix-blend-mode: screen`, opens from that line to the full height and fades to black. Both are Web Animations.
3. **Degauss.** An inline SVG filter feeds `feTurbulence` into `feDisplacementMap`. Each frame changes the frequency of the turbulence and the scale of the displacement, adds a brightness bloom, and lets both fall away over 0.95 s.
4. **Log.** The log prints several lines per frame and pauses after some of them. Beside it are a memory meter, a carrier trace drawn on a canvas with phosphor persistence, a module list and a hex dump. The load time of each module is made up on every run, and the log waits with a spinner on any module that has not loaded yet. Below 820 px the side panels are left out.
5. **Draw.** A bright scan line runs down the glass while a `clip-path` reveals the terminal behind it.
6. **Power off.** The tube squashes to 1.2% of its height and brightens. The beam then pulls in to a point, which fades quickly at first and then slowly while the glass shrinks back into its slot.

Over everything on the glass sit CSS layers for the scanlines, a moving grain tile, a slow hum bar, the vignette, faint scratches and a reflection. While it is on, the terminal also flickers now and then.

## Files

- `index.html` is the demo page.
- `js/main.js` loads the font, builds the screen and wires the buttons.
- `js/screen.js` is the screen. It holds the states, the grow and the shrink, and the terminal picture.
- `js/boot.js` holds the power-on, degauss, draw, power-off and afterglow steps and the start-up log.
- `js/sequence.js` is a timeline that can be skipped, and a tween.
- `js/dom.js` holds small helpers for the DOM and the clock.
- `crt.css` is the glass, its layers and the log. It also sets the two phosphor colours.
- `term.css` is the terminal picture.
- `demo.css` is the bar and the slot on the demo page.
- `fonts/` holds VT323 and Share Tech Mono with their licences.

## Putting it on a page

Load `crt.css` and `term.css`, with the `fonts/` folder beside them. Give the glass a slot that has a size and `position: relative`:

```html
<div style="position: relative; width: 640px; aspect-ratio: 7 / 5">
  <div class="crt"></div>
</div>
```

Then build the screen in a module script:

```js
import { Screen } from './js/screen.js';

const screen = new Screen(document.querySelector('.crt'));
screen.powerOn();
```

- `screen.powerOn()`, `screen.powerOff()`, `screen.degauss()` and `screen.skip()` do what the buttons do.
- `screen.state` is the current state. It is one of `standby`, `expand`, `power`, `telemetry`, `draw`, `on`, `shutdown` and `collapse`. An `onChange` function passed in the second argument, as in `new Screen(el, { onChange })`, is called with each new state.
- When it is on, the glass fills the window. A page with a fixed bar at the top sets `--crt-top` to the height of the bar.
- `data-phosphor="red"` on `<html>` switches the phosphor from green to red.
- The terminal picture is the `TERMINAL` string in `js/screen.js`. The log lines are in `script()` in `js/boot.js`.

## Fonts

- [VT323](https://fonts.google.com/specimen/VT323) by Peter Hull draws everything on the glass. It is under the SIL Open Font License 1.1, and the licence text is in `fonts/LICENSE-VT323.txt`.
- [Share Tech Mono](https://fonts.google.com/specimen/Share+Tech+Mono) by Carrois Type Design is the font of the bar. It is under the SIL Open Font License 1.1, and the licence text is in `fonts/LICENSE-ShareTechMono.txt`.

Both files are the latin subset from the Fontsource packages `@fontsource/vt323` and `@fontsource/share-tech-mono`, version 5.3.0.
