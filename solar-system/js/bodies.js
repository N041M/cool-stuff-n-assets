/* ==========================================================================
   The catalogue of everything on the map: the names, the labels the HUD
   draws, and the rotation and orbit periods. Positions come from
   planet-positions/. This file holds only words and numbers for people.

   name: the name in the info panel. label: the name the HUD draws. short:
   the name in the list where the full one is long. day: the rotation
   period in hours, negative for a body that turns backwards, or 'sync' for
   a moon that keeps one face to its planet. year: the orbital period in
   days. round: what it goes round, where that is not the Sun or its planet.
   next: a comet's predicted return, where the planets' pull moves it off a
   plain ellipse. craft: a spacecraft's launch year. size: across in
   light-years, one figure or two. kind: see KINDS. in: the constellation.
   mass: in Suns.

   sites: landings, marked on the globe when it is close and listed in the
   info panel when clicked. Each has its name, the date in UTC, the
   latitude and east longitude, who sent it (see BY), the crew and their
   time on the surface for a crewed landing, and the place.
   ========================================================================== */
window.BODY_INFO = (function () {
  'use strict';

  var B = {
    sun:       { name: 'Sun', label: 'SUN', day: 609.12 },
    mercury:   { name: 'Mercury', label: 'MERCURY', day: 1407.6, year: 87.969 },
    venus:     { name: 'Venus', label: 'VENUS', day: -5832.5, year: 224.701,
                 sites: [
                   { name: 'Venera 7', t: '1970-12-15', at: [-5, -9], by: 'ussr' },
                   { name: 'Venera 13', t: '1982-03-01', at: [-7.5, -57], by: 'ussr' }
                 ] },
    earth:     { name: 'Earth', label: 'EARTH', day: 23.9345, year: 365.256 },
    moon:      { name: 'Moon', label: 'MOON', day: 'sync', year: 27.3217,
                 sites: [
                   { name: 'Apollo 11', t: '1969-07-20', at: [0.674, 23.473], by: 'nasa', crew: 'Neil Armstrong, Buzz Aldrin', stay: '21 h 36 min', place: 'Sea of Tranquillity' },
                   { name: 'Apollo 12', t: '1969-11-19', at: [-3.012, -23.422], by: 'nasa', crew: 'Pete Conrad, Alan Bean', stay: '31 h 31 min', place: 'Ocean of Storms' },
                   { name: 'Apollo 14', t: '1971-02-05', at: [-3.645, -17.471], by: 'nasa', crew: 'Alan Shepard, Edgar Mitchell', stay: '33 h 31 min', place: 'Fra Mauro' },
                   { name: 'Apollo 15', t: '1971-07-30', at: [26.132, 3.634], by: 'nasa', crew: 'David Scott, James Irwin', stay: '66 h 55 min', place: 'Hadley–Apennine' },
                   { name: 'Apollo 16', t: '1972-04-21', at: [-8.973, 15.5], by: 'nasa', crew: 'John Young, Charles Duke', stay: '71 h 2 min', place: 'Descartes Highlands' },
                   { name: 'Apollo 17', t: '1972-12-11', at: [20.191, 30.772], by: 'nasa', crew: 'Eugene Cernan, Harrison Schmitt', stay: '74 h 59 min', place: 'Taurus–Littrow' },
                   { name: 'Luna 9', t: '1966-02-03', at: [7.08, -64.37], by: 'ussr', place: 'Ocean of Storms' },
                   { name: 'Lunokhod 1', t: '1970-11-17', at: [38.238, -35.002], by: 'ussr', place: 'Sea of Rains' },
                   { name: 'Chang’e 4', t: '2019-01-03', at: [-45.445, 177.599], by: 'cnsa', place: 'Von Kármán crater' },
                   { name: 'Chandrayaan-3', t: '2023-08-23', at: [-69.373, 32.319], by: 'isro', place: 'Near the south pole' }
                 ] },
    mars:      { name: 'Mars', label: 'MARS', day: 24.6229, year: 686.98,
                 sites: [
                   { name: 'Viking 1', t: '1976-07-20', at: [22.27, -47.95], by: 'nasa', place: 'Chryse Planitia' },
                   { name: 'Viking 2', t: '1976-09-03', at: [47.64, 134.29], by: 'nasa', place: 'Utopia Planitia' },
                   { name: 'Pathfinder', t: '1997-07-04', at: [19.13, -33.22], by: 'nasa', place: 'Ares Vallis' },
                   { name: 'Spirit', t: '2004-01-04', at: [-14.572, 175.479], by: 'nasa', place: 'Gusev crater' },
                   { name: 'Opportunity', t: '2004-01-25', at: [-1.946, -5.527], by: 'nasa', place: 'Meridiani Planum' },
                   { name: 'Phoenix', t: '2008-05-25', at: [68.22, -125.75], by: 'nasa', place: 'Near the north pole' },
                   { name: 'Curiosity', t: '2012-08-06', at: [-4.59, 137.442], by: 'nasa', place: 'Gale crater' },
                   { name: 'InSight', t: '2018-11-26', at: [4.502, 135.623], by: 'nasa', place: 'Elysium Planitia' },
                   { name: 'Perseverance', t: '2021-02-18', at: [18.445, 77.451], by: 'nasa', place: 'Jezero crater' },
                   { name: 'Zhurong', t: '2021-05-14', at: [25.066, 109.925], by: 'cnsa', place: 'Utopia Planitia' }
                 ] },
    jupiter:   { name: 'Jupiter', label: 'JUPITER', day: 9.925, year: 4332.59 },
    saturn:    { name: 'Saturn', label: 'SATURN', day: 10.656, year: 10759.22 },
    uranus:    { name: 'Uranus', label: 'URANUS', day: -17.24, year: 30688.5 },
    neptune:   { name: 'Neptune', label: 'NEPTUNE', day: 16.11, year: 60182 },

    phobos:    { name: 'Phobos', label: 'PHOBOS', day: 'sync', year: 0.31891 },
    deimos:    { name: 'Deimos', label: 'DEIMOS', day: 'sync', year: 1.26244 },
    io:        { name: 'Io', label: 'IO', day: 'sync', year: 1.769138 },
    europa:    { name: 'Europa', label: 'EUROPA', day: 'sync', year: 3.551181 },
    ganymede:  { name: 'Ganymede', label: 'GANYMEDE', day: 'sync', year: 7.154553 },
    callisto:  { name: 'Callisto', label: 'CALLISTO', day: 'sync', year: 16.689017 },
    mimas:     { name: 'Mimas', label: 'MIMAS', day: 'sync', year: 0.942422 },
    enceladus: { name: 'Enceladus', label: 'ENCELADUS', day: 'sync', year: 1.370218 },
    tethys:    { name: 'Tethys', label: 'TETHYS', day: 'sync', year: 1.887802 },
    dione:     { name: 'Dione', label: 'DIONE', day: 'sync', year: 2.736915 },
    rhea:      { name: 'Rhea', label: 'RHEA', day: 'sync', year: 4.5175 },
    titan:     { name: 'Titan', label: 'TITAN', day: 'sync', year: 15.945421,
                 sites: [
                   { name: 'Huygens', t: '2005-01-14', at: [-10.573, 167.665], by: 'esa', place: 'Near Adiri' }
                 ] },
    iapetus:   { name: 'Iapetus', label: 'IAPETUS', day: 'sync', year: 79.330183 },
    miranda:   { name: 'Miranda', label: 'MIRANDA', day: 'sync', year: 1.413479 },
    ariel:     { name: 'Ariel', label: 'ARIEL', day: 'sync', year: 2.520379 },
    umbriel:   { name: 'Umbriel', label: 'UMBRIEL', day: 'sync', year: 4.144177 },
    titania:   { name: 'Titania', label: 'TITANIA', day: 'sync', year: 8.705872 },
    oberon:    { name: 'Oberon', label: 'OBERON', day: 'sync', year: 13.463239 },
    triton:    { name: 'Triton', label: 'TRITON', day: 'sync', year: -5.876854 },

    pluto:     { name: 'Pluto', label: 'PLUTO', day: -153.29, year: 90560 },
    charon:    { name: 'Charon', label: 'CHARON', day: 'sync', year: 6.3872 },
    halley:    { name: '1P/Halley', label: '1P/HALLEY', comet: true, next: '2061-07-28' },

    voyager1:  { name: 'Voyager 1', label: 'VOYAGER 1', craft: 1977 },
    voyager2:  { name: 'Voyager 2', label: 'VOYAGER 2', craft: 1977 },
    newhorizons: { name: 'New Horizons', label: 'NEW HORIZONS', craft: 2006 },
    pioneer10: { name: 'Pioneer 10', label: 'PIONEER 10', craft: 1972 },
    pioneer11: { name: 'Pioneer 11', label: 'PIONEER 11', craft: 1973 },
    parker:    { name: 'Parker Solar Probe', label: 'PARKER SOLAR PROBE', craft: 2018 },
    jwst:      { name: 'James Webb Space Telescope', label: 'JWST', short: 'JWST', craft: 2021 },

    // the nearest stars and Proxima's planets
    proxima:   { name: 'Proxima Centauri', label: 'PROXIMA CENTAURI', day: 1992, year: 186642750, round: 'Alpha Centauri A and B' },
    proximab:  { name: 'Proxima b', label: 'PROXIMA B', year: 11.18465, round: 'Proxima Centauri' },
    proximad:  { name: 'Proxima d', label: 'PROXIMA D', year: 5.12338, round: 'Proxima Centauri' },
    alphacena: { name: 'Alpha Centauri A', label: 'ALPHA CENTAURI A', day: 528, year: 29133.1, round: 'Alpha Centauri B' },
    alphacenb: { name: 'Alpha Centauri B', label: 'ALPHA CENTAURI B', day: 864, year: 29133.1, round: 'Alpha Centauri A' },

    // other well-known stars, nearest first
    siriusa:   { name: 'Sirius A', label: 'SIRIUS A', year: 18309.4, round: 'Sirius B' },
    siriusb:   { name: 'Sirius B', label: 'SIRIUS B', year: 18309.4, round: 'Sirius A' },
    vega:      { name: 'Vega', label: 'VEGA', day: 16.27 },
    arcturus:  { name: 'Arcturus', label: 'ARCTURUS' },

    // a star cluster, drawn like the nebulae
    pleiades:  { name: 'Pleiades', label: 'PLEIADES', size: [16], kind: 'cluster', in: 'Taurus' },

    // the Pleiades' nine brightest stars, brightest first
    alcyone:   { name: 'Alcyone', label: 'ALCYONE' },
    atlas:     { name: 'Atlas', label: 'ATLAS' },
    electra:   { name: 'Electra', label: 'ELECTRA' },
    maia:      { name: 'Maia', label: 'MAIA', day: 247 },
    merope:    { name: 'Merope', label: 'MEROPE' },
    taygeta:   { name: 'Taygeta', label: 'TAYGETA' },
    pleione:   { name: 'Pleione', label: 'PLEIONE', day: 11.8 },
    celaeno:   { name: 'Celaeno', label: 'CELAENO' },
    asterope:  { name: 'Asterope', label: 'ASTEROPE' },
    polaris:   { name: 'Polaris', label: 'POLARIS' },
    betelgeuse: { name: 'Betelgeuse', label: 'BETELGEUSE' },
    rigel:     { name: 'Rigel', label: 'RIGEL' },

    // nebulae, nearest first
    helix:     { name: 'Helix Nebula', label: 'HELIX NEBULA', short: 'Helix', size: [5.7], kind: 'planetary', in: 'Aquarius' },
    orionnebula: { name: 'Orion Nebula', label: 'ORION NEBULA', short: 'Orion', size: [25], kind: 'forming', in: 'Orion' },
    ringnebula: { name: 'Ring Nebula', label: 'RING NEBULA', short: 'Ring', size: [1, 0.7], kind: 'planetary', in: 'Lyra' },
    eagle:     { name: 'Eagle Nebula', label: 'EAGLE NEBULA', short: 'Eagle', size: [70, 55], kind: 'forming', in: 'Serpens' },
    crab:      { name: 'Crab Nebula', label: 'CRAB NEBULA', short: 'Crab', size: [13, 9], kind: 'remnant', in: 'Taurus' },
    carina:    { name: 'Carina Nebula', label: 'CARINA NEBULA', short: 'Carina', size: [300], kind: 'forming', in: 'Carina' },

    // the black hole at the centre of the galaxy
    sgra:      { name: 'Sagittarius A*', label: 'SGR A*', short: 'Sgr A*', kind: 'hole', in: 'Sagittarius', mass: 4.297e6 },

    // the star best followed round it
    s2:        { name: 'S2', label: 'S2', year: 5860.6, round: 'Sagittarius A*' },

    // the widest view, which the info panel describes
    milkyway:  { name: 'Milky Way', label: 'MILKY WAY' }
  };

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
