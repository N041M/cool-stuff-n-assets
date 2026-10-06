/* ==========================================================================
   The catalogue of everything on the map: the names and the labels the HUD
   draws. Positions come from planet-positions/. This file holds only words
   for people.

   name: the name the page reads out when a body takes the focus. label: the
   name the HUD draws. short: the name in the list where the full one is
   long.

   sites: landings, marked on the globe when it is close. Each has its name,
   the date in UTC, and the latitude and east longitude.
   ========================================================================== */
window.BODY_INFO = (function () {
  'use strict';

  var B = {
    sun:       { name: 'Sun', label: 'SUN' },
    mercury:   { name: 'Mercury', label: 'MERCURY' },
    venus:     { name: 'Venus', label: 'VENUS',
                 sites: [
                   { name: 'Venera 7', t: '1970-12-15', at: [-5, -9] },
                   { name: 'Venera 13', t: '1982-03-01', at: [-7.5, -57] }
                 ] },
    earth:     { name: 'Earth', label: 'EARTH' },
    moon:      { name: 'Moon', label: 'MOON',
                 sites: [
                   { name: 'Apollo 11', t: '1969-07-20', at: [0.674, 23.473] },
                   { name: 'Apollo 12', t: '1969-11-19', at: [-3.012, -23.422] },
                   { name: 'Apollo 14', t: '1971-02-05', at: [-3.645, -17.471] },
                   { name: 'Apollo 15', t: '1971-07-30', at: [26.132, 3.634] },
                   { name: 'Apollo 16', t: '1972-04-21', at: [-8.973, 15.5] },
                   { name: 'Apollo 17', t: '1972-12-11', at: [20.191, 30.772] },
                   { name: 'Luna 9', t: '1966-02-03', at: [7.08, -64.37] },
                   { name: 'Lunokhod 1', t: '1970-11-17', at: [38.238, -35.002] },
                   { name: 'Chang’e 4', t: '2019-01-03', at: [-45.445, 177.599] },
                   { name: 'Chandrayaan-3', t: '2023-08-23', at: [-69.373, 32.319] }
                 ] },
    mars:      { name: 'Mars', label: 'MARS',
                 sites: [
                   { name: 'Viking 1', t: '1976-07-20', at: [22.27, -47.95] },
                   { name: 'Viking 2', t: '1976-09-03', at: [47.64, 134.29] },
                   { name: 'Pathfinder', t: '1997-07-04', at: [19.13, -33.22] },
                   { name: 'Spirit', t: '2004-01-04', at: [-14.572, 175.479] },
                   { name: 'Opportunity', t: '2004-01-25', at: [-1.946, -5.527] },
                   { name: 'Phoenix', t: '2008-05-25', at: [68.22, -125.75] },
                   { name: 'Curiosity', t: '2012-08-06', at: [-4.59, 137.442] },
                   { name: 'InSight', t: '2018-11-26', at: [4.502, 135.623] },
                   { name: 'Perseverance', t: '2021-02-18', at: [18.445, 77.451] },
                   { name: 'Zhurong', t: '2021-05-14', at: [25.066, 109.925] }
                 ] },
    jupiter:   { name: 'Jupiter', label: 'JUPITER' },
    saturn:    { name: 'Saturn', label: 'SATURN' },
    uranus:    { name: 'Uranus', label: 'URANUS' },
    neptune:   { name: 'Neptune', label: 'NEPTUNE' },

    phobos:    { name: 'Phobos', label: 'PHOBOS' },
    deimos:    { name: 'Deimos', label: 'DEIMOS' },
    io:        { name: 'Io', label: 'IO' },
    europa:    { name: 'Europa', label: 'EUROPA' },
    ganymede:  { name: 'Ganymede', label: 'GANYMEDE' },
    callisto:  { name: 'Callisto', label: 'CALLISTO' },
    mimas:     { name: 'Mimas', label: 'MIMAS' },
    enceladus: { name: 'Enceladus', label: 'ENCELADUS' },
    tethys:    { name: 'Tethys', label: 'TETHYS' },
    dione:     { name: 'Dione', label: 'DIONE' },
    rhea:      { name: 'Rhea', label: 'RHEA' },
    titan:     { name: 'Titan', label: 'TITAN',
                 sites: [
                   { name: 'Huygens', t: '2005-01-14', at: [-10.573, 167.665] }
                 ] },
    iapetus:   { name: 'Iapetus', label: 'IAPETUS' },
    miranda:   { name: 'Miranda', label: 'MIRANDA' },
    ariel:     { name: 'Ariel', label: 'ARIEL' },
    umbriel:   { name: 'Umbriel', label: 'UMBRIEL' },
    titania:   { name: 'Titania', label: 'TITANIA' },
    oberon:    { name: 'Oberon', label: 'OBERON' },
    triton:    { name: 'Triton', label: 'TRITON' },

    pluto:     { name: 'Pluto', label: 'PLUTO' },
    charon:    { name: 'Charon', label: 'CHARON' },
    halley:    { name: '1P/Halley', label: '1P/HALLEY' },

    voyager1:  { name: 'Voyager 1', label: 'VOYAGER 1' },
    voyager2:  { name: 'Voyager 2', label: 'VOYAGER 2' },
    newhorizons: { name: 'New Horizons', label: 'NEW HORIZONS' },
    pioneer10: { name: 'Pioneer 10', label: 'PIONEER 10' },
    pioneer11: { name: 'Pioneer 11', label: 'PIONEER 11' },
    parker:    { name: 'Parker Solar Probe', label: 'PARKER SOLAR PROBE' },
    jwst:      { name: 'James Webb Space Telescope', label: 'JWST', short: 'JWST' },

    // the nearest stars and Proxima's planets
    proxima:   { name: 'Proxima Centauri', label: 'PROXIMA CENTAURI' },
    proximab:  { name: 'Proxima b', label: 'PROXIMA B' },
    proximad:  { name: 'Proxima d', label: 'PROXIMA D' },
    alphacena: { name: 'Alpha Centauri A', label: 'ALPHA CENTAURI A' },
    alphacenb: { name: 'Alpha Centauri B', label: 'ALPHA CENTAURI B' },

    // other well-known stars, nearest first
    siriusa:   { name: 'Sirius A', label: 'SIRIUS A' },
    siriusb:   { name: 'Sirius B', label: 'SIRIUS B' },
    vega:      { name: 'Vega', label: 'VEGA' },
    arcturus:  { name: 'Arcturus', label: 'ARCTURUS' },

    // a star cluster, drawn like the nebulae
    pleiades:  { name: 'Pleiades', label: 'PLEIADES' },

    // the Pleiades' nine brightest stars, brightest first
    alcyone:   { name: 'Alcyone', label: 'ALCYONE' },
    atlas:     { name: 'Atlas', label: 'ATLAS' },
    electra:   { name: 'Electra', label: 'ELECTRA' },
    maia:      { name: 'Maia', label: 'MAIA' },
    merope:    { name: 'Merope', label: 'MEROPE' },
    taygeta:   { name: 'Taygeta', label: 'TAYGETA' },
    pleione:   { name: 'Pleione', label: 'PLEIONE' },
    celaeno:   { name: 'Celaeno', label: 'CELAENO' },
    asterope:  { name: 'Asterope', label: 'ASTEROPE' },
    polaris:   { name: 'Polaris', label: 'POLARIS' },
    betelgeuse: { name: 'Betelgeuse', label: 'BETELGEUSE' },
    rigel:     { name: 'Rigel', label: 'RIGEL' },

    // nebulae, nearest first
    helix:     { name: 'Helix Nebula', label: 'HELIX NEBULA', short: 'Helix' },
    orionnebula: { name: 'Orion Nebula', label: 'ORION NEBULA', short: 'Orion' },
    ringnebula: { name: 'Ring Nebula', label: 'RING NEBULA', short: 'Ring' },
    eagle:     { name: 'Eagle Nebula', label: 'EAGLE NEBULA', short: 'Eagle' },
    crab:      { name: 'Crab Nebula', label: 'CRAB NEBULA', short: 'Crab' },
    carina:    { name: 'Carina Nebula', label: 'CARINA NEBULA', short: 'Carina' },

    // the black hole at the centre of the galaxy
    sgra:      { name: 'Sagittarius A*', label: 'SGR A*', short: 'Sgr A*' },

    // the star best followed round it
    s2:        { name: 'S2', label: 'S2' },

    // the widest view
    milkyway:  { name: 'Milky Way', label: 'MILKY WAY' }
  };

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

  return { bodies: B, groups: GROUPS };
})();
