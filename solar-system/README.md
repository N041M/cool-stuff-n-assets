# Solar system

This is an explorer of the Solar System drawn in text characters. The Sun, the planets, 21 moons, Pluto, Halley's Comet and seven spacecraft sit where they are at the moment on the clock, and the clock runs live. Zooming out leads past the planets to the nearest stars, the Pleiades, six nebulae and the black hole at the centre of the Milky Way, and then to the whole galaxy.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/solar-system/.

The sky fills the window and opens on Saturn. The page is dark in both system themes, because the sky is drawn as light on black. When the system asks for reduced motion, the camera jumps to each body instead of flying, the stars stop twinkling and the bodies turn only at their real rate.

## Controls

Every gesture also has a button, so the explorer works with touch alone.

- **Bodies** opens the list of everything there is to fly to: the Sun, the planets with their moons under them, Pluto, Halley's Comet, the stars, the nebulae, the galactic centre and the spacecraft, then the whole system and the whole galaxy.
- **Info** shows or hides the panel about the body in focus. The panel gives its distances, size, day and year, and a few lines about it. Its close button hides it too.
- **−** and **+** zoom out and in. The mouse wheel, a pinch and a one-finger swipe up or down zoom as well. Zooming in near a body hands it the focus.
- The two curved arrows turn the view left and right. A sideways drag or swipe turns it too, and a quick swipe keeps it turning for a moment.
- The straight arrows tilt the view up and down. A vertical mouse drag or two fingers moving up and down together tilt it too.
- Holding a zoom, turn or tilt button repeats it.
- **«** and **»** step the clock's rate, from a month a second backwards to a month a second forwards. The pause button stops the clock and starts it again. **Now** brings the clock back to the present at real speed.
- A click or a tap on a body flies to it and opens the info panel. Close to a planet or a moon, its landing sites are marked, and a click on one describes it in the panel.

The top bar shows the time on the clock in UTC and its rate: Live, Paused or a rate such as +1 day/s.

On a keyboard, the up and down arrows zoom and the left and right arrows turn. Keys 0 to 8 fly to the Sun and the planets, M flies to the Moon and Home shows the whole system. Esc closes the body list on a small screen, then a landing site, then the info panel.

The tab's icon is the body in focus, ray-cast from the explorer's camera and framed by corner brackets in the body's colour. In a background tab it is drawn again once a minute. Browsers that keep the first icon they load, such as Safari, show the plain icon in the page's head.

## How it is drawn

1. **Positions.** `js/ephemeris.js` works out where every body is and how it is turned at the moment on the clock, in heliocentric ecliptic coordinates (J2000).
2. **Maps.** `js/surfaces.js` generates each body's map the first time it is needed. A small map is made at once, and the full-size one is refined a few rows per frame while the body is large on the screen.
3. **Samples.** Each character cell is sampled at six points (2 × 3). The bodies are ray-cast as ellipsoids with their rings, ring shadows, the shadows of their moons and eclipses. The spacecraft are small models ray-cast at their real size, and the black hole bends each ray that passes it. Orbits, the asteroid and Kuiper belts, the comet's tails, the Sun's glow, the galaxy and the nebulae are drawn into the same samples.
4. **Glyphs.** Each cell takes the glyph whose shape best matches its six samples where it holds an edge, or a glyph from a density ramp where it is smooth, tinted from a palette of hues and saturations. The grid is drawn with WebGL, or on a 2D canvas where WebGL is missing.
5. **Labels.** The names, distances and corner brackets are drawn on a second canvas, on a grid of their own.

Whatever stays the same while a body spins is cached for each view, so a still camera costs one texture lookup per sample. While the camera moves, a large body is sampled at three of the six points and drawn in full once the camera stops. A flight follows van Wijk and Nuij's path for zooming and panning at once (2003).

The planets' orbits hold from 1800 to 2050. The clock can run past those years, and the planets then drift from their real places.

## Files

