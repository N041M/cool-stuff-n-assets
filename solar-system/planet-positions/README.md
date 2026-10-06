# Planet positions

This is an ephemeris. It works out where the Sun, the planets, 21 moons, Pluto, Halley's Comet and seven spacecraft are at any moment, and how each body is turned. It also places the nearest stars as they move, the Pleiades, six nebulae, the black hole at the centre of the Milky Way and the star S2 that goes round it, and it gives the frame of the galaxy.

Positions are heliocentric ecliptic J2000 coordinates in astronomical units (AU): x points toward the March equinox and z toward the north pole of the ecliptic. Dates are JavaScript `Date` objects in UTC, and the orbits run on Terrestrial Time, which is UTC plus ΔT.

## Running the demo

From the root of this repository:

```sh
python3 -m http.server
```

Then open http://localhost:8000/solar-system/planet-positions/. The page draws the Sun and the planets on their orbits for today, seen from the north of the ecliptic. Inner planets and All planets set the scale. The buttons beside the date move it a month back or forward, or back to today. The page uses only `ephemeris.js`.

## Using it

```html
<script src="ephemeris.js"></script>
<script>
  const now = new Date();
  const mars = Ephemeris.planetPosition('mars', now);   // [x, y, z] in AU
  const all = Ephemeris.system(now);                     // every body at once
  console.log(all.bodies.moon.pos, all.bodies.saturn.frame.N, Ephemeris.deltaT(Ephemeris.julianDay(now)));
</script>
```

This logs the Moon's position, the direction of Saturn's north pole and ΔT in seconds.

## Files

- `ephemeris.js` sets up `window.Ephemeris`.
- `index.html`, `demo.js` and `demo.css` are the demo page.
- `fonts/` holds the demo page's font.

## API

### Everything at once

`system(date)` returns `{ date, bodies }`. `bodies` holds an entry for each key below, with these fields:

| Field   | Meaning |
|---------|---------|
| `pos`   | Its position, `[x, y, z]` in AU |
| `dist`  | Its distance from the Sun, AU |
| `frame` | How it is turned: `N` its north pole, `Q` its prime meridian and `E` the direction 90° east, as unit vectors, and `W` the angle of its prime meridian in degrees |
| `vel`   | The velocity of the Earth and the Moon, AU per day |
| `off`   | `true` for a spacecraft before its launch, which then sits at the Earth |

These are the keys:

- The Sun, the planets, the Moon and Pluto: `sun`, `mercury`, `venus`, `earth`, `moon`, `mars`, `jupiter`, `saturn`, `uranus`, `neptune` and `pluto`.
- The other moons: `phobos`, `deimos`, `io`, `europa`, `ganymede`, `callisto`, `mimas`, `enceladus`, `tethys`, `dione`, `rhea`, `titan`, `iapetus`, `miranda`, `ariel`, `umbriel`, `titania`, `oberon`, `triton` and `charon`.
- Halley's Comet: `halley`.
- The spacecraft: `voyager1`, `voyager2`, `newhorizons`, `pioneer10`, `pioneer11`, `parker` and `jwst`.
- The stars: `proxima`, `alphacena`, `alphacenb`, `siriusa`, `siriusb`, `vega`, `arcturus`, `polaris`, `betelgeuse` and `rigel`, and Proxima's planets `proximab` and `proximad`.
- The nebulae: `helix`, `orionnebula`, `ringnebula`, `eagle`, `crab` and `carina`.
- The Pleiades: `pleiades` and its stars `alcyone`, `atlas`, `electra`, `maia`, `merope`, `taygeta`, `pleione`, `celaeno` and `asterope`.
- The centre of the galaxy: `sgra` and `s2`.

### One body

- `planetPosition(name, date)` gives a planet's or Pluto's position. For `'earth'` it is the Earth-Moon barycentre.
- `moonVector(date)` gives the Moon's position from the Earth, AU.
- `bodyFrame(name, date)` gives a body's `frame` as above.
- `rotationRate(name)` gives how fast a body turns, degrees per day.
- `orbit(name, date)` gives a planet's orbital elements at a date: `a` (AU), `e`, and `I`, `w`, `node`, `L` and `M` in radians, with `E`, its eccentric anomaly then. `orbitPoint(elements, E)` gives the point at eccentric anomaly `E` on such an orbit, and `orbitPath(name, date, n)` gives `n` points round it. `solveKepler(M, e)` gives the eccentric anomaly for a mean anomaly.
- `smallPosition(elements, jd)` gives the position on an orbit given as `{ q, e, i, node, peri, T }`: perihelion distance in AU, eccentricity, angles in degrees and the Julian day of perihelion. `SMALL` holds those elements for `halley` and `parker`.
- `nearStars(jd)` gives the positions of the nearest stars alone, by key.
- `SGRA_STARS` holds S2's orbit round Sagittarius A*, and `sgraOrbit(key, date)` returns a function of eccentric anomaly that gives points along it.

### Time

- `julianDay(date)` gives the Julian day of a date in UTC.
- `ttDay(date)` gives it in Terrestrial Time.
- `deltaT(jd)` gives ΔT, TT minus UT, in seconds.

### Constants

| Name | Meaning |
|------|---------|
| `AU_KM` | Kilometres in an AU |
| `PLANETS` | The eight planets' keys, in order from the Sun |
| `RADIUS_KM` | The mean radii of the Sun, the planets and the Moon, km |
| `MOONS` | Each moon's planet and mean distance from it, km |
| `ROTATION` | Each body's pole and prime meridian, as the IAU gives them |
| `CRAFT` | The spacecraft leaving the Solar System, as straight lines |
| `GALAXY` | The galaxy's frame: its axes `x`, `y` and `z` as unit vectors, its `centre` in AU, the Sun's distance from the centre `R0` and height above the plane `Z_SUN` in kiloparsecs, `KPC_AU`, and `toEcl(x, y, z)`, which turns galactocentric kiloparsecs into a position |

`longitude(pos)` gives a position's ecliptic longitude in degrees, and `length(v)` a vector's length.

## Accuracy

The planets' orbits hold from 1800 to 2050. Against JPL's DE421 the inner planets are within about an arcminute, Jupiter within 5' and Saturn within 12'. Past those years the planets drift from their real places. The Moon is within 8" of DE421 from 1972 to 2050, which is close enough for an eclipse's shadow.

The other moons are placed on circles at their mean distances, by the turn of a face each keeps to its planet, so their positions are approximate. The spacecraft leaving the Solar System are good to about a degree.

## Data

- The planets: JPL's "Keplerian Elements for Approximate Positions of the Major Planets" (E. M. Standish).
- The Moon: Meeus's truncation of ELP-2000/82, from *Astronomical Algorithms*.
- The poles and rotation of the bodies: the IAU WGCCRE reports.
- ΔT: Espenak and Meeus (NASA, 2006).
- Halley's Comet: orbital elements from the Minor Planet Center.
- The stars: Hipparcos (van Leeuwen 2007) and Gaia DR3, by way of SIMBAD.
- The galaxy's frame and the Sun's place in it: the IAU and Reid et al. (2019, ApJ 885, 131).
- Sagittarius A* and S2: ICRF3 (Gordon, de Witt and Jacobs 2023, AJ 165, 49) and the GRAVITY Collaboration (2020, A&A 636, L5).

The other papers the numbers come from are cited in the comments beside them.

## Font

[IBM Plex Mono](https://github.com/IBM/plex) by IBM, under the SIL Open Font License 1.1. The licence text is in `fonts/LICENSE-IBMPlexMono.txt`.

## Needs

Nothing. It is one file with no dependencies.
