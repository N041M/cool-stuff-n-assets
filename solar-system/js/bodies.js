/* ==========================================================================
   The catalogue of everything on the map: the names, the labels the HUD
   draws, rotation and orbit periods, and a line about each body. Positions
   come from ephemeris.js. This file holds only words and numbers for people.

   name: the name in the info panel. label: the name the HUD draws. short:
   the name in the list where the full one is long. day: the rotation
   period in hours, negative for a body that turns backwards, or 'sync' for
   a moon that keeps one face to its planet. year: the orbital period in
   days. round: what it goes round, where that is not the Sun or its planet.
   next: a comet's predicted return, where the planets' pull moves it off a
   plain ellipse. craft: a spacecraft's launch year. approx: its position is
   approximate. size: across in light-years, one figure or two. kind: see
   KINDS. in: the constellation. mass: in Suns. note: a line about the body.
   unreal: what the picture shows that the real body does not.

   sites: landings, marked on the globe when it is close and described in
   the info panel when clicked. Each has its name, the date in UTC, the
   latitude and east longitude, who sent it (see BY), the crew and their
   time on the surface for a crewed landing, the place and a line about it.
   ========================================================================== */
window.BODY_INFO = (function () {
  'use strict';

  var B = {
    sun:       { name: 'Sun', label: 'SUN', day: 609.12,
                 note: 'A G-type star 4.6 billion years old. It holds 99.86% of the mass of the Solar System.',
                 unreal: 'The sunspots are made up, and in live time it turns 160 times faster than it really does.' },
    mercury:   { name: 'Mercury', label: 'MERCURY', day: 1407.6, year: 87.969,
                 note: 'The smallest planet. Its day side reaches 430 °C and its night side falls to -180 °C.',
                 unreal: 'In live time it turns once every five minutes.' },
    venus:     { name: 'Venus', label: 'VENUS', day: -5832.5, year: 224.701,
                 note: 'The hottest planet, at 465 °C under clouds of sulphuric acid. It turns backwards.',
                 unreal: 'Its cloud markings are made up, and in live time it turns once every five minutes.',
                 sites: [
                   { name: 'Venera 7', t: '1970-12-15', at: [-5, -9], by: 'ussr',
                     note: 'The first spacecraft to send data from the surface of another planet. It lasted 23 minutes at 475 °C.' },
                   { name: 'Venera 13', t: '1982-03-01', at: [-7.5, -57], by: 'ussr',
                     note: 'It took the first colour pictures of the surface of Venus and lasted 127 minutes in the heat and pressure.' }
                 ] },
    earth:     { name: 'Earth', label: 'EARTH', day: 23.9345, year: 365.256,
                 note: 'The only place known to have life. Oceans cover 71% of its surface.',
                 unreal: 'The clouds are made up and move 3,600 times faster than real ones.' },
    moon:      { name: 'Moon', label: 'MOON', day: 'sync', year: 27.3217,
                 note: 'Twelve people have walked on it, the last in December 1972.',
                 unreal: 'In live time it turns once every five minutes, so it does not keep one face to the Earth.',
                 sites: [
                   { name: 'Apollo 11', t: '1969-07-20', at: [0.674, 23.473], by: 'nasa', crew: 'Neil Armstrong, Buzz Aldrin', stay: '21 h 36 min', place: 'Sea of Tranquillity',
                     note: 'The first people to walk on the Moon. They brought back 21.5 kg of rock and dust.' },
                   { name: 'Apollo 12', t: '1969-11-19', at: [-3.012, -23.422], by: 'nasa', crew: 'Pete Conrad, Alan Bean', stay: '31 h 31 min', place: 'Ocean of Storms',
                     note: 'It landed 180 m from Surveyor 3, a probe that had come down two and a half years earlier, and the crew brought parts of it home.' },
                   { name: 'Apollo 14', t: '1971-02-05', at: [-3.645, -17.471], by: 'nasa', crew: 'Alan Shepard, Edgar Mitchell', stay: '33 h 31 min', place: 'Fra Mauro',
                     note: 'Alan Shepard, the first American in space, hit two golf balls here.' },
                   { name: 'Apollo 15', t: '1971-07-30', at: [26.132, 3.634], by: 'nasa', crew: 'David Scott, James Irwin', stay: '66 h 55 min', place: 'Hadley–Apennine',
                     note: 'The first crew to drive on the Moon. They took the Lunar Roving Vehicle 28 km along the foot of the Apennine mountains.' },
                   { name: 'Apollo 16', t: '1972-04-21', at: [-8.973, 15.5], by: 'nasa', crew: 'John Young, Charles Duke', stay: '71 h 2 min', place: 'Descartes Highlands',
                     note: 'The first landing in the lunar highlands. Charles Duke left a photograph of his family on the ground.' },
                   { name: 'Apollo 17', t: '1972-12-11', at: [20.191, 30.772], by: 'nasa', crew: 'Eugene Cernan, Harrison Schmitt', stay: '74 h 59 min', place: 'Taurus–Littrow',
                     note: 'The last people on the Moon so far. Harrison Schmitt was a geologist, the only scientist to have walked there.' },
                   { name: 'Luna 9', t: '1966-02-03', at: [7.08, -64.37], by: 'ussr', place: 'Ocean of Storms',
                     note: 'The first probe to land softly on another world. It sent back the first pictures from the surface of the Moon.' },
                   { name: 'Lunokhod 1', t: '1970-11-17', at: [38.238, -35.002], by: 'ussr', place: 'Sea of Rains',
                     note: 'The first rover on another world, driven from the Earth. It covered 10.5 km in ten months.' },
                   { name: 'Chang’e 4', t: '2019-01-03', at: [-45.445, 177.599], by: 'cnsa', place: 'Von Kármán crater',
                     note: 'The first landing on the far side of the Moon. Its rover, Yutu-2, had driven 1.6 km by 2024.' },
                   { name: 'Chandrayaan-3', t: '2023-08-23', at: [-69.373, 32.319], by: 'isro', place: 'Near the south pole',
                     note: 'The first landing near the Moon’s south pole. Its lander and its rover, Pragyan, worked through one lunar day.' }
                 ] },
    mars:      { name: 'Mars', label: 'MARS', day: 24.6229, year: 686.98,
                 note: 'Olympus Mons, the tallest volcano known, is here. Rovers are still at work on its surface.',
                 unreal: 'In live time it turns once every five minutes.',
                 sites: [
                   { name: 'Viking 1', t: '1976-07-20', at: [22.27, -47.95], by: 'nasa', place: 'Chryse Planitia',
                     note: 'The first spacecraft to land on Mars and keep working. It sent pictures and weather reports for six years.' },
                   { name: 'Viking 2', t: '1976-09-03', at: [47.64, 134.29], by: 'nasa', place: 'Utopia Planitia',
                     note: 'It photographed frost on the ground in the Martian winter and worked for three and a half years.' },
                   { name: 'Pathfinder', t: '1997-07-04', at: [19.13, -33.22], by: 'nasa', place: 'Ares Vallis',
                     note: 'It bounced to a stop on airbags and let out Sojourner, the first rover on Mars.' },
                   { name: 'Spirit', t: '2004-01-04', at: [-14.572, 175.479], by: 'nasa', place: 'Gusev crater',
                     note: 'Planned to last 90 days, it worked for six years. A stuck wheel it dragged behind it dug up silica left by old hot springs.' },
                   { name: 'Opportunity', t: '2004-01-25', at: [-1.946, -5.527], by: 'nasa', place: 'Meridiani Planum',
                     note: 'It drove 45 km over 14 years, until a dust storm round the whole planet covered its solar panels in 2018.' },
                   { name: 'Phoenix', t: '2008-05-25', at: [68.22, -125.75], by: 'nasa', place: 'Near the north pole',
                     note: 'It dug into the ground and found water ice a few centimetres down.' },
                   { name: 'Curiosity', t: '2012-08-06', at: [-4.59, 137.442], by: 'nasa', place: 'Gale crater',
                     note: 'A rover the size of a car, lowered on cables from a hovering crane. It has been climbing Mount Sharp, in the middle of the crater, since 2014.' },
                   { name: 'InSight', t: '2018-11-26', at: [4.502, 135.623], by: 'nasa', place: 'Elysium Planitia',
                     note: 'It listened for marsquakes and recorded over 1,300 of them before dust on its solar panels stopped it in 2022.' },
                   { name: 'Perseverance', t: '2021-02-18', at: [18.445, 77.451], by: 'nasa', place: 'Jezero crater',
                     note: 'It collects rock samples from an old river delta. It brought Ingenuity, the first helicopter to fly on another planet.' },
                   { name: 'Zhurong', t: '2021-05-14', at: [25.066, 109.925], by: 'cnsa', place: 'Utopia Planitia',
                     note: 'China’s first rover on Mars. It drove 1.9 km and went to sleep for the winter in 2022, and dust kept it from waking.' }
                 ] },
    jupiter:   { name: 'Jupiter', label: 'JUPITER', day: 9.925, year: 4332.59,
                 note: 'Twice as massive as all the other planets together. The Great Red Spot is wider than Earth.',
                 unreal: 'Its cloud features are not at their real places, and in live time it turns 160 times faster than it really does.' },
    saturn:    { name: 'Saturn', label: 'SATURN', day: 10.656, year: 10759.22,
                 note: 'Its rings are mostly water ice. They are 280,000 km across and mostly only tens of metres thick.',
                 unreal: 'Its cloud features are not at their real places, and in live time it turns 160 times faster than it really does.' },
    uranus:    { name: 'Uranus', label: 'URANUS', day: -17.24, year: 30688.5,
                 note: 'It is tipped on its side, so each pole has 42 years of daylight and then 42 years of night.',
                 unreal: 'Its cloud features are not at their real places, and in live time it turns 160 times faster than it really does.' },
    neptune:   { name: 'Neptune', label: 'NEPTUNE', day: 16.11, year: 60182,
                 note: 'The windiest planet, with winds up to 2,100 km/h. It was found by calculation in 1846.',
                 unreal: 'Its cloud features are not at their real places, and in live time it turns 160 times faster than it really does.' },

    phobos:    { name: 'Phobos', label: 'PHOBOS', day: 'sync', year: 0.31891,
                 note: 'It spirals closer to Mars every year. In about 50 million years it will break up or crash.' },
    deimos:    { name: 'Deimos', label: 'DEIMOS', day: 'sync', year: 1.26244,
                 note: 'It is only 12 km across. From Mars it looks like a bright star.' },
    io:        { name: 'Io', label: 'IO', day: 'sync', year: 1.769138,
                 note: 'The most volcanic world known, kneaded and heated by Jupiter’s tides.' },
    europa:    { name: 'Europa', label: 'EUROPA', day: 'sync', year: 3.551181,
                 note: 'A shell of ice over a salty ocean holding more water than all of Earth’s seas.' },
    ganymede:  { name: 'Ganymede', label: 'GANYMEDE', day: 'sync', year: 7.154553,
                 note: 'The largest moon in the Solar System, bigger than Mercury, with its own magnetic field.' },
    callisto:  { name: 'Callisto', label: 'CALLISTO', day: 'sync', year: 16.689017,
                 note: 'One of the most cratered surfaces known, barely changed in four billion years.' },
    mimas:     { name: 'Mimas', label: 'MIMAS', day: 'sync', year: 0.942422,
                 note: 'Its crater Herschel is a third as wide as the whole moon.' },
    enceladus: { name: 'Enceladus', label: 'ENCELADUS', day: 'sync', year: 1.370218,
                 note: 'Geysers at its south pole spray an underground ocean into space and feed Saturn’s E ring.' },
    tethys:    { name: 'Tethys', label: 'TETHYS', day: 'sync', year: 1.887802,
                 note: 'It is almost pure water ice, scarred by the 445 km crater Odysseus.' },
    dione:     { name: 'Dione', label: 'DIONE', day: 'sync', year: 2.736915,
                 note: 'Bright cliffs of ice streak its trailing side.' },
    rhea:      { name: 'Rhea', label: 'RHEA', day: 'sync', year: 4.5175,
                 note: 'Saturn’s second largest moon, a ball of ice pocked with craters.' },
    titan:     { name: 'Titan', label: 'TITAN', day: 'sync', year: 15.945421,
                 note: 'It has thicker air than the Earth and lakes of liquid methane. Huygens landed here in 2005.',
                 sites: [
                   { name: 'Huygens', t: '2005-01-14', at: [-10.573, 167.665], by: 'esa', place: 'Near Adiri',
                     note: 'The farthest landing from the Earth. Its pictures show pebbles of water ice on an orange plain.' }
                 ] },
    iapetus:   { name: 'Iapetus', label: 'IAPETUS', day: 'sync', year: 79.330183,
                 note: 'Its leading side is as dark as coal and its trailing side is as bright as snow.' },
    miranda:   { name: 'Miranda', label: 'MIRANDA', day: 'sync', year: 1.413479,
                 note: 'A patchwork world with cliffs up to 20 km high.' },
    ariel:     { name: 'Ariel', label: 'ARIEL', day: 'sync', year: 2.520379,
                 note: 'The brightest of Uranus’s large moons, crossed by long rift valleys.' },
    umbriel:   { name: 'Umbriel', label: 'UMBRIEL', day: 'sync', year: 4.144177,
                 note: 'The darkest of Uranus’s large moons. Its one bright feature is a ring on the floor of the crater Wunda.' },
    titania:   { name: 'Titania', label: 'TITANIA', day: 'sync', year: 8.705872,
                 note: 'Uranus’s largest moon, cut by canyons up to 1,500 km long.' },
    oberon:    { name: 'Oberon', label: 'OBERON', day: 'sync', year: 13.463239,
                 note: 'The outermost of Uranus’s large moons, old and heavily cratered.' },
    triton:    { name: 'Triton', label: 'TRITON', day: 'sync', year: -5.876854,
                 note: 'It orbits backwards, so it was probably captured from the Kuiper belt. Nitrogen geysers erupt from it.' },

    pluto:     { name: 'Pluto', label: 'PLUTO', day: -153.29, year: 90560,
                 note: 'New Horizons flew past in 2015 and found a heart-shaped glacier of nitrogen ice.',
                 unreal: 'In live time it turns once every five minutes.' },
    charon:    { name: 'Charon', label: 'CHARON', day: 'sync', year: 6.3872,
                 note: 'It is so big next to Pluto that the two circle a point in space between them.' },
    halley:    { name: '1P/Halley', label: '1P/HALLEY', comet: true, next: '2061-07-28',
                 note: 'The most famous comet. It last passed the Sun in 1986 and comes back in 2061.' },

    voyager1:  { name: 'Voyager 1', label: 'VOYAGER 1', craft: 1977,
                 note: 'Launched in 1977, it is the farthest thing people have made. It has been in interstellar space since 2012.' },
    voyager2:  { name: 'Voyager 2', label: 'VOYAGER 2', craft: 1977,
                 note: 'The only probe to have visited Uranus and Neptune. It has been in interstellar space since 2018.' },
    newhorizons: { name: 'New Horizons', label: 'NEW HORIZONS', craft: 2006,
                   note: 'It flew past Pluto in 2015 and Arrokoth in 2019, and it is still heading out of the Solar System.' },
    pioneer10: { name: 'Pioneer 10', label: 'PIONEER 10', craft: 1972,
                 note: 'The first probe to cross the asteroid belt and fly past Jupiter, in 1973. Its last signal came in 2003.' },
    pioneer11: { name: 'Pioneer 11', label: 'PIONEER 11', craft: 1973,
                 note: 'The first probe to visit Saturn, in 1979. Like Pioneer 10 it carries a plaque showing who sent it. It has been silent since 1995.' },
    parker:    { name: 'Parker Solar Probe', label: 'PARKER SOLAR PROBE', craft: 2018,
                 note: 'It dives to 6.1 million km above the Sun every 88 days at up to 192 km/s. No spacecraft has gone closer to the Sun or faster.' },
    jwst:      { name: 'James Webb Space Telescope', label: 'JWST', short: 'JWST', craft: 2021,
                 note: 'The largest telescope in space. It circles the L2 point 1.5 million km beyond the Earth, its mirror kept at -230 °C behind a sunshield the size of a tennis court.' },

    // the nearest stars and Proxima's planets
    proxima:   { name: 'Proxima Centauri', label: 'PROXIMA CENTAURI', day: 1992, year: 186642750, round: 'Alpha Centauri A and B',
                 note: 'The nearest star to the Sun, a red dwarf too faint to see without a telescope. Its flares can make it several times brighter within minutes.',
                 unreal: 'Its spots and the tilt of its axis are made up, and in live time it turns 160 times faster than it really does.' },
    proximab:  { name: 'Proxima b', label: 'PROXIMA B', year: 11.18465, round: 'Proxima Centauri', approx: true,
                 note: 'A planet with at least the mass of the Earth, on an orbit warm enough for liquid water. Found in 2016, it is the nearest known planet outside the Solar System.',
                 unreal: 'Nobody has seen it. Its size, its surface, the tilt of its orbit and its place on it are made up.' },
    proximad:  { name: 'Proxima d', label: 'PROXIMA D', year: 5.12338, round: 'Proxima Centauri', approx: true,
                 note: 'It has at least a quarter of the mass of the Earth. It was found in 2022 from a wobble of 40 cm a second that it gives Proxima.',
                 unreal: 'Nobody has seen it. Its size, its surface, the tilt of its orbit and its place on it are made up.' },
    alphacena: { name: 'Alpha Centauri A', label: 'ALPHA CENTAURI A', day: 528, year: 29133.1, round: 'Alpha Centauri B',
                 note: 'A star much like the Sun, a little larger and brighter. Together with B it is the third brightest star in the night sky.',
                 unreal: 'Its spots and the tilt of its axis are made up, and in live time it turns 160 times faster than it really does.' },
    alphacenb: { name: 'Alpha Centauri B', label: 'ALPHA CENTAURI B', day: 864, year: 29133.1, round: 'Alpha Centauri A',
                 note: 'It is a little smaller and cooler than the Sun. Every 80 years it and A swing from 35 AU apart to 11 AU and back.',
                 unreal: 'Its spots and the tilt of its axis are made up, and in live time it turns 160 times faster than it really does.' },

    // other well-known stars, nearest first
    siriusa:   { name: 'Sirius A', label: 'SIRIUS A', year: 18309.4, round: 'Sirius B',
                 note: 'The brightest star in the night sky, twice the mass of the Sun. It and the white dwarf Sirius B circle each other every 50 years.' },
    siriusb:   { name: 'Sirius B', label: 'SIRIUS B', year: 18309.4, round: 'Sirius A',
                 note: 'A white dwarf, the bare core of a dead star, with as much mass as the Sun in a ball smaller than the Earth. Bessel worked out that it was there in 1844 from the way Sirius wobbles, and it was first seen in 1862.' },
    vega:      { name: 'Vega', label: 'VEGA', day: 16.27,
                 note: 'It turns once every 16 hours. That is fast enough to make it 13% wider at its equator than through its poles and over 1,000 °C cooler there. From the Earth we see it almost pole-on.' },
    arcturus:  { name: 'Arcturus', label: 'ARCTURUS',
                 note: 'An orange giant 25 times as wide as the Sun and the brightest star north of the celestial equator. It is about 7 billion years old and moves past the Sun at 122 km/s.',
                 unreal: 'Its spots are made up.' },

    // a star cluster, drawn like the nebulae
    pleiades:  { name: 'Pleiades', label: 'PLEIADES', size: [16], kind: 'cluster', in: 'Taurus',
                 note: 'The Seven Sisters, a cluster of over 1,000 young stars about 100 million years old. Six or seven of them can be seen without a telescope, and the blue haze round them is a cloud of dust the cluster is passing through, lit by their light.',
                 unreal: 'The nine brightest stars are at their real places on the sky. Their depths, the fainter stars and the shape of the haze are made up.' },

    // the Pleiades' nine brightest stars, brightest first
    alcyone:   { name: 'Alcyone', label: 'ALCYONE',
                 note: 'The brightest star of the Pleiades, a blue giant that gives off about 2,000 times as much light as the Sun. It spins so fast that it has thrown a disc of gas off its equator.' },
    atlas:     { name: 'Atlas', label: 'ATLAS',
                 note: 'It is named after the father of the seven sisters. It is two hot stars that go round each other every 291 days, too close together for any but the largest telescopes to see apart.' },
    electra:   { name: 'Electra', label: 'ELECTRA',
                 note: 'The third brightest of the Pleiades, a blue giant that spins fast enough to throw off a disc of gas.' },
    maia:      { name: 'Maia', label: 'MAIA', day: 247,
                 note: 'A blue giant that turns slowly, about once in 10 days. One of the brightest parts of the haze in the Pleiades, the Maia Nebula, lies round it.' },
    merope:    { name: 'Merope', label: 'MEROPE',
                 note: 'A young blue-white star that lights the brightest part of the haze round the Pleiades, the Merope Nebula, which reaches south of it.' },
    taygeta:   { name: 'Taygeta', label: 'TAYGETA',
                 note: 'A blue-white star with a close companion that goes round it every 1,313 days.' },
    pleione:   { name: 'Pleione', label: 'PLEIONE', day: 11.8,
                 note: 'It is named after the mother of the seven sisters. It turns once every 12 hours, close to the speed that would tear it apart, and every few decades it throws off a new disc of gas.' },
    celaeno:   { name: 'Celaeno', label: 'CELAENO',
                 note: 'One of the fainter sisters, a blue-white star about 350 times as bright as the Sun.' },
    asterope:  { name: 'Asterope', label: 'ASTEROPE',
                 note: 'The faintest of the nine, a blue-white star about 100 times as bright as the Sun.' },
    polaris:   { name: 'Polaris', label: 'POLARIS',
                 note: 'The North Star, less than a degree from the celestial pole. It is a supergiant that swells and shrinks every four days, the nearest of the pulsating stars used to measure the distances to other galaxies.',
                 unreal: 'Its spots are made up.' },
    betelgeuse: { name: 'Betelgeuse', label: 'BETELGEUSE',
                  note: 'A red supergiant near the end of its life. Put where the Sun is, it would reach past the orbit of Mars. In early 2020 a cloud of dust it had thrown off dimmed it to less than half its usual brightness.',
                  unreal: 'The bright and dark patches on its surface are made up.' },
    rigel:     { name: 'Rigel', label: 'RIGEL',
                 note: 'A blue supergiant and usually the brightest star in Orion. It gives off around 100,000 times as much light as the Sun.' },

    // nebulae, nearest first
    helix:     { name: 'Helix Nebula', label: 'HELIX NEBULA', short: 'Helix', size: [5.7], kind: 'planetary', in: 'Aquarius',
                 note: 'One of the nearest shells of gas thrown off by a dying star like the Sun. Its inner edge holds about 40,000 knots of gas, each with a tail pointing away from the star.' },
    orionnebula: { name: 'Orion Nebula', label: 'ORION NEBULA', short: 'Orion', size: [25], kind: 'forming', in: 'Orion',
                   note: 'The nearest place where large stars are forming. The four hot young stars of the Trapezium, at its heart, make it glow. Without a telescope it looks like a fuzzy star in the sword of Orion.' },
    ringnebula: { name: 'Ring Nebula', label: 'RING NEBULA', short: 'Ring', size: [1, 0.7], kind: 'planetary', in: 'Lyra',
                  note: 'The shell a dying star like the Sun threw off. It has been spreading for about 1,600 years, and the star left in the middle is a white dwarf.' },
    eagle:     { name: 'Eagle Nebula', label: 'EAGLE NEBULA', short: 'Eagle', size: [70, 55], kind: 'forming', in: 'Serpens',
                 note: 'A cloud where stars are forming round a young cluster. In it are the Pillars of Creation, columns of gas and dust about 4 light-years tall that Hubble photographed in 1995.' },
    crab:      { name: 'Crab Nebula', label: 'CRAB NEBULA', short: 'Crab', size: [13, 9], kind: 'remnant', in: 'Taurus',
                 note: 'It is what is left of a star that exploded. Astronomers in China recorded the explosion on 4 July 1054, bright enough to see by day. At its centre a neutron star about 30 km across spins 30 times a second.' },
    carina:    { name: 'Carina Nebula', label: 'CARINA NEBULA', short: 'Carina', size: [300], kind: 'forming', in: 'Carina',
                 note: 'One of the largest and brightest nebulae in the sky, far larger than the Orion Nebula. Its star Eta Carinae, over 100 times the mass of the Sun, flared in the 1840s into the second brightest star in the night sky.' },

    // the black hole at the centre of the galaxy
    sgra:      { name: 'Sagittarius A*', label: 'SGR A*', short: 'Sgr A*', kind: 'hole', in: 'Sagittarius', mass: 4.297e6,
                 note: 'The black hole at the centre of the Milky Way, 4.3 million times the mass of the Sun. It was weighed by the stars that swing round it, work that won the 2020 Nobel Prize in Physics. In 2022 the Event Horizon Telescope showed the ring of hot gas round its shadow, which would fit inside the orbit of Mercury.',
                 unreal: 'Its colours are made up, as it was photographed in radio waves. The gas round it is drawn as a thin disc, though it is a thick, faint cloud, and the disc’s tilt and the clumps in it are made up too. The clumps go round in 45 minutes, as the flares seen beside it do.' },

    // the star best followed round it
    s2:        { name: 'S2', label: 'S2', year: 5860.6, round: 'Sagittarius A*',
                 note: 'A hot young star about 14 times the mass of the Sun. Every 16 years it swings to within 120 AU of Sagittarius A* at 7,650 km/s, and each time round its orbit turns a little further, as general relativity predicts. Following it is the main way the hole was weighed.' },

    // the widest view, which the info panel describes
    milkyway:  { name: 'Milky Way', label: 'MILKY WAY',
                 note: 'Our galaxy, a spiral with a bar through its centre. The Sun is in the Orion Arm, a short arm between the Sagittarius and Perseus arms.',
                 unreal: 'Nobody has seen it from outside. The arms on our side are drawn where measured distances to young stars put them, and the far side continues them. The other galaxies around it are made up.' }
  };

  // the Pleiades' stars are at their real places on the sky, but not in depth
  ['alcyone', 'atlas', 'electra', 'maia', 'merope', 'taygeta', 'pleione', 'celaeno', 'asterope'].forEach(function (k) {
    B[k].unreal = 'How far it lies in front of or behind the middle of the cluster is made up.';
  });
  // every nebula's picture is a sketch
  ['helix', 'orionnebula', 'ringnebula', 'eagle', 'crab', 'carina'].forEach(function (k) {
    B[k].unreal = 'Its shape is drawn from photographs. Its depth, and how it looks from any other side, are made up.';
  });
  var KINDS = { planetary: 'planetary nebula', forming: 'star-forming region', remnant: 'supernova remnant', cluster: 'star cluster', hole: 'supermassive black hole' };

  // the list in the explorer: planets with their moons, Pluto and Halley,
  // then the stars, the nebulae and the galactic centre, nearest first, and
  // the spacecraft
  var GROUPS = [
    { id: 'planets', name: 'solar system', items: ['sun', 'mercury', 'venus', ['earth', ['moon']], ['mars', ['phobos', 'deimos']],
                                                   ['jupiter', ['io', 'europa', 'ganymede', 'callisto']],
                                                   ['saturn', ['mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'iapetus']],
                                                   ['uranus', ['miranda', 'ariel', 'umbriel', 'titania', 'oberon']], ['neptune', ['triton']],
                                                   ['pluto', ['charon']], 'halley'] },
    { id: 'stars', name: 'stars', items: [['proxima', ['proximab', 'proximad']], 'alphacena', 'alphacenb',
                                          'siriusa', 'siriusb', 'vega', 'arcturus',
                                          ['pleiades', ['alcyone', 'atlas', 'electra', 'maia', 'merope', 'taygeta', 'pleione', 'celaeno', 'asterope']],
                                          'polaris', 'betelgeuse', 'rigel'] },
    { id: 'nebulae', name: 'nebulae', items: ['helix', 'orionnebula', 'ringnebula', 'eagle', 'crab', 'carina'] },
    { id: 'centre', name: 'galactic centre', items: [['sgra', ['s2']]] },
    { id: 'craft', name: 'spacecraft', items: ['voyager1', 'voyager2', 'jwst', 'parker', 'newhorizons', 'pioneer10', 'pioneer11'] }
  ];

  // who sent a landing
  var BY = { nasa: 'NASA', ussr: 'Soviet Union', cnsa: 'CNSA, China', isro: 'ISRO, India', esa: 'ESA' };

  return { bodies: B, groups: GROUPS, by: BY, kinds: KINDS };
})();
