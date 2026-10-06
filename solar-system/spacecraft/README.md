# Spacecraft

These are seven spacecraft as small 3D models at their real size: Voyager 1 and 2, New Horizons, Pioneer 10 and 11, Parker Solar Probe and the James Webb Space Telescope. Each is built in metres from a few kinds of part: dishes, cylinders, rods too thin to see whole, flat panels and prisms, and JWST's mirror of 18 hexagons. A ray cast through a model keeps every part it passes, so a boom thinner than a pixel covers only part of it. The parts shade one another from the Sun, and a faint light from the camera's side keeps the shaded side readable.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/solar-system/spacecraft/. The page shows one model at a time in characters, turning slowly. Previous and Next switch between the five models. It stands still when the system asks for reduced motion. The Glyphs button draws the same picture without the characters.

## Using it

The core, `spacecraft.js`, gives the models and casts rays through them.

```html
<canvas id="craft" width="200" height="200" style="background:#000"></canvas>
<script src="spacecraft.js"></script>
<script>
  const M = Spacecraft.models.voyager, g = document.getElementById('craft').getContext('2d'), out = [0, 0, 0];
  for (let py = 0; py < 200; py++) for (let px = 0; px < 200; px++) {
    const cover = Spacecraft.ray(M, [(px - 100) / 6, (100 - py) / 6, 0], [0, 0, 1], [0.5, 0.3, 0.81], 1 / 6, out);
    if (cover > 0) { g.fillStyle = `rgb(${out.map((v) => Math.min(255, v / cover * 255)).join()})`; g.fillRect(px, py, 1, 1); }
  }
</script>
```

This draws Voyager from in front of its dish, 6 pixels to a metre, lit from the upper right.

For the look of the explorer in `../` (the `solar-system/` folder), add the glyph renderer and the drawing layer:

```html
<canvas id="sky"></canvas>
<script src="../glyph-renderer/glyph-renderer.js"></script>
<script src="spacecraft.js"></script>
<script src="spacecraft-glyphs.js"></script>
<script>
  const g = GlyphRenderer.create(document.getElementById('sky'));
  g.resize(innerWidth, innerHeight, devicePixelRatio, 10);
  const M = Spacecraft.models.jwst;
  g.clear();
  Spacecraft.draw(g, { model: M, x: g.W / 2, y: g.H / 2, metres: 2.4 * M.r / g.H, frame: { N: [0, 0.8, 0.6], Q: [0.6, -0.48, 0.64], E: [0.8, 0.36, -0.48] }, light: [0.3, -0.8, -0.52] });
  g.compose();
  g.present();
</script>
```

This draws JWST in the middle of the screen from above, with its mirror turned partly toward the camera and the Sun below its sunshield.

## Files

- `spacecraft.js` is the core. It sets up `window.Spacecraft` and needs nothing else.
- `spacecraft-glyphs.js` adds `Spacecraft.draw`. It needs `spacecraft.js` and a renderer from `../glyph-renderer/glyph-renderer.js`.
- `index.html`, `demo.js` and `demo.css` are the demo page. `fonts/` holds the font the page and its characters use.

## API

### The core

- `models` holds the five models by name: `voyager`, `newhorizons`, `pioneer`, `parker` and `jwst`.
- `fleet` gives the model each spacecraft uses, by key: `voyager1`, `voyager2`, `newhorizons`, `pioneer10`, `pioneer11`, `parker` and `jwst`.
- `orient(model, pos, earth)` gives how a spacecraft is turned at `pos` with the Earth at `earth`, both heliocentric ecliptic and in any one unit: `N`, the model's z axis, which points its dish at the Earth or its shield to or from the Sun, `Q`, its x axis, which lies along the ecliptic, and `E`, its y axis, as unit vectors.
- `ray(model, origin, dir, light, footprint, out)` casts one ray through a model. `origin` is a point in metres in the model's frame, `dir` the way toward the camera and `light` the way toward the Sun, both unit vectors in the model's frame, and `footprint` the width in metres the ray stands for. It returns how much of the ray the model covers, 0 to 1, and puts its colour, already multiplied by that cover, into `out`.
- `rayParts(parts, ids, from, to, x, y, z, dir, light, footprint, out)` does the same against only the parts `ids[from]` to `ids[to − 1]`.

A model has these fields:

| Field | Meaning |
|-------|---------|
| `parts` | Its parts, centred on its middle |
| `r` | Half the diagonal of the box round its body, metres. The long booms and wire antennas are left out of it |
| `reach` | How far its parts reach from its middle, booms and all, metres |
| `point` | What its z axis points at: `'earth'`, `'sun'`, or `'out'`, away from the Sun |
| `view` | The side it is best seen from, a direction in its own frame |
| `col` | Its colour from far off, 0 to 1 |

### Drawing with glyphs

`draw(renderer, s)` adds a model to a renderer's samples, seen through the renderer's camera. `s.model` is the model. `s.x` and `s.y` are where its middle is on the screen and `s.metres` is how many metres a device pixel spans there. `s.frame` holds its `N`, `Q` and `E` in the camera's space, as `orient` gives them, and `s.light` is the way to the Sun. `s.reach`, the reach in device pixels, `s.alpha`, how much of it shows, and `s.fine` can be left out. Each sample casts four rays, or one while `s.fine` is `false`, which suits a moving camera.

## Data

The models are built to the spacecraft's main measurements: Voyager's 3.7 m dish and 13 m magnetometer boom, New Horizons's 2.1 m dish, Pioneer's 2.7 m dish, Parker's 2.3 m heat shield, and JWST's 21 × 14 m sunshield and mirror of 18 segments.

## Needs

The core needs nothing. The drawing layer needs `../glyph-renderer/`. In the explorer, where the spacecraft are comes from `../planet-positions/`. This folder does not need it.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
