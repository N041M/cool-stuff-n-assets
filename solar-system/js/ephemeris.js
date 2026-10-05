/* ==========================================================================
   Ephemeris: where the Sun, planets and Moon are at a given moment.

   Planet positions use JPL's "Keplerian Elements for Approximate Positions
   of the Major Planets" (E. M. Standish, table 1, valid 1800–2050). Against
   JPL's DE421 the inner planets are within about an arcminute, Jupiter 5'
   and Saturn 12'. The Moon uses Meeus's truncation of ELP-2000/82 and is
   within 8" of DE421 from 1972 to 2050, which is what an eclipse's shadow
   needs. The orbits run on Terrestrial Time (UTC plus ΔT). The Earth turns
   by Greenwich sidereal time about its precessed pole; the other bodies'
   poles and rotation angles are the IAU WGCCRE values. Everything is
   returned in heliocentric ecliptic J2000 coordinates, in astronomical
   units.
   ========================================================================== */
(function () {
  'use strict';

  var DEG = Math.PI / 180;
  var AU_KM = 149597870.7;
  var OBLIQUITY = 23.4392911 * DEG;

  // a (AU), e, I, L, long. of perihelion, long. of ascending node (degrees),
  // then their rates per Julian century
  var ELEMENTS = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
              [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
              [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
              [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
              [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
              [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
              [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
              [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
              [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
    // Pluto is in the same table, which was made while it was a planet.
    // Its elements describe the Pluto-Charon barycentre.
    pluto:   [[39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
              [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]]
  };
  var PLANETS = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

  // north pole (RA, Dec of the J2000 equator) and prime meridian W = W0 + W1·d
  var ROTATION = {
    sun:     [286.13, 63.87, 84.176, 14.1844000],
    mercury: [281.0103, 61.4155, 329.5988, 6.1385108],
    venus:   [272.76, 67.16, 160.20, -1.4813688],
    earth:   [0, 90, 190.147, 360.9856235],
    moon:    [269.9949, 66.5392, 38.3213, 13.17635815, 0.0031, 0.0130],
    mars:    [317.269202, 54.432516, 176.049863, 350.891982443297],
    jupiter: [268.056595, 64.495303, 284.95, 870.5360000],
    saturn:  [40.589, 83.537, 38.90, 810.7939024],
    uranus:  [257.311, -15.175, 203.81, -501.1600928],
    neptune: [299.36, 43.46, 253.18, 536.3128492],
    pluto:   [132.993, -6.163, 302.695, 56.3625225],
    // major moons (IAU WGCCRE 2015, with the secular drift of their poles,
    // the largest periodic terms in rotationAt() and a small phase
    // correction fitted against the TASS, GUST86 and Lieske theories)
    io:        [268.05, 64.50, 200.39, 203.4889538, -0.009, 0.003],
    europa:    [268.08, 64.51, 34.522, 101.3747235, -0.009, 0.003],
    ganymede:  [268.20, 64.57, 41.664, 50.3176081, -0.009, 0.003],
    callisto:  [268.72, 64.83, 259.51, 21.5710715, -0.009, 0.003],
    mimas:     [40.66, 83.52, 339.56, 381.9945550, -0.036, -0.004],
    enceladus: [40.66, 83.52, 2.32, 262.7318996, -0.036, -0.004],
    tethys:    [40.66, 83.52, 8.95, 190.6979085, -0.036, -0.004],
    dione:     [40.66, 83.52, 357.6, 131.5349316, -0.036, -0.004],
    rhea:      [40.38, 83.55, 232.38, 79.6900478, -0.036, -0.004],
    titan:     [39.4827, 83.4279, 188.8855, 22.5769768, 0, 0],
    iapetus:   [318.16, 75.03, 352.2, 4.5379572, -3.949, -1.143],
    miranda:   [257.43, -15.08, 30.70, -254.6906892, 0, 0],
    ariel:     [257.43, -15.10, 156.22, -142.8356681, 0, 0],
    umbriel:   [257.43, -15.10, 108.05, -86.8688923, 0, 0],
    titania:   [257.43, -15.10, 77.74, -41.3514316, 0, 0],
    oberon:    [257.43, -15.10, 6.77, -26.7394932, 0, 0],
    triton:    [299.36, 41.17, 296.53, -61.2572637, 0, 0],
    phobos:    [317.67071657, 52.88627266, 35.18774440, 1128.84475928, -0.10844326, -0.06134706],
    deimos:    [316.65705808, 53.50992033, 79.39932954, 285.16188899, -0.10518014, -0.05979094],
    charon:    [132.993, -6.163, 122.695, 56.3625225, 0, 0],
    // The nearest stars' spin axes are not known, so these poles are
    // chosen. Their rates are from their measured rotation periods: Proxima
    // 83 days (Suarez Mascareno et al. 2016), Alpha Centauri A 22 days and
    // B 36 days (Bazot et al. 2007, DeWarf et al. 2010). Proxima's planets
    // are taken to keep one face to it, on orbits seen face-on from the
    // Sun, as their tilts are not known either. Their rates are their
    // orbital periods, 11.18465 and 5.12338 days (Suarez Mascareno et al.
    // 2025).
    proxima:   [100.0, 20.0, 0, 4.3373494],
    alphacena: [40.0, 30.0, 0, 16.3636364],
    alphacenb: [40.0, 30.0, 0, 9.9447514],
    proximab:  [37.42894, 62.67949, 0, 32.1869705],
    proximad:  [37.42894, 62.67949, 140, 70.2661134],
    // Vega's pole is 6.2 degrees from the line of sight at position angle
    // -58 degrees, and it turns in 0.678 days (Monnier et al. 2012, Alina et
    // al. 2012). The other stars' rotation has not been measured, so they
    // do not turn.
    vega:      [105.6796, -35.3174, 0, 530.9734513],
    // Sagittarius A*: the gas round it. The flares GRAVITY followed went
    // round clockwise on the sky about once in 45 minutes (GRAVITY
    // Collaboration 2018, A&A 618, L10), so its pole points away from the
    // Earth. How far it tips from the line of sight, 25 degrees here toward
    // north, is a guess.
    sgra:      [266.4168085, -4.0078378, 0, 11520]
  };

  // moons: parent and mean distance (km). A tidally locked moon keeps its
  // prime meridian toward its planet, so its rotation gives its place in
  // its orbit.
  var MOONS = {
    io: ['jupiter', 421700], europa: ['jupiter', 671034], ganymede: ['jupiter', 1070412], callisto: ['jupiter', 1882709],
    mimas: ['saturn', 185539], enceladus: ['saturn', 238042], tethys: ['saturn', 294672], dione: ['saturn', 377415],
    rhea: ['saturn', 527068], titan: ['saturn', 1221870], iapetus: ['saturn', 3560820],
    miranda: ['uranus', 129900], ariel: ['uranus', 190900], umbriel: ['uranus', 266000], titania: ['uranus', 435910], oberon: ['uranus', 583520],
    triton: ['neptune', 354759], phobos: ['mars', 9376], deimos: ['mars', 23463], charon: ['pluto', 19591],
    // Proxima's planets: 0.04848 and 0.02881 AU (Suarez Mascareno et al. 2025)
    proximab: ['proxima', 7252505], proximad: ['proxima', 4309914]
  };

  /* ------------------------------------------------------------------------
     The stars. Each moves in a straight line from where the catalogue puts
     it at its epoch: right ascension and declination (J2000, degrees),
     proper motion in right ascension and declination (mas a year), parallax
     (mas) and radial velocity (km/s). Proxima is from Gaia DR3 by way of
     SIMBAD. A pair is placed by its barycentre, and its two stars go round
     it. Alpha Centauri's barycentre, the orbit of B about A and the stars'
     mass fraction are Akeson et al.'s (2021, AJ 162, 14).
     The other stars are from Hipparcos (van Leeuwen 2007) by way of SIMBAD,
     with these distances: Sirius from the parallax Bond et al. adopt (2017,
     ApJ 840, 70), Polaris from Gaia DR3's parallax of its companion Polaris
     B as Evans et al. use it (2024, ApJ 971, 190) and Betelgeuse from Joyce
     et al. (2020, ApJ 902, 63). Hipparcos solved Sirius for its barycentre,
     so its motion is the pair's. The orbit of Sirius B about A, the share
     of the separation that puts A and Sirius's radial velocity without A's
     gravitational redshift are Bond et al.'s.
     ------------------------------------------------------------------------ */
  var NEAR = {
    proxima: { ra: 217.4289423, dec: -62.6794902, pm: [-3781.741, 769.465], plx: 768.0665, rv: -20.578, ep: 2000.0 },
    alphacen: { ra: 219.8589228, dec: -60.8316319, pm: [-3639.95, 700.40], plx: 750.81, rv: -22.3796, ep: 2019.5 },
    sirius: { ra: 101.287155, dec: -16.716116, pm: [-546.01, -1223.07], plx: 378.9, rv: -8.47, ep: 2000.0 },
    vega: { ra: 279.234735, dec: 38.783689, pm: [200.94, 286.23], plx: 130.23, rv: -13.5, ep: 2000.0 },
    arcturus: { ra: 213.915300, dec: 19.182409, pm: [-1093.39, -2000.06], plx: 88.83, rv: -5.229, ep: 2000.0 },
    polaris: { ra: 37.954561, dec: 89.264109, pm: [44.48, -11.85], plx: 7.3045, rv: -16.42, ep: 2000.0 },
    betelgeuse: { ra: 88.792939, dec: 7.407064, pm: [27.54, 11.30], plx: 5.95, rv: 21.91, ep: 2000.0 },
    rigel: { ra: 78.634467, dec: -8.201638, pm: [1.31, 0.50], plx: 3.78, rv: 17.8, ep: 2000.0 }
  };
  // the second star about the first: semi-major axis (arcsec), e, i, node,
  // argument of periastron (degrees), period and time of periastron (Julian
  // years), the first star's share of the pair's mass, and the two stars
  var PAIRS = {
    alphacen: { a: 17.4930, e: 0.51947, i: 79.2430, node: 205.073, peri: 231.519, P: 79.762, T: 1955.564, fA: 0.54266,
                stars: ['alphacena', 'alphacenb'] },
    sirius: { a: 7.4957, e: 0.59142, i: 136.336, node: 45.400, peri: 149.161, P: 50.1284, T: 1994.5715, fA: 0.66966,
              stars: ['siriusa', 'siriusb'] }
  };
  var PC_AU = 206264.806247, AU_YR = 365.25 * 86400 / AU_KM;
  // a star's position (heliocentric equatorial, AU) at Julian year y, with
  // the unit vectors east, north and away from the Sun at it
  function nearAt(c, y) {
    var r0 = radec(c.ra, c.dec), ra = c.ra * DEG, de = c.dec * DEG, d = 1000 / c.plx;
    var east = [-Math.sin(ra), Math.cos(ra), 0], north = [-Math.sin(de) * Math.cos(ra), -Math.sin(de) * Math.sin(ra), Math.cos(de)];
    var t = y - c.ep, ve = d * c.pm[0] / 1000, vn = d * c.pm[1] / 1000, vr = c.rv * AU_YR;
    var pos = [0, 1, 2].map(function (i) { return d * PC_AU * r0[i] + t * (ve * east[i] + vn * north[i] + vr * r0[i]); });
    return { pos: pos, east: east, north: north, away: r0 };
  }
  // where the second star of a pair is from the first on the sky (east,
  // north, away; AU) at Julian year y; peri, when given, in place of o.peri
  function pairRelative(o, y, plx, peri) {
    var M = 2 * Math.PI * (y - o.T) / o.P, e = o.e;
    M = Math.atan2(Math.sin(M), Math.cos(M));
    var E = M + 0.85 * e * (M >= 0 ? 1 : -1);
    for (var k = 0; k < 50; k++) { var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= dE; if (Math.abs(dE) < 1e-13) break; }
    return orbitOnSky(o, E, o.a / (plx / 1000), peri == null ? o.peri : peri);
  }
  // the point at eccentric anomaly E of an orbit on the sky, a AU across
  // its semi-major axis, with its periastron at peri degrees
  function orbitOnSky(o, E, a, peri) {
    var e = o.e, nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2)), r = a * (1 - e * Math.cos(E));
    var u = peri * DEG + nu, O = o.node * DEG, i = o.i * DEG;
    return { n: r * (Math.cos(u) * Math.cos(O) - Math.sin(u) * Math.sin(O) * Math.cos(i)),
             e: r * (Math.cos(u) * Math.sin(O) + Math.sin(u) * Math.cos(O) * Math.cos(i)), z: r * Math.sin(u) * Math.sin(i) };
  }
  // every star, heliocentric ecliptic J2000 (AU), at a Julian day
  function nearStars(jd) {
    var y = 2000 + (jd - 2451545.0) / 365.25, out = {};
    Object.keys(NEAR).forEach(function (k) {
      var C = nearAt(NEAR[k], y), o = PAIRS[k];
      if (!o) { out[k] = eqToEcl(C.pos); return; }
      var rel = pairRelative(o, y, NEAR[k].plx), fA = o.fA;
      var d = [0, 1, 2].map(function (i) { return rel.e * C.east[i] + rel.n * C.north[i] + rel.z * C.away[i]; });
      out[o.stars[0]] = eqToEcl([0, 1, 2].map(function (i) { return C.pos[i] - (1 - fA) * d[i]; }));
      out[o.stars[1]] = eqToEcl([0, 1, 2].map(function (i) { return C.pos[i] + fA * d[i]; }));
    });
    return out;
  }

  // Nebulae and the Pleiades, fixed where the catalogues put their
  // centres: right ascension and declination (J2000, degrees) and distance
  // in light-years. The Ring and the Helix are at the distances Gaia's
  // parallaxes of their central stars give, and the Pleiades at the
  // distance Gaia's parallaxes of its stars give, about 136 parsecs. The
  // Orion Nebula is at Kounkel et al.'s (2017, ApJ 834, 142) distance, and
  // the others are at the usual estimates, which are uncertain by 7 to 25%.
  var NEBULAE = {
    pleiades: [56.75, 24.1167, 444],
    helix: [337.41063, -20.83711, 655], orionnebula: [83.82, -5.3875, 1270], ringnebula: [283.39624, 33.02913, 2570],
    eagle: [274.68792, -13.78694, 5700], crab: [83.6325, 22.0175, 6500], carina: [161.28542, -59.86778, 8500]
  };
  var NEB_POS = {};
  Object.keys(NEBULAE).forEach(function (k) {
    var n = NEBULAE[k], u = eqToEcl(radec(n[0], n[1])), d = n[2] * 63241.077;
    NEB_POS[k] = [u[0] * d, u[1] * d, u[2] * d];
  });
  // The Pleiades' nine brightest stars at their places on the sky (J2000,
  // degrees, from SIMBAD) and how many light-years further away than the
  // cluster's centre each one is. Those depths are made up.
  var PLEIADES = {
    alcyone: [56.871152, 24.105137, 0], atlas: [57.290594, 24.053417, 1.2], electra: [56.218905, 24.113336, -0.8],
    maia: [56.456695, 24.367746, 0.6], merope: [56.581558, 23.948356, -1.4], taygeta: [56.302066, 24.467282, 1.8],
    pleione: [57.296734, 24.136712, 1.0], celaeno: [56.200898, 24.289469, -2.1], asterope: [56.47699, 24.55451, 1.5]
  };
  Object.keys(PLEIADES).forEach(function (k) {
    var s = PLEIADES[k], u = eqToEcl(radec(s[0], s[1])), d = (NEBULAE.pleiades[2] + s[2]) * 63241.077;
    NEB_POS[k] = [u[0] * d, u[1] * d, u[2] * d];
  });

  // Bodies on plain orbits, heliocentric ecliptic J2000: q (AU), e, i, node,
  // peri (argument of perihelion) and T (JD of perihelion). Halley is from
  // the Minor Planet Center via Stellarium. Parker Solar Probe has kept one
  // orbit since its last Venus flyby on 6 November 2024: its period and
  // perihelion distance come from its perihelia of 24 December 2024 and
  // 15 September 2025, and the rest from passing through Venus at the flyby
  // in Venus's orbital plane.
  var SMALL = {
    halley:   { q: 0.5871036, e: 0.9672769, i: 162.24217, node: 58.86013, peri: 111.86566, T: 2446470.95895 },
    parker:   { q: 0.0458536, e: 0.8819761, i: 3.39448, node: 76.61084, peri: 67.94309, T: 2460668.99514, launch: 2458342.81 }
  };

  // Spacecraft leaving the solar system, as straight lines: the direction
  // they are heading (RA, Dec), a distance from the Sun at a date, their
  // speed (AU a year) and the launch (JD). Good to a degree or so, which is
  // what a dot at 150 AU needs. The line only holds once they are well out;
  // before that they ease out from where the Earth was at launch.
  var CRAFT = {
    voyager1:     [257.6, 12.1, 121.6, 2456164.5, 3.574, 2443392.04],   // crossed the heliopause 2012-08-25
    voyager2:     [300.2, -57.3, 119.0, 2458427.5, 3.254, 2443376.10],  // crossed it 2018-11-05
    newhorizons:  [290.6, -20.4, 43.3, 2458484.5, 2.98, 2453755.29],    // passed Arrokoth 2019-01-01
    pioneer10:    [80.0, 26.1, 81.6, 2452662.5, 2.54, 2441379.58],      // last signal 2003-01-23
    pioneer11:    [284.3, -8.9, 44.4, 2449990.5, 2.37, 2441778.59]      // end of the mission 1995-09-30
  };
  var CRAFT_LINE_AU = 10;
  // JWST circles the Sun-Earth L2 point, 1.5 million km beyond the Earth;
  // it is drawn at the point itself, which it reached a month after launch
  var L2_KM = 1.5e6, JWST_LAUNCH = 2459574.01, JWST_AT_L2 = 2459604.29;

  // mean radius, km
  var RADIUS_KM = {
    sun: 695700, mercury: 2439.7, venus: 6051.8, earth: 6371.0, moon: 1737.4, mars: 3389.5,
    jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622
  };

  function julianDay(date) { return date.getTime() / 86400000 + 2440587.5; }

  // ΔT = TT - UT in seconds: how far the Earth's turning has fallen behind
  // a uniform clock. Espenak and Meeus's fits (NASA, 2006) up to 2005, the
  // observed values from then to 2025, then a guess that rises slowly and
  // joins their long-term parabola by 2150.
  var DT_OBSERVED = [[2005, 64.69], [2010, 66.07], [2015, 67.64], [2020, 69.36], [2025, 69.20]];
  function deltaT(jd) {
    var y = 2000 + (jd - 2451545.0) / 365.25, t, u;
    if (y < -500 || y >= 2150) { u = (y - 1820) / 100; return -20 + 32 * u * u; }
    if (y < 500) { u = y / 100; return 10583.6 - 1014.41 * u + 33.78311 * u * u - 5.952053 * u * u * u - 0.1798452 * Math.pow(u, 4) + 0.022174192 * Math.pow(u, 5) + 0.0090316521 * Math.pow(u, 6); }
    if (y < 1600) { u = (y - 1000) / 100; return 1574.2 - 556.01 * u + 71.23472 * u * u + 0.319781 * u * u * u - 0.8503463 * Math.pow(u, 4) - 0.005050998 * Math.pow(u, 5) + 0.0083572073 * Math.pow(u, 6); }
    if (y < 1700) { t = y - 1600; return 120 - 0.9808 * t - 0.01532 * t * t + t * t * t / 7129; }
    if (y < 1800) { t = y - 1700; return 8.83 + 0.1603 * t - 0.0059285 * t * t + 0.00013336 * t * t * t - Math.pow(t, 4) / 1174000; }
    if (y < 1860) { t = y - 1800; return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * t * t * t - 0.00037436 * Math.pow(t, 4) + 0.0000121272 * Math.pow(t, 5) - 0.0000001699 * Math.pow(t, 6) + 0.000000000875 * Math.pow(t, 7); }
    if (y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * t * t * t - 0.0004473624 * Math.pow(t, 4) + Math.pow(t, 5) / 233174; }
    if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t * t * t - 0.000197 * Math.pow(t, 4); }
    if (y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * t * t * t; }
    if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + t * t * t / 2547; }
    if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - t * t * t / 718; }
    if (y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t * t * t + 0.000651814 * Math.pow(t, 4) + 0.00002373599 * Math.pow(t, 5); }
    if (y < 2025) {
      for (var i = 1; y > DT_OBSERVED[i][0]; i++);
      var a = DT_OBSERVED[i - 1], b = DT_OBSERVED[i];
      return a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0]);
    }
    if (y < 2050) return 69.2 + 0.1 * (y - 2025);
    u = (y - 1820) / 100; t = (y - 2050) / 100;
    return 71.7 * (1 - t) + (-20 + 32 * u * u) * t;
  }
  // a Julian day in Terrestrial Time, the uniform clock the orbits run on
  function ttDay(date) { var jd = julianDay(date); return jd + deltaT(jd) / 86400; }

  function norm360(x) { x %= 360; return x < 0 ? x + 360 : x; }

  // equatorial (J2000) unit vector -> ecliptic
  function eqToEcl(v) {
    var c = Math.cos(OBLIQUITY), s = Math.sin(OBLIQUITY);
    return [v[0], c * v[1] + s * v[2], -s * v[1] + c * v[2]];
  }
  function radec(ra, dec) {
    ra *= DEG; dec *= DEG;
    return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
  }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

  // orbital elements at T (Julian centuries from J2000)
  function elementsAt(name, T) {
    var e0 = ELEMENTS[name][0], r = ELEMENTS[name][1];
    var a = e0[0] + r[0] * T, e = e0[1] + r[1] * T, I = (e0[2] + r[2] * T) * DEG;
    var L = e0[3] + r[3] * T, peri = e0[4] + r[4] * T, node = e0[5] + r[5] * T;
    return { a: a, e: e, I: I, L: L * DEG, w: (peri - node) * DEG, node: node * DEG, M: norm360(L - peri) * DEG };
  }

  function solveKepler(M, e) {
    if (M > Math.PI) M -= 2 * Math.PI;
    var E = M + e * Math.sin(M);
    for (var i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    return E;
  }

  // position on an orbit at eccentric anomaly E, in the ecliptic frame
  function orbitPoint(el, E) {
    var xp = el.a * (Math.cos(E) - el.e), yp = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
    var cw = Math.cos(el.w), sw = Math.sin(el.w), cn = Math.cos(el.node), sn = Math.sin(el.node);
    var ci = Math.cos(el.I), si = Math.sin(el.I);
    return [
      (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
      (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
      (sw * si) * xp + (cw * si) * yp
    ];
  }

  // a planet's position at jde (a Julian day in Terrestrial Time); for
  // 'earth' the table gives the Earth-Moon barycentre
  function planetAt(name, jde) {
    var el = elementsAt(name, (jde - 2451545.0) / 36525);
    return orbitPoint(el, solveKepler(el.M, el.e));
  }
  function planetPosition(name, date) { return planetAt(name, ttDay(date)); }

  // a planet's orbital elements at a date, with its current eccentric anomaly E
  function orbit(name, date) {
    var T = (ttDay(date) - 2451545.0) / 36525;
    var el = elementsAt(name, T);
    el.E = solveKepler(el.M, el.e);
    return el;
  }

  // the whole orbit, sampled evenly in eccentric anomaly
  function orbitPath(name, date, n) {
    var T = (ttDay(date) - 2451545.0) / 36525;
    var el = elementsAt(name, T), out = [];
    for (var i = 0; i < n; i++) out.push(orbitPoint(el, (i / n) * 2 * Math.PI));
    return out;
  }

  // Precession of the equator between J2000 and a date T centuries later
  // (IAU 1976, Meeus, Astronomical Algorithms, ch. 21). Equatorial vectors.
  function rotZ(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]; }
  function rotY(v, a) { var c = Math.cos(a), s = Math.sin(a); return [v[0] * c - v[2] * s, v[1], v[0] * s + v[2] * c]; }
  function precession(T) {
    var as = DEG / 3600;
    return { zeta: (2306.2181 * T + 0.30188 * T * T + 0.017998 * T * T * T) * as,
             z: (2306.2181 * T + 1.09468 * T * T + 0.018203 * T * T * T) * as,
             theta: (2004.3109 * T - 0.42665 * T * T - 0.041833 * T * T * T) * as };
  }
  function ofDateToJ2000(v, p) { return rotZ(rotY(rotZ(v, -p.z), -p.theta), -p.zeta); }
  // mean obliquity of the ecliptic of date
  function obliquity(T) { return (23.4392911 - (46.8150 * T + 0.00059 * T * T - 0.001813 * T * T * T) / 3600) * DEG; }

  // The Moon: Meeus's truncation of ELP-2000/82 (Astronomical Algorithms,
  // ch. 47), good to about 10" in longitude and 4" in latitude. Each row is
  // the multiples of D, M, M', F and the coefficients of the sine in
  // longitude (1e-6 degrees) and of the cosine in distance (1e-3 km).
  var MOON_LR = [
    [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
    [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
    [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
    [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
    [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
    [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
    [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
    [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
    [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
    [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
    [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
    [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
    [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0],
    [3, 0, -1, 0, -892, 3258], [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
    [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
    [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
    [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0],
    [0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
    [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165],
    [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752]
  ];
  // latitude: multiples of D, M, M', F and the sine coefficient (1e-6 degrees)
  var MOON_B = [
    [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
    [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
    [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
    [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
    [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
    [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
    [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
    [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833], [0, 0, 1, -3, 777], [4, 0, -2, 1, 671],
    [2, 0, 0, -3, 607], [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
    [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421], [2, 1, -1, 1, -366],
    [2, 1, 0, 1, -351], [4, 0, 0, 1, 331], [2, -1, 1, 1, 315], [2, -2, 0, -1, 302],
    [0, 0, 1, 3, -283], [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
    [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185], [2, -1, -2, -1, 181],
    [0, 1, 2, 1, -177], [4, 0, -2, -1, 176], [4, -1, -1, -1, 166], [1, 0, 1, -1, -164],
    [4, 0, 1, -1, 132], [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107]
  ];
  // the Moon relative to the Earth, AU, in the J2000 ecliptic like the planets,
  // at jde (a Julian day in Terrestrial Time)
  function moonAt(jde) {
    var T = (jde - 2451545.0) / 36525, T2 = T * T, T3 = T2 * T, T4 = T3 * T;
    var Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000;
    var D = (297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000) * DEG;
    var M = (357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000) * DEG;
    var Mp = (134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000) * DEG;
    var F = (93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000) * DEG;
    var A1 = (119.75 + 131.849 * T) * DEG, A2 = (53.09 + 479264.290 * T) * DEG, A3 = (313.45 + 481266.484 * T) * DEG;
    var Ec = 1 - 0.002516 * T - 0.0000074 * T2, i, row, arg, ecc;
    var sl = 0, sr = 0, sb = 0;
    for (i = 0; i < MOON_LR.length; i++) {
      row = MOON_LR[i]; arg = row[0] * D + row[1] * M + row[2] * Mp + row[3] * F;
      ecc = row[1] === 0 ? 1 : Math.abs(row[1]) === 1 ? Ec : Ec * Ec;
      sl += row[4] * ecc * Math.sin(arg); sr += row[5] * ecc * Math.cos(arg);
    }
    for (i = 0; i < MOON_B.length; i++) {
      row = MOON_B[i]; arg = row[0] * D + row[1] * M + row[2] * Mp + row[3] * F;
      ecc = row[1] === 0 ? 1 : Math.abs(row[1]) === 1 ? Ec : Ec * Ec;
      sb += row[4] * ecc * Math.sin(arg);
    }
    var LpR = Lp * DEG;
    sl += 3958 * Math.sin(A1) + 1962 * Math.sin(LpR - F) + 318 * Math.sin(A2);
    sb += -2235 * Math.sin(LpR) + 382 * Math.sin(A3) + 175 * Math.sin(A1 - F) + 175 * Math.sin(A1 + F) +
          127 * Math.sin(LpR - Mp) - 115 * Math.sin(LpR + Mp);
    var lam = (Lp + sl / 1e6) * DEG, bet = sb / 1e6 * DEG, r = (385000.56 + sr / 1000) / AU_KM;
    // ecliptic of date -> equator of date -> equator of J2000 -> ecliptic of J2000
    var v = [Math.cos(bet) * Math.cos(lam), Math.cos(bet) * Math.sin(lam), Math.sin(bet)], ep = obliquity(T);
    v = [v[0], v[1] * Math.cos(ep) - v[2] * Math.sin(ep), v[1] * Math.sin(ep) + v[2] * Math.cos(ep)];
    v = eqToEcl(ofDateToJ2000(v, precession(T)));
    return [v[0] * r, v[1] * r, v[2] * r];
  }
  function moonVector(date) { return moonAt(ttDay(date)); }

  // pole RA, Dec and prime meridian W (degrees) at d days from J2000
  function rotationAt(name, d) {
    var R = ROTATION[name], T = d / 36525;
    var ra = R[0] + (R[4] || 0) * T, dec = R[1] + (R[5] || 0) * T, W = R[2] + R[3] * d;
    if (name === 'moon') {
      // the IAU's periodic terms, led by the 18.6-year turn of the Moon's
      // orbit. Without them the face the Moon shows the Earth is off by a
      // few degrees.
      var E = [125.045 - 0.0529921 * d, 250.089 - 0.1059842 * d, 260.008 + 13.0120009 * d, 176.625 + 13.3407154 * d,
               357.529 + 0.9856003 * d, 311.589 + 26.4057084 * d, 134.963 + 13.0649930 * d, 276.617 + 0.3287146 * d,
               34.226 + 1.7484877 * d, 15.134 - 0.1589763 * d, 119.743 + 0.0036096 * d, 239.961 + 0.1643573 * d,
               25.053 + 12.9590088 * d].map(function (x) { return x * DEG; });
      var sn = E.map(Math.sin), cs = E.map(Math.cos);
      ra += -3.8787 * sn[0] - 0.1204 * sn[1] + 0.0700 * sn[2] - 0.0172 * sn[3] + 0.0072 * sn[5] - 0.0052 * sn[9] + 0.0043 * sn[12];
      dec += 1.5419 * cs[0] + 0.0239 * cs[1] - 0.0278 * cs[2] + 0.0068 * cs[3] - 0.0029 * cs[5] + 0.0009 * cs[6] + 0.0008 * cs[9] - 0.0009 * cs[12];
      W += -1.4e-12 * d * d + 3.5610 * sn[0] + 0.1208 * sn[1] - 0.0642 * sn[2] + 0.0158 * sn[3] + 0.0252 * sn[4] - 0.0066 * sn[5] -
           0.0047 * sn[6] - 0.0046 * sn[7] + 0.0028 * sn[8] + 0.0052 * sn[9] + 0.0040 * sn[10] + 0.0019 * sn[11] - 0.0044 * sn[12];
    }
    else if (name === 'mimas') W -= 44.85 * Math.sin((316.45 + 506.2 * T) * DEG);
    else if (name === 'phobos') W += 12.72192797 * T * T;    // tidal acceleration (IAU 2015)
    else if (name === 'rhea') {
      var S6 = (345.20 - 1016.3 * T) * DEG;
      ra += 3.10 * Math.sin(S6); dec -= 0.35 * Math.cos(S6); W -= 3.08 * Math.sin(S6);
    }
    else if (name === 'triton') {
      // Triton's orbit precesses round Neptune's pole every 688 years
      var N7 = (177.85 + 52.316 * T) * DEG;
      ra += -32.35 * Math.sin(N7) - 6.28 * Math.sin(2 * N7) - 2.08 * Math.sin(3 * N7);
      dec += 22.55 * Math.cos(N7) + 2.10 * Math.cos(2 * N7) + 0.55 * Math.cos(3 * N7);
      W += 22.25 * Math.sin(N7) + 6.73 * Math.sin(2 * N7) + 2.05 * Math.sin(3 * N7);
    }
    return [ra, dec, W];
  }

  // The Earth's frame: Greenwich from the mean sidereal time (IAU 1982, on
  // UT, which UTC follows to within a second) and the pole of the equator
  // of date. Nutation, under 20", is left out.
  function earthFrame(date) {
    var jd = julianDay(date), T = (jd - 2451545.0) / 36525, p = precession((ttDay(date) - 2451545.0) / 36525);
    var gmst = norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000) * DEG;
    var N = eqToEcl(ofDateToJ2000([0, 0, 1], p)), Q = eqToEcl(ofDateToJ2000([Math.cos(gmst), Math.sin(gmst), 0], p));
    return { N: N, Q: Q, E: cross(N, Q), W: gmst / DEG };
  }

  // body frame in ecliptic coordinates: pole N, prime meridian Q, east E
  function bodyFrame(name, date) {
    if (name === 'earth') return earthFrame(date);
    var R = ROTATION[name] ? rotationAt(name, ttDay(date) - 2451545.0) : null;
    if (!R) return { N: [0, 0, 1], Q: [1, 0, 0], E: [0, 1, 0], W: 0 };
    var N = radec(R[0], R[1]);
    // the prime meridian is measured from the node of the body's equator on
    // the J2000 equator, at right ascension a0 + 90°
    var node = [-Math.sin(R[0] * DEG), Math.cos(R[0] * DEG), 0];
    var W = norm360(R[2]) * DEG;
    var NxNode = cross(N, node);
    var Q = [0, 1, 2].map(function (i) { return node[i] * Math.cos(W) + NxNode[i] * Math.sin(W); });
    N = eqToEcl(N); Q = eqToEcl(Q);
    return { N: N, Q: Q, E: cross(N, Q), W: W / DEG };
  }

  var GAUSS = 0.01720209895;   // rad/day, the Gaussian gravitational constant
  function rotateOrbit(el, x, y) {
    var w = el.peri * DEG, O = el.node * DEG, I = el.i * DEG;
    var cw = Math.cos(w), sw = Math.sin(w), cn = Math.cos(O), sn = Math.sin(O), ci = Math.cos(I), si = Math.sin(I);
    return [
      (cw * cn - sw * sn * ci) * x + (-sw * cn - cw * sn * ci) * y,
      (cw * sn + sw * cn * ci) * x + (-sw * sn + cw * cn * ci) * y,
      (sw * si) * x + (cw * si) * y
    ];
  }
  // position on an elliptic orbit (heliocentric ecliptic J2000, AU) at a JD
  function smallPosition(el, jd) {
    var e = el.e, a = el.q / (1 - e), M = GAUSS * (jd - el.T) / Math.pow(a, 1.5);
    M = Math.atan2(Math.sin(M), Math.cos(M));
    var E = M + 0.85 * e * (M >= 0 ? 1 : -1);
    for (var k = 0; k < 50; k++) {
      var dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-13) break;
    }
    return rotateOrbit(el, a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E));
  }
  // spacecraft on a straight line out of the solar system, null before launch
  function craftPosition(c, jd) {
    if (jd < c[5]) return null;
    var u = eqToEcl(radec(c[0], c[1])), jdLine = c[3] + (CRAFT_LINE_AU - c[2]) / c[4] * 365.25;
    var r = c[2] + c[4] * (Math.max(jd, jdLine) - c[3]) / 365.25, p = [u[0] * r, u[1] * r, u[2] * r];
    if (jd >= jdLine) return p;
    // before the line holds, a straight path out from the Earth at launch
    var e0 = planetPosition('earth', new Date((c[5] - 2440587.5) * 864e5)), f = (jd - c[5]) / (jdLine - c[5]);
    return [e0[0] + (p[0] - e0[0]) * f, e0[1] + (p[1] - e0[1]) * f, e0[2] + (p[2] - e0[2]) * f];
  }

  function length(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); }

  // the Earth's mass over the Moon's
  var EARTH_MOON = 81.30056;
  // everything at once: positions (AU), frames and radii (AU). The Earth and
  // the Moon also carry their velocity (AU a day), which bends the sunlight
  // they meet by up to 20" (aberration) and so moves an eclipse's shadow.
  function system(date) {
    var out = { date: date, bodies: {} }, jd = ttDay(date), k;
    out.bodies.sun = { pos: [0, 0, 0] };
    PLANETS.forEach(function (p) { out.bodies[p] = { pos: planetAt(p, jd) }; });
    out.bodies.pluto = { pos: planetAt('pluto', jd) };
    // The table's 'earth' is the Earth-Moon barycentre. The Earth sits on
    // the far side of it from the Moon.
    var m = moonAt(jd), bc = out.bodies.earth.pos, f = 1 / (1 + EARTH_MOON);
    var e = [bc[0] - m[0] * f, bc[1] - m[1] * f, bc[2] - m[2] * f];
    var b0 = planetAt('earth', jd - 0.01), b1 = planetAt('earth', jd + 0.01), vel = [(b1[0] - b0[0]) / 0.02, (b1[1] - b0[1]) / 0.02, (b1[2] - b0[2]) / 0.02];
    out.bodies.earth = { pos: e, vel: vel };
    out.bodies.moon = { pos: [e[0] + m[0], e[1] + m[1], e[2] + m[2]], vel: vel };
    var l2 = 1 + Math.min(1, Math.max(0, (jd - JWST_LAUNCH) / (JWST_AT_L2 - JWST_LAUNCH))) * L2_KM / AU_KM / length(e);
    out.bodies.jwst = jd < JWST_LAUNCH ? { pos: e.slice(), off: true } : { pos: [e[0] * l2, e[1] * l2, e[2] * l2] };
    // before launch a craft is still on the Earth, and not shown
    for (k in SMALL) if (!out.bodies[k]) {
      out.bodies[k] = jd < (SMALL[k].launch || -Infinity) ? { pos: e.slice(), off: true } : { pos: smallPosition(SMALL[k], jd) };
    }
    for (k in CRAFT) {
      var cp = craftPosition(CRAFT[k], jd);
      out.bodies[k] = cp ? { pos: cp } : { pos: e.slice(), off: true };
    }
    var ns = nearStars(jd);
    for (k in ns) out.bodies[k] = { pos: ns[k] };
    for (k in NEB_POS) out.bodies[k] = { pos: NEB_POS[k] };
    out.bodies.sgra = { pos: SGRA_POS };
    var yr = 2000 + (jd - 2451545.0) / 365.25;
    for (k in SGRA_STARS) out.bodies[k] = { pos: sgraStar(SGRA_STARS[k], yr) };
    Object.keys(out.bodies).forEach(function (key) {
      var b = out.bodies[key];
      b.frame = bodyFrame(key, date);
      b.dist = length(b.pos);
    });
    // moons sit opposite their prime meridian from their planet
    for (k in MOONS) {
      var F = bodyFrame(k, date), P = out.bodies[MOONS[k][0]].pos, a = MOONS[k][1] / AU_KM;
      out.bodies[k] = { pos: [P[0] - a * F.Q[0], P[1] - a * F.Q[1], P[2] - a * F.Q[2]], frame: F };
      out.bodies[k].dist = length(out.bodies[k].pos);
    }
    return out;
  }

  // heliocentric ecliptic longitude, degrees
  function longitude(pos) { return norm360(Math.atan2(pos[1], pos[0]) / DEG); }

  // The Milky Way's frame, for the explorer's widest views. The north
  // galactic pole and the direction of the centre (l = 0, b = 0) are the
  // IAU's, in J2000. The distance to the centre and the Sun's height above
  // the plane are Reid et al.'s (2019, ApJ 885, 131). Galactocentric
  // coordinates are in kiloparsecs: x toward the centre as seen from the
  // Sun, y toward longitude 90 degrees, which is the way the Sun moves
  // round the centre, and z toward the north pole. The Sun is at x = -R0.
  var GALAXY = (function () {
    var KPC_AU = 206264.806247 * 1000, R0 = 8.15, Z_SUN = 0.0055;
    var z = eqToEcl(radec(192.85948, 27.12825)), c = eqToEcl(radec(266.40510, -28.93617));
    var k = c[0] * z[0] + c[1] * z[1] + c[2] * z[2];
    var x = [c[0] - k * z[0], c[1] - k * z[1], c[2] - k * z[2]], lx = length(x);
    x = [x[0] / lx, x[1] / lx, x[2] / lx];
    var y = cross(z, x);
    // galactocentric kpc to heliocentric ecliptic AU
    function toEcl(gx, gy, gz, out) {
      var a = (gx + R0) * KPC_AU, b = gy * KPC_AU, d = (gz - Z_SUN) * KPC_AU;
      out = out || [0, 0, 0];
      out[0] = a * x[0] + b * y[0] + d * z[0]; out[1] = a * x[1] + b * y[1] + d * z[1]; out[2] = a * x[2] + b * y[2] + d * z[2];
      return out;
    }
    return { KPC_AU: KPC_AU, R0: R0, Z_SUN: Z_SUN, x: x, y: y, z: z, centre: toEcl(0, 0, 0), toEcl: toEcl };
  })();

  // Sagittarius A*, the black hole at the centre, fixed at its place in the
  // ICRF3 (Gordon, de Witt and Jacobs 2023, AJ 165, 49) and at the distance
  // to the centre above. It is 0.07 degrees from the IAU's direction of the
  // centre, which puts it 8 parsecs from the middle of the galaxy as drawn.
  var SGRA_RA = 266.4168085, SGRA_DEC = -29.0078378, SGRA_POS = (function () {
    var u = eqToEcl(radec(SGRA_RA, SGRA_DEC)), d = GALAXY.R0 * GALAXY.KPC_AU;
    return [u[0] * d, u[1] * d, u[2] * d];
  })();
  // The stars round it go round on their orbits as seen on the sky, at its
  // distance. S2's is GRAVITY's (GRAVITY Collaboration 2020, A&A 636, L5),
  // in the elements of a pair of stars above, with prec, how far its
  // periastron moves on each time round: 12.1 arcminutes, as general
  // relativity has it and GRAVITY saw.
  var SGRA_STARS = { s2: { a: 0.125058, e: 0.884649, i: 134.567, node: 228.171, peri: 66.263, P: 16.0455, T: 2018.379, prec: 0.2017 } };
  // the hole's parallax (mas), and east, north and away from the Sun at it, in ecliptic coordinates
  var SGRA_PLX = 1 / GALAXY.R0, SGRA_SKY = (function () {
    var ra = SGRA_RA * DEG, de = SGRA_DEC * DEG;
    return [[-Math.sin(ra), Math.cos(ra), 0], [-Math.sin(de) * Math.cos(ra), -Math.sin(de) * Math.sin(ra), Math.cos(de)], radec(SGRA_RA, SGRA_DEC)].map(function (v) { return eqToEcl(v); });
  })();
  function sgraSky(rel) {
    var S = SGRA_SKY;
    return [0, 1, 2].map(function (i) { return SGRA_POS[i] + rel.e * S[0][i] + rel.n * S[1][i] + rel.z * S[2][i]; });
  }
  // a star's periastron at Julian year y, and where the star is then
  function sgraPeri(o, y) { return o.peri + o.prec * (y - o.T) / o.P; }
  function sgraStar(o, y) { return sgraSky(pairRelative(o, y, SGRA_PLX, sgraPeri(o, y))); }
  // a star's orbit as it lies at a moment, as a function of eccentric anomaly
  function sgraOrbit(key, date) {
    var o = SGRA_STARS[key], y = 2000 + (ttDay(date) - 2451545.0) / 365.25, a = o.a * 1000 / SGRA_PLX, w = sgraPeri(o, y);
    return function (E) { return sgraSky(orbitOnSky(o, E, a, w)); };
  }

  window.Ephemeris = {
    AU_KM: AU_KM,
    PLANETS: PLANETS,
    RADIUS_KM: RADIUS_KM,
    system: system,
    ROTATION: ROTATION,
    MOONS: MOONS,
    SMALL: SMALL,
    CRAFT: CRAFT,
    smallPosition: smallPosition,
    rotationRate: function (name) { return ROTATION[name] ? ROTATION[name][3] : 0; },
    julianDay: julianDay,
    ttDay: ttDay,
    deltaT: deltaT,
    planetPosition: planetPosition,
    orbit: orbit,
    orbitPoint: orbitPoint,
    solveKepler: solveKepler,
    orbitPath: orbitPath,
    moonVector: moonVector,
    bodyFrame: bodyFrame,
    longitude: longitude,
    length: length,
    nearStars: nearStars,
    SGRA_STARS: SGRA_STARS,
    sgraOrbit: sgraOrbit,
    GALAXY: GALAXY
  };
})();