- `index.html`, `demo.css` and `demo.js` are the page, its styles and its controls: the gestures, the buttons, the body list, the info panel, the clock and the tab's icon.
- `js/ephemeris.js` holds the orbits and rotations and works out positions.
- `js/earth-map.js` is the Earth's land, sea and ice, 1024 × 512, run-length encoded.
- `js/surfaces.js` generates the maps, the rings, the spacecraft models and the points of the galaxy and the nebulae.
- `js/bodies.js` holds the names, labels, periods, notes and landing sites.
- `js/orrery.js` is the renderer and the camera.
- `tools/earth-mask.js` rebuilds `js/earth-map.js` from a Natural Earth raster with Node: `node tools/earth-mask.js world.png`.

The scripts load in the order `index.html` gives, as classic scripts.

## Orrery

`js/orrery.js` sets up `window.Orrery`. A page calls `Orrery.init(sky, hud, options)` with two canvases fixed over the window, the HUD canvas on top. These options can be left out:

| Option          | Meaning |
|-----------------|---------|
| `focus`         | The body to open on, by key, such as `'earth'`. Saturn by default |
| `font`          | The font family of the characters |
| `fontWeight`    | Its weight |
| `accent`        | The colour of the HUD and of the focused body's orbit, as hex |
| `background`    | The colour behind the HUD's labels |
| `fps`           | The highest frame rate while the camera is still |
| `reducedMotion` | `true` makes flights instant and stops the twinkle and the time-lapse spin |
| `insets`        | `[top, bottom, right]`, the CSS pixels the page's controls cover |
| `time`          | A moment to start at, in ms since 1970 |

After that:

- `flyTo(key)` flies to a body. `overview()` shows the whole system and `galaxy()` the whole galaxy.
- `zoom(delta, x, y)` zooms out for a positive delta and in for a negative one, toward the body nearest the point when one is given. `rotate(dx, dy)` turns and tilts the view by a drag of that many CSS pixels.
- `pick(x, y, reach)` gives the key of the body nearest a point, or null. `pickSite(x, y, reach)` gives the landing site there, and `setSite(i)` marks one. `hover(x, y)` lights up the body under the pointer.
- `setWarp(w)` sets how many seconds of the clock pass each second. 1 is real time, a negative number runs backwards and 0 stops the clock. `resetTime()` goes back to now and `setTime(ms)` jumps to a moment.
- `date`, `warp`, `live`, `focus` and `galaxyShown` read the state. `info(key)` gives a body's live distances, radius and speed.
- `icon(canvas, options)` draws the body in focus into a small square canvas.
- `onFocus(fn)` is called with the key of each new body in focus.
- `setLabels`, `setColours`, `setSites` and `setAccent` give the HUD its names, each body's colour, the landing sites and the accent.
- `setInsets(top, bottom, right)`, `setCovered(boxes)` and `setGutter(px)` tell the renderer where the page's controls are. `frameFocus()` frames the body in focus again at once, for after those change.
- `setReducedMotion(on)` and `remeasure()` follow the system setting and a font that loads late.

## Data

- The planets: JPL's "Keplerian Elements for Approximate Positions of the Major Planets" (E. M. Standish).
- The Moon: Meeus's truncation of ELP-2000/82, from *Astronomical Algorithms*.
- The poles and rotation of the bodies: the IAU WGCCRE reports.
- ΔT: Espenak and Meeus (NASA, 2006).
- Halley's Comet: orbital elements from the Minor Planet Center.
- The stars: Hipparcos (van Leeuwen 2007) and Gaia DR3, by way of SIMBAD.
- The galaxy's arms and the Sun's place in it: Reid et al. (2019, ApJ 885, 131).
- Sagittarius A* and S2: ICRF3 (Gordon, de Witt and Jacobs 2023, AJ 165, 49), the GRAVITY Collaboration (2020, A&A 636, L5 and 2022, A&A 657, L12) and the Event Horizon Telescope Collaboration (2022, ApJL 930, L12).
- The Earth's land and ice: [Natural Earth](https://www.naturalearthdata.com), which is in the public domain.

The other papers the numbers come from are cited in the comments beside them.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
