# Page background

This is a glyph field drawn behind a page. A fixed canvas is divided into character cells, and each cell draws one glyph. The page shows a plot with a dotted grid and ridgeline traces, with heavy dashes and dots on them that appear and fade out every few seconds. A numbered ruler hangs under the top bar, and the footer sits on water. The whole field scrolls at half the speed of the page.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/page-background/ for the documentation page. It shows each feature in a frame, with the code behind it and the steps to add it to your page.

The demo itself is at http://localhost:8000/page-background/demo.html. Scroll to the end for the water, or press Scroll to the water. The page opens dark, and Light switches it to the light colours.

Add `?feature=water` to the demo's address to show only the water. The footer then sits at the bottom of the window with the water under it.

Add `embed` to the address to show the demo without its bar and Read me, as the frames on the documentation page do. For example `demo.html?feature=water&embed`. The ruler then hangs from the top of the window.

## Files

- `index.html` is the documentation page.
- `demo.html` and `demo.css` are the demo.
- `field.js` is the field.

## Putting it on a page

The field draws on `<canvas id="field">`, fixed to the window behind the page:

```css
#field { position: fixed; inset: 0; width: 100%; height: 100vh; pointer-events: none; z-index: 0; }
.top, main, .foot { position: relative; z-index: 1; }
```

It reads these from the page:

- `--bg` and `--fg` on `:root`. The glyphs are `--fg` at falling opacities on `--bg`. The field redraws when `data-theme` on `<html>` or the system theme changes.
- The IBM Plex Mono font. The glyphs are set in 11 px type in cells of 7 × 14 px. The field waits up to 1.5 s for the font to load before it starts, and a page without it gets the system's monospace font.
- Elements with the class `ko`, which are cut out of the field with a ragged margin so their text stays readable.
- A `.top` bar. The ruler hangs just below it, and a page without one has no ruler.
- An element with `data-shore` under the footer. The water starts below it and reaches its top when the page is scrolled to the end. The demo uses an empty `<div class="shore" data-shore>` 36vh high.

A page that adds `.ko` elements or changes its layout without a resize can call `Field.refresh()` so the field measures the page again.

The field draws at up to 30 frames a second, and only cells whose glyph changed are drawn again. A machine that takes more than 16 ms a frame gets bigger cells. When the system asks for reduced motion, the field shows one still moment and redraws only when the page scrolls or changes.

The cursor trail can run on top of the field. Give its canvas `data-parallax="0.5"` and `data-fill="true"` so its cells line up with the field's and cover them.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
