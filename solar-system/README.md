# Solar system

This is an explorer of the Solar System drawn in text characters. The Sun, the planets, 21 moons, Pluto, Halley's Comet and seven spacecraft sit where they are at the moment on the clock, and the clock runs live. Zooming out leads past the planets to the nearest stars, the Pleiades, six nebulae and the black hole at the centre of the Milky Way, and then to the whole galaxy.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/solar-system/ for the documentation page, or http://localhost:8000/solar-system/demo.html for the explorer.

The documentation page shows the explorer in a frame and then each feature it is built from, with a small live demo, the code that makes it work and the steps to add it to another page.

In the explorer, the sky fills the window and opens on Saturn. The page is dark whatever the system theme is, because the sky is drawn as light on black. When the system asks for reduced motion, the camera jumps to each body instead of flying, the stars stop twinkling and the bodies turn only at their real rate.

## Controls

Every gesture also has a button, so the explorer works with touch alone.

- **Bodies** opens the list of everything there is to fly to: the Sun, the planets with their moons under them, Pluto, Halley's Comet, the stars, the nebulae, the galactic centre and the spacecraft, then the whole system and the whole galaxy.
- **Info** shows or hides the panel about the body in focus. The panel lists its distances, size, day and year. Its Close button hides it too.
- **−** and **+** zoom out and in. The mouse wheel, a pinch and a one-finger swipe up or down zoom as well. Zooming in near a body hands it the focus.
- The two curved arrows turn the view left and right. A sideways drag or swipe turns it too, and a quick swipe keeps it turning for a moment.
- The straight arrows tilt the view up and down. A vertical mouse drag or two fingers moving up and down together tilt it too.
- Holding a zoom, turn or tilt button repeats it.
- **«** and **»** step the clock's rate, from a month a second backwards to a month a second forwards. The pause button stops the clock and starts it again. **Now** brings the clock back to the present at real speed.
- **WebGL** and **Canvas 2D** choose what draws the characters. WebGL is the default, and Canvas 2D is the renderer that browsers without WebGL get. The picture is the same on both, and the camera, the body in focus and the clock carry on across a switch. Where the browser has no WebGL, the WebGL button is greyed out.
- A click or a tap on a body flies to it and opens the info panel. Close to a planet or a moon, its landing sites are marked, and a click on one lists its date, who sent it and where it is in the panel.

The top bar shows the time on the clock in UTC and its rate, which reads Live, Paused or a rate such as +1 day/s. Its Read me button opens the steps for putting the explorer, or one of its parts, on another page.

On a keyboard, the up and down arrows zoom and the left and right arrows turn. Keys 0 to 8 fly to the Sun and the planets, M flies to the Moon and Home shows the whole system. Esc closes the Read me panel while it is open. Otherwise it closes the body list on a small screen, then a landing site, then the info panel.

The tab's icon is the body in focus, ray-cast from the explorer's camera and framed by corner brackets in the body's colour. In a background tab it is drawn again once a minute. Browsers that keep the first icon they load, such as Safari, show the plain icon in the page's head.

## Views

- Add `?focus=mars` to the address of `demo.html` to open on Mars, or on any other body by its key.
- Add `?feature=flights` to show only the body list and the buttons that zoom, turn and tilt.
- Add `?feature=rings` to show Saturn in June 2017, when its rings were tilted furthest toward the Sun, with only the buttons that zoom, turn and tilt.
- Add `?feature=eclipse` to run the total eclipse of the Moon of 7 September 2025 at a minute a second, over and over, with only the clock's buttons.
- Add `?feature=renderer` to show only the WebGL and Canvas 2D switch.
- Add `?embed` to show the sky and its controls without the bar and the Read me, as the documentation page does in its frames. It combines with the others, as in `demo.html?feature=rings&embed`. In a frame the sky stops drawing while the frame is off screen. The wheel there scrolls the page round the frame, and it zooms only with Ctrl or Cmd held.

The feature views have no info panel. The explorer's name in their bar links to the whole explorer.

Each part's own demo page accepts `?embed` as well, and keeps only its own buttons.

## How it is drawn

The explorer is built from the components in its subfolders.

