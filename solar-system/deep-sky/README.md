# Deep sky

This is the Milky Way, six nebulae, the Pleiades and Sagittarius A*, the black hole at the centre of the galaxy.

- The galaxy is 450,000 stars on spiral arms fitted to the parallaxes of masers in young star-forming regions, with its bar, the ring round the bar, star clusters, pink glowing gas, spurs of young stars and dust that dims and reddens the light behind it.
- The Helix, Orion, Ring, Eagle, Crab and Carina nebulae and the haze of the Pleiades are clouds of up to 150,000 points of glowing gas, sketched from photographs, with the stars inside them.
- The black hole bends the light of the disc of gas round it as a hole that does not spin bends light. The far side of the disc shows over the top of the shadow and under it, thin rings of light edge the shadow, and the side of the disc coming toward the camera is brighter.

Each object is described in a frame of its own. The galaxy is in galactocentric kiloparsecs: x points from the Sun toward the centre, y toward galactic longitude 90° and z toward the north galactic pole, and the Sun is at x = −8.15. A nebula is in units of its radius, with u to the right and v up as it looks from the Earth with north up, and w toward the Earth. The black hole is in units of the radius of the ring the Event Horizon Telescope saw round it.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/solar-system/deep-sky/. Previous and Next step through the Milky Way, the six nebulae, the Pleiades and Sagittarius A*. The points of each object are made the first time it is shown, and a status line shows until they are ready. The galaxy turns once in four minutes, a nebula sways 20° either way, and the gas round the black hole goes round once a minute. When the system asks for reduced motion, they stand still. The Glyphs button draws the same picture without the characters.

## Using it

The core, `deep-sky.js`, gives the objects as data and works out the black hole's light.

```html
<canvas id="disc" width="400" height="400" style="background:#000"></canvas>
<script src="deep-sky.js"></script>
<script>
  while (!DeepSky.galaxy.prepare(50));
  const P = DeepSky.galaxy.points(), g = document.getElementById('disc').getContext('2d');
  for (let i = 0; i < P.n; i += 3) {
    g.fillStyle = `rgb(${P.col[i * 3]},${P.col[i * 3 + 1]},${P.col[i * 3 + 2]})`;
    g.fillRect(200 + P.pos[i * 3] * 10, 200 - P.pos[i * 3 + 1] * 10, 1, 1);
  }
</script>
```

This draws a third of the galaxy's stars face-on, 10 pixels to a kiloparsec, with its centre in the middle and the Sun to the left of it.

For the look of the explorer in `../` (the `solar-system/` folder), add the glyph renderer and the drawing layer:

```html
<canvas id="sky" style="background:#000"></canvas>
<script src="../glyph-renderer/glyph-renderer.js"></script>
<script src="deep-sky.js"></script>
<script src="deep-sky-glyphs.js"></script>
<script>
  const g = GlyphRenderer.create(document.getElementById('sky'));
  g.resize(innerWidth, innerHeight, devicePixelRatio, 10);
  g.clear();
  DeepSky.drawHole(g, { x: g.W / 2, y: g.H / 2, radius: g.H / 6, frame: { N: [0, 0.42, 0.91], Q: [1, 0, 0], E: [0, 0.91, -0.42] } });
  g.compose();
  g.present();
</script>
```

This draws the black hole in the middle of the screen, its ring a third of the screen's height across and its disc tipped 25° from face-on. Positions on the screen are in device pixels, as the renderer's `W` and `H` are. The renderer's camera looks along its z axis by default, so the disc's pole `N` is given in those axes.

## Files

- `deep-sky.js` is the core. It sets up `window.DeepSky` and needs nothing else.
- `deep-sky-glyphs.js` adds the drawing functions to `DeepSky`. It needs `deep-sky.js` and a renderer from `../glyph-renderer/glyph-renderer.js`.
- `index.html`, `demo.js` and `demo.css` are the demo page, its script and its styles.
- `fonts/` holds the demo page's font.

## API

### The galaxy

`DeepSky.galaxy` holds the galaxy.

- `prepare(ms)` makes the stars for up to `ms` milliseconds and returns `true` once they are all made. Making them takes about half a second, so a page can call it a few milliseconds at a time.
- `points()` gives the stars once they are made, or `null`: `n` stars, their positions `pos` (x, y and z in kiloparsecs, `Float32Array`) and their colours `col` (red, green and blue as bytes, `Uint8Array`). A colour times `colScale` is a light where 1 is a typical star.
- `armPoint(arm, beta)` gives the point `[x, y]` in kiloparsecs on an arm at `beta` degrees round the centre, 0 toward the Sun. The arms are `'scutum'`, `'perseus'`, `'sagittarius'`, `'local'` (the Orion Arm) and `'outer'`, which joins the Norma arm round the far side.
- `blobs`, `barAngle` and `blobColour` describe the bulge and the bar as glowing ellipsoids along the bar: each blob is `[distance along the bar, spread along it, across it, up, brightness]` in kiloparsecs, and the bar lies at `barAngle` degrees to the line from the Sun.

