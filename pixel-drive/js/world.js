// Places, regions and the route. The route is generated as the car drives: a
// random walk from place to place through the allowed neighbours, grouped
// into regions that set the horizon. Rules 5 and 6 in docs/drive-rules.md.
(function () {
  "use strict";

  const K = window.DriveKit;
  const M = K.M;
  const world = (K.world = {});

  // Regions set the horizon and which places can come up.
  const REGIONS = {
    coast: { places: ["city", "highway", "bridge", "shore"], next: ["lowland", "dry"], far: { sea: 1, hills: 0.12 }, towns: 0, turbines: 0 },
    lowland: { places: ["city", "highway", "country", "village"], next: ["coast", "hills", "dry"], far: { plain: 1, hills: 0.3 }, towns: 0.6, turbines: 0.5 },
    hills: { places: ["country", "village", "forest", "rally"], next: ["lowland", "mountains", "dry"], far: { hills: 1 }, towns: 0.35, turbines: 0.25, jested: true },
    dry: { places: ["highway", "desert", "rally"], next: ["coast", "lowland", "hills"], far: { mesas: 1, plain: 0.3 }, towns: 0, turbines: 0 },
    mountains: { places: ["forest", "mountains", "winter"], next: ["hills"], far: { mountains: 1 }, towns: 0.1, turbines: 0 },
  };
  world.REGIONS = REGIONS;

  // Row 0 stands at the back of the roadside, row 1 in front of it, and row
  // 2 holds things at regular spacing, such as lamps and poles. Each entry is
  // [weight, builder, options, gap before in metres [min, max]].
  const PLACES = {};
  world.PLACES = PLACES;

  PLACES.city = {
    next: ["highway", "bridge", "shore", "country"],
    surface: "city", verge: "pavement", edge: "none", fg: "park", fgCoast: "sea",
    climate: { temp: 13, rain: 0.35, fog: 0.15, haze: [205, 208, 214] },
    traffic: 0.5, people: 0.8,
    mid: { kind: "town", base: 2, amp: 3 }, midCoast: { kind: "quay", base: 3, amp: 0 },
    roadside: [
      [[5, "house", { floors: 2, wmin: 8, wmax: 12, flowers: false }, [1, 6]],
       [3, "house", { floors: 3, wmin: 9, wmax: 12, flowers: false }, [1, 4]],
       [2, "tree", { kind: "round", hmin: 7, hmax: 10 }, [2, 8]],
       [1, "kiosk", {}, [2, 6]]],
      [[3, "bench", {}, [6, 14]], [1, "busStop", {}, [10, 20]], [2, null, {}, [6, 14]], [2, "people", { n: 2 }, [6, 14]]],
      [[1, "lamp", { kind: "street" }, [5.5, 5.5]]],
    ],
    midTable: [
      [[5, "panelBlock", {}, [2, 10]], [4, "townHouse", {}, [0, 4]], [1, "church", {}, [8, 20]], [1, "factory", {}, [10, 24]], [1, "tree", { kind: "round", s: 3 }, [1, 4]]],
    ],
    midTableCoast: [
      [[3, "crane", {}, [8, 24]], [4, "containers", {}, [2, 10]], [2, "townHouse", {}, [4, 12]], [1, "factory", {}, [10, 24]]],
    ],
  };

  PLACES.highway = {
    next: ["city", "bridge", "country", "desert", "forest"],
    surface: "motorway", verge: "grass", edge: "guard", fg: "verge",
    climate: { temp: 13, rain: 0.35, fog: 0.2, haze: [205, 208, 214] },
    traffic: 1, people: 0,
    mid: { kind: "fields", base: 3, amp: 9 },
    roadside: [
      [[4, "tree", { kind: "round" }, [8, 40]], [3, "tree", { kind: "poplar" }, [4, 20]], [3, "bush", {}, [3, 12]], [2, null, {}, [20, 40]]],
      [[1, "roadSign", { kind: "direction" }, [120, 220]], [3, null, {}, [20, 60]]],
      [[1, "lamp", { kind: "highway" }, [9, 9]]],
    ],
    midTable: [
      [[3, "tree", { kind: "round", s: 3 }, [2, 20]], [2, "pylon", {}, [40, 40]], [2, "midHouse", {}, [10, 40]], [1, "silo", {}, [20, 50]], [2, "tree", { kind: "poplar", s: 3 }, [1, 8]]],
    ],
    rail: 0.6,
  };

  PLACES.bridge = {
    next: ["city", "highway", "shore"],
    surface: "bridge", verge: "deck", edge: "railing", fg: "bay",
    climate: { temp: 13, rain: 0.3, fog: 0.25, haze: [210, 214, 220] },
    traffic: 0.8, people: 0,
    mid: { kind: "sea", base: 0, amp: 0 },
    roadside: [
      [[1, null, {}, [30, 60]]],
      [[1, null, {}, [30, 60]]],
      [[1, null, {}, [30, 30]]],
    ],
    midTable: [[[1, null, {}, [40, 80]]]],
    boats: 1,
  };

  PLACES.shore = {
    next: ["city", "bridge", "desert", "country"],
    surface: "shore", verge: "sand", edge: "none", fg: "dunes",
    climate: { temp: 17, rain: 0.25, fog: 0.3, haze: [214, 220, 226] },
    traffic: 0.4, people: 0.6,
    mid: { kind: "sea", base: 0, amp: 0 },
    roadside: [
      [[5, "palm", {}, [3, 14]], [1, "kiosk", {}, [10, 30]], [2, "rocks", {}, [4, 16]], [1, "tuft", { kind: "reed" }, [1, 6]]],
      [[2, "people", { n: 1 }, [10, 30]], [2, null, {}, [10, 30]], [1, "bench", {}, [14, 30]]],
      [[1, "lamp", { kind: "park" }, [11, 11]]],
    ],
    midTable: [[[1, "lighthouse", {}, [60, 140]], [3, null, {}, [30, 90]]]],
    boats: 1,
  };

  PLACES.desert = {
    next: ["shore", "highway", "rally"],
    surface: "desert", verge: "sand", edge: "none", fg: "sand",
    climate: { temp: 31, rain: 0.04, fog: 0.08, haze: [232, 214, 180] },
    traffic: 0.3, people: 0,
    mid: { kind: "dunes", base: 3, amp: 8 },
    roadside: [
      [[4, "cactus", {}, [4, 22]], [3, "cactus", { kind: "small" }, [2, 10]], [3, "rocks", { kind: "red", wmax: 3 }, [3, 16]], [1, "deadTree", {}, [10, 30]], [2, "bush", { kind: "dry", wmax: 2 }, [3, 12]]],
      [[1, null, {}, [20, 40]]],
      [[1, "pole", {}, [11, 11]]],
    ],
    midTable: [[[3, "mesa", {}, [6, 40]], [2, "rocks", { kind: "red", s: 3, wmin: 2, wmax: 6 }, [4, 24]], [1, "cactus", { s: 3 }, [3, 16]]]],
  };

  PLACES.rally = {
    next: ["desert", "country", "forest"],
    surface: "gravel", verge: "gravelGrass", edge: "tape", fg: "rough",
    climate: { temp: 16, rain: 0.3, fog: 0.2, haze: [206, 210, 206] },
    traffic: 0, people: 1,
    mid: { kind: "forest", base: 5, amp: 14 },
    roadside: [
      [[4, "conifer", { kind: "spruce" }, [2, 10]], [2, "tree", { kind: "birch" }, [3, 14]], [2, "hayBale", {}, [6, 20]], [1, "conifer", { kind: "pine" }, [3, 12]]],
      [[4, "spectators", {}, [4, 14]], [1, "hayBale", {}, [6, 16]], [2, null, {}, [6, 14]]],
      [[1, null, {}, [30, 30]]],
    ],
    midTable: [[[1, null, {}, [40, 80]]]],
  };

  PLACES.country = {
    next: ["city", "highway", "shore", "rally", "village", "forest"],
    surface: "country", verge: "grass", edge: "rail", fg: "crops",
    climate: { temp: 15, rain: 0.35, fog: 0.25, haze: [208, 212, 208] },
    traffic: 0.35, people: 0.2, slowTraffic: 0.5,
    mid: { kind: "fields", base: 3, amp: 12 },
    roadside: [
      [[4, "tree", { kind: "round" }, [4, 24]], [2, "tree", { kind: "apple" }, [2, 10]], [2, "barn", {}, [10, 40]], [2, "house", { floors: 1 }, [10, 40]], [3, "hayBale", {}, [4, 20]], [2, "bush", {}, [2, 10]], [2, "pasture", { kind: "cow" }, [10, 40]], [1, "pasture", { kind: "sheep" }, [10, 40]]],
      [[1, "busStop", {}, [60, 160]], [1, "cross", {}, [80, 200]], [5, null, {}, [20, 60]]],
      [[1, "pole", {}, [9, 9]]],
    ],
    midTable: [[[4, "tree", { kind: "round", s: 3 }, [2, 18]], [2, "midHouse", {}, [6, 30]], [1, "silo", {}, [20, 50]], [2, "pylon", {}, [40, 40]], [1, "church", {}, [60, 140]], [2, "tree", { kind: "poplar", s: 3 }, [1, 6]], [1, "midPasture", {}, [20, 60]]]],
    rail: 0.5,
  };

  PLACES.village = {
    next: ["country", "forest"],
    surface: "village", verge: "grass", edge: "picket", fg: "garden",
    climate: { temp: 14, rain: 0.35, fog: 0.25, haze: [208, 212, 208] },
    traffic: 0.2, people: 0.7, slowTraffic: 0.4,
    mid: { kind: "meadow", base: 3, amp: 10 },
    roadside: [
      [[7, "house", {}, [1, 8]], [3, "tree", { kind: "apple" }, [1, 6]], [2, "tree", { kind: "round", hmin: 8, hmax: 12 }, [2, 8]], [1, "woodPile", {}, [2, 6]], [1, "barn", {}, [4, 12]]],
      [[2, "people", { n: 1 }, [8, 20]], [1, "bench", {}, [8, 20]], [1, "busStop", {}, [30, 80]], [3, null, {}, [8, 20]], [2, "bush", { kind: "flower", wmax: 2 }, [3, 10]]],
      [[1, "lamp", { kind: "street" }, [7, 7]]],
    ],
    midTable: [[[5, "midHouse", {}, [0, 6]], [1, "church", {}, [30, 80]], [3, "tree", { kind: "apple", s: 3 }, [0, 4]], [2, "tree", { kind: "round", s: 3 }, [1, 8]]]],
  };

  PLACES.forest = {
    next: ["highway", "rally", "country", "village", "mountains", "winter"],
    surface: "forest", verge: "moss", edge: "none", fg: "undergrowth",
    climate: { temp: 11, rain: 0.45, fog: 0.45, haze: [200, 206, 204] },
    traffic: 0.25, people: 0,
    mid: { kind: "forest", base: 8, amp: 18 },
    roadside: [
      [[6, "conifer", { kind: "spruce" }, [-3, 0.5]], [3, "conifer", { kind: "pine" }, [-2, 1]], [2, "tree", { kind: "birch" }, [-2, 1]], [1, "woodPile", {}, [2, 8]]],
      [[3, "bush", {}, [1, 6]], [4, "conifer", { kind: "spruce", hmin: 3, hmax: 7 }, [0, 6]], [1, "animals", { kind: "deer" }, [30, 80]], [1, null, {}, [4, 10]]],
      [[1, null, {}, [30, 30]]],
    ],
    midTable: [[[1, null, {}, [30, 60]]]],
  };

  PLACES.mountains = {
    next: ["forest", "winter"],
    surface: "mountain", verge: "rock", edge: "wall", fg: "lake",
    climate: { temp: 4, rain: 0.4, fog: 0.35, haze: [204, 212, 222] },
    traffic: 0.2, people: 0,
    mid: { kind: "slope", base: 14, amp: 42 },
    roadside: [
      [[3, "conifer", { kind: "spruce" }, [3, 18]], [3, "rocks", { wmin: 1.5, wmax: 4 }, [3, 16]], [1, "cabin", {}, [30, 80]], [1, "conifer", { kind: "pine" }, [4, 16]]],
      [[2, "rocks", { wmax: 1.5 }, [4, 16]], [3, null, {}, [8, 20]]],
      [[1, null, {}, [30, 30]]],
    ],
    midTable: [[[3, "conifer", { s: 3, kind: "spruce" }, [1, 10]], [2, "rocks", { s: 3, wmin: 3, wmax: 8 }, [4, 20]]]],
  };

  PLACES.winter = {
    next: ["mountains", "forest"],
    surface: "snow", verge: "snow", edge: "poles", fg: "ice",
    climate: { temp: -6, rain: 0.5, fog: 0.3, haze: [214, 222, 232] },
    traffic: 0.15, people: 0.3,
    mid: { kind: "snow", base: 10, amp: 28 },
    roadside: [
      [[5, "conifer", { kind: "spruce", snowy: true }, [1, 8]], [1, "cabin", { snowy: true }, [20, 60]], [1, "snowman", {}, [10, 40]]],
      [[2, "conifer", { kind: "spruce", snowy: true, hmin: 3, hmax: 6 }, [3, 12]], [3, null, {}, [8, 20]]],
      [[1, null, {}, [30, 30]]],
    ],
    midTable: [[[4, "conifer", { s: 3, kind: "spruce", snowy: true }, [0, 6]], [1, "liftTower", {}, [30, 30]]]],
  };

  // Landmarks where one place meets the next: [chance, builder, options,
  // offset in metres from the meeting point on the roadside].
  world.LANDMARKS = {
    "*>city": [0.8, "townSign", {}, -14],
    "city>*": [0.8, "townSign", { end: true }, 10],
    "*>village": [0.7, "villageSign", {}, -10],
    "village>*": [0.7, "villageSign", { end: true }, 8],
    "shore>desert": [0.8, "fuelStation", {}, -40],
    "highway>desert": [0.7, "fuelStation", {}, -40],
    "*>rally": [1, "rallyStart", {}, -12],
    "rally>*": [1, "rallyFinish", {}, -12],
    "forest>mountains": [0.7, "rockWall", {}, -6],
    "mountains>winter": [0.8, "winterSign", {}, -10],
    "country>village": [0.6, "cross", {}, -26],
    "village>forest": [0.6, "stand", {}, 6],
  };

  world.TOWNS = ["LIBEREC", "JABLONEC N. N.", "TURNOV", "SEMILY", "TANVALD"];
  // Brown tourist signs before the winter valley point to ski areas.
  world.SKI = ["SKIAREÁL", "BEDŘICHOV", "JIZERKA", "ŠPIČÁK"];
  world.VILLAGES = ["LUČANY", "RYCHNOV", "PULEČNÝ", "JANOV", "BRATŘÍKOV", "FRÝDŠTEJN", "MALÁ SKÁLA", "HODKOVICE"];
  world.DIRECTIONS = ["PRAHA 102", "LIBEREC 14", "JABLONEC 8", "TURNOV 28", "HRADEC KRÁLOVÉ 96", "BRNO 186", "MLADÁ BOLESLAV 52"];

  // -------------------------------------------------------------- route ---
  // A segment covers world positions [x0, x1) with one place in one region.
  function Route(rng, opts) {
    this.rng = rng;
    this.segs = [];
    this.recent = [];
    this.region = null;
    this.regionLeft = 0;
    this.seen = { jested: false, pitches: 0 };
    this.opts = opts || {};
  }
  world.Route = Route;

  // Seconds a place lasts at the road, and a region.
  const PLACE_S = [55, 100], REGION_S = [180, 360];

  Route.prototype.start = function (x, speed) {
    const rng = this.rng;
    this.speed = speed;
    // Most visits start in the lowland or the hills, so the pitch can come
    // up early.
    this.region = rng.weighted([[3, "lowland"], [3, "hills"], [1, "coast"], [1, "dry"], [1, "mountains"]]);
    this.regionLeft = rng.range(REGION_S[0], REGION_S[1]) * speed;
    const place = rng.pick(REGIONS[this.region].places);
    const len = rng.range(PLACE_S[0], PLACE_S[1]) * speed;
    // The camera starts partway through the first place.
    const x0 = x - len * rng.range(0.25, 0.6);
    this.push(place, x0, len);
  };

  Route.prototype.push = function (place, x0, len) {
    const seg = { place: place, region: this.region, x0: x0, x1: x0 + len, id: this.segs.length ? this.segs[this.segs.length - 1].id + 1 : 0 };
    const prev = this.segs[this.segs.length - 1];
    seg.coast = seg.region === "coast";
    this.segs.push(seg);
    this.recent.push(place);
    if (this.recent.length > 6) this.recent.shift();
    this.regionLeft -= len;
    if (prev) this.decorate(prev, seg);
    else seg.first = true;
    return seg;
  };

  // Picks the next place and region.
  Route.prototype.extend = function () {
    const rng = this.rng;
    const last = this.segs[this.segs.length - 1];
    const cur = last.place;
    let region = this.region;
    if (this.regionLeft <= 0) {
      const opts = REGIONS[region].next.filter(function (r) {
        return PLACES[cur].next.some(function (p) { return REGIONS[r].places.indexOf(p) >= 0; }) || REGIONS[r].places.indexOf(cur) >= 0;
      });
      if (opts.length) {
        region = rng.pick(opts);
        this.region = region;
        this.regionLeft = rng.range(REGION_S[0], REGION_S[1]) * this.speed;
      }
    }
    const recent = this.recent;
    const early = this.seen.pitches === 0 && this.segs.length < 4 && !this.opts.still;
    let cands = PLACES[cur].next.filter(function (p) { return REGIONS[region].places.indexOf(p) >= 0; });
    if (!cands.length) cands = PLACES[cur].next.slice();
    const list = cands.map(function (p) {
      let w = 1;
      for (let i = 0; i < recent.length; i++) if (recent[i] === p) w *= 0.35;
      // The pitch should come up within the first few minutes.
      if (early && (p === "village" || p === "country")) w *= 6;
      return [w, p];
    });
    const place = rng.weighted(list);
    const len = rng.range(PLACE_S[0], PLACE_S[1]) * this.speed;
    return this.push(place, last.x1, len);
  };

  // Decides what happens where one place meets the next, and schedules the
  // special scenes.
  Route.prototype.decorate = function (a, b) {
    const rng = this.rng;
    const L = world.LANDMARKS;
    const key = [a.place + ">" + b.place, "*>" + b.place, a.place + ">*"];
    b.marks = [];
    for (let i = 0; i < key.length; i++) {
      const spec = L[key[i]];
      if (spec && rng.chance(spec[0])) b.marks.push({ make: spec[1], opt: spec[2], at: b.x0 + spec[3] * 10, meet: b.x0, key: key[i] });
    }
    // The football pitch, on most visits within the first few minutes.
    if ((b.place === "village" || b.place === "country") && !this.opts.still) {
      const first = this.seen.pitches === 0;
      if (first ? b.id <= 4 : rng.chance(0.3)) {
        b.pitch = { at: b.x0 + (b.x1 - b.x0) * rng.range(0.35, 0.6), first: first };
        this.seen.pitches++;
      }
    }
    // Ještěd, on about a third of the passes through the hills.
    if (b.region === "hills" && a.region !== "hills" && !this.seen.jested && rng.chance(0.34)) {
      b.jested = { at: b.x0 + this.speed * rng.range(60, 140) };
      this.seen.jested = true;
    }
  };

  // Makes sure the route covers x.
  Route.prototype.cover = function (x) {
    let n = 0;
    while (this.segs[this.segs.length - 1].x1 < x && n++ < 50) this.extend();
  };

  Route.prototype.forget = function (x) {
    while (this.segs.length > 3 && this.segs[1].x1 < x) this.segs.shift();
  };

  Route.prototype.segAt = function (x) {
    const s = this.segs;
    for (let i = s.length - 1; i >= 0; i--) if (x >= s[i].x0) return s[i];
    return s[0];
  };

  // The places at x: segment a, and segment b with weight w near a meeting
  // point. The blend runs over a third of the shorter place.
  const BL = { a: null, b: null, w: 0 };
  Route.prototype.blendAt = function (x, out) {
    out = out || BL;
    const s = this.segs;
    let i = s.length - 1;
    while (i > 0 && x < s[i].x0) i--;
    const cur = s[i];
    out.a = cur;
    out.b = null;
    out.w = 0;
    const next = s[i + 1], prev = s[i - 1];
    if (next) {
      const hw = Math.min(cur.x1 - cur.x0, next.x1 - next.x0) / 6;
      if (x > cur.x1 - hw) {
        out.b = next;
        out.w = K.smooth(cur.x1 - hw, cur.x1 + hw, x);
        return out;
      }
    }
    if (prev) {
      const hw = Math.min(cur.x1 - cur.x0, prev.x1 - prev.x0) / 6;
      if (x < cur.x0 + hw) {
        out.a = prev;
        out.b = cur;
        out.w = K.smooth(cur.x0 - hw, cur.x0 + hw, x);
      }
    }
    return out;
  };

  // The horizon's mix of landforms at x, smoothed over a long stretch so the
  // far plane changes slowly.
  const FAR_KINDS = ["sea", "plain", "hills", "mesas", "mountains"];
  world.FAR_KINDS = FAR_KINDS;
  Route.prototype.farAt = function (x, out) {
    out = out || {};
    for (let k = 0; k < FAR_KINDS.length; k++) out[FAR_KINDS[k]] = 0;
    out.towns = 0;
    out.turbines = 0;
    const R = 1400 * (this.speed / 7.2);
    let sum = 0;
    const s = this.segs;
    for (let i = 0; i < s.length; i++) {
      const a = Math.max(s[i].x0, x - R), b = Math.min(s[i].x1, x + R);
      if (b <= a) continue;
      // A triangular window: weight falls off with distance from x.
      const mid = (a + b) / 2;
      const w = (b - a) * (1 - Math.abs(mid - x) / (R * 1.05));
      if (w <= 0) continue;
      const reg = REGIONS[s[i].region];
      for (const k in reg.far) out[k] += reg.far[k] * w;
      out.towns += reg.towns * w;
      out.turbines += reg.turbines * w;
      sum += w;
    }
    if (sum > 0) {
      for (let k = 0; k < FAR_KINDS.length; k++) out[FAR_KINDS[k]] /= sum;
      out.towns /= sum;
      out.turbines /= sum;
    } else out.plain = 1;
    return out;
  };

  // The climate at x, blended across a meeting point.
  Route.prototype.climateAt = function (x, out) {
    const bl = this.blendAt(x, {});
    const a = PLACES[bl.a.place].climate, b = bl.b ? PLACES[bl.b.place].climate : a;
    out = out || { haze: [0, 0, 0] };
    out.temp = K.lerp(a.temp, b.temp, bl.w);
    out.rain = K.lerp(a.rain, b.rain, bl.w);
    out.fog = K.lerp(a.fog, b.fog, bl.w);
    K.mixRgb(a.haze, b.haze, bl.w, out.haze);
    return out;
  };
})();
