# Glyph renderer

This renderer draws a picture in text characters on a canvas. The canvas is divided into character cells, and each cell is sampled at six points, two across and three down. A scene fills those samples with light. Each cell then takes the glyph whose shape best matches its six samples where it holds an edge, or a glyph from a density ramp where it is smooth. The glyph is tinted from a palette of 36 hues and 7 saturations. The grid is drawn with WebGL, or on a 2D canvas where WebGL is missing. With the glyphs turned off, the renderer draws the same samples as a smooth picture instead.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/solar-system/glyph-renderer/. The page draws a ring that turns slowly. It stands still when the system asks for reduced motion. The Glyphs button draws the same ring without the characters. The ring's scene function is in `demo.js`, as a longer example than the one below.

## Using it

```html
<canvas id="sky"></canvas>
<script src="glyph-renderer.js"></script>
<script>
  const g = GlyphRenderer.create(document.getElementById('sky'));
  g.resize(innerWidth, innerHeight, devicePixelRatio, 10);
  g.draw((x, y, out) => {
    const dx = (x - innerWidth / 2) / 200, dy = (y - innerHeight / 2) / 200, z = 1 - dx * dx - dy * dy;
    if (z > 0) out[0] = out[1] = out[2] = Math.max(0, 0.6 * Math.sqrt(z) - 0.5 * dx - 0.5 * dy);
  });
</script>
```

This draws a sphere 400 pixels across, lit from the upper left. `draw` calls the scene once for every sample and draws the grid. A page that moves the picture calls it again each frame.

## Files

- `glyph-renderer.js` sets up `window.GlyphRenderer`.
- `index.html`, `demo.js` and `demo.css` are the demo page. `fonts/` holds the font the page and its characters use.

## API

### Making a renderer

`GlyphRenderer.create(canvas, options)` returns a renderer that draws on the canvas. These options can be left out:

| Option   | Meaning |
|----------|---------|
| `font`   | The CSS font family of the characters. `monospace` by default |
| `weight` | Its weight. 400 by default |
| `view`   | A camera object to use (see Camera) |
| `tune`   | Settings of the glyph matching, by name (see Settings) |
| `glyphs` | `false` starts with the glyphs off (see Without glyphs) |

`GlyphRenderer.tone(x)` is the default tone curve on its own, for pictures drawn without a renderer.

### Size

- `resize(width, height, ratio, fontPx)` sizes the canvas to `width` by `height` CSS pixels at `ratio` device pixels per CSS pixel, and lays the grid out for characters of `fontPx` CSS pixels. A fifth argument of `true` measures the glyphs again, for a font that has just loaded.
- `setFont(fontPx)` lays the grid out for another character size on the same canvas.
- `cellSize(fontPx)` gives the size of a character at that size, `[width, height]` in device pixels. It is the size of a cell while the glyphs are on.
- `font(fontPx)` gives the CSS font string the characters are drawn with at that size.

These read the grid. Every length is in device pixels.

| Property     | Meaning |
|--------------|---------|
| `W`, `H`     | The canvas's size |
| `dpr`        | Device pixels per CSS pixel |
| `cw`, `ch`   | A cell's width and height |
| `cols`, `rows` | The grid's size in cells |
| `fontPx`     | The character size in CSS pixels |
| `gl`         | `true` when the grid is drawn with WebGL |
| `glyphs`     | `true` while the glyphs are on |
| `canvas`     | The canvas. It is a fresh copy when WebGL failed after the first one gave a WebGL context |

### Drawing a scene

`draw(scene)` fills every sample from `scene(x, y, out)` and draws the grid. `x` and `y` are CSS pixels from the canvas's top left. The scene writes the light at that point into `out` as red, green and blue. A light of 1 is full brightness after the tone curve, and more than that saturates.

### Drawing samples by hand

A page with many things to draw fills the samples itself, then composes and presents them. The solar system explorer in `../` works this way.

The samples are kept in arrays, six to a cell. Sample `k` of the cell in column `c` and row `r` is at index `(r * cols + c) * 6 + k`, and `k` is `2 * row + column` within the cell's 2 × 3 grid.

| Property | Meaning |
|----------|---------|
| `red`, `green`, `blue` | The light at each sample (`Float32Array`) |
| `cover` | How much of each cell an opaque body covers, 0 to 1 (`Float32Array`, one per cell). The background shows only where it is under 0.35 |
| `tex` | The map a sample shows, as an id from 1 to 255, or 0 for none (`Uint8Array`) |
| `texU`, `texV`, `texF` | The place on that map, 0 to 1 across and down, and the light that falls on it (`Float32Array`) |

