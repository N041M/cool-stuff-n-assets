# Text scramble

The scramble makes text resolve out of random glyphs. It is plain JavaScript with no dependencies.

Each character resolves at its own time within 620–800 ms, in a sweep from left to right with some jitter, and now and then from right to left. Until then it changes every 38 ms to a glyph from one of three pools, and one pool is used per element per run. Spaces never change, so the shape of each word holds still. When a run ends, the element holds its exact original text again. A second trigger during a run is ignored. When the system asks for reduced motion, nothing scrambles.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/scramble/. Run again repeats the scramble the bar ran when the page loaded, or the one the dates ran when they scrolled into view.

## Files

- `scramble.js` is the scramble. It needs no CSS and no font.
- `demo.js` runs it on the demo page.
- `demo.css` and `fonts/` style the demo page.

## Using it

`scramble.js` sets up `window.Scramble`. It only animates elements that hold a single text node, which it calls leaves. Mark the containers to scramble with `data-scramble`. A number in the attribute delays that container by that many milliseconds.

```html
<p class="label" data-scramble="180">Label</p>
<a href="#more" data-scramble><span lang="en">More</span><span lang="cs">Více</span></a>
```

The demo page uses these calls:

- `Scramble.all(selector, options)` scrambles every shown leaf inside the matching containers, 40 ms apart in steps that repeat every five leaves. The demo runs it on the top bar when the page loads and when Run again is pressed. After a language switch it runs `Scramble.all("[data-scramble]", { onlyInViewport: true })`, which only touches leaves on screen.
- `Scramble.installClickHandler()` scrambles any leaf inside `[data-scramble]` when it is clicked.
- `Scramble.leaves(el)` lists the leaves under an element, and `Scramble.element(el, delay)` scrambles one of them. The demo uses the pair for the dates the first time they scroll into view, for the text of a section link when it is clicked, and for "Copied" on the copy button.
- `Scramble.streamReveal(text, onFrame, onDone)` reveals a string behind a trailing window of 14 scrambled characters, in about 1.1 s. `onFrame` gets each frame's text, and the last frame is the exact string. The demo uses it for the line that Reveal shows.

`Scramble.element` and `Scramble.streamReveal` return a function that stops the run. `Scramble.isMotionEnabled()` is false when the system asks for reduced motion, and `Scramble.randomGlyph()` returns one glyph from the symbol pool.

## Font

The demo page uses [Departure Mono](https://departuremono.com) by Helena Zhang, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-DepartureMono.txt`.
