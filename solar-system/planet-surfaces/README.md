# Planet surfaces

These are procedural maps of the Sun and 20 other stars, the eight planets, 21 moons, Pluto, Proxima's two planets and Halley's nucleus, with the rings of Jupiter, Saturn, Uranus and Neptune and the Earth's clouds. The maps are generated in the browser from code and a small land mask, with no image files.

The surfaces follow the real bodies where it matters. The Earth's land and ice come from Natural Earth. The Moon's maria and bright rays, the dark markings and polar caps of Mars, Mercury's Caloris basin, Pluto's heart and features of several moons sit at their real coordinates. The cloud features of the giants, the sunspots, the spots of the other stars, and the sizes and surfaces of Proxima's planets are made up. The other sizes and the ring radii are the measured ones.

A map is equirectangular albedo in RGB: east longitude runs across it from −180° to 180°, and north is at the top.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/solar-system/planet-surfaces/.

The page shows one body's map on a sphere that turns once a minute. Previous and Next step through the Sun, the planets and their moons, Pluto, Halley's Comet and the other stars. The sphere shows the small map at once, and Preparing shows under the name until the full-size map is made. When the system asks for reduced motion, the sphere stands still.

## Using it

```html
<canvas id="map"></canvas>
<script src="earth-map.js"></script>
<script src="surfaces.js"></script>
<script>
  const T = Surfaces.texture('mars');
  Surfaces.refine('mars', Infinity);
  const L = T.levels[0], cv = document.getElementById('map'), img = new ImageData(L.w, L.h);
  for (let i = 0, j = 0; i < L.d.length; i += 3, j += 4) img.data.set([L.d[i], L.d[i + 1], L.d[i + 2], 255], j);
  cv.width = L.w; cv.height = L.h; cv.getContext('2d').putImageData(img, 0, 0);
</script>
```

This draws the full-size map of Mars, 512 × 256. `earth-map.js` is only needed for the Earth.

## Files

- `surfaces.js` sets up `window.Surfaces`.
- `earth-map.js` sets up `window.EARTH_MASK`, the Earth's land, sea and ice at 1024 × 512, run-length encoded. It has to load before the Earth's map is first made.
- `tools/earth-mask.js` rebuilds `earth-map.js` from a Natural Earth country raster with Node. From this folder: `node tools/earth-mask.js world.png`.
- `index.html`, `demo.css` and `demo.js` are the demo page. `demo.js` draws the sphere on a 2D canvas in an orthographic view, reading each pixel's colour from the map.

## API

### The bodies

`BODIES` holds each body by key. These fields describe it:

| Field | Meaning |
|-------|---------|
| `r` | Its equatorial radius, km |
| `f` | Its flattening |
| `shape` | Halley's nucleus only: its three semi-axes as shares of `r` |
| `tex` | The size of its full map, `[width, height]` |
| `kind` | How it is lit: `'star'`, `'rock'`, `'gas'`, `'cloud'` or `'earth'` |
| `col` | Its mean colour, 0 to 1, for when it is too small for its map |
| `haze`, `hazeCol` | How much haze shows toward its limb, and its colour |
| `glow` | How bright the rim of its atmosphere is past its lit limb |
| `limb` | How much a gas giant darkens toward its limb |
| `exposure` | How brightly it is drawn |
| `glowCol` | A star's glow, 0 to 1 |
| `clouds` | The key of the map of clouds laid over its ground, for the Earth |
| `cls` | What it is: `'star'`, `'planet'`, `'moon'`, `'dwarf'` or `'comet'` |
| `parent` | The key of the body it goes round, for a moon or a planet of another star |
| `star` | The key of the star that lights it, where that is not the Sun |
| `host` | The key of the cluster it belongs to, for the Pleiades' stars |

The keys are those of `../planet-positions/`: `sun`, the planets, `moon` and the other moons, `pluto`, `halley`, the stars, `proximab`, `proximad`, the Pleiades' stars and `s2`.

### Maps

- `texture(key)` gives a body's map, making a small version at once if there is none yet. The map holds `w` and `h`, its full size, `levels`, a chain of mip levels from the full size down to 16 pixels across, each `{ w, h, d }` with `d` its RGB bytes, row by row from the north, and `mean`, its mean colour from 0 to 1. A cloud map also holds `share`, how much of the globe is under cloud.
- The full-size level starts as the small version enlarged. `refine(key, ms)` works out the full-size rows for up to `ms` milliseconds and returns how far it has got, 0 to 1. `ready` and `progress` on the map say the same.
- `prepare(key, ms)` makes the small version for up to `ms` milliseconds and returns `true` once it is made, so that a page can make maps while it is idle. `has(key)` says whether a body's map is made.
- `define(key, { size, gen })` adds a map of another kind, made the same way: `size` is `[width, height]` and `gen(lon, lat, x, y, z, out)` writes the colour at east longitude `lon` and latitude `lat` in degrees, with `(x, y, z)` the same point on the unit sphere, into `out`.

### Rings

`ring(key)` gives a planet's rings, or `null`. The rings run from `inner` to `outer`, in units of the planet's equatorial radius, sampled at `n` steps with `scale` steps per unit. `cOp`, `cR`, `cG`, `cB` and `cU` are cumulative sums along them of the opacity, of the lit face's red, green and blue, and of the light that leaks through to the unlit face. A difference of two entries over the steps between them gives the mean over a span, so a ring narrower than a pixel still shows as a faint line.

### Clouds

The Earth's cloud map, `earthclouds`, holds noise in its red channel, with 0.5 as zero, and how bright the cloud tops are in its green channel.

- `cloudCover(lat)` gives how cloudy a latitude is on average.
- `cloudOf(noise, cover, bright)` turns the noise from −1 to 1, the cover and the brightness into how much cloud there is, 0 to 1.
- `cloudWind(lat)` gives the wind that carries the clouds at a latitude, in m/s toward the east.

## Data

- The Earth's land and ice: [Natural Earth](https://www.naturalearthdata.com), which is in the public domain.
- The radii of the stars other than the Sun: the papers cited beside them in `surfaces.js`.

## Needs

It needs no other files or libraries. The maps are made in the browser from the code and the land mask.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
