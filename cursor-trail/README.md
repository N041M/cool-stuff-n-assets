# Cursor trail

This is a trail of glyphs the pointer leaves, together with a ripple sent out from a click. As the pointer moves, the character cells it passes over light up in the accent colour with glyphs such as `< > / \ = + * # %`, which flicker and fade out over about half a second. `CursorTrail.pulse(x, y)` sends a ring of the same glyphs out from a point. It grows at 950 px a second and fades out over 1.4 s.

The trail draws on a canvas of its own, so it runs over any page.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/cursor-trail/ for the documentation page. It shows each feature in a frame, with the code behind it and the steps to add it to your page.

The demo itself is at http://localhost:8000/cursor-trail/demo.html. Move the pointer and click anywhere. Trail draws a wave across the window for a screen with no pointer, and Ripple sends a ripple from the button. The page opens dark, and Light switches it to the light colours.

Add `?feature=<id>` to the demo's address to show one of the two on its own:

- `?feature=trail` shows only the trail. Clicks send no ripple.
- `?feature=ripple` shows only the ripple. Moving the pointer leaves no trail.

Add `embed` to the address to show the demo without its back link, name, Read me and theme switch, as the frames on the documentation page do. For example `demo.html?feature=trail&embed`.

## Files

- `index.html` is the documentation page.
- `demo.html` is the demo.
- `cursor-trail.js` is the trail and the ripple.

## Putting it on a page

Load the script with `defer`:

```html
<script defer src="cursor-trail.js"></script>
```

With nothing else on the page, it adds a canvas over the whole window that lets clicks through. The script does not listen for clicks, so a page sends a ripple from each click itself:

```html
<script>
  document.addEventListener("click", function (e) {
    if (window.CursorTrail) CursorTrail.pulse(e.clientX, e.clientY);
  });
</script>
```

To draw the trail behind the page's content instead, add the canvas yourself and give it a lower layer:

```html
<canvas id="trail" aria-hidden="true"></canvas>
```

```css
#trail { position: fixed; inset: 0; width: 100%; height: 100vh; pointer-events: none; z-index: 0; }
main { position: relative; z-index: 1; }
```

Two attributes on that canvas change how it draws:

- `data-parallax` is the share of the page scroll the grid of cells moves with. It is 0 by default. The glyph field in `../page-background/` uses 0.5.
- `data-fill="true"` paints each glyph's cell in `--bg` before the glyph, so the trail covers whatever is under it. Use both attributes to run the trail over the page background in `../page-background/`, so its cells line up with the field's.

It reads these from the page:

- `--accent` on `:root` for the glyphs, and `--bg` for `data-fill`. It picks up a change of `data-theme` on `<html>` or of the system theme.
- The IBM Plex Mono font. The glyphs are set in 11 px type in cells of 7 × 14 px. The trail waits up to 1.5 s for the font to load before it starts, and a page without it gets the system's monospace font.
- Elements with the class `ko`. The trail stays off them and off about half of a ragged margin around them. A page that adds `.ko` elements later can call `CursorTrail.refresh()`.

The script sets up `window.CursorTrail` with `pulse(x, y)`, `stroke(x0, y0, x1, y1)` and `refresh()`. `stroke` lights the cells along a line in CSS pixels, as the pointer does along its path, without joining up with the pointer's own trail. The demo's Trail button draws its wave with it, a short stroke each frame. It also sets `window.Field.pulse` unless the page already has one. The drive in `../pixel-drive/` calls it when its car is clicked.

The trail only draws while something is lit and stops once the last glyph has faded. When the system asks for reduced motion, it draws nothing.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
