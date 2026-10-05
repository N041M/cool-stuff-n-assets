# cool stuff n assets

This repository holds nine pieces. Each folder has a demo page, the code, the assets it needs and a README. The pieces are plain HTML, CSS and JavaScript with no build step, and each folder runs without the others.

The demos are online at https://n041m.github.io/cool-stuff-n-assets/.

- [`pixel-drive/`](pixel-drive/) is an endless drive drawn as pixel art. A rally car drives a generated route through cities, the coast, a desert, a rally stage, farmland, villages, forest and mountains, with a continuous day, weather, traffic, trains, boats, planes, a village football pitch, Ještěd and a UFO.
- [`globe/`](globe/) is a globe drawn in text and shaded as a lit sphere. It marks Jablonec nad Nisou, can be dragged and zoomed, and names the country under the pointer.
- [`scramble/`](scramble/) makes text resolve out of random glyphs when the page loads, when it is clicked and when it scrolls into view.
- [`page-background/`](page-background/) is a glyph field drawn behind a page. It draws a ridgeline plot on a dotted grid, a numbered ruler under the top bar and water under the footer.
- [`cursor-trail/`](cursor-trail/) is a trail of glyphs the pointer leaves, and a ripple sent out from a click. It runs over any page.
- [`gothic-corridor/`](gothic-corridor/) is a candlelit gothic hall where a servitor swings a censer, raymarched in the browser with WebGL2 from hand-written shaders.
- [`stl-models/`](stl-models/) holds nine generated STL models of armour, terrain, relics and characters in a gothic sci-fi style. The demo turns each one in 3D, draws it in four looks and gives its size and triangle count.
- [`solar-system/`](solar-system/) is an explorer of the Solar System drawn in text characters. The planets, their moons, a comet and spacecraft sit where they are on a live clock, and zooming out leads to the nearest stars and the whole galaxy.
- [`crt-boot/`](crt-boot/) is the power-on and power-off sequence of a CRT terminal, with a degauss wave and a start-up log, on glass with scanlines and grain.

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
- VT323 by the VT323 Project Authors and Share Tech Mono by Carrois Type Design, both in `crt-boot/fonts/`, are under the SIL Open Font License 1.1, with their licence texts beside them.
- IBM Plex Mono in `solar-system/fonts/` is under the SIL Open Font License 1.1, with its licence text beside it.
- [three.js](https://threejs.org) in `stl-models/vendor/three/` is under the MIT licence in its own `LICENSE` file.
- The map in `globe/data/` and the Earth in `solar-system/` are made from [Natural Earth](https://www.naturalearthdata.com) data, which is in the public domain. The positions and sizes in `solar-system/` come from published catalogues and papers, listed in its README.
