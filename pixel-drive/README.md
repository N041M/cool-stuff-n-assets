# Pixel drive

This is an endless drive drawn as pixel art. A rally car drives a route that is generated as it goes, through cities, highways, a bridge, the coast, a desert, a rally stage, farmland, villages, forest, mountain passes and a winter valley. The time of day runs on continuously, with a whole day every 10 minutes, and the weather drifts toward the climate of each place. The moon shows its real phase for the date. The car overtakes slower traffic, weaves through a sprint on the highway and meets oncoming cars. Trains, boats, planes and birds pass now and then. The route also holds a village football pitch, the Ještěd tower above Liberec and, at night, a UFO.

The rules the drive follows are in [docs/drive-rules.md](docs/drive-rules.md). Every change to the drive should be checked against them.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/pixel-drive/. The panel on the page jumps to a place, a time of day, a weather or one of the scenes. Speed runs the drive at 1, 2, 4 or 8 times its pace, and the day and the weather run faster with it. Hop makes the car hop, as clicking it does. Hide setup folds the panel down to the speed and Hop. Clicking the UFO sends it away.

The address takes these options:

- `?drive=ascii` shows the character look.
- `?seed=123` starts the route from a fixed seed.
- `?hour=21.5` starts the day at 21:30.

## Files

- `js/core.js` holds the materials, the light and weather colouring, and the small sprites every picture is drawn into.
- `js/art-nature.js`, `js/art-built.js` and `js/art-beings.js` draw the pictures: plants, buildings and signs, and people, animals and vehicles.
- `js/world.js` holds the places, the regions and the route.
- `js/weather.js` holds the weather, the clouds and the rain and snow.
- `js/scenes.js` holds everything that moves: people, animals, the football pitch, traffic, trains, boats, birds, planes and the UFO.
- `js/ascii.js` redraws the pictures in characters for the character look.
- `js/engine.js` builds the planes of scenery and draws each frame.
- `demo.js` and `demo.css` are the demo page's controls and styles.

The blend between road surfaces in `drawRoad` in `js/engine.js` is unfinished.

## Putting it on a page

Load the nine scripts in the order `index.html` uses, with `defer`. The drive draws on `<canvas id="drive">`, which should be fixed to the window behind the page:

```css
#drive { position: fixed; inset: 0; width: 100%; height: 100vh; pointer-events: none; z-index: 0; }
```

Everything else is optional:

- An element with `data-hero` sets the height of the scene. The road sits at 80% of it. Without one, the scene fills the window.
- The road moves lower to keep clear of any block in `[data-hero] .hero-inner` that would stand above the car.
- The sky starts just below a `.top` bar, or 56 px from the top without one.
- The drive reads `--bg`, `--fg` and `--accent` from `:root`. The car's body is the accent colour, and the scene fades into `--bg` at the bottom. It redraws when `data-theme` on `<html>` or the system theme changes.
- The character look uses the Departure Mono font. The drive waits up to 1.5 s for it to load before it starts.
- A click on the car calls `window.Field.pulse(x, y)` when the page has it. The cursor trail in `../cursor-trail/` provides it.

When the system asks for reduced motion, the drive shows one still picture, generated fresh for each visit.

## Drive

The scripts set up `window.Drive`:

- `Drive.seed` is the seed of the current route.
- `Drive.style` is `"pixel"` or `"ascii"`, and `Drive.setStyle(style)` switches between them.
- `Drive.jump(options)` starts a new route from a place, an hour and a weather, for trying scenes.
- `Drive.hop()` makes the car hop, as a click on it does.
- `Drive.rate` is how many times its normal speed the drive runs at, and `Drive.setRate(n)` sets it from 1 to 8. Each frame then runs that many steps of the scene, so the day, the weather and the traffic run faster too.
- `Drive.refresh()` measures the page again. A page that shows or hides blocks in `[data-hero] .hero-inner` without a resize calls it so the road keeps clear of them.
- `Drive.darkAt(y)` tells whether the scene is dark at a height on the screen. A page can use it to pick light ink for text over the scene.
- `Drive.engine` is the engine's state, for looking around in the console.

`Drive.jump` takes these options, and all of them can be left out:

| Option    | Meaning |
|-----------|---------|
| `place`   | `city`, `highway`, `bridge`, `shore` (coast), `desert`, `rally`, `country` (farmland), `village`, `forest`, `mountains` or `winter` |
| `region`  | `coast`, `lowland`, `hills`, `dry` or `mountains`, for a place that belongs to more than one |
| `hour`    | The hour of the day from 0 to 24, for example `19.5` for 19:30 |
| `weather` | Numbers that hold still until the next jump: `cover`, `precip` and `fog` from 0 to 1, `temp` in °C, `snow` and `wet` from 0 to 1 |
| `seed`    | The seed of the route. It stays the same when left out |
| `pitch`   | `true` puts the football pitch just ahead |
| `silence` | With `pitch`, `true` chooses the minute's silence and `false` one of the other moments |
| `jested`  | `true` puts Ještěd on the horizon. It needs the `hills` region |
| `ufo`     | `true` sends the UFO to the next pasture in the middle distance. It only comes at night in clear air. The next pasture can be a minute or two away, so the demo's UFO button tries routes until one has a pasture just ahead |

For example:

```js
Drive.jump({ place: "village", hour: 21, weather: { precip: 1, temp: -3 } });
Drive.jump({ place: "village", region: "hills", jested: true, hour: 22 });
```

## The football pitch

The pitch is a nod to a referee from the years of communist Czechoslovakia. It has no names, no club and no political symbols. The players wear black armbands, and half of the first pitches of a visit show a minute's silence. Keep the scene as it is. Rule 10 in `docs/drive-rules.md` describes it.

## Font

[Departure Mono](https://departuremono.com) by Helena Zhang, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-DepartureMono.txt`.