### Nebulae

`DeepSky.nebula` holds the nebulae and the Pleiades, by key: `pleiades`, `helix`, `orionnebula`, `ringnebula`, `eagle`, `crab` and `carina`.

- `catalogue[key]` gives a nebula's `radius` in km and its `colour` from 0 to 1.
- `prepare(key, ms)` makes a nebula's points for up to `ms` milliseconds and returns `true` once they are made.
- `points(key)` gives them once they are made, or `null`: `n` points of gas at `pos` (u, v and w in units of the radius, `Float32Array`) with colours `col` that add up to a light of 1 (`Float32Array`), the brightness `gain` the nebula is drawn at, and `stars`, its stars as `[u, v, w, colour, brightness]`.

### The black hole

`DeepSky.hole` holds Sagittarius A*.

| Name | Meaning |
|------|---------|
| `radius` | The radius of its ring, km |
| `mass` | Its mass as a length, GM/c², km |
| `radial` | The disc's map runs from `radial[0]` times `mass` from the middle at its top to `radial[1]` at its bottom |
| `colour`, `glow` | The disc's mean colour and the colour of its glow from far off, 0 to 1 |
| `reach` | How far out it is drawn, in ring radii |
| `mapSize` | The size its map is made at, `[width, height]` |
| `map(lon, lat, x, y, z, out)` | The disc's map: the colour at east longitude `lon` round the disc and `lat` from the top, both in degrees, into `out`. The clumps of hot gas on it are made up |

- `setup(frame, view, px, mean)` works out what stays the same across the hole for a camera. `frame` holds the disc's pole `N`, prime meridian `Q` and east `E`, and `view` the camera's right, up and backward directions `R`, `U` and `B`, all as unit vectors in one space. `px` is the distance between samples in ring radii, and `mean` the clumps' colour where there is no map.
- `at(setup, x, y, out)` gives the light at `(x, y)` in ring radii from the middle, with y up. It returns how much the shadow covers there, 0 to 1. `out.r`, `out.g` and `out.b` get the light without the clumps, and `out.f` the light that takes the clumps' colour from the map at `(out.u, out.v)`, each from 0 to 1.

### Drawing with glyphs

Each function adds one object's light to a renderer's samples, seen through the renderer's camera. Positions and sizes on the screen are in device pixels.

- `drawGalaxy(renderer, frame, options)` draws the galaxy, once its stars are made, and returns `false` until then. `frame` says where the galaxy sits in the camera's space: its axes `x`, `y` and `z` as unit vectors, its `centre`, the length of a kiloparsec (`unit`) and `toScene(x, y, z)`, which turns galactocentric kiloparsecs into a point in that space. Left out, the camera's space is galactocentric kiloparsecs. The options `alpha`, `gain` and `points` set how much of it shows and the brightness of its bulge and of its stars.
- `drawNebula(renderer, n)` draws a nebula and returns `false` while its points are still to be made. `n.key` names it. `n.x` and `n.y` are its centre, `n.radius` its radius and `n.dot` the radius of its dot from far off. `n.frame` holds its `u`, `v` and `w` as unit vectors in the camera's space. `n.alpha`, `n.glow`, `n.gain`, `n.max` and `n.stars` set how much shows, the colour of its glow from far off, the gas's brightness, the brightness the gas is compressed toward and the stars' brightness.
- `drawHole(renderer, h)` draws the black hole. `h.x` and `h.y` are its middle, `h.radius` the radius of its ring and `h.dot` the radius of its dot from far off. `h.frame` holds its `N`, `Q` and `E` in the camera's space. `h.alpha` and `h.glow` set how much shows and the glow's colour. With `h.coarse`, which suits a moving camera, a large hole is sampled down the middle of each cell only. `h.map`, when given, is a function that returns the id of the disc's map with the renderer's sampler, and the clumps are then shaded from the map each frame as the disc turns. Without it they take the disc's mean colour.

## Data

- The spiral arms, the Sun's place in the galaxy and the widening of the arms: Reid et al. (2019, ApJ 885, 131).
- The bar: Wegg, Gerhard and Portail (2015). The disc's scale length: Bland-Hawthorn and Gerhard (2016).
- The ring round Sagittarius A*: the Event Horizon Telescope Collaboration (2022, ApJL 930, L12). Its mass: the GRAVITY Collaboration (2022, A&A 657, L12).
- The nebulae's sizes are the usual published ones, and their shapes are sketched from photographs. The Pleiades' nine brightest stars are at their places on the sky.

The other papers the numbers come from are cited in the comments beside them.

## Needs

The core needs nothing. The drawing layer needs `../glyph-renderer/`. In the explorer, where these objects are in the sky and the galaxy's frame in ecliptic coordinates come from `../planet-positions/`. This folder does not need it.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
