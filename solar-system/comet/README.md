# Comet

This is Halley's Comet as it comes past the Sun: its coma, its jets, its dust tail and its ion tail, at their real size for any date.

- The coma is a glow round the nucleus, brighter toward the middle as gas streaming out at an even speed is.
- The ion tail is a narrow beam the solar wind blows straight back from the Sun, tipped a few degrees by the comet's own speed. It breaks into thin rays with knots running out along them.
- The dust tail is made as the real one forms. Grains leave the nucleus over the last 45 days, and the Sun's light pushes each one outward with a share of the Sun's pull. Each grain then follows an orbit of its own, so the tail fans out and curves back along the comet's path.
- Most grains leave in three jets from the sunlit side, which sweep round as the nucleus turns every 2.2 days. Halley's activity rose and fell every 7.4 days in 1986, and each rise leaves a band across the dust tail.

All of it grows as the comet comes within about 3 AU of the Sun. Positions are heliocentric ecliptic J2000 coordinates in astronomical units (AU), and dates are Julian days.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/solar-system/comet/. The page draws Halley's Comet in characters, seen from the north of the ecliptic. The buttons beside the date show its 1986 perihelion, today and its 2061 perihelion. While the comet has tails the view frames its head and tails. Further out from the Sun the view shows the whole orbit.

## Using it

The core, `comet.js`, gives the tails as particles.

```html
<canvas id="tails" width="600" height="600" style="background:#000"></canvas>
<script src="comet.js"></script>
<script>
  const jd = 2446499.5, pos = Comet.position(Comet.HALLEY, jd);     // 10 March 1986
  const c = Comet.at(Comet.HALLEY, jd, pos), g = document.getElementById('tails').getContext('2d');
  const dust = Comet.dust(c, { N: [0, 0, 1], Q: [1, 0, 0], E: [0, 1, 0] });
  g.fillStyle = '#ffd';
  for (let i = 0; i < dust.n; i++) if (dust.w[i] > 0) g.fillRect(200 + dust.pos[i * 3] * 1000, 150 - dust.pos[i * 3 + 1] * 1000, 1, 1);
</script>
```

This draws the dust grains as seen from the north pole of the ecliptic, 1,000 pixels to an AU.

For the look of the explorer in `../` (the `solar-system/` folder), add the glyph renderer and the drawing layer:

```html
<canvas id="sky"></canvas>
<script src="../glyph-renderer/glyph-renderer.js"></script>
<script src="comet.js"></script>
<script src="comet-glyphs.js"></script>
<script>
  const g = GlyphRenderer.create(document.getElementById('sky'));
  g.resize(innerWidth, innerHeight, devicePixelRatio, 10);
  const jd = 2446499.5, pos = Comet.position(Comet.HALLEY, jd);
  g.clear();
  Comet.draw(g, { elements: Comet.HALLEY, jd: jd, pos: pos, x: g.W * 0.75, y: g.H * 0.2, scale: g.H * 20, frame: { N: [0, 0, 1], Q: [1, 0, 0], E: [0, 1, 0] } });
  g.compose();
  g.present();
</script>
```

This draws the comet near the top right of the screen, a twentieth of an AU to the screen's height, seen from the north pole of the ecliptic.

## Files

- `comet.js` is the core. It sets up `window.Comet` and needs nothing else.
- `comet-glyphs.js` adds `Comet.draw`. It needs `comet.js` and a renderer from `../glyph-renderer/glyph-renderer.js`.
- `index.html`, `demo.js` and `demo.css` are the demo page. It loads the renderer from `../glyph-renderer/`.
- `fonts/` holds the demo page's font.

## API

### The core

- `HALLEY` holds Halley's orbit: `q`, its perihelion distance in AU, `e`, its eccentricity, `i`, `node` and `peri` in degrees, and `T`, the Julian day of perihelion.
- `position(elements, jd)` gives where a comet on that orbit is, `[x, y, z]` in AU.
- `at(elements, jd, pos, fade)` gives the comet at a moment, from its orbit, the date and where its nucleus is. `fade`, from 0 to 1, scales its activity and can be left out. The result holds these fields:

  | Field | Meaning |
  |-------|---------|
  | `r` | Its distance from the Sun, AU |
  | `coma`, `tail` | How active its coma and its tails are, 0 to 1 |
  | `u` | The way from the Sun to it, a unit vector |
  | `dir` | The way the ion tail points, a unit vector |
  | `length` | The ion tail's length, AU |
  | `comaRadius` | The coma's radius, AU |
  | `coreDays` | How many days gas takes to cross the coma's bright core |

- `dust(comet, frame, key)` gives the dust tail's grains for a comet from `at`. `frame` holds the nucleus's pole `N`, prime meridian `Q` and east `E` as unit vectors, which turn the jets. `key` names the comet, for the table of where its dust has gone, which is worked out again once its date has moved by half an hour. The result holds `n` grains, their positions from the nucleus `pos` (x, y and z in AU, `Float64Array`) and their light `w` (`Float64Array`). A grain on the shaded side has a light of 0.
- `ion(comet)` gives the ion tail's points in the same way.
- `colours` holds the colours of the `dust`, the `ion` tail and the `coma`, 0 to 1. `COMA_KM` is the coma's radius at full activity, km.

The arrays that `dust` and `ion` return are used again by the next call.

### Drawing with glyphs

`draw(renderer, o)` adds the comet to a renderer's samples, seen through the renderer's camera. `o.elements`, `o.jd`, `o.pos`, `o.frame` and `o.fade` are as above, and `o.key` names the comet. `o.x` and `o.y` are where the nucleus is on the screen and `o.scale` is how many of those pixels make an AU there, all in device pixels. `o.gain` and `o.max` set the tails' brightness and the brightness they are compressed toward, and can be left out.

The tails keep their brightness per area as their size on the screen changes. Where they would be shorter than a few characters they are drawn longer, so they show. Once the coma's core fills a tenth of the screen, the coma and the tails dim together as the view goes further in.

## Data

Halley's orbital elements are from the Minor Planet Center, by way of Stellarium. Its jets, its 2.2-day turn and its 7.4-day cycle of activity follow what was seen in 1986.

The orbit is a fixed ellipse and leaves out the pull of the planets, so its returns drift from the real ones. It puts the next perihelion on 8 February 2062, and the predicted date is 28 July 2061. The demo page keeps the orbit's shape and gives it the 2061 perihelion date for dates after the aphelion of late 2023.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.

## Needs

The core needs nothing. The drawing layer needs `../glyph-renderer/`. The explorer places the comet with `../planet-positions/`. This folder works out the comet's position itself, with `position`.