These functions fill them:

- `clear()` sets every sample to dark and empties `cover` and `tex`.
- `sampleX(c, k)` and `sampleY(r, k)` give the device-pixel position of sample `k` of the cell in column `c` and row `r`.
- `add(i, r, g, b)` adds light to sample `i`.
- `splat(x, y, r, g, b)` adds a point of light at device pixel `(x, y)`, shared between the four nearest samples.
- `line(x0, y0, x1, y1, r, g, b)` adds a line of even brightness along its length.
- `cloudStart()`, `cloudAdd(x, y, r, g, b)` and `cloudEnd(perSample, max)` add up a cloud of points on its own and compress its brightness toward `max` before it joins the picture. `perSample` is how many points fall in a sample over the whole cloud. Where the points lie further apart than a sample, the cloud is blurred by about that distance.
- `cloudSpread(x, y, r, g, b, f)` adds a point spread over about `f` samples. `cometEnd(max, gain)` adds a cloud made this way to the picture, compressing the cube root of its brightness toward `max`. It suits a cloud whose light runs over a range of millions, such as a comet's. `spreadLevels` is how many coarser grids it spreads over.
- `setSampler(fn)` sets the function that shades samples which show a map: `fn(id, u, v, out)` writes the colour of map `id` at `(u, v)` into `out`. Those samples are shaded again by every `update`, so a body can turn under a still camera.
- `freeze(i)` turns sample `i`'s map into fixed light, for when something half covers it.

These draw the result:

- `compose(background)` turns every cell into a glyph.
- `update(background, twinkle)` shades again only the cells that show a map. With `twinkle` it also redraws the background's cells.
- `present()` puts the grid on the canvas and returns `true` if anything changed. Without WebGL the cells are drawn as they change and it does nothing.

`background` can be left out. When given, it fills the empty cells: `background.state(cell)` returns a cell's packed state or 0, and `background.cells` lists the cells it uses. `pack(glyph, row, alpha)` packs a state from a glyph index (`glyph(character)`), a palette row (`colourRow(r, g, b)`) and an opacity from 0 to 63.

`drawn` counts the characters drawn by the last `compose` or `update`. Set `moving` while the camera moves. The 2D canvas then skips cells that only change their opacity by one step, and sets `coarse`. A page that draws less detail while moving sets `coarse` too, and draws again in full once the camera stops and `coarse` is set.

`tone(x)` is the renderer's tone curve, which turns light into a brightness from 0 to 1.

### Without glyphs

`setGlyphs(false)` turns the characters off and `setGlyphs(true)` turns them back on. Without glyphs, each sample is one pixel of a picture that is stretched over the canvas and smoothed between samples. A sample's brightest channel goes through the tone curve and the other two are scaled with it, so its colour keeps its hue. A background character becomes a point of light in the middle of its cell, as bright as the character's ink and opacity.

The cells are then half the size of a character, so the picture has four times as many samples, up to 120,000 cells. The grid changes with the switch, so a page fills the samples and draws again after it, as after `setFont`.

### Camera

`view` is a camera for scenes in 3D. It is orthographic. `T` is the point it looks at, `R`, `U` and `B` its right, up and backward directions as unit vectors, `k` the device pixels per unit of length, `span` the screen's height in those units (`H / k`), and `ax` and `ay` where `T` sits on the screen as shares of its width and height. `project(P, out)` puts a point's screen position in device pixels into `out[0]` and `out[1]`, and its depth along `B` into `out[2]`. By default the camera looks at the origin along −z, with x to the right and y up, at one device pixel to a unit. A page sets the fields it needs, keeping `span` equal to `H / k`.

### Settings

`tune` holds the settings, which can be set by name when the renderer is made.

| Setting | Default | Meaning |
|---------|---------|---------|
| `gamma`, `filmic` | 1.0, 2.2 | The tone curve: a filmic shoulder of that strength, then gamma |
| `rampGamma` | 2.0 | How the density ramp's glyphs are spread over brightness |
| `alphaGain`, `alphaPow` | 1.0, 0.6 | A cell's opacity from its mean brightness |
| `edge`, `edgeRel` | 0.25, 0.55 | How uneven a cell's samples must be, outright and against its brightest, to take a shape glyph |
| `contrast` | 2.0 | The power the samples are raised to before their shape is matched |
| `saturation` | 0.92 | How strongly colours are tinted |

## Needs

Nothing. The renderer is one file with no dependencies.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
