# Night sky

This is the background of a sky: 5,200 stars that crowd along the real path of the Milky Way and into its bright middle in Sagittarius, a second sky of 7,000 stars spread evenly for a view of the galaxy from outside, and 174 other galaxies far behind it. The other galaxies are made up. They are spirals, barred spirals, patchy spirals, lenticulars, ring galaxies, ellipticals and irregulars, and some of them sit in small groups round a large elliptical.

Each star and galaxy is placed by direction only, as a unit vector in ecliptic J2000 coordinates: x points toward the March equinox and z toward the north pole of the ecliptic. Only the direction a camera looks in changes where the sky appears. Everything is made from fixed seeds, so it is the same every time.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/solar-system/night-sky/. The sky fills the window and drifts slowly from left to right, once round in 15 minutes, and the stars twinkle. When the system asks for reduced motion, the sky stands still and the stars hold their brightness.

## Using it

The core, `night-sky.js`, gives the stars and galaxies as data.

```html
<canvas id="map" width="720" height="360" style="background:#000"></canvas>
<script src="night-sky.js"></script>
<script>
  const g = document.getElementById('map').getContext('2d');
  g.fillStyle = '#fff';
  for (const s of NightSky.stars()) {
    const lon = Math.atan2(s.d[1], s.d[0]), lat = Math.asin(s.d[2]);
    g.globalAlpha = s.a;
    g.fillText(s.glyph, (1 - lon / Math.PI) * 360, (0.5 - lat / Math.PI) * 360);
  }
</script>
```

This plots the whole sky on a map of ecliptic longitude and latitude, with each star drawn as its glyph at its brightness.

For the look of the explorer in `../` (the `solar-system/` folder), where the stars take the empty character cells of a glyph grid and twinkle, add the glyph renderer and the drawing layer:

```html
<canvas id="sky"></canvas>
<script src="../glyph-renderer/glyph-renderer.js"></script>
<script src="night-sky.js"></script>
<script src="night-sky-glyphs.js"></script>
<script>
  const g = GlyphRenderer.create(document.getElementById('sky'));
  g.resize(innerWidth, innerHeight, devicePixelRatio, 10);
  const sky = NightSky.layer(g);
  sky.place();
  g.clear();
  g.compose(sky);
  (function frame(ms) { sky.time = ms / 1000; g.update(sky, true); g.present(); requestAnimationFrame(frame); })(0);
</script>
```

The renderer's camera looks toward the south pole of the ecliptic by default. Setting `g.view.R`, `g.view.U` and `g.view.B` to other unit vectors turns the sky, and `sky.place()` lays the stars out again.

## Files

- `night-sky.js` is the core. It sets up `window.NightSky` and needs nothing else.
- `night-sky-glyphs.js` adds the drawing functions to `NightSky`. It needs `night-sky.js` and a renderer from `../glyph-renderer/glyph-renderer.js`.
- `index.html`, `demo.js` and `demo.css` are the demo page, its script and its styles.
- `fonts/` holds the demo page's font.

## API

### The core

- `stars()` gives the stars of the sky, with the Milky Way.
- `galaxyStars()` gives the stars round the galaxy, for a view from outside it. Each also has `cut`, a number from 0 to 1 that lets them thin out over the galaxy's disc, each at its own distance from the centre.
- `galaxies()` gives the other galaxies.
- `galaxyImage(galaxy)` gives a galaxy's face-on picture: `I`, its light, and `K`, its pink knots of star formation, each on a grid of `IMAGE_N` × `IMAGE_N` (40 × 40) over −1.1 to 1.1 of its radius. The bulge is left out of it, so it can be added round however the disc is tipped.
- `discAxes(n, R, U)` gives how a disc with axis `n` shows to a camera with right and up directions `R` and `U`: the angle of its long axis on the screen (`pa`, radians) and the directions in space along its long and short axes (`L` and `M`).

A star has these fields:

| Field | Meaning |
|-------|---------|
| `d` | Its direction, a unit vector |
| `glyph` | The character it is drawn as: `*`, `+`, `'`, `.`, `` ` `` or `,` |
| `tint` | Its colour: 0 white, 1 blue, 2 warm, as RGB in `TINTS` |
| `a` | Its brightness, 0 to 1 |
| `tw`, `ph`, `amp` | Its twinkle: how fast it goes in radians a second, where it starts and how deep it is. Its brightness at time `t` is `a × (1 − amp + amp × sin(t × tw + ph))` |

A galaxy has these fields:

| Field | Meaning |
|-------|---------|
| `d` | Its direction, a unit vector |
| `n` | The axis of its disc, a unit vector |
| `type` | Its kind, one of the numbers in `TYPES`: `spiral`, `barred`, `elliptical`, `irregular`, `lenticular`, `ring` and `patchy` |
| `size` | Its radius, as an angle in radians |
| `bright` | How bright it is |
| `core`, `arm` | The colours of its middle and its edge, 0 to 1 |
| `q` | How round an elliptical is, as its short axis over its long one |
| `e1`, `e2` | Two directions across its disc that its picture is laid along |

`KNOT` is the colour of the knots, and `frame` holds the galaxy's axes `x`, `y` and `z` as unit vectors: x toward the centre of the galaxy, y toward galactic longitude 90° and z toward the north galactic pole.

### Drawing with glyphs

- `layer(renderer)` makes a background for the renderer, to pass to its `compose` and `update`. `place(options)` lays the stars out for the renderer's camera, one star a cell, the brightest where several fall in one. These options can be left out:

  | Option | Meaning |
  |--------|---------|
  | `stars` | How much of the sky's stars show, 0 to 1. 1 by default |
  | `galaxyStars` | How much of the stars round the galaxy show, 0 to 1. 0 by default |
  | `disc(x, y)` | Where the line of sight through device pixel `(x, y)` meets the galaxy's plane, as galactocentric `[x, y]` in kiloparsecs. The stars round the galaxy thin out over its disc |

  The layer's `time` is the time in seconds the stars twinkle at, and while `still` is set they hold at their brightest.
- `drawGalaxies(renderer, alpha, disc)` adds the other galaxies to the renderer's samples, faded by `alpha` from 0 to 1. With `disc`, those behind the Milky Way's disc are hidden.

The stars and the galaxies are seen through the renderer's camera (`view.R`, `view.U` and `view.B`) with a field of view of about 55° across the screen's height.

## Needs

The core needs nothing. The drawing layer needs `../glyph-renderer/`.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
