# Globe

This globe is drawn in text and shaded as a lit sphere. It marks Jablonec nad Nisou and turns slowly until someone drags it. The wheel, a pinch, a double click or the buttons zoom in as far as single countries. The strip under the globe shows the scale and names the country and coordinates under the pointer.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/globe/ for the documentation page, or http://localhost:8000/globe/demo.html for the demo. The globe fetches its map from `data/`, so open the pages from a web server. Opened as a file, the globe shows no land.

The demo takes a few options in its address. `?lang=cs` opens it in Czech, `?theme=light` opens it in the light colours, and `?home` flies the globe to the marked place once it has been drawn. `?embed` shows only the globe, and the documentation page uses it for its frames.

## Files

- `index.html` is the documentation page. It has a section for each part you can change, with a live frame, the code and the steps to add it to a page.
- `demo.html` is the demo.
- `globe.js` draws the globe and handles dragging and zooming.
- `globe.css` holds the fonts, the colours, the buttons, the shading classes and the figure's frame.
- `data/world.png` and `data/world.json` hold the map. Each pixel of the image stores which country it belongs to, and the JSON lists the countries with their ISO codes, label positions and sizes.
- `tools/build-world.js` rebuilds both map files.
- `fonts/` holds IBM Plex Mono. The globe is drawn in it at 11 px, in cells 14 px high. `globe.js` measures the width of a cell once the font has loaded, which is 6.6 px for Plex Mono, and measures it again when the font or its size changes.

## Putting it on a page

The globe goes in a `<pre>` with `data-figure="globe"`, inside a figure that holds its zoom buttons:

```html
<figure class="fig globe-fig">
  <pre class="plot" data-figure="globe" data-world="data/world" aria-hidden="true"></pre>
  <div class="seg globe-zoom" role="group" aria-label="Globe">
    <button type="button" class="btn" data-globe="in" aria-label="Zoom in">+</button>
    <button type="button" class="btn" data-globe="out" aria-label="Zoom out">-</button>
    <button type="button" class="btn" data-globe="home" aria-label="Show Jablonec nad Nisou">JBC</button>
  </div>
</figure>
```

`data-world` is the path of the two map files without their extension. It defaults to `data/world`. The map is fetched when the globe comes within 600 px of the screen.

The wheel only zooms once the globe has been clicked, so scrolling past it still scrolls the page. A pinch on a trackpad always zooms.

Country names come from the browser in the language of `<html lang>`. With `lang="cs"` the names and the coordinates are in Czech. A page that switches language should send a `langchange` event on `document`.

The globe is dark by default. It takes the light colours, including the `--sea-*` and `--land-*` colours in `globe.css`, when `<html>` has `data-theme="light"`. It is drawn only while it is on screen. When the system asks for reduced motion, it stops turning and redraws only when someone drags or zooms it.

The marked place is set in `HOME` near the top of the globe section in `globe.js`.

## Map data

The map is made from [Natural Earth](https://www.naturalearthdata.com)'s 1:50m admin-0 countries, which are in the public domain. To rebuild it, download `ne_50m_admin_0_countries.geojson` from the [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector/tree/master/geojson) repository and run this from the `globe` folder:

```sh
node tools/build-world.js ne_50m_admin_0_countries.geojson data
```

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.
