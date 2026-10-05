# cool stuff n assets

This repository holds seven pieces. Each folder has a demo page, the code, the assets it needs and a README. The pieces are plain HTML, CSS and JavaScript with no build step, and each folder runs without the others.

The demos are online at https://n041m.github.io/cool-stuff-n-assets/.

- [`pixel-drive/`](pixel-drive/) is an endless drive drawn as pixel art. A rally car drives a generated route through cities, the coast, a desert, a rally stage, farmland, villages, forest and mountains, with a continuous day, weather, traffic, trains, boats, planes, a village football pitch, Ještěd and a UFO.
- [`globe/`](globe/) is a globe drawn in text and shaded as a lit sphere. It marks Jablonec nad Nisou, can be dragged and zoomed, and names the country under the pointer.
- [`scramble/`](scramble/) makes text resolve out of random glyphs when the page loads, when it is clicked and when it scrolls into view.
- [`page-background/`](page-background/) is a glyph field drawn behind a page. It draws a ridgeline plot on a dotted grid, a numbered ruler under the top bar and water under the footer.
- [`cursor-trail/`](cursor-trail/) is a trail of glyphs the pointer leaves, and a ripple sent out from a click. It runs over any page.
- [`gothic-corridor/`](gothic-corridor/) is a candlelit gothic hall where a servitor swings a censer, raymarched in the browser with WebGL2 from hand-written shaders.
- [`stl-models/`](stl-models/) holds nine generated STL models of armour, terrain, relics and characters in a gothic sci-fi style. The demo turns each one in 3D, draws it in four looks and gives its size and triangle count.

## Running the demos

Serve the repository from its root:

```sh
python3 -m http.server
```

Then open http://localhost:8000/ and pick a demo. The globe fetches its map and the corridor its shaders, so the demos have to come from a server rather than straight from the files.

The drive, the globe, the background and the trail follow the page's light or dark theme. Every piece stops moving when the system asks for reduced motion.

## Licence

Everything in this repository is under the MIT licence in [LICENSE](LICENSE), except for these parts, which keep their own licences:

- [Departure Mono](https://departuremono.com) by Helena Zhang is under the SIL Open Font License 1.1. Each folder that uses it has a copy in `fonts/` with the licence text.
- [three.js](https://threejs.org) in `stl-models/vendor/three/` is under the MIT licence in its own `LICENSE` file.
- The map in `globe/data/` is made from [Natural Earth](https://www.naturalearthdata.com) data, which is in the public domain.
