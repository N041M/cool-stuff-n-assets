# Kissifier

The Kissifier turns a shape into a lipstick print. The print has ridges, thin cracks, weak spots where less ink transferred, and a fine grain. The look is measured from a photo of a real print. Upload a PNG, JPG or SVG on the demo page, set how many ridges, lines and weak spots it has, pick the ink and save the print as a transparent PNG.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/kissifier/. The print renders in a worker, so the page has to come from a server.

## Files

- `kissifier.js` is the generator. It needs no page and no CSS, so it also runs in a worker.
- `render-worker.js` runs `Kissifier.render` off the page's main thread.
- `demo.html`, `demo.js` and `demo.css` are the demo page. `index.html` is the documentation page.
- `kiss.png` is the outline the demo opens on. It is traced from the Pexels photo `pexels-umaykaratas-14716155.jpg`, which is not in this repository.
- `tools/kiss_texture.py` is the Python tool the generator was ported from.
- `fonts/` holds IBM Plex Mono for the demo and documentation pages.

## The demo page

- A transparent image gives its shape by alpha. In an opaque image the shape is everything that differs from the colour along the image's edges.
- The longest side of the image is scaled to 800 px and a 160 px margin is added around it.
- The sliders set the number of ridges (0 to 300), lines (0 to 200) and weak spots (0 to 20). Raising a slider adds features and keeps the ones already there. Lowering it removes the newest.
- The colour wheel sets hue and saturation, and the slider under it sets brightness. Red (#7a1e1e), Bright (#b23a3a) and Brown (#1e100b) are presets. A new ink colour recolours the print without rendering it again.
- New print starts a new recipe with new random features. Download PNG saves the print on a transparent background.

## API

`kissifier.js` sets up `globalThis.Kissifier`.

- `Kissifier.shape(alpha, width, height)` takes a mask with one number from 0 to 1 per pixel, where 1 is ink, and returns a shape. It returns `null` when no pixel is above 0.5. The shape's `A`, `W` and `H` are the mask and its size, and `box` is the bounding box of the pixels above 0.5.
- `Kissifier.newRecipe(seed)` returns an empty recipe.
- `Kissifier.addFeatures(shape, recipe, { ridges, lines, weak }, seed)` adds that many features to the recipe at random places and returns it.
- `Kissifier.render(shape, recipe, color)` returns `{ width, height, data }`, where `data` is RGBA pixels in the colour `#rrggbb` with the print in the alpha channel.

A print about 1000 px wide takes one to two seconds. The same recipe on the same shape always gives the same print.

## Recipes

```json
{
  "seed": 1,
  "pressure": 1.1,
  "ridges": [{ "at": [0.079, 0.5508], "width": 0.0039, "seed": 109342232 }],
  "lines": [{ "at": [0.3341, 0.903], "width": 0.0036, "length": 0.069, "branches": 3, "seed": 411772336 }],
  "weak": [{ "at": [0.72, 0.8], "radius": 0.0647, "strength": 0.5566 }]
}
```

- A ridge is a paper-coloured gap that opens on the outer outline and tapers to its tip at `at`.
- A line is a thin crack centred on `at`, with `branches` side cracks.
- A weak spot is a patch around `at` where less ink transferred. `strength` runs from 0 to 1.
- `at` is a point as fractions of the shape's bounding box, with x across and y down. `width`, `length` and `radius` are fractions of the box width. `pressure` sets the overall ink, and `seed` sets the paper grain.

Each feature has its own `seed`, so adding or removing one does not change the others.

## How shapes come out

- Creases run across the shape and fan out from the centre of its bounding box. They point away from a line through the middle, which is the mouth on a kiss.
- An edge that faces that line is treated as the mouth. Along it the print has a band about 6% of the print width deep, with no ridges or lines. The band is a pale ink film with mottled grain and short striations that follow a smooth curve through the middle of the mouth. On the upper lip the band is pale and fades into the mouth. On the lower lip it is denser and keeps a crisp edge, so the corners of the mouth stay sharp.
- A hole in the shape, such as the inside of an o, is treated as a mouth.
- On a shape without a mouth, such as a circle or a heart, the creases meet in a seam through the middle.
- A shape in several pieces, such as a word, is treated as one print. Its creases fan out from the middle of the whole shape and its features are sized to the whole shape, so thin letters come out mostly as pale band.

## The Python tool

`tools/kiss_texture.py` needs numpy, Pillow, SciPy and scikit-image. Its recipes have the same format, but its random numbers differ, so one recipe gives a different print in each.

```sh
python tools/kiss_texture.py analyze photo.jpg --out kiss_tex/
python tools/kiss_texture.py add kiss.json --shape shape.png --ridges 100 --lines 10 --box 0,0.5,1,1
python tools/kiss_texture.py add kiss.json --shape shape.png --ridges 25 --lines 70 --box 0,0,1,0.5
python tools/kiss_texture.py add kiss.json --shape shape.png --weak 4
python tools/kiss_texture.py render kiss.json --shape shape.png --color "#7A1E1E" --out kiss.png
```

- `analyze` measures a photo of a print. It writes maps of the ink, pressure, creases, grain and crease direction, and `stats.json` with coverage, opacity, crease density, crease spacing and the main crease angles.
- `add` places features and appends them to a recipe, which it creates if it is missing. `--box x0,y0,x1,y1` keeps the new features inside part of the shape, and `--at x,y` puts them at one point.
- `render` draws a recipe on a shape. The shape is a PNG whose alpha is the outline.

The three `add` calls above give a print close to the photo, with ridges mostly on the lower lip and cracks mostly on the upper lip.

## Font

The demo and documentation pages use [IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