1. **Positions.** `planet-positions/` works out where every body is and how it is turned at the moment on the clock, in heliocentric ecliptic coordinates (J2000).
2. **Maps.** `planet-surfaces/` generates each body's map the first time it is needed. A small map is made at once, and the full-size one is refined a few rows per frame while the body is large on the screen.
3. **Samples.** Each character cell is sampled at six points (2 × 3). `js/orrery.js` ray-casts the bodies as ellipsoids with their rings, ring shadows, the shadows of their moons and eclipses, and draws the orbits, the asteroid and Kuiper belts and the Sun's glow into the same samples. The spacecraft (`spacecraft/`), the comet's coma and tails (`comet/`), the galaxy, the nebulae and the black hole (`deep-sky/`), and the background stars and the other galaxies (`night-sky/`) are drawn into them by their own components.
4. **Glyphs.** `glyph-renderer/` gives each cell the glyph whose shape best matches its six samples where it holds an edge, or a glyph from a density ramp where it is smooth, tinted from a palette of hues and saturations. The grid is drawn with WebGL, or on a 2D canvas where WebGL is missing or the Canvas 2D button is pressed.
5. **Labels.** The names, distances and corner brackets are drawn on a second canvas, on a grid of their own.

Whatever stays the same while a body spins is cached for each view, so a still camera costs one texture lookup per sample. While the camera moves, a large body is sampled at three of the six points and drawn in full once the camera stops. A flight follows van Wijk and Nuij's path for zooming and panning at once (2003).

## Files

- `index.html` is the documentation page.
- `demo.html`, `demo.css` and `demo.js` are the explorer's page, its styles and its controls: the gestures, the buttons, the body list, the info panel, the clock, the tab's icon and the views.
- `js/bodies.js` holds the names, labels, periods and landing sites.
- `fonts/` holds IBM Plex Mono for the page and the characters.
- `js/orrery.js` is the explorer's engine: the bodies, the camera and its flights, the HUD, picking, the tab's icon and the loop.

The page loads these components from its subfolders, as classic scripts, before `js/bodies.js`, `js/orrery.js` and `demo.js`. Each subfolder also has a small demo page of its own and a README with its API, and each one can be copied into another project without the explorer:

| Folder | What the explorer takes from it |
|--------|---------------------------------|
| `planet-positions/` | `ephemeris.js`: where every body is, and how it is turned |
| `planet-surfaces/` | `earth-map.js` and `surfaces.js`: the maps, the rings and the Earth's clouds |
| `glyph-renderer/` | `glyph-renderer.js`: the character grid |
| `night-sky/` | `night-sky.js` and `night-sky-glyphs.js`: the background stars and the other galaxies |
| `deep-sky/` | `deep-sky.js` and `deep-sky-glyphs.js`: the galaxy, the nebulae and the black hole |
| `comet/` | `comet.js` and `comet-glyphs.js`: Halley's coma and tails |
| `spacecraft/` | `spacecraft.js` and `spacecraft-glyphs.js`: the spacecraft models |

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
| `renderer`      | `'2d'` draws the characters on a 2D canvas instead of with WebGL |

After that:

- `flyTo(key)` flies to a body. `overview()` shows the whole system and `galaxy()` the whole galaxy.
- `zoom(delta, x, y)` zooms out for a positive delta and in for a negative one, toward the body nearest the point when one is given. `rotate(dx, dy)` turns and tilts the view by a drag of that many CSS pixels.
- `pick(x, y, reach)` gives the key of the body nearest a point, or null. `pickSite(x, y, reach)` gives the landing site there, and `setSite(i)` marks one. `hover(x, y)` lights up the body under the pointer.
- `setWarp(w)` sets how many seconds of the clock pass each second. 1 is real time, a negative number runs backwards and 0 stops the clock. `resetTime()` goes back to now and `setTime(ms)` jumps to a moment.
- `date`, `warp`, `live`, `focus` and `galaxyShown` read the state. `info(key)` gives a body's live distances, radius and speed.
- `icon(canvas, options)` draws the body in focus into a small square canvas.
- `onFocus(fn)` is called with the key of each new body in focus.
- `setLabels`, `setColours`, `setSites` and `setAccent` give the HUD its names, each body's colour, the landing sites and the accent.
- `setInsets(top, bottom, right)`, `setCovered(boxes)` and `setGutter(px)` tell the explorer where the page's controls are. `frameFocus()` frames the body in focus again at once, for after those change.
- `setReducedMotion(on)` and `remeasure()` follow the system setting and a font that loads late.
- `setPaused(on)` stops the drawing while `on` is true, for a page that scrolls the sky out of view. `paused` reads it.
- `setRenderer(kind)` draws the characters with WebGL (`'webgl'`) or on a 2D canvas (`'2d'`). A new canvas with the same id and attributes takes the old one's place, and the old canvas's WebGL context is released at once. It returns the renderer in use, which stays `'2d'` where the browser has no WebGL. `renderer` reads which one is in use.
- `BODIES` holds every body by key, with its radius in km, its kind and class, and what it goes round.

## Data

The catalogues and papers the positions, maps and models come from are listed in each component's README.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
