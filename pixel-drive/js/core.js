// The shared parts of the drive: random numbers, noise, the list of
// materials, the light and weather colouring, and the small index sprites that
// every picture is drawn into. The rules the drive follows are in
// docs/drive-rules.md.
(function () {
  "use strict";

  const K = (window.DriveKit = {});

  // ------------------------------------------------------------ numbers ---

  function hash2(a, b) {
    let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function hash3(a, b, c) {
    return hash2((a | 0) + Math.imul(c | 0, 1442695041), (b | 0) ^ Math.imul(c | 0, -2048144777));
  }

  // A seeded stream of random numbers (mulberry32).
  function Rng(seed) {
    this.s = seed >>> 0;
  }
  Rng.prototype.next = function () {
    let t = (this.s = (this.s + 0x6d2b79f5) | 0);
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.range = function (a, b) {
    return a + (b - a) * this.next();
  };
  Rng.prototype.int = function (a, b) {
    return a + Math.floor((b - a + 1) * this.next());
  };
  Rng.prototype.chance = function (p) {
    return this.next() < p;
  };
  Rng.prototype.pick = function (list) {
    return list[Math.floor(this.next() * list.length)];
  };
  // Picks from [[weight, value], ...].
  Rng.prototype.weighted = function (list) {
    let sum = 0;
    for (let i = 0; i < list.length; i++) sum += list[i][0];
    let a = this.next() * sum;
    for (let i = 0; i < list.length; i++) {
      a -= list[i][0];
      if (a < 0) return list[i][1];
    }
    return list[list.length - 1][1];
  };
  Rng.prototype.fork = function (salt) {
    return new Rng(Math.floor(hash2(this.s, salt) * 4294967296));
  };

  function clamp(x, a, b) {
    return x < a ? a : x > b ? b : x;
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }
  function smooth(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  }
  function smoother(t) {
    t = clamp(t, 0, 1);
    return t * t * t * (t * (t * 6 - 15) + 10);
  }
  function mod(a, n) {
    return ((a % n) + n) % n;
  }

  // Smooth 1D value noise in [0, 1], and a sum of octaves.
  function noise1(x, seed) {
    const i = Math.floor(x);
    const f = x - i;
    const a = hash2(i, seed), b = hash2(i + 1, seed);
    const t = f * f * (3 - 2 * f);
    return a + (b - a) * t;
  }
  function fbm1(x, seed, oct) {
    let v = 0, amp = 0.5, sum = 0, fr = 1;
    for (let o = 0; o < (oct || 4); o++) {
      v += amp * noise1(x * fr, seed + o * 131);
      sum += amp;
      amp *= 0.5;
      fr *= 2.07;
    }
    return v / sum;
  }
  // Smooth 2D value noise in [0, 1].
  function noise2(x, y, seed) {
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = hash3(i, j, seed), b = hash3(i + 1, j, seed), c = hash3(i, j + 1, seed), d = hash3(i + 1, j + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  // A ridged version for mountain ranges.
  function ridge1(x, seed) {
    const a = 1 - Math.abs(noise1(x, seed) * 2 - 1);
    const b = 1 - Math.abs(noise1(x * 2.3, seed + 7) * 2 - 1);
    const c = noise1(x * 5.1, seed + 13);
    return a * a * 0.62 + b * b * 0.28 + c * 0.1;
  }

  Object.assign(K, { hash2, hash3, Rng, clamp, lerp, smooth, smoother, mod, noise1, noise2, fbm1, ridge1 });

  // ------------------------------------------------------------ colours ---

  function rgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mixRgb(a, b, t, out) {
    out = out || [0, 0, 0];
    out[0] = a[0] + (b[0] - a[0]) * t;
    out[1] = a[1] + (b[1] - a[1]) * t;
    out[2] = a[2] + (b[2] - a[2]) * t;
    return out;
  }
  function lum(c) {
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  }
  function css(c, a) {
    const r = Math.round(clamp(c[0], 0, 255)), g = Math.round(clamp(c[1], 0, 255)), b = Math.round(clamp(c[2], 0, 255));
    return a === undefined ? "rgb(" + r + "," + g + "," + b + ")" : "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  Object.assign(K, { rgb, mixRgb, lum, css });

  // ----------------------------------------------------------- materials ---
  // Every colour in the drive is a material with one colour at noon. Flags:
  // g ground (turns white under snow, darkens when wet), r road (darkens a lot
  // when wet, takes some snow), n takes no snow on top, e emits its own light,
  // w water, p a person or animal or vehicle (no snow on top).
  const MAT = [null];
  const M = {};
  function mat(name, hex, flags) {
    M[name] = MAT.length;
    MAT.push({ name: name, base: rgb(hex), flags: flags || "" });
  }

  // Ground and nature.
  mat("grassL", "#95c35e", "g");
  mat("grass", "#74a64c", "g");
  mat("grassD", "#557f3c", "g");
  mat("grassDD", "#3e6232", "g");
  mat("meadow", "#a8bf62", "g");
  mat("rape", "#e9d03c", "g");
  mat("rapeD", "#c4ad2e", "g");
  mat("wheat", "#dcbb68", "g");
  mat("wheatD", "#b9984c", "g");
  mat("soil", "#8e6c4b", "g");
  mat("soilD", "#6b4f37", "g");
  mat("plough", "#5f4632", "g");
  mat("sand", "#e4ca99", "g");
  mat("sandD", "#c8a877", "g");
  mat("sandL", "#f0deb6", "g");
  mat("rock", "#8d8781", "");
  mat("rockD", "#6a645e", "");
  mat("rockL", "#aca69e", "");
  mat("mesa", "#c46e4a", "");
  mat("mesaD", "#9b5238", "");
  mat("mesaL", "#da9068", "");
  mat("snow", "#f4f7fa", "g");
  mat("snowS", "#cbd8e6", "g");
  mat("ice", "#bdd5e7", "w");
  mat("water", "#4b87b9", "wn");
  mat("waterD", "#346a9a", "wn");
  mat("waterL", "#7fb1d9", "wn");
  mat("foam", "#eef4f8", "wn");
  mat("mud", "#6e5a44", "g");
  mat("pitchLine", "#f1f3ec", "g");
  // The mown green of the football pitch, in the colours of grass.
  mat("pitchGrass", "#74a64c", "g");
  mat("pitchGrassL", "#95c35e", "g");

  // Plants.
  mat("leafL", "#88ba5c", "");
  mat("leaf", "#62994a", "");
  mat("leafD", "#467838", "");
  mat("leafDD", "#335a2c", "");
  mat("pineL", "#5c8c64", "");
  mat("pine", "#407152", "");
  mat("pineD", "#2d553d", "");
  // Forest that covers the ground in the distance, in the colours of the
  // conifers. It is drawn as ground, not as single trees, in characters.
  mat("woodsL", "#5c8c64", "");
  mat("woods", "#407152", "");
  mat("woodsD", "#2d553d", "");
  mat("woodsDD", "#335a2c", "");
  mat("bark", "#6e5541", "");
  mat("barkD", "#4d3a2b", "");
  mat("birch", "#e9e5dc", "");
  mat("palm", "#5b9b49", "");
  mat("palmD", "#3f7a37", "");
  mat("palmT", "#9b7b53", "");
  mat("cactus", "#609259", "");
  mat("cactusD", "#44714b", "");
  mat("flowerR", "#d9493c", "");
  mat("flowerY", "#efca3b", "");
  mat("flowerW", "#f3f0e7", "");
  mat("flowerP", "#9b6bc5", "");
  mat("apple", "#cf3c2d", "");
  mat("hay", "#d9b95b", "");
  mat("hayD", "#b39441", "");
  mat("bushD", "#6d7a44", "");

  // Built things.
  mat("asphalt", "#5c5f64", "r");
  mat("asphaltD", "#4b4e53", "r");
  mat("asphaltL", "#6e7176", "r");
  mat("line", "#ecebe6", "r");
  mat("lineY", "#e7ba3b", "r");
  mat("gravel", "#a99d89", "r");
  mat("gravelD", "#8b806d", "r");
  mat("gravelL", "#c3b9a5", "r");
  mat("kerb", "#b9b7b1", "");
  mat("concrete", "#cac7c0", "");
  mat("concreteD", "#a4a19b", "");
  mat("concreteL", "#dcdad4", "");
  mat("brick", "#b1563d", "");
  mat("brickD", "#8d4331", "");
  mat("plasterW", "#f0ece3", "");
  mat("plasterC", "#ebdcb8", "");
  mat("plasterP", "#e9c5b5", "");
  mat("plasterB", "#c5d7e3", "");
  mat("plasterG", "#d0e1c1", "");
  mat("plasterS", "#d9d2c5", "");
  mat("plasterY", "#eed98f", "");
  mat("plinth", "#9b968d", "");
  mat("roof", "#c3563b", "");
  mat("roofD", "#9d4331", "");
  mat("roofL", "#da714f", "");
  mat("slate", "#5b6171", "");
  mat("slateD", "#454b59", "");
  mat("wood", "#a57b4f", "");
  mat("woodD", "#7f5b39", "");
  mat("woodL", "#c59b6b", "");
  mat("metal", "#9ba1a9", "");
  mat("metalD", "#6f757d", "");
  mat("metalL", "#c5c9cf", "");
  mat("steel", "#b9462f", "");
  mat("steelD", "#8d3323", "");
  mat("glass", "#4f6379", "n");
  mat("glassL", "#90b1cd", "n");
  mat("black", "#1a1b1f", "");
  mat("dark", "#2f3136", "");
  mat("white", "#f5f4f0", "");
  mat("grey", "#8b8e94", "");
  mat("greyL", "#b8bbc0", "");
  mat("signBlue", "#1f4e9c", "n");
  mat("signGreen", "#1d6b3c", "n");
  mat("signBrown", "#7b4b2b", "n");
  mat("signRed", "#c8352b", "n");
  mat("signYellow", "#f2c230", "n");
  mat("signWhite", "#f2f1ed", "n");
  mat("signInk", "#17181b", "n");
  mat("accent", "#c8352b", "");
  mat("accentD", "#90261f", "");
  mat("cream", "#f4ecd6", "");
  mat("container1", "#b8452f", "");
  mat("container2", "#2f6fb0", "");
  mat("container3", "#e0a526", "");
  mat("container4", "#4f8a4b", "");
  mat("crane", "#e6b33a", "");
  mat("craneD", "#b8892a", "");
  mat("hull", "#2e3a4e", "");
  mat("hullR", "#a8392a", "");
  mat("sail", "#f6f4ee", "n");
  // The steel lattice of power pylons.
  mat("pylon", "#6f757d", "");
  // The striped legs and the chequer of the rally arches.
  mat("poleY", "#f2c230", "n");
  mat("poleK", "#1a1b1f", "n");
  mat("chequer", "#f2f1ed", "n");
  mat("tape", "#f2f1ed", "n");

  // People, animals and vehicles. They take no snow.
  mat("skin", "#e1b595", "p");
  mat("skinD", "#b98b69", "p");
  mat("skinB", "#8d6349", "p");
  mat("hairK", "#2f2723", "p");
  mat("hairB", "#6f4b2f", "p");
  mat("hairY", "#d9b96b", "p");
  mat("hairG", "#b9b5ad", "p");
  mat("clothR", "#c9422f", "p");
  mat("clothB", "#3e63a9", "p");
  mat("clothG", "#50894c", "p");
  mat("clothY", "#e1b12b", "p");
  mat("clothP", "#7b5ba9", "p");
  mat("clothO", "#e17b2b", "p");
  mat("clothW", "#eeede8", "p");
  mat("clothK", "#26272b", "p");
  mat("clothN", "#24386b", "p");
  mat("clothSky", "#a9c9e7", "p");
  mat("clothBr", "#7a5a3e", "p");
  mat("kitW", "#f4f3ee", "p");
  mat("kitB", "#a6c6e4", "p");
  mat("kitShort", "#2a3a5c", "p");
  mat("refK", "#1d1e22", "p");
  mat("outline", "#141518", "p");
  mat("cow", "#f1eee6", "p");
  mat("cowK", "#2b2927", "p");
  mat("cowP", "#e3a9a0", "p");
  mat("sheep", "#ede7d9", "p");
  mat("sheepD", "#3b3733", "p");
  mat("deer", "#9b6b43", "p");
  mat("deerL", "#c59b6b", "p");
  mat("fox", "#d1712d", "p");
  mat("dog", "#8a6440", "p");
  mat("bird", "#3b3b41", "p");
  mat("gull", "#eceae4", "p");
  mat("carK", "#141518", "p");
  mat("carD", "#2f3136", "p");
  mat("carW", "#f5f4f0", "p");
  mat("carNavy", "#223a7a", "p");
  mat("carGlass", "#5b7390", "p");
  mat("carGlassL", "#b9d0e6", "p");
  mat("carPod", "#e8b92e", "p");
  mat("carTail", "#c8352b", "p");
  mat("carHead", "#fff3c4", "p");
  mat("carRim", "#d4a72c", "p");
  mat("carSpoke", "#c8ccd2", "p");
  mat("carAmber", "#ffb300", "p");
  mat("tyre", "#1f2024", "p");
  mat("rail", "#8c8f95", "");
  mat("sleeper", "#6b5846", "");
  mat("ufo", "#b9c1cd", "p");
  mat("ufoD", "#7b8391", "p");
  mat("ballO", "#ef7a2a", "p");
  mat("balloonR", "#d9493c", "p");
  mat("balloonY", "#efca3b", "p");
  mat("balloonB", "#3e63a9", "p");
  mat("basket", "#8a6440", "p");
  mat("plane", "#e9ebee", "p");
  mat("planeD", "#aab0b8", "p");

  // Body colours for traffic, each with a darker lower body.
  const BODY = ["#2f6fb0", "#e0a526", "#4f8a4b", "#8a8f99", "#ece9e2", "#6a4fa0", "#1f7f86", "#23262b", "#b8452f", "#7a2e3a", "#c9c1a8"];
  K.BODIES = [];
  for (let i = 0; i < BODY.length; i++) {
    const c = rgb(BODY[i]);
    mat("body" + i, BODY[i], "p");
    mat("bodyD" + i, "#" + c.map(function (v) { return Math.round(v * 0.76).toString(16).padStart(2, "0"); }).join(""), "p");
    K.BODIES.push([M["body" + i], M["bodyD" + i]]);
  }

  // Lights. These keep their colour at night.
  mat("lampE", "#ffd98c", "en");
  mat("winE", "#ffc861", "en");
  mat("indE", "#ffa21f", "en");
  mat("headE", "#fff2c2", "en");
  mat("tailE", "#ff4b3b", "en");
  mat("beaconE", "#ff3b2b", "en");
  mat("ufoE", "#8af3d6", "en");
  mat("flameE", "#ffb142", "en");

  // The sky plane: clouds get their own colouring from the sun.
  mat("cloud", "#ffffff", "n");
  mat("cloudS", "#d3dae4", "n");
  mat("cloudD", "#aeb8c7", "n");

  K.MAT = MAT;
  K.M = M;
  K.NMAT = MAT.length;
  const FLAG = new Uint8Array(256);
  const F_GROUND = 1, F_ROAD = 2, F_NOSNOW = 4, F_EMIT = 8, F_WATER = 16, F_BEING = 32;
  for (let i = 1; i < MAT.length; i++) {
    const f = MAT[i].flags;
    FLAG[i] = (f.indexOf("g") >= 0 ? F_GROUND : 0) | (f.indexOf("r") >= 0 ? F_ROAD : 0) |
      (f.indexOf("n") >= 0 ? F_NOSNOW : 0) | (f.indexOf("e") >= 0 ? F_EMIT : 0) |
      (f.indexOf("w") >= 0 ? F_WATER | F_NOSNOW : 0) | (f.indexOf("p") >= 0 ? F_BEING | F_NOSNOW : 0);
  }
  K.FLAG = FLAG;
  K.F = { GROUND: F_GROUND, ROAD: F_ROAD, NOSNOW: F_NOSNOW, EMIT: F_EMIT, WATER: F_WATER, BEING: F_BEING };

  // The body of the rally car is the page's accent colour.
  K.setAccent = function (hex) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
    const c = rgb(hex);
    MAT[M.accent].base = c;
    MAT[M.accentD].base = c.map(function (v) { return v * 0.7; });
  };

  // ------------------------------------------------------ time of day ---
  // Key colours at set hours: the top of the sky, the sky at the horizon, and
  // the light that falls on everything.
  const KEYS = [
    [0, "#0a0f24", "#1c2646", [0.2, 0.235, 0.4]],
    [4.4, "#10173a", "#2c3560", [0.23, 0.26, 0.43]],
    [5.4, "#34416f", "#b77f86", [0.45, 0.43, 0.56]],
    [6.2, "#6a88bf", "#f0ae82", [0.8, 0.72, 0.7]],
    [7.4, "#7ea5d4", "#f2dcc2", [0.96, 0.92, 0.87]],
    [12, "#6fa0d7", "#d7e6f0", [1, 1, 1]],
    [16.8, "#6b99d0", "#e5e2d3", [1, 0.98, 0.93]],
    [18.6, "#7f90c1", "#f3bb80", [1.04, 0.88, 0.7]],
    [19.6, "#56598e", "#ec8062", [0.78, 0.58, 0.56]],
    [20.5, "#262c5a", "#6a4f7c", [0.42, 0.38, 0.55]],
    [21.6, "#0d1330", "#232b50", [0.22, 0.25, 0.42]],
    [24, "#0a0f24", "#1c2646", [0.2, 0.235, 0.4]],
  ].map(function (k) { return { h: k[0], top: rgb(k[1]), hor: rgb(k[2]), amb: k[3] }; });
  K.SUNRISE = 5.7;
  K.SUNSET = 19.9;

  // Fills env with the sky and light for an hour of the day in [0, 24).
  K.timeOfDay = function (hour, env) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].h <= hour) i++;
    const a = KEYS[i], b = KEYS[i + 1];
    const t = smooth(0, 1, (hour - a.h) / (b.h - a.h));
    mixRgb(a.top, b.top, t, env.top);
    mixRgb(a.hor, b.hor, t, env.hor);
    for (let j = 0; j < 3; j++) env.amb[j] = a.amb[j] + (b.amb[j] - a.amb[j]) * t;
    env.dark = clamp(1 - (lum([env.amb[0] * 255, env.amb[1] * 255, env.amb[2] * 255]) - 0.22) / 0.76, 0, 1);
    // The sun is up from sunrise to sunset.
    const sp = (hour - K.SUNRISE) / (K.SUNSET - K.SUNRISE);
    env.sunUp = sp;
    env.sunEl = sp > -0.05 && sp < 1.05 ? Math.sin(Math.PI * clamp(sp, 0, 1)) : -1;
    const low = 1 - smooth(0.05, 0.35, Math.max(0, env.sunEl));
    mixRgb([255, 246, 220], [255, 150, 80], low, env.sun);
    env.low = low * (env.sunEl > -0.5 ? 1 : 0);
    // The moon is up from 19:30 to 6:30.
    const mp = mod(hour - 19.5, 24) / 11;
    env.moonUp = mp;
    env.moonEl = mp < 1 ? Math.sin(Math.PI * mp) : -1;
    return env;
  };
  K.newEnv = function () {
    return { top: [0, 0, 0], hor: [0, 0, 0], amb: [1, 1, 1], sun: [255, 255, 255], dark: 0, sunUp: 0, sunEl: 0, low: 0, moonUp: 0, moonEl: 0 };
  };

  // ----------------------------------------------------------------- LUT ---
  // One colour table per plane: every material under the current light,
  // weather and distance, as 32-bit pixels ready for ImageData.
  const tmp = [0, 0, 0];
  K.buildLut = function (out32, look, haze) {
    // look: amb, sky horizon, fog colour, cover, wet, snow, fog, theme.
    const amb = look.amb, th = look.theme;
    const hz = [0, 0, 0];
    mixRgb(look.hor, look.fogCol, clamp(look.fog * 1.2, 0, 1), hz);
    const h = clamp(haze + look.fog * look.fogPlane, 0, 0.95);
    const snowC = [MAT[M.snow].base[0] * amb[0] * th[0], MAT[M.snow].base[1] * amb[1] * th[1], MAT[M.snow].base[2] * amb[2] * th[2]];
    const cover = look.cover, wet = look.wet, snow = look.snow;
    out32[0] = 0;
    for (let i = 1; i < MAT.length; i++) {
      const b = MAT[i].base, f = FLAG[i];
      let r, g, bl, hh = h;
      if (f & F_EMIT) {
        r = b[0]; g = b[1]; bl = b[2];
        hh = h * 0.4;
      } else {
        r = b[0] * amb[0]; g = b[1] * amb[1]; bl = b[2] * amb[2];
        if (cover > 0) {
          const grey = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
          const k = 0.38 * cover;
          const dim = 1 - 0.2 * cover;
          r = (r + (grey - r) * k) * dim;
          g = (g + (grey - g) * k) * dim;
          bl = (bl + (grey - bl) * k) * dim;
        }
        r *= th[0]; g *= th[1]; bl *= th[2];
        if (f & F_GROUND) {
          const d = 1 - 0.12 * wet;
          r = lerp(r * d, snowC[0], snow * 0.92);
          g = lerp(g * d, snowC[1], snow * 0.92);
          bl = lerp(bl * d, snowC[2], snow * 0.92);
        } else if (f & F_ROAD) {
          const d = 1 - 0.3 * wet;
          r = lerp(r * d, snowC[0] * 0.9, snow * 0.55);
          g = lerp(g * d, snowC[1] * 0.9, snow * 0.55);
          bl = lerp(bl * d, snowC[2] * 0.92, snow * 0.55);
        }
      }
      r = r + (hz[0] - r) * hh;
      g = g + (hz[1] - g) * hh;
      bl = bl + (hz[2] - bl) * hh;
      out32[i] = (255 << 24) | (clamp(Math.round(bl), 0, 255) << 16) | (clamp(Math.round(g), 0, 255) << 8) | clamp(Math.round(r), 0, 255);
    }
    // Clouds take the light of the sky: warm on top at sunset and grey under
    // heavy cover.
    const sunK = look.low * clamp(look.sunEl + 0.3, 0, 1);
    for (let n = 0; n < 3; n++) {
      const i = M.cloud + n;
      const b = MAT[i].base;
      tmp[0] = b[0] * (0.25 + 0.75 * amb[0]); tmp[1] = b[1] * (0.25 + 0.75 * amb[1]); tmp[2] = b[2] * (0.28 + 0.72 * amb[2]);
      const warm = n === 0 ? 0.75 : n === 1 ? 0.45 : 0.2;
      mixRgb(tmp, [look.sun[0] * amb[0] * 1.1, look.sun[1] * amb[1] * 0.95, look.sun[2] * amb[2] * 0.9], sunK * warm, tmp);
      mixRgb(tmp, [tmp[0] * 0.62, tmp[1] * 0.64, tmp[2] * 0.68], cover * 0.7, tmp);
      tmp[0] *= th[0]; tmp[1] *= th[1]; tmp[2] *= th[2];
      out32[i] = (255 << 24) | (clamp(Math.round(tmp[2]), 0, 255) << 16) | (clamp(Math.round(tmp[1]), 0, 255) << 8) | clamp(Math.round(tmp[0]), 0, 255);
    }
    return out32;
  };

  // A colour table for characters drawn on flat row tones. The light only
  // half dims them at night, since the rows behind them carry the darkness,
  // and distance is left to the three strengths of the character view.
  K.buildGlyphLut = function (out32, look, haze) {
    const a = look.amb;
    const soft = {
      amb: [0.5 + 0.5 * a[0], 0.5 + 0.5 * a[1], 0.52 + 0.48 * a[2]], hor: look.hor, fogCol: look.fogCol,
      cover: look.cover * 0.6, wet: look.wet, snow: look.snow, fog: look.fog * 0.7, fogPlane: look.fogPlane,
      theme: [1, 1, 1], sun: look.sun, low: look.low, sunEl: look.sunEl,
    };
    return K.buildLut(out32, soft, haze * 0.35);
  };

  // The rgb of a material in a table, for drawing with fillStyle.
  K.lutRgb = function (lut, i, out) {
    const v = lut[i];
    out = out || [0, 0, 0];
    out[0] = v & 255;
    out[1] = (v >>> 8) & 255;
    out[2] = (v >>> 16) & 255;
    return out;
  };

  // --------------------------------------------------------------- sprites ---
  // A picture as a grid of material indices. 0 is empty. y runs down from the
  // top, and pictures stand on their bottom row.
  function Spr(w, h) {
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    this.d = new Uint8Array(this.w * this.h);
    this.lights = null;
  }
  const S = Spr.prototype;
  S.px = function (x, y, c) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c;
  };
  S.get = function (x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.d[y * this.w + x];
  };
  S.rect = function (x, y, w, h, c) {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(this.w, Math.floor(x + w)), y1 = Math.min(this.h, Math.floor(y + h));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.d[j * this.w + i] = c;
  };
  S.hline = function (x0, x1, y, c) {
    this.rect(Math.min(x0, x1), y, Math.abs(x1 - x0) + 1, 1, c);
  };
  S.vline = function (x, y0, y1, c) {
    this.rect(x, Math.min(y0, y1), 1, Math.abs(y1 - y0) + 1, c);
  };
  S.line = function (x0, y0, x1, y1, c) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let n = 0; n < 2000; n++) {
      this.px(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  S.disc = function (cx, cy, r, c) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r2) this.px(x, y, c);
      }
    }
  };
  S.ellipse = function (cx, cy, rx, ry, c, fn) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const q = dx * dx + dy * dy;
        if (q <= 1) this.px(x, y, fn ? fn(x, y, dx, dy, q) : c);
      }
    }
  };
  // A band from row y0 to y1 whose left and right edges run straight from
  // (l0, r0) at y0 to (l1, r1) at y1.
  S.trap = function (y0, y1, l0, l1, r0, r1, c) {
    for (let y = Math.floor(y0); y <= Math.floor(y1); y++) {
      const f = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      const l = Math.round(l0 + (l1 - l0) * f), r = Math.round(r0 + (r1 - r0) * f);
      if (r >= l) this.rect(l, y, r - l + 1, 1, c);
    }
  };
  // Replaces every filled pixel that borders empty space with c.
  S.edge = function (c, only) {
    const w = this.w, h = this.h, d = this.d;
    const mark = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = d[y * w + x];
        if (!v || (only && !only[v])) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !d[y * w + x - 1] || !d[y * w + x + 1] || !d[(y - 1) * w + x] || !d[(y + 1) * w + x]) mark.push(y * w + x);
      }
    }
    for (let i = 0; i < mark.length; i++) d[mark[i]] = c;
    return this;
  };
  // Replaces material a with b where test(x, y) is true.
  S.recolour = function (a, b, test) {
    const w = this.w;
    for (let i = 0; i < this.d.length; i++) {
      if (this.d[i] === a && (!test || test(i % w, (i / w) | 0))) this.d[i] = b;
    }
    return this;
  };
  S.blit = function (src, x, y, flip) {
    x = Math.round(x);
    y = Math.round(y);
    for (let j = 0; j < src.h; j++) {
      const ty = y + j;
      if (ty < 0 || ty >= this.h) continue;
      for (let i = 0; i < src.w; i++) {
        const v = src.d[j * src.w + (flip ? src.w - 1 - i : i)];
        if (!v) continue;
        const tx = x + i;
        if (tx >= 0 && tx < this.w) this.d[ty * this.w + tx] = v;
      }
    }
    if (src.lights) {
      for (let k = 0; k < src.lights.length; k++) {
        const l = src.lights[k];
        this.light(x + (flip ? src.w - l.x - l.w : l.x), y + l.y, l.w, l.h, l.kind, l.id);
      }
    }
    if (src.texts && !flip) {
      if (!this.texts) this.texts = [];
      for (let k = 0; k < src.texts.length; k++) {
        const t = src.texts[k];
        this.texts.push({ text: t.text, x: x + t.x, y: y + t.y, w: t.w, mat: t.mat });
      }
    }
    return this;
  };
  S.flipped = function () {
    const o = new Spr(this.w, this.h);
    o.blit(this, 0, 0, true);
    return o;
  };
  // A light that is drawn over the picture on its own schedule.
  S.light = function (x, y, w, h, kind, id) {
    if (!this.lights) this.lights = [];
    this.lights.push({ x: x, y: y, w: w, h: h, kind: kind, id: id === undefined ? Math.floor(Math.random() * 1e9) : id });
    return this;
  };

  // Makes a sprite from rows of keys. `keys` maps each character to a
  // material index, and "." is empty.
  Spr.from = function (rows, keys) {
    const h = rows.length;
    let w = 0;
    for (let i = 0; i < h; i++) w = Math.max(w, rows[i].length);
    const s = new Spr(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === "." || ch === " ") continue;
        const m = keys[ch];
        if (m) s.d[y * w + x] = m;
      }
    }
    return s;
  };

  K.Spr = Spr;

  // ------------------------------------------------------------------ font ---
  // A pixel font for signs, 5 rows high with 3 rows above for Czech accents.
  const BASE = {
    A: [".#.", "#.#", "###", "#.#", "#.#"], B: ["##.", "#.#", "##.", "#.#", "##."],
    C: [".##", "#..", "#..", "#..", ".##"], D: ["##.", "#.#", "#.#", "#.#", "##."],
    E: ["###", "#..", "##.", "#..", "###"], F: ["###", "#..", "##.", "#..", "#.."],
    G: [".##", "#..", "#.#", "#.#", ".##"], H: ["#.#", "#.#", "###", "#.#", "#.#"],
    I: ["###", ".#.", ".#.", ".#.", "###"], J: ["..#", "..#", "..#", "#.#", ".#."],
    K: ["#.#", "#.#", "##.", "#.#", "#.#"], L: ["#..", "#..", "#..", "#..", "###"],
    M: ["#...#", "##.##", "#.#.#", "#...#", "#...#"], N: ["#..#", "##.#", "#.##", "#..#", "#..#"],
    O: [".#.", "#.#", "#.#", "#.#", ".#."], P: ["##.", "#.#", "##.", "#..", "#.."],
    Q: [".#.", "#.#", "#.#", "##.", ".##"], R: ["##.", "#.#", "##.", "#.#", "#.#"],
    S: [".##", "#..", ".#.", "..#", "##."], T: ["###", ".#.", ".#.", ".#.", ".#."],
    U: ["#.#", "#.#", "#.#", "#.#", "###"], V: ["#.#", "#.#", "#.#", "#.#", ".#."],
    W: ["#...#", "#...#", "#.#.#", "##.##", "#...#"], X: ["#.#", "#.#", ".#.", "#.#", "#.#"],
    Y: ["#.#", "#.#", ".#.", ".#.", ".#."], Z: ["###", "..#", ".#.", "#..", "###"],
    0: ["###", "#.#", "#.#", "#.#", "###"], 1: [".#.", "##.", ".#.", ".#.", "###"],
    2: ["##.", "..#", ".#.", "#..", "###"], 3: ["##.", "..#", ".#.", "..#", "##."],
    4: ["#.#", "#.#", "###", "..#", "..#"], 5: ["###", "#..", "##.", "..#", "##."],
    6: [".##", "#..", "###", "#.#", "###"], 7: ["###", "..#", ".#.", ".#.", ".#."],
    8: ["###", "#.#", "###", "#.#", "###"], 9: ["###", "#.#", "###", "..#", "##."],
    " ": ["..", "..", "..", "..", ".."], ".": [".", ".", ".", ".", "#"], ":": [".", "#", ".", "#", "."],
    "-": ["...", "...", "###", "...", "..."], "·": [".", ".", "#", ".", "."], "/": ["..#", "..#", ".#.", "#..", "#.."],
    "→": ["....", "..#.", "####", "..#.", "...."], "★": ["..#..", "#####", ".###.", ".#.#.", "#...#"],
  };
  const ACCENTS = {
    "Á": ["A", "acute"], "É": ["E", "acute"], "Í": ["I", "acute"], "Ó": ["O", "acute"], "Ú": ["U", "acute"], "Ý": ["Y", "acute"],
    "Č": ["C", "caron"], "Ď": ["D", "caron"], "Ě": ["E", "caron"], "Ň": ["N", "caron"], "Ř": ["R", "caron"], "Š": ["S", "caron"],
    "Ť": ["T", "caron"], "Ž": ["Z", "caron"], "Ů": ["U", "ring"],
  };
  const MARKS = {
    acute: ["...", "..#", ".#."],
    caron: ["...", "#.#", ".#."],
    ring: [".#.", "#.#", ".#."],
  };
  const FONT = {};
  for (const ch in BASE) FONT[ch] = ["", "", ""].map(function (_, i) { return ".".repeat(BASE[ch][0].length); }).concat(BASE[ch]);
  for (const ch in ACCENTS) {
    const b = BASE[ACCENTS[ch][0]], m = MARKS[ACCENTS[ch][1]];
    const w = b[0].length;
    const top = m.map(function (row) { return (row + ".".repeat(w)).slice(0, w); });
    if (w === 4) for (let i = 0; i < 3; i++) top[i] = "." + m[i];
    FONT[ch] = top.concat(b);
  }
  K.textWidth = function (text) {
    let w = 0;
    for (const ch of text) w += (FONT[ch] || FONT[" "])[3].length + 1;
    return Math.max(0, w - 1);
  };
  // Draws text with its top-left at (x, y). The accent rows sit above y, so
  // y is the top of the capitals.
  S.text = function (text, x, y, c) {
    if (!this.texts) this.texts = [];
    this.texts.push({ text: text, x: x, y: y, w: K.textWidth(text), mat: c });
    if (K.asciiText) return this;
    let cx = x;
    for (const ch of text) {
      const g = FONT[ch] || FONT[" "];
      for (let r = 0; r < 8; r++) {
        for (let i = 0; i < g[r].length; i++) if (g[r][i] === "#") this.px(cx + i, y + r - 3, c);
      }
      cx += g[3].length + 1;
    }
    return this;
  };
})();
