// The drive: a camera moving along a generated route,
// four planes of scenery built just past their right edge, the sky, the
// weather, traffic and the rally car. The rules it follows are in
// docs/drive-rules.md.
(function () {
  "use strict";

  const K = window.DriveKit;
  if (!K || !K.world || !K.art || !K.managers) return;
  const canvas = document.getElementById("drive");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const root = document.documentElement;
  const reducedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const darkMQ = window.matchMedia("(prefers-color-scheme: dark)");
  const M = K.M, art = K.art, world = K.world, PLACES = world.PLACES;

  // The camera's speed at the road in CSS px per second, the page scroll
  // share the scene moves with (the same as field.js), and a day in seconds.
  const V = 36;
  const PARALLAX = 0.5;
  const DAY_S = 600;
  const CW = 128;
  const GEN_AHEAD = 420;

  // Each plane's depth, its extent above and below its ground line in sprite
  // pixels, its distance tint and how much fog adds to it, and its scale in
  // pixels per metre.
  const PLANE_DEFS = [
    { name: "far", d: 0.1, top: -150, bot: 120, haze: 0.45, fogPlane: 0.9, scale: 0.05, rows: 1 },
    { name: "mid", d: 0.3, top: -150, bot: 3, haze: 0.18, fogPlane: 0.6, scale: 3, rows: 1 },
    { name: "roadside", d: 0.6, top: -150, bot: 4, haze: 0.05, fogPlane: 0.3, scale: 6, rows: 3 },
    { name: "road", d: 1, top: -2, bot: 220, haze: 0, fogPlane: 0.12, scale: 10, rows: 0 },
  ];

  // ------------------------------------------------------------- state ---
  const E = {
    t: 0, dt: 0, camX: 0, speed: 7, P: 5, pD: 5, dpr: 1, Wsp: 300, c: 150,
    L: {}, env: K.newEnv(), look: null, weather: null, route: null, rng: null,
    planes: {}, still: false, carLane: 1, carW: 40, railY: -6, beam: 0, beams: [], indicator: 0,
    // The car's pace as a share of V, and the speed it gives in sprite px
    // per second. The pace rises on a rally stage and in a highway sprint.
    pace: 1, speedNow: 7,
    // How many steps of the scene each frame runs. Above 1 the drive, the
    // day and the weather all run faster. Drive.setRate sets it.
    rate: 1,
  };
  window.DriveEngine = E;
  let vw = 0, vh = 0, heroEl = null, heroH = 0, heroBlocks = [], barBottom = 56;
  let pageBg = [251, 250, 248], darkPage = false;
  let seed = 0, hour0 = 12, started = false, raf = 0, lastNow = 0;
  let planes = [];
  let traffic, trains, boats, sky;
  const dust = [];
  let lastDust = 0, lastPuff = 0, bumpFront = 0, bumpRear = 0, bodyY = 0, bodyV = 0;
  let hopT = -10, carFade = 1, carRect = null, carShift = 0, indT = -1;
  let lastEvent = -99;
  let ufo = null, ufoDone = false;
  let forced = null;
  let lutTimer = 0, lutVer = 0, lastSky = null;
  const skyLut = new Uint32Array(256), skyGlut = new Uint32Array(256);
  const params = new URLSearchParams(window.location.search);
  // The drive is drawn as pixel art. The character look is kept in the code
  // and can be seen with `?drive=ascii` in the address, but the page has no
  // switch for it.
  E.style = params.get("drive") === "ascii" ? "ascii" : "pixel";
  E.ascii = E.style !== "pixel";
  K.asciiText = E.ascii;

  // ------------------------------------------------------------ layout ---
  function readColors() {
    const cs = getComputedStyle(root);
    const bg = cs.getPropertyValue("--bg").trim();
    const m = /^#([0-9a-f]{6})$/i.exec(bg);
    if (m) pageBg = K.rgb(bg);
    darkPage = pageBg[0] + pageBg[1] + pageBg[2] < 384;
    K.setAccent(cs.getPropertyValue("--accent").trim());
  }

  function layout() {
    E.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    vw = rect.width;
    vh = rect.height;
    canvas.width = Math.round(vw * E.dpr);
    canvas.height = Math.round(vh * E.dpr);
    heroEl = document.querySelector("[data-hero]");
    heroH = heroEl ? heroEl.offsetHeight : vh;
    const bar = document.querySelector(".top");
    barBottom = bar ? Math.round(bar.getBoundingClientRect().bottom) : 56;
    let P = vw < 640 ? 3 : vw < 1200 ? 4 : 5;
    while (P > 3 && heroH / P < 150) P--;
    const oldP = E.pD;
    E.pD = Math.max(1, Math.round(P * E.dpr));
    E.P = E.pD / E.dpr;
    E.Wsp = Math.ceil(canvas.width / E.pD) + 1;
    E.c = E.Wsp / 2;
    E.speed = V / E.P;
    E.speedNow = E.speed * E.pace;
    heroBlocks = heroEl
      ? Array.from(heroEl.querySelectorAll(".hero-inner > *")).map(function (el) {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top + window.scrollY, bottom: r.bottom + window.scrollY };
        }).filter(function (b) { return b.right > b.left; })
      : [];
    const L = E.L;
    const carCss = 40 * E.P, carHCss = 17 * E.P;
    const carXcss = vw * (vw < 640 ? 0.62 : 0.7) - carCss / 2;
    E.carXs = Math.round(carXcss / E.P);
    // The road sits at 80% of the hero, or lower if the car would otherwise
    // drive behind the hero text above it.
    let clear = 0;
    for (let i = 0; i < heroBlocks.length; i++) {
      const b = heroBlocks[i];
      if (b.right > carXcss - 8 && b.left < carXcss + carCss + 8) clear = Math.max(clear, b.bottom);
    }
    const roadCss = Math.max(heroH * 0.8, clear ? clear + 14 + carHCss - 13 * E.P : 0);
    L.roadTop = Math.ceil(roadCss / E.P);
    L.roadH = 16;
    L.laneFar = L.roadTop + 7;
    L.laneNear = L.roadTop + 14;
    L.horizon = L.roadTop - Math.round((heroH * 0.24) / E.P);
    L.skyTop = Math.ceil((barBottom + 6) / E.P);
    L.groundEnd = Math.ceil((heroH + vh * 0.3) / E.P);
    L.fadeTop = Math.floor((heroH * 0.94) / E.P);
    E.railY = -Math.max(5, Math.round((L.roadTop - L.horizon) * 0.18));
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < planes.length; i++) planes[i].achunks.clear();
    return oldP !== E.pD;
  }

  // ------------------------------------------------------------- start ---
  function newPlane(def) {
    const pl = { def: def, name: def.name, d: def.d, objs: [], rows: [], chunks: new Map(), achunks: new Map(), lut: new Uint32Array(256), glut: new Uint32Array(256), ver: -1, actors: [], reserved: [], marks: new Set(), wires: [] };
    for (let r = 0; r < def.rows; r++) pl.rows.push({ u: 0, rng: E.rng.fork(1000 + def.d * 100 + r), last: null });
    return pl;
  }

  function reset(opts) {
    opts = opts || {};
    seed = opts.seed !== undefined ? opts.seed >>> 0 : (Number(params.get("seed")) || Math.floor(Math.random() * 4294967295)) >>> 0;
    E.seed = seed;
    E.rng = new K.Rng(seed);
    E.route = new world.Route(E.rng.fork(1), { still: E.still });
    E.weather = new K.Weather(E.rng.fork(2));
    E.t = 0;
    E.camX = 0;
    E.pace = 1;
    E.speedNow = E.speed;
    const now = new Date();
    hour0 = opts.hour !== undefined ? opts.hour : params.get("hour") !== null ? Number(params.get("hour")) : now.getHours() + now.getMinutes() / 60;
    if (E.still) hour0 = opts.hour !== undefined ? opts.hour : E.rng.range(0, 24);
    if (opts.place) {
      const reg = opts.region || Object.keys(world.REGIONS).find(function (r) { return world.REGIONS[r].places.indexOf(opts.place) >= 0; });
      E.route.region = reg;
      E.route.speed = E.speed;
      E.route.regionLeft = 300 * E.speed;
      E.route.push(opts.place, -E.speed * 20, E.speed * 90);
      E.route.segs[0].first = true;
      if (opts.pitch) E.route.segs[0].pitch = { at: -(E.Wsp * 0.32) / 0.6, first: true, silence: opts.silence };
      if (opts.jested) E.route.segs[0].jested = { at: 300 };
    } else E.route.start(0, E.speed);
    forced = opts.weather || null;
    E.forceUfo = !!opts.ufo;
    // Settle the weather on the climate of the start.
    const cl = E.route.climateAt(0);
    K.timeOfDay(hour0, E.env);
    for (let i = 0; i < 40; i++) E.weather.update(10, cl, E.env, forced);
    E.weather.snow = forced && forced.snow !== undefined ? forced.snow : cl.temp < 0 ? K.clamp(E.weather.snow + 0.6, 0, 1) : E.weather.snow;
    farCache.clear();
    traffic = new K.managers.Traffic(E);
    trains = new K.managers.Trains(E);
    boats = new K.managers.Boats(E);
    sky = new K.managers.Sky(E);
    E.mgr = { traffic: traffic, trains: trains, boats: boats, sky: sky };
    dust.length = 0;
    lastDust = 0;
    lastPuff = 0;
    carShift = 0;
    ufo = null;
    ufoDone = false;
    lastEvent = -99;
    rebuildPlanes();
    lutTimer = 0;
    updateLook(0, true);
  }

  function rebuildPlanes() {
    planes = PLANE_DEFS.map(newPlane);
    E.gates = [];
    E.planes = {};
    for (let i = 0; i < planes.length; i++) E.planes[planes[i].name] = planes[i];
    E.weather.clouds.length = 0;
    E.weather.nextCloud = undefined;
    for (let i = 0; i < planes.length; i++) {
      const pl = planes[i];
      const uL = pl.d * E.camX - E.c - 60;
      for (let r = 0; r < pl.rows.length; r++) pl.rows[r].u = uL - 80 - r * 13;
      generate(pl);
    }
    // Fill the sky with the clouds already there.
    const w = E.weather;
    const n = Math.round(w.cover * 14);
    for (let i = 0; i < n; i++) w.addCloud(E, w.skyShift + E.rng.range(-20, E.Wsp), 1, false);
    for (const c of w.clouds) c.alpha = 1;
  }

  // -------------------------------------------------------- generation ---
  const BL = {};
  function blendAt(x) {
    return E.route.blendAt(x, BL);
  }

  function placeOf(seg) {
    return PLACES[seg.place];
  }

  // The table of things a row of a plane picks from in a place.
  function tableFor(pl, seg, row) {
    const p = placeOf(seg);
    if (pl.name === "roadside") return p.roadside[row] || [];
    if (pl.name === "mid") return (seg.coast && p.midTableCoast ? p.midTableCoast : p.midTable)[0] || [];
    return [];
  }

  // Builds one object: a sprite and any actors that live on it.
  function make(name, rng, opt, pl, seg) {
    const o = Object.assign({ s: pl.def.scale }, opt || {});
    if (seg && seg.place === "winter" && (name === "conifer" || name === "cabin")) o.snowy = true;
    let res;
    if (K.objects[name]) res = K.objects[name](rng, o, seg);
    else if (art[name]) res = { spr: art[name](rng, o) };
    else return null;
    return res;
  }

  // Places a built object at plane position u, standing on local row y.
  function place(pl, res, u, y, row) {
    const spr = res.spr;
    const obj = { u: u, y: y, spr: spr, row: row, w: spr.w, actors: res.actors || [], pasture: res.pasture };
    pl.objs.push(obj);
    for (let i = 0; i < obj.actors.length; i++) {
      const a = obj.actors[i];
      a.plane = pl;
      a.u += u;
      a.y += y;
      a.obj = obj;
      if (a.H === undefined) a.H = spr.h;
      pl.actors.push(a);
    }
    if (spr.chimney) addActor(pl, new K.Smoke(u + spr.chimney.x, y - spr.h + spr.chimney.y, K.hash2(u | 0, 9) * 10));
    if (spr.beam) addActor(pl, new K.Beam(u + spr.beam.x, y - spr.h + spr.beam.y));
    if (spr.hub) addActor(pl, new K.Blades(u + spr.hub.x, y - spr.h + spr.hub.y, spr.hub.r, K.hash2(u | 0, 3) * 10));
    if (spr.jested) {
      const j = spr.jested;
      addActor(pl, new K.CableCar(u + j.base.x, y - spr.h + j.base.y, j.peak - 5 - j.base.x, j.top - 1 - j.base.y));
    }
    if (spr.wire) {
      const pts = spr.wire.map(function (p) { return { u: u + p.x, y: y - spr.h + p.y }; });
      if (pl.lastWire && u - pl.lastWire.u < 160) pl.wires.push({ a: pl.lastWire.pts, b: pts });
      pl.lastWire = { u: u, pts: pts };
    } else if (row === 2 && pl.lastWire && u - pl.lastWire.u > 80) pl.lastWire = null;
    return obj;
  }

  function addActor(pl, a) {
    a.plane = pl;
    pl.actors.push(a);
  }

  function overlapsReserved(pl, u0, u1) {
    for (let i = 0; i < pl.reserved.length; i++) {
      const r = pl.reserved[i];
      if (u0 < r.u1 && u1 > r.u0) return r;
    }
    return null;
  }

  // Landmarks, the pitch, the bridge and Ještěd are placed where the route
  // says, and ordinary objects keep out of their space.
  // Whether the span [u0, u1] of plane pl overlaps a football pitch, placed
  // or still to come.
  function onPitch(pl, u0, u1) {
    const segs = E.route.segs;
    for (let i = 0; i < segs.length; i++) {
      const p = segs[i].pitch;
      if (!p) continue;
      const a = p.at * pl.d - 20, b = p.at * pl.d + 320;
      if (u1 > a && u0 < b) return true;
    }
    return false;
  }

  function placeMarks(pl, uMax) {
    const segs = E.route.segs;
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const key = seg.id;
      if (pl.name === "roadside") {
        if (seg.marks) {
          for (let m = 0; m < seg.marks.length; m++) {
            const mk = seg.marks[m];
            const id = key + ":" + m;
            const u = mk.at * pl.d;
            if (pl.marks.has(id) || u > uMax) continue;
            pl.marks.add(id);
            const rng = E.rng.fork(seg.id * 31 + m);
            const nameSeg = mk.key.indexOf(">*") > 0 ? segs[i - 1] : seg;
            if (nameSeg && !nameSeg.name) nameSeg.name = nameSeg.place === "city" ? rng.pick(world.TOWNS) : rng.pick(world.VILLAGES);
            const res = make(mk.make, rng, mk.opt, pl, nameSeg);
            if (!res) continue;
            // A landmark that would stand on the football pitch is left out.
            if (onPitch(pl, u - 8, u + res.spr.w + 8)) continue;
            place(pl, res, u, 0, 1);
            pl.reserved.push({ u0: u - 8, u1: u + res.spr.w + 8 });
            // An arch across the road stands where the two places meet.
            if (res.gate) {
              const g = art.rallyGate(rng, Object.assign({ depth: E.L.roadH }, res.gate));
              E.gates.push({ X: (mk.meet !== undefined ? mk.meet : mk.at) - g.front.w / 2, front: g.front, back: g.back });
            }
          }
        }
        if (seg.pitch && !pl.marks.has(key + ":pitch")) {
          const u = seg.pitch.at * pl.d;
          if (u <= uMax) {
            pl.marks.add(key + ":pitch");
            const res = make("pitch", E.rng.fork(seg.id * 97), { first: seg.pitch.first, silence: seg.pitch.silence }, pl, seg);
            place(pl, res, u, 0, 0);
            pl.reserved.push({ u0: u - 12, u1: u + res.spr.w + 12 });
          }
        }
        if (seg.place === "bridge" && !pl.marks.has(key + ":bridge")) {
          const u = seg.x0 * pl.d;
          if (u <= uMax) {
            pl.marks.add(key + ":bridge");
            const spans = Math.max(1, Math.floor(((seg.x1 - seg.x0) * pl.d) / 270));
            const res = make("bridge", E.rng.fork(seg.id * 13), { spans: spans }, pl, seg);
            const u0 = seg.x0 * pl.d + ((seg.x1 - seg.x0) * pl.d - res.spr.w) / 2;
            place(pl, res, u0, 1, 2);
            pl.reserved.push({ u0: u0 - 4, u1: u0 + res.spr.w + 4, bridge: true });
          }
        }
        if (seg.jested && !pl.marks.has(key + ":jsign")) {
          const u = (seg.jested.at - 1500 * (E.speed / 7.2)) * pl.d;
          if (u <= uMax) {
            pl.marks.add(key + ":jsign");
            const res = make("jestedSign", E.rng.fork(seg.id * 7), {}, pl, seg);
            place(pl, res, u, 0, 1);
            pl.reserved.push({ u0: u - 4, u1: u + res.spr.w + 4 });
          }
        }
      } else if (pl.name === "far" && seg.jested && !pl.marks.has(key + ":jested")) {
        const u = seg.jested.at * pl.d + E.c * 0;
        if (u <= uMax) {
          pl.marks.add(key + ":jested");
          const spr = art.jested(E.rng.fork(seg.id), {});
          place(pl, { spr: spr }, u - spr.w / 2, 6, 0);
          pl.reserved.push({ u0: u - spr.w / 2 - 10, u1: u + spr.w / 2 + 10 });
        }
      }
    }
  }

  function generate(pl) {
    const uL = pl.d * E.camX - E.c;
    const uR = uL + E.Wsp + GEN_AHEAD;
    E.route.cover(uR / pl.d + 400);
    E.route.cover((uL + E.Wsp + GEN_AHEAD * 2) / Math.max(0.1, pl.d));
    if (pl.name === "roadside" || pl.name === "far") placeMarks(pl, uR + 300);
    for (let r = 0; r < pl.rows.length; r++) genRow(pl, pl.rows[r], r, uR);
    // Forget what has gone past the left edge.
    const cut = uL - 300;
    if (pl.objs.length > 400 || (pl.objs.length && pl.objs[0].u + pl.objs[0].w < cut)) {
      pl.objs = pl.objs.filter(function (o) { return o.u + o.w > cut; });
      pl.actors = pl.actors.filter(function (a) { return (a.u || 0) + 400 > cut; });
      pl.reserved = pl.reserved.filter(function (r) { return r.u1 > cut; });
      pl.wires = pl.wires.filter(function (w) { return w.b[0].u > cut; });
    }
    for (const k of pl.chunks.keys()) if ((k + 1) * CW < cut - CW) pl.chunks.delete(k);
    for (const k of pl.achunks.keys()) if (((k + 1) * ACOLS * K.ascii.CW) / E.P < cut - CW) pl.achunks.delete(k);
    E.route.forget(Math.min(E.camX - 6000, uL / 0.1 - 800));
  }

  function genRow(pl, row, r, uR) {
    let guard = 0;
    while (row.u < uR && guard++ < 200) {
      const rng = row.rng;
      if (pl.name === "far") {
        genFar(pl, row, rng);
        continue;
      }
      if (pl.name === "mid" && genTurbines(pl, row, rng)) continue;
      const X = row.u / pl.d;
      const bl = blendAt(X);
      const seg = bl.b && rng.next() < bl.w ? bl.b : bl.a;
      const table = tableFor(pl, seg, r);
      if (!table.length) {
        row.u += 20;
        continue;
      }
      const entry = rng.weighted(table.map(function (e) { return [e[0], e]; }));
      const gap = rng.range(entry[3][0], entry[3][1]) * pl.def.scale;
      if (!entry[1]) {
        row.u += Math.max(4, gap);
        continue;
      }
      // Avoid repeating the same thing right after itself.
      if (row.last === entry[1] && entry[1] !== "lamp" && entry[1] !== "pole" && rng.chance(0.3)) {
        row.u += 2;
        continue;
      }
      const res = make(entry[1], rng, entry[2], pl, seg);
      if (!res) {
        row.u += 10;
        continue;
      }
      const u = row.u + gap;
      const rsv = overlapsReserved(pl, u, u + res.spr.w);
      if (rsv) {
        row.u = rsv.u1 + 2;
        continue;
      }
      let y = 0;
      if (pl.name === "mid") y = -midHeight(u + res.spr.w / 2) + 1;
      else if (r === 0) y = -rng.int(1, 3);
      else if (r === 2) y = 1;
      if (pl.name === "mid" && midKind(u + res.spr.w / 2) === "sea" && entry[1] !== "lighthouse") {
        row.u = u + 10;
        continue;
      }
      if (pl.name === "mid" && entry[1] === "lighthouse") y = 2;
      const obj = place(pl, res, u, y, r);
      if (res.pasture && pl.name === "mid") obj.ufo = E.forceUfo || rng.chance(0.4);
      row.u = u + res.spr.w;
      row.last = entry[1];
    }
  }

  // The horizon's features: distant towns on land.
  function genFar(pl, row, rng) {
    const X = row.u / pl.d;
    const f = E.route.farAt(X, {});
    const land = 1 - f.sea;
    const r = rng.next();
    if (land > 0.6 && r < f.towns * 0.5) {
      const spr = art.farTown(rng, {});
      const u = row.u + rng.range(10, 60);
      if (!overlapsReserved(pl, u, u + spr.w)) place(pl, { spr: spr }, u, -farHeight(u + spr.w / 2) + 1, 0);
      row.u = u + spr.w + 10;
    } else row.u += rng.range(40, 120);
  }

  // Wind farms in the middle distance: two to four turbines on open fields
  // or meadow, where the region has them. A farm is considered every 120 to
  // 250 px of the plane and the next one comes at least 250 px later.
  const TURBINE_LAND = { fields: 1, meadow: 1 };
  function genTurbines(pl, row, rng) {
    if (row.turbNext === undefined) row.turbNext = row.u + rng.range(40, 160);
    if (row.u < row.turbNext) return false;
    const f = E.route.farAt(row.u / pl.d, {});
    if (!rng.chance(f.turbines * 1.2) || !TURBINE_LAND[midKind(row.u)]) {
      row.turbNext = row.u + rng.range(120, 250);
      return false;
    }
    let u = row.u + rng.range(4, 20);
    const n = rng.int(2, 4);
    for (let i = 0; i < n; i++) {
      const spr = art.turbine(rng);
      if (TURBINE_LAND[midKind(u + 2)] && !overlapsReserved(pl, u, u + spr.w)) place(pl, { spr: spr }, u, -midHeight(u + 2) + 1, 0);
      u += rng.range(34, 52);
    }
    row.u = u;
    row.turbNext = u + rng.range(250, 480);
    return true;
  }

  // ----------------------------------------------------------- terrain ---
  // Heights are in sprite pixels above a plane's ground line.
  const FAR = {};
  const farCache = new Map();
  function farMix(u) {
    const k = Math.floor(u / 8);
    let v = farCache.get(k);
    if (!v) {
      v = E.route.farAt((k * 8) / 0.1, {});
      farCache.set(k, v);
      if (farCache.size > 3000) farCache.clear();
    }
    return v;
  }
  function farHeight(u) {
    const a = farMix(u), b = farMix(u + 8);
    const f = (u - Math.floor(u / 8) * 8) / 8;
    const w = {};
    for (let i = 0; i < world.FAR_KINDS.length; i++) {
      const k = world.FAR_KINDS[i];
      w[k] = K.lerp(a[k], b[k], f);
    }
    // The tallest peaks reach about half way up the sky.
    const room = K.clamp(((E.L.horizon - E.L.skyTop) * 0.55) / 70, 0.35, 1.2);
    const plain = 2 + 4 * K.fbm1(u / 45, 11, 3);
    const hills = 4 + 20 * K.fbm1(u / 70, 21, 4) * room;
    const m = K.fbm1(u / 55, 31, 3);
    const mesas = 3 + (m > 0.52 ? 12 + 6 * K.noise1(u / 160, 33) : m > 0.47 ? (12 * (m - 0.47)) / 0.05 : 0) * room;
    const mountains = 8 + 62 * Math.pow(K.ridge1(u / 85, 41), 1.25) * room;
    FAR.w = w;
    FAR.snowLine = 40 * room;
    return w.plain * plain + w.hills * hills + w.mesas * mesas + w.mountains * mountains;
  }
  function farKind(u) {
    const w = FAR.w;
    let best = "plain", bv = -1;
    for (let i = 0; i < world.FAR_KINDS.length; i++) {
      const k = world.FAR_KINDS[i];
      const v = w[k] + (K.noise1(u / 30, i * 7 + 5) - 0.5) * 0.3;
      if (v > bv) { bv = v; best = k; }
    }
    return best;
  }

  const MID_SCALE = { fields: 60, meadow: 50, forest: 40, town: 80, quay: 80, sea: 80, dunes: 30, slope: 55, snow: 45 };
  const MID_BL = {};
  function midParams(u) {
    const X = u / 0.3;
    const bl = E.route.blendAt(X, MID_BL);
    const pa = placeOf(bl.a), pb = bl.b ? placeOf(bl.b) : pa;
    const ma = bl.a.coast && pa.midCoast ? pa.midCoast : pa.mid;
    const mb = bl.b ? (bl.b.coast && pb.midCoast ? pb.midCoast : pb.mid) : ma;
    return { a: ma, b: mb, w: bl.w, sa: bl.a, sb: bl.b || bl.a };
  }
  function midHeight(u) {
    const p = midParams(u);
    const ha = p.a.kind === "sea" ? 0 : p.a.base + p.a.amp * K.fbm1(u / MID_SCALE[p.a.kind], 51, 4);
    const hb = p.b.kind === "sea" ? 0 : p.b.base + p.b.amp * K.fbm1(u / MID_SCALE[p.b.kind], 51, 4);
    return K.lerp(ha, hb, p.w);
  }
  function midKind(u) {
    const p = midParams(u);
    return K.hash2(Math.floor(u / 4), 61) < p.w ? p.b.kind : p.a.kind;
  }

  // ------------------------------------------------------------ chunks ---
  // A chunk is CW columns of one plane, drawn once as material indices and
  // painted with the plane's colour table when the light has changed.
  function getChunk(pl, k) {
    let ch = pl.chunks.get(k);
    if (!ch) {
      ch = buildChunk(pl, k);
      pl.chunks.set(k, ch);
    }
    return ch;
  }

  function buildChunk(pl, k) {
    const def = pl.def;
    const h = def.bot - def.top;
    const spr = new K.Spr(CW, h);
    const u0 = k * CW;
    const oy = -def.top; // local y 0 is this row of the chunk
    if (pl.name === "far") drawFarGround(spr, u0, oy);
    else if (pl.name === "mid") drawMidGround(spr, u0, oy);
    else if (pl.name === "roadside") drawVerge(spr, u0, oy);
    else drawRoad(spr, u0, oy);
    // Objects, back row first.
    const list = pl.objs.filter(function (o) { return o.u < u0 + CW && o.u + o.w > u0; });
    list.sort(function (a, b) { return a.row - b.row || a.u - b.u; });
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      spr.blit(o.spr, Math.round(o.u - u0), Math.round(o.y - o.spr.h + oy));
    }
    // Wires between poles and pylons.
    for (let i = 0; i < pl.wires.length; i++) {
      const w = pl.wires[i];
      for (let j = 0; j < Math.min(w.a.length, w.b.length); j++) wire(spr, w.a[j], w.b[j], u0, oy);
    }
    // The character view draws fences in characters of its own, so it reads
    // the roadside without them.
    let bare = null;
    if (pl.name === "roadside") {
      bare = spr.d.slice();
      drawEdges(spr, u0, oy);
    }
    const ch = { k: k, u0: u0, h: h, idx: spr.d, bare: bare, lights: spr.lights || [], texts: spr.texts || [], ver: -1, cv: null, snow: null };
    ch.snowMask = snowMask(spr);
    return ch;
  }

  function wire(spr, a, b, u0, oy) {
    const n = Math.ceil(Math.abs(b.u - a.u));
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const u = a.u + (b.u - a.u) * f;
      const y = a.y + (b.y - a.y) * f + Math.sin(Math.PI * f) * Math.min(4, n / 18);
      const x = Math.round(u - u0);
      if (x >= 0 && x < CW && !spr.get(x, Math.round(y + oy))) spr.px(x, Math.round(y + oy), M.dark);
    }
  }

  // Which pixels hold snow when it settles: every pixel with open sky above
  // it, except on water, people, glass and ground (ground turns white in the
  // colour table instead).
  function snowMask(spr) {
    const w = spr.w, d = spr.d;
    const mask = new Uint8Array(d.length);
    let any = false;
    const F = K.FLAG;
    for (let i = w; i < d.length; i++) {
      const v = d[i];
      if (!v || d[i - w] || F[v] & (K.F.NOSNOW | K.F.GROUND | K.F.EMIT)) continue;
      mask[i] = 2;
      if (i + w < d.length && d[i + w] && !(F[d[i + w]] & K.F.NOSNOW)) mask[i + w] = 1;
      any = true;
    }
    return any ? mask : null;
  }

  // The horizon: a silhouette per column, snow on high peaks, and below the
  // horizon a band of distant land or sea.
  function drawFarGround(spr, u0, oy) {
    for (let x = 0; x < CW; x++) {
      const u = u0 + x;
      const h = farHeight(u);
      const kind = farKind(u);
      const w = FAR.w;
      const hl = farHeight(u - 1), hr = farHeight(u + 1);
      FAR.w = w;
      const top = Math.round(oy - h);
      for (let y = Math.max(0, top); y < spr.h; y++) {
        const depth = y - top;
        let c;
        if (y >= oy) {
          // Below the horizon. Coming to the coast, the sea shows first as a
          // strip along the horizon and widens toward the road as the coast
          // comes nearer, with a line of sand where it meets the land, as in
          // the first drive. So the coast is a line across the land, never a
          // straight cut down it.
          const band = y - oy;
          const seaTo = w.sea > 0.97 ? Infinity : K.smooth(0.12, 0.95, w.sea) * (spr.h - oy) * 0.9 + (K.noise1(u / 14, 61) - 0.5) * 3 * K.smooth(0.12, 0.3, w.sea);
          if (band < seaTo) {
            c = band === 0 ? M.waterL : K.hash2(Math.floor((u + band * 7) / (3 + band)), band + 300) < 0.08 ? M.waterL : band > 12 ? M.waterD : M.water;
          } else if (band < seaTo + 1.5) c = M.sandL;
          else if (w.mesas > 0.45) c = (band + Math.round(K.noise1(u / 25, 72) * 2)) % 5 === 0 ? M.sandD : M.sand;
          else if (w.mountains > 0.45) c = K.noise1(u / 6 + band * 0.3, 73) > 0.45 ? M.woodsD : M.woods;
          else if (w.hills > 0.5) c = K.noise1(u / 9 + band * 0.2, 74) > 0.55 ? M.woods : band % 4 === 0 ? M.grassD : M.grass;
          else {
            const b2 = Math.floor(Math.pow(band + 1, 0.7) * 1.6);
            c = [M.grass, M.meadow, M.grassD, M.wheat, M.grass][Math.floor(K.hash2(Math.floor((u + b2 * 37) / 26), b2) * 5)];
          }
        } else if (kind === "mountains") {
          const snowLine = FAR.snowLine;
          const lit = hr > hl ? 1 : 0;
          if (h > snowLine && depth < (h - snowLine) * 0.8 + 2) c = lit ? M.snowS : M.snow;
          else c = depth < 2 ? (lit ? M.rock : M.rockL) : lit ? M.rockD : M.rock;
          if (depth > 18 && K.hash2(u >> 1, y >> 1) < 0.35) c = M.woodsD;
        } else if (kind === "mesas") {
          c = depth < 1 ? M.mesaL : (y >> 2) % 2 ? M.mesa : M.mesaD;
        } else if (kind === "sea") {
          c = y >= oy - 1 ? M.waterL : 0;
        } else {
          const lit = hr > hl;
          c = depth < 1 ? (lit ? M.woods : M.woodsL) : K.hash2(u, y) < 0.25 ? M.woodsD : lit ? M.woodsD : M.woods;
          if (kind === "plain" && depth < 3) c = M.leafD;
        }
        if (c) spr.d[y * CW + x] = c;
      }
    }
  }

  // The middle distance: rolling land in fields, meadow, forest, dunes,
  // rock or snow, and a railway line where the place has one.
  function drawMidGround(spr, u0, oy) {
    for (let x = 0; x < CW; x++) {
      const u = u0 + x;
      const kind = midKind(u);
      if (kind === "sea") continue;
      const h = midHeight(u);
      let top = Math.round(oy - h);
      if (kind === "forest") top -= Math.round(K.noise1(u / 3, 81) * 3);
      const fieldW = 14 + Math.floor(K.hash2(Math.floor(u / 26), 91) * 26);
      const field = Math.floor((u + K.noise1(u / 40, 93) * 10) / fieldW);
      for (let y = Math.max(0, top); y < spr.h; y++) {
        const depth = y - top;
        let c;
        switch (kind) {
          case "fields": {
            // Fields lie in strips that get thinner toward the horizon, each
            // strip cut into fields of its own widths, with a hedge between
            // some strips.
            const band = Math.floor(Math.pow(depth + 1, 0.62) * 1.9);
            const bw = 30 + Math.floor(K.hash2(band, 95) * 60);
            const fid = Math.floor((u + K.hash2(band, 96) * 200) / bw);
            const f = K.hash2(fid, band * 17 + 3);
            const crop = [M.rape, M.wheat, M.grass, M.plough, M.meadow, M.grassL, M.wheat][Math.floor(f * 7)];
            const edgeRow = Math.floor(Math.pow(depth, 0.62) * 1.9) !== band;
            c = depth < 1 ? M.grassL : crop;
            if (depth >= 1 && (y & 1) && (crop === M.rape || crop === M.wheat || crop === M.plough)) c = crop === M.rape ? M.rapeD : crop === M.wheat ? M.wheatD : M.soilD;
            if (edgeRow && depth > 1 && K.hash2(band, 97) < 0.5) c = K.noise1(u / 2.5, band) < 0.55 ? M.leafD : M.leaf;
            break;
          }
          case "meadow":
            c = depth < 1 ? M.grassL : K.hash2(u, y) < 0.08 ? M.flowerW : K.hash2(u >> 2, y >> 1) < 0.3 ? M.grassD : M.grass;
            break;
          case "forest": {
            // Crowns in clumps, lit on top, with darker shade between.
            const n = K.noise2(u / 3.2, depth / 2.2, 131) * 0.7 + K.noise2(u / 9, depth / 5, 132) * 0.3;
            c = depth < 1 ? M.woodsL : n > 0.62 ? M.woodsL : n > 0.36 ? M.woods : n > 0.2 ? M.woodsD : M.woodsDD;
            break;
          }
          case "town":
            c = depth < 1 ? M.grassL : M.grass;
            break;
          case "quay":
            c = depth < 1 ? M.concreteL : depth < 3 ? M.concrete : M.concreteD;
            break;
          case "dunes":
            c = depth < 1 ? M.sandL : (depth + Math.round(K.noise1(u / 9, 97) * 3)) % 4 === 0 ? M.sandD : M.sand;
            break;
          case "slope": {
            // Patches of forest on rock, scree below cliffs, snow up high.
            const wood = K.noise2(u / 16, depth / 9, 141);
            const grain = K.noise2(u / 3, depth / 2, 142);
            if (wood > 0.5) c = grain > 0.55 ? M.woods : grain > 0.3 ? M.woodsD : M.woodsDD;
            else c = grain > 0.7 ? M.rockL : grain > 0.35 ? M.rock : M.rockD;
            if (depth < 1) c = wood > 0.5 ? M.woodsL : M.rockL;
            if (h > 38 && depth < (h - 38) * 0.6) c = depth < 1 ? M.snow : grain > 0.4 ? M.snow : M.snowS;
            break;
          }
          case "snow": {
            // Snowfields with stands of dark spruce.
            const wood = K.noise2(u / 12, depth / 7, 151);
            const grain = K.noise2(u / 3, depth / 2, 152);
            c = depth < 1 ? M.snow : wood > 0.62 ? (grain > 0.5 ? M.woods : M.woodsD) : grain > 0.72 ? M.snowS : M.snow;
            break;
          }
          default:
            c = M.grass;
        }
        spr.d[y * CW + x] = c;
      }
      // The railway: an embankment with the track on top.
      if (railAt(u)) {
        const ry = oy + E.railY;
        spr.px(x, ry, M.rail);
        spr.px(x, ry + 1, u % 3 === 0 ? M.sleeper : M.gravelD);
        for (let y = ry + 2; y < ry + 4; y++) spr.px(x, y, M.gravel);
      }
    }
  }

  // Whether the middle plane has rails at u. Rails run in long stretches.
  function railAt(u) {
    const X = u / 0.3;
    const seg = E.route.segAt(X);
    const p = placeOf(seg);
    if (!p.rail) return false;
    const k = Math.floor(u / 180);
    return K.hash2(k, seg.id * 7 + 3) < p.rail + 0.25 && midKind(u) !== "sea";
  }
  E.railSpan = function (u0, u1) {
    for (let u = u0; u <= u1; u += 6) if (!railAt(u)) return false;
    return true;
  };
  E.waterSpan = function (d, u0, u1) {
    for (let u = u0; u <= u1; u += 6) {
      if (d < 0.2) {
        const f = farMix(u);
        if (f.sea < 0.6) return false;
      } else if (midKind(u) !== "sea") return false;
    }
    return true;
  };

  // The strip of ground along the roadside, and the fences and railings at
  // its front edge.
  function vergeAt(u) {
    const X = u / 0.6;
    const bl = blendAt(X);
    const seg = bl.b && K.hash2(Math.floor(u / 6), 131) < bl.w ? bl.b : bl.a;
    return seg;
  }
  function drawVerge(spr, u0, oy) {
    for (let x = 0; x < CW; x++) {
      const u = u0 + x;
      const seg = vergeAt(u);
      const v = placeOf(seg).verge;
      const bridge = seg.place === "bridge";
      const h = bridge ? 1 : 1 + Math.round(K.noise1(u / 11, 141) * 2);
      for (let y = oy - h; y <= oy + 3; y++) {
        if (y < 0 || y >= spr.h) continue;
        const depth = y - (oy - h);
        let c;
        switch (v) {
          case "pavement": c = depth < 1 ? M.concreteL : y >= oy + 2 ? M.kerb : (u + y) % 7 === 0 ? M.concreteD : M.concrete; break;
          case "sand": c = depth < 1 ? M.sandL : K.hash2(u, y) < 0.15 ? M.sandD : M.sand; break;
          case "snow": c = depth < 1 ? M.snow : M.snowS; break;
          case "rock": c = depth < 1 ? M.rockL : K.hash2(u, y) < 0.3 ? M.rockD : M.rock; break;
          case "deck": c = M.steelD; break;
          case "gravelGrass": c = depth < 1 ? M.grassL : K.hash2(u, y) < 0.4 ? M.gravel : M.grass; break;
          case "moss": c = depth < 1 ? M.grass : K.hash2(u, y) < 0.3 ? M.soilD : M.grassD; break;
          default: c = depth < 1 ? M.grassL : K.hash2(u, y) < 0.25 ? M.grassD : M.grass;
        }
        spr.d[y * CW + x] = c;
      }
      // Tufts of grass along the edge.
      if ((v === "grass" || v === "moss" || v === "gravelGrass") && K.hash2(u, 143) < 0.18) spr.px(x, oy - h - 1, M.grassD);
    }
  }

  function drawEdges(spr, u0, oy) {
    for (let x = 0; x < CW; x++) {
      const u = u0 + x;
      const seg = vergeAt(Math.floor(u / 16) * 16);
      let e = placeOf(seg).edge;
      if (seg.place === "city" && seg.coast) e = "railing";
      const fn = art.EDGE[e] || art.EDGE.none;
      for (let hh = 0; hh <= 9; hh++) {
        const c = fn(u, hh);
        if (c) spr.px(x, oy - hh + 1, c);
      }
    }
  }

  // The road: its surface, and below it the ground in front of the road.
  function surfaceAt(u) {
    const seg = E.route.segAt(u);
    return seg;
  }
  // Bends in a rally stage. Seen from the side, the track swings toward the
  // viewer and back, as a smooth downward offset of up to CURVE_PX sprite px
  // that is level at both ends of the stage. curveAt is from 0 to 1.
  const CURVE_PX = 6;
  E.curveAt = function (x) {
    const seg = E.route.segAt(x);
    if (seg.place !== "rally") return 0;
    // Level for the first and last 110 px, so the arches stand on a
    // straight road.
    const edge = K.smooth(110, 170, x - seg.x0) * K.smooth(110, 170, seg.x1 - x);
    return edge * K.smooth(0.3, 0.7, K.noise1(x / 70, seg.id * 13 + 5));
  };
  // The road's offset at x as it is drawn, in sprite px: whole pixels, and
  // in the character look one whole row of the page at most.
  E.roadShift = function (x) {
    const c = E.curveAt(x);
    if (!c) return 0;
    if (E.ascii) return Math.round((Math.round(c) * K.ascii.CH) / E.P);
    return Math.round(c * CURVE_PX);
  };

  // How far either side of a change of surface the two surfaces mix, in
  // sprite px.
  const ROAD_BLEND = 24;
  function drawRoad(spr, u0, oy) {
    const R = E.L.roadH;
    for (let x = 0; x < CW; x++) {
      const u = u0 + x;
      const seg = surfaceAt(u);
      const p = placeOf(seg);
      // Only a bridge has a joint across the road at its ends. Elsewhere
      // one surface takes over from the next along a slanted, ragged edge
      // fixed to the ground.
      const bridge = p.surface === "bridge";
      const joint = bridge && (Math.abs(u - seg.x0) < 1 || Math.abs(u - seg.x1) < 1);
      const near = !bridge && (u - seg.x0 < ROAD_BLEND ? { xb: seg.x0, other: E.route.segAt(seg.x0 - 1), after: true } : seg.x1 - u < ROAD_BLEND ? { xb: seg.x1, other: E.route.segAt(seg.x1), after: false } : null);
      const nearKind = near && near.other !== seg ? placeOf(near.other).surface : null;
      // Where the track bends toward the viewer it lies lower, with rough
      // ground above it.
      const sh = E.roadShift(u);
      for (let y = 0; y < sh; y++) spr.d[(y + oy) * CW + x] = K.hash2(u, y + 950) < 0.45 ? M.grass : K.hash2(u, y + 951) < 0.5 ? M.gravel : M.grassD;
      for (let y = 0; y < R; y++) {
        let kind = p.surface;
        if (nearKind && nearKind !== kind && nearKind !== "bridge") {
          // The edge leans with the road's depth and wanders a little, with
          // a few loose pixels of each surface on either side of it.
          const edge = near.xb + (y - R / 2) * 1.4 + (K.noise1(y / 3 + near.xb * 0.01, 977) - 0.5) * 14;
          const loose = (K.hash2(u, y + 978) - 0.5) * 6;
          const mine = near.after ? u + loose >= edge : u + loose < edge;
          if (!mine) kind = nearKind;
        }
        let c = joint && y > 0 && y < R - 1 ? M.asphaltD : roadPx(kind, u, y, R);
        // Lane markings stop short of a change of surface.
        if (nearKind && nearKind !== p.surface && (c === M.line || c === M.lineY) && Math.abs(u - near.xb) < ROAD_BLEND) c = M.asphalt;
        spr.d[(y + sh + oy) * CW + x] = c;
      }
      // The ground in front of the road. Near a meeting point it changes
      // along a slanted, ragged line fixed to the ground.
      for (let y = R + sh; y < spr.h - oy; y++) {
        const row = y - R - sh;
        const edgeShift = Math.round(row * 0.6 + (K.hash2(row, seg.id) - 0.5) * 4);
        const s2 = u - edgeShift < seg.x0 ? E.route.segAt(u - edgeShift) : u - edgeShift >= seg.x1 ? E.route.segAt(u - edgeShift) : seg;
        const q = placeOf(s2);
        const fg = s2.coast && q.fgCoast ? q.fgCoast : q.fg;
        spr.d[(y + oy) * CW + x] = fgPx(fg, u, row, s2);
      }
    }
  }

  function roadPx(kind, u, y, R) {
    const hv = K.hash2(u, y + 400);
    const centre = R >> 1;
    switch (kind) {
      case "motorway":
        if (y === 0) return M.concreteD;
        if (y === 1 || y === R - 2) return M.line;
        if (y === R - 1) return M.metal;
        if (y === centre && K.mod(u, 30) < 18) return M.line;
        return hv < 0.06 ? M.asphalt : M.asphaltD;
      case "gravel":
        // The rally stage: a dirt and sand track with two darker ruts.
        if (y === 0 || y === R - 1) return hv < 0.5 ? M.sandD : M.soil;
        if (y === 4 || y === 5 || y === R - 5 || y === R - 4) return hv < 0.3 ? M.soil : M.soilD;
        return hv < 0.1 ? M.sandL : hv < 0.22 ? M.soil : M.sandD;
      case "snow":
        if (y === 0 || y === R - 1) return M.snow;
        if (y === 4 || y === R - 4) return hv < 0.6 ? M.asphalt : M.snowS;
        return hv < 0.15 ? M.snow : M.snowS;
      case "desert":
        if (y === 0 || y === R - 1) return M.sand;
        if ((y === 1 || y === R - 2) && hv < 0.5) return M.sand;
        if (y === centre && K.mod(u, 22) < 10) return M.lineY;
        if (hv < 0.02) return M.asphaltD;
        return M.asphaltL;
      case "bridge":
        if (y === 0) return M.steelD;
        if (y === R - 1) return M.steel;
        if (K.mod(u, 90) === 0) return M.dark;
        if (y === centre && K.mod(u, 24) < 12) return M.line;
        return hv < 0.05 ? M.asphaltD : M.asphalt;
      case "city":
        if (y === 0 || y === R - 1) return M.kerb;
        if (y === centre && K.mod(u, 24) < 12) return M.line;
        return hv < 0.05 ? M.asphaltD : M.asphalt;
      case "shore":
        if (y === 0 || y === R - 1) return hv < 0.6 ? M.sand : M.asphalt;
        if (y === centre && K.mod(u, 24) < 12) return M.line;
        return hv < 0.05 ? M.sand : M.asphalt;
      case "forest":
        if (y === 0 || y === R - 1) return hv < 0.4 ? M.soilD : M.asphaltD;
        if (y === centre && K.mod(u, 30) < 12) return M.line;
        return hv < 0.03 ? M.leafD : hv < 0.05 ? M.bark : M.asphalt;
      case "village":
        if (y === 0 || y === R - 1) return M.kerb;
        if (K.hash2(u >> 2, (y >> 1) + 900) < 0.035) return M.asphaltD;
        return hv < 0.05 ? M.asphaltD : M.asphalt;
      case "mountain":
        if (y === 0 || y === R - 1) return M.rock;
        if (y === centre && K.mod(u, 20) < 10) return M.lineY;
        return hv < 0.05 ? M.asphaltD : M.asphalt;
      default:
        if (y === 0 || y === R - 1) return hv < 0.5 ? M.grass : M.asphaltD;
        if (K.hash2(u >> 2, (y >> 1) + 700) < 0.03) return M.asphaltD;
        return hv < 0.05 ? M.asphaltL : M.asphalt;
    }
  }

  function fgPx(kind, u, row, seg) {
    const hv = K.hash2(u, row + 800);
    switch (kind) {
      case "sea":
      case "bay":
        if (kind === "bay" && row < 3) return row === 0 ? M.steelD : row === 1 ? M.steel : M.steelD;
        if (kind === "sea" && row < 2) return row === 0 ? M.concrete : M.concreteD;
        if (K.hash2(Math.floor((u + row * 5) / (4 + (row >> 2))), row + 820) < 0.07) return M.waterL;
        return row > 14 ? M.waterD : M.water;
      case "lake":
        if (row < 2) return row === 0 ? M.rockL : M.rock;
        if (K.hash2(Math.floor((u + row * 3) / 5), row + 840) < 0.05) return M.waterL;
        return row > 10 ? M.waterD : M.water;
      case "ice": {
        // A frozen lake with snow blown across it in long drifts.
        const n = K.noise2(u / 18, row / 3, 931);
        if (row < 2) return M.snow;
        return n > 0.62 ? M.snow : n > 0.42 ? M.snowS : M.ice;
      }
      case "dunes":
        if (hv < 0.06) return M.grassD;
        return (row + Math.round(K.noise1(u / 11, 850) * 3)) % 5 === 0 ? M.sandD : M.sand;
      case "sand":
        return (row + Math.round(K.noise1(u / 13, 860) * 3)) % 4 === 0 ? M.sandD : hv < 0.01 ? M.rockD : M.sand;
      case "crops": {
        const f = K.hash2(Math.floor(u / 90), seg.id + 870);
        const crop = f < 0.4 ? M.rape : f < 0.75 ? M.wheat : M.grass;
        if (row < 2) return row === 0 ? M.grassD : M.grass;
        if (hv < 0.01) return M.flowerR;
        return row & 1 ? (crop === M.rape ? M.rapeD : crop === M.wheat ? M.wheatD : M.grassD) : crop;
      }
      case "garden": {
        // Beds of one kind each, between grass paths.
        if (row < 2) return M.grass;
        const bed = Math.floor(u / 24 + K.noise1(u / 30, 880) * 0.6);
        const kind = K.hash2(bed, seg.id + 881);
        const band = (row >> 1) % 4;
        if (band === 0) return hv < 0.25 ? M.grassD : M.grass;
        if (kind < 0.35) return band === 2 && hv < 0.4 ? [M.flowerR, M.flowerY, M.flowerW][Math.floor(K.hash2(bed, 882) * 3)] : M.grassD;
        if (kind < 0.7) return (row & 1) ? M.soil : hv < 0.5 ? M.grassL : M.grass;
        return hv < 0.15 ? M.grassD : M.grass;
      }
      case "undergrowth": {
        // Clumps of fern and moss with shade between them.
        const n = K.noise2(u / 4, row / 2.5, 890) * 0.75 + K.noise2(u / 13, row / 6, 891) * 0.25;
        if (hv < 0.002) return M.flowerR;
        return n > 0.62 ? (hv < 0.3 ? M.grassL : M.grass) : n > 0.4 ? M.grassD : n > 0.25 ? M.grassDD : M.soilD;
      }
      case "rough": {
        const n = K.noise2(u / 5, row / 3, 900);
        return row < 2 ? (n > 0.5 ? M.gravel : M.gravelD) : n > 0.6 ? M.grassL : n > 0.3 ? M.grass : M.grassD;
      }
      case "verge": {
        if (row === 4 || row === 5) return K.noise1(u / 6, 910) > 0.35 ? M.water : M.grassD;
        if (row === 3 || row === 6) return M.grassD;
        const n = K.noise2(u / 6, row / 3, 911);
        return n > 0.66 ? M.meadow : n > 0.3 ? M.grass : M.grassD;
      }
      case "park": {
        if (row >= 3 && row <= 5) return row === 5 ? M.concrete : M.concreteL;
        const n = K.noise2(u / 7, row / 3, 921);
        return n > 0.7 ? M.grassL : n > 0.28 ? M.grass : M.grassD;
      }
      default:
        return M.grass;
    }
  }

  // --------------------------------------------------------- the light ---
  // The look of the moment: the time of day, the weather and the page theme.
  function hourNow() {
    return K.mod(hour0 + (E.t * 24) / DAY_S, 24);
  }

  const LOOK = { amb: [1, 1, 1], hor: [0, 0, 0], top: [0, 0, 0], fogCol: [0, 0, 0], cover: 0, wet: 0, snow: 0, fog: 0, fogPlane: 0, theme: [1, 1, 1], sun: [0, 0, 0], low: 0, sunEl: 0, chimneys: 0 };
  function updateLook(dt, force) {
    const env = K.timeOfDay(hourNow(), E.env);
    const w = E.weather;
    const L = LOOK;
    L.theme = darkPage ? [0.5, 0.53, 0.62] : [1, 1, 1];
    L.amb = env.amb;
    L.sun = env.sun;
    L.low = env.low;
    L.sunEl = env.sunEl;
    L.cover = w.cover * 0.85;
    L.wet = w.wet;
    L.snow = w.snow;
    L.fog = w.fog;
    L.fogCol = w.fogCol.map(function (v, i) { return v * (0.25 + 0.75 * env.amb[i]) * L.theme[i]; });
    // Cloud cover greys the sky, and fog whitens the horizon.
    const grey = (env.top[0] + env.top[1] + env.top[2]) / 3;
    const greyH = (env.hor[0] + env.hor[1] + env.hor[2]) / 3;
    for (let i = 0; i < 3; i++) {
      L.top[i] = K.lerp(env.top[i], grey * 0.9, L.cover * 0.7) * L.theme[i];
      L.hor[i] = K.lerp(K.lerp(env.hor[i], greyH, L.cover * 0.6), L.fogCol[i], w.fog * 0.6) * (i === 2 ? 1 : 1) * L.theme[i];
    }
    L.chimneys = K.clamp(0.4 + (12 - w.temp) / 20, 0, 1);
    E.look = L;
    lutTimer -= dt;
    if (lutTimer <= 0 || force) {
      lutTimer = 0.25;
      let changed = force;
      computeTones();
      const skySig = TONE.top.concat(TONE.hor, TONE.ground, TONE.road).map(Math.round);
      if (E.ascii && lastSky) for (let j = 0; j < 12 && !changed; j++) if (Math.abs(skySig[j] - lastSky[j]) >= 2) changed = true;
      if (changed || !lastSky) lastSky = skySig;
      for (let i = 0; i < planes.length; i++) {
        const pl = planes[i];
        L.fogPlane = pl.def.fogPlane;
        const next = K.buildLut(new Uint32Array(256), L, pl.def.haze);
        pl.nextGlut = K.buildGlyphLut(new Uint32Array(256), L, pl.def.haze);
        if (!changed) {
          for (let j = 1; j < K.NMAT && !changed; j++) {
            const a = next[j], b = pl.lut[j];
            if (Math.abs((a & 255) - (b & 255)) >= 2 || Math.abs(((a >>> 8) & 255) - ((b >>> 8) & 255)) >= 2 || Math.abs(((a >>> 16) & 255) - ((b >>> 16) & 255)) >= 2) changed = true;
          }
        }
        pl.nextLut = next;
      }
      if (changed) {
        for (let i = 0; i < planes.length; i++) {
          planes[i].lut = planes[i].nextLut;
          planes[i].glut = planes[i].nextGlut;
          planes[i].ver++;
        }
        L.fogPlane = 0;
        K.buildLut(skyLut, L, 0);
        K.buildGlyphLut(skyGlut, L, 0);
        lutVer++;
        backdropKey = "";
      }
    }
  }

  // ------------------------------------------------------------ row tones ---
  // In the character view every row of the scene has one flat tone, as in
  // the first drive: the sky from its top to the horizon down to the road,
  // then the road, then the ground, fading into the page at the bottom. The
  // keys are the first drive's, for day, dusk and night on the light and the
  // dark page.
  const TONE_KEYS = {
    light: { day: ["#cfe0ee", "#f3efe5", "#e9ebe6", "#d5d6d0"], dusk: ["#766b98", "#f0a068", "#cfb9ab", "#b39d93"], night: ["#0c1226", "#1e284a", "#0b1020", "#1b2236"] },
    dark: { day: ["#1c2b3e", "#2c3947", "#171b21", "#262b33"], dusk: ["#241f3b", "#5c3125", "#1a1618", "#2b2327"], night: ["#090d1a", "#131b31", "#0a0d16", "#191d2a"] },
  };
  for (const th in TONE_KEYS) for (const ph in TONE_KEYS[th]) TONE_KEYS[th][ph] = TONE_KEYS[th][ph].map(K.rgb);
  const TONE = { top: [0, 0, 0], hor: [0, 0, 0], ground: [0, 0, 0], road: [0, 0, 0], dusk: 0 };
  function computeTones() {
    const h = hourNow();
    const day = K.smooth(K.SUNRISE - 0.8, K.SUNRISE + 1.2, h) * (1 - K.smooth(K.SUNSET - 1.8, K.SUNSET + 0.2, h));
    const dusk = 4 * day * (1 - day);
    const wDay = day * (1 - dusk), wNight = (1 - day) * (1 - dusk);
    const keys = darkPage ? TONE_KEYS.dark : TONE_KEYS.light;
    const outs = [TONE.top, TONE.hor, TONE.ground, TONE.road];
    const w = E.weather;
    for (let i = 0; i < 4; i++) {
      const o = outs[i];
      for (let j = 0; j < 3; j++) o[j] = keys.day[i][j] * wDay + keys.dusk[i][j] * dusk + keys.night[i][j] * wNight;
      // Cloud cover greys the sky, and fog whitens the horizon.
      const grey = (o[0] + o[1] + o[2]) / 3;
      const k = (i < 2 ? 0.55 : 0.3) * w.cover;
      for (let j = 0; j < 3; j++) o[j] += (grey - o[j]) * k;
      if (i === 1) for (let j = 0; j < 3; j++) o[j] += (LOOK.fogCol[j] - o[j]) * w.fog * 0.5;
    }
    TONE.dusk = dusk;
  }
  // One entry per row of the scene: its tone, whether it is dark enough for
  // light characters, and how far it has faded into the page.
  const ROWS = [];
  function computeRows() {
    const P = E.P, CH = K.ascii.CH;
    const roadTop = E.L.roadTop * P, roadEnd = (E.L.roadTop + E.L.roadH) * P, gEnd = E.L.groundEnd * P;
    const n = Math.ceil(gEnd / CH) + 2;
    for (let r = 0; r < n; r++) {
      const o = ROWS[r] || (ROWS[r] = { tone: [0, 0, 0], dark: false, fade: 0, r: r });
      const y = (r + 0.5) * CH;
      if (y < roadTop) K.mixRgb(TONE.top, TONE.hor, K.smooth(heroH * 0.08, roadTop, y), o.tone);
      else {
        const src = y < roadEnd ? TONE.road : TONE.ground;
        o.tone[0] = src[0]; o.tone[1] = src[1]; o.tone[2] = src[2];
      }
      const k = 1 - K.smooth(heroH * 0.98, gEnd, y);
      K.mixRgb(pageBg, o.tone, k, o.tone);
      o.fade = 1 - k;
      o.dark = K.lum(o.tone) < 0.38;
    }
    ROWS.length = n;
  }
  function rowAt(yCss) {
    return ROWS[K.clamp(Math.floor(yCss / K.ascii.CH), 0, ROWS.length - 1)];
  }
  E.rowAt = rowAt;
  // The rows a picture's cells fall on. A plane's strips line up with the
  // scene's rows; a moving sprite uses the row at its middle.
  function rowsFrom(r0, n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(ROWS[K.clamp(r0 + i, 0, ROWS.length - 1)]);
    return out;
  }
  const BASE = { far: 2, mid: 1, roadside: 0, road: 0 };
  // Ink for clouds: the page's text colour on light rows and its background
  // on dark ones, turning warm at dusk.
  const INK = { dark: [23, 24, 27], light: [240, 240, 236], dusk: [212, 105, 78], duskK: 0 };
  K.ascii.ink = INK;
  function readInk() {
    const cs = getComputedStyle(root);
    const fg = cs.getPropertyValue("--fg").trim();
    if (/^#[0-9a-f]{6}$/i.test(fg)) {
      const c = K.rgb(fg);
      if (darkPage) { INK.light = c; INK.dark = [23, 24, 27]; }
      else { INK.dark = c; INK.light = pageBg.slice(); }
    }
  }

  // How bright a light is right now, from 0 to 1. Each light has its own
  // times, so they come on one after another and fade over about 2 s.
  function lightLevel(kind, id) {
    const h = hourNow();
    const h2 = h < 12 ? h + 24 : h;
    const fade = 0.08;
    const env = E.env;
    switch (kind) {
      case "win": {
        if (K.hash2(id | 0, 5) < 0.22) return 0;
        const on = K.SUNSET - 1 + 1.8 * K.hash2(id | 0, 6);
        const off = 21.5 + 8 * K.hash2(id | 0, 7);
        const morning = K.hash2(id | 0, 8) < 0.3 ? K.smooth(K.SUNRISE - 1.2, K.SUNRISE - 1.2 + fade, h) * (1 - K.smooth(K.SUNRISE + 0.6, K.SUNRISE + 0.6 + fade, h)) : 0;
        const eve = K.smooth(on, on + fade, h2) * (1 - K.smooth(off, off + fade, h2));
        return Math.max(eve, morning) * K.smooth(0.15, 0.5, env.dark);
      }
      case "lamp":
      case "flood": {
        const on = K.SUNSET - (kind === "flood" ? 0.9 : 0.3) + 0.5 * K.hash2(id | 0, 9);
        const off = 24 + K.SUNRISE + 0.2 - 0.5 * K.hash2(id | 0, 10);
        const fogOn = K.smooth(0.45, 0.6, E.weather.fog) * K.smooth(0.2, 0.4, env.dark);
        return Math.max(K.smooth(on, on + fade, h2) * (1 - K.smooth(off, off + fade, h2)), fogOn);
      }
      case "beacon":
        return K.smooth(0.25, 0.45, env.dark) * (0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin((E.t * 2 * Math.PI) / 2.4 + (id % 7)), 2));
      case "head":
      case "tail":
        return 1;
      case "pod":
        return E.beam;
      case "ind":
        return E.indicator;
      case "mast":
        return K.smooth(0.4, 0.6, env.dark);
      case "navR":
      case "strobe":
        return K.smooth(0.3, 0.5, env.dark) * (kind === "strobe" ? Math.pow(0.5 + 0.5 * Math.sin(E.t * Math.PI), 6) : 1);
      case "flame":
        return 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(E.t * 0.9 + id), 8);
      default:
        return 0;
    }
  }
  E.lightLevel = lightLevel;
  const LIGHT_MAT = { win: "winE", lamp: "lampE", flood: "headE", beacon: "beaconE", head: "headE", tail: "tailE", pod: "carAmber", ind: "indE", mast: "lampE", navR: "beaconE", strobe: "headE", flame: "flameE" };

  // -------------------------------------------------------- drawing kit ---
  function heroOffDev() {
    return Math.round((window.scrollY || 0) * PARALLAX * E.dpr);
  }
  let offDev = 0;
  E.devY = function (y) {
    return Math.round(y * E.pD) - offDev;
  };
  function baseline(pl) {
    return pl.name === "far" ? E.L.horizon : E.L.roadTop;
  }
  // Screen position of a plane position, in sprite px and in device px.
  E.screenXsp = function (d, u) {
    return u - d * E.camX + E.c;
  };
  E.screenX = function (pl, u) {
    return Math.round((u - pl.d * E.camX + E.c) * E.pD);
  };
  E.carX = function () {
    return Math.round((E.carXs + 20) * E.pD);
  };
  E.carWorldX = function () {
    return E.camX + (E.carXs - E.c);
  };

  // A sprite painted with a colour table, cached until the light changes.
  function sprCanvas(spr, lut, ver) {
    let c = spr._cache;
    if (!c) c = spr._cache = {};
    if (c.ver === ver && c.lut === lut) return c.cv;
    if (!c.cv) {
      c.cv = document.createElement("canvas");
      c.cv.width = spr.w;
      c.cv.height = spr.h;
      c.cx = c.cv.getContext("2d");
      c.img = c.cx.createImageData(spr.w, spr.h);
      c.u32 = new Uint32Array(c.img.data.buffer);
    }
    const d = spr.d, u32 = c.u32;
    for (let i = 0; i < d.length; i++) u32[i] = lut[d[i]];
    c.cx.putImageData(c.img, 0, 0);
    c.ver = ver;
    c.lut = lut;
    return c.cv;
  }

  function lutCss(lut, i, a) {
    const v = lut[i];
    return "rgba(" + (v & 255) + "," + ((v >>> 8) & 255) + "," + ((v >>> 16) & 255) + "," + (a === undefined ? 1 : a) + ")";
  }
  E.lutCss = function (planeName, mat, a) {
    const lut = planeName === "sky" ? skyLut : E.planes[planeName].lut;
    return lutCss(lut, mat, a);
  };

  // A sprite read in characters, cached until the light changes. Its cells
  // start at its bottom left corner, so it moves with its own grid.
  function asciiSpr(spr, lut, ver, rowsFn, rowKey, base) {
    let c = spr._ascii;
    if (!c || c.P !== E.P) {
      const P = E.P, A = K.ascii;
      const cols = Math.max(1, Math.ceil((spr.w * P) / A.CW)), rows = Math.max(1, Math.ceil((spr.h * P) / A.CH));
      const offY = rows * A.CH - spr.h * P;
      const sample = function (x, y) {
        const sx = Math.floor(x / P), sy = Math.floor((y - offY) / P);
        if (sx < 0 || sy < 0 || sx >= spr.w || sy >= spr.h) return 0;
        return spr.d[sy * spr.w + sx];
      };
      const cells = A.convert(sample, cols, rows, 0, 0);
      A.draft(cells, { sample: sample, kind: "sprite", base: base, cx0: 0, ry0: 0 });
      if (spr.texts) A.setText(cells, spr.texts.map(function (t) { return { text: t.text, x: t.x * P, y: (t.y + 2.5) * P, w: t.w * P, mat: t.mat }; }), 0, offY);
      c = spr._ascii = { P: E.P, cells: cells, target: {}, ver: -1, lut: null, W: cols * A.CW, H: rows * A.CH, offY: offY };
    }
    const key = ver + ":" + rowKey + ":" + base;
    if (c.key !== key || c.lut !== lut) {
      K.ascii.paint(c.cells, lut, c.target, rowsFn(c.cells.rows), base, INK, null, false);
      c.key = key;
      c.lut = lut;
    }
    return c;
  }

  // Draws a sprite with its bottom left corner at device (x, bottom), and
  // returns the device y of its top. People, animals and vehicles stay in
  // pixels. With `back`, a sprite is drawn in characters on the sky that
  // `back` gives.
  function putSpr(spr, lut, ver, x, bottom, lights, ch) {
    if (E.ascii && ch) {
      const a = asciiSpr(spr, lut, ver, ch.rows, ch.key, ch.base);
      const w = a.W * E.dpr, h = a.H * E.dpr;
      ctx.drawImage(a.target.cv, x, bottom - h, w, h);
      if (lights && spr.lights) drawLightsAscii(spr.lights, x, bottom, spr.h);
      return bottom - h;
    }
    const top = bottom - spr.h * E.pD;
    ctx.drawImage(sprCanvas(spr, lut, ver), x, top, spr.w * E.pD, spr.h * E.pD);
    if (lights && spr.lights) drawLights(spr.lights, x, top);
    return top;
  }

  // One character in a colour at a device position.
  function glyphAt(ch, x, y, rgb, a) {
    if (a <= 0.01) return;
    if (a < 1) ctx.globalAlpha = a;
    ctx.drawImage(K.ascii.stamp(ch, rgb), Math.round(x), Math.round(y), K.ascii.CW * E.dpr, K.ascii.CH * E.dpr);
    ctx.globalAlpha = 1;
  }
  E.glyphAt = glyphAt;
  const RGB = [0, 0, 0];
  function lutRgb(lut, m) {
    return K.lutRgb(lut, m, RGB);
  }
  E.lutRgbOf = function (planeName, m) {
    if (E.ascii) return K.lutRgb(planeName === "sky" ? skyGlut : E.planes[planeName].glut, m, [0, 0, 0]);
    return K.lutRgb(planeName === "sky" ? skyLut : E.planes[planeName].lut, m, [0, 0, 0]);
  };
  // A character's colour for a material on a plane, lifted on dark rows.
  function glyphRgb(pl, m, yCss, level) {
    const c = K.lutRgb(pl ? pl.glut : skyGlut, m, [0, 0, 0]);
    return K.ascii.colour(c, rowAt(yCss), level || 0, 1);
  }

  // In the character view, a sprite that moves takes the colours of the row
  // at its middle.
  function spriteRows(midCss) {
    const row = rowAt(midCss);
    return { key: row.r, rows: function (n) { const a = []; for (let i = 0; i < n; i++) a.push(row); return a; } };
  }
  // Draws a sprite standing on local row y of plane pl, left edge at u.
  E.drawSpr = function (spr, pl, u, y, flip, lights, alpha) {
    const x = E.screenX(pl, u);
    const w = spr.w * E.pD;
    if (x + w < 0 || x > canvas.width) return;
    if (alpha !== undefined && alpha < 1) ctx.globalAlpha = Math.max(0, alpha);
    let ch = null;
    if (E.ascii) {
      ch = spriteRows((baseline(pl) + y - spr.h / 2) * E.P);
      ch.base = BASE[pl.name];
    }
    putSpr(spr, E.ascii ? pl.glut : pl.lut, pl.ver, x, E.devY(baseline(pl) + y), lights, ch);
    ctx.globalAlpha = 1;
  };
  E.drawPx = function (mat, pl, u, y, alpha, ch) {
    if (E.ascii) {
      glyphAt(ch || "·", E.screenX(pl, u) - ((K.ascii.CW * E.dpr) >> 1), E.devY(baseline(pl) + y) - ((K.ascii.CH * E.dpr) >> 1), glyphRgb(pl, mat, (baseline(pl) + y) * E.P, BASE[pl.name]), alpha === undefined ? 1 : alpha);
      return;
    }
    const lut = pl.lut;
    ctx.fillStyle = lutCss(lut, mat, alpha === undefined ? 1 : alpha);
    ctx.fillRect(E.screenX(pl, Math.floor(u)), E.devY(baseline(pl) + Math.floor(y)), E.pD, E.pD);
  };
  // Rotor blades in characters, as the first drive drew its wind turbines:
  // each blade is a line of characters from the hub to its tip, with + on
  // the hub. A steep blade has one character per row, │ or a slash. A
  // shallow one has ─ along the columns and a slash where it steps to the
  // next row. (u, y) is the hub on plane pl, r the blade length and a the
  // angle of the first blade, all in sprite px.
  E.drawBladesAscii = function (pl, u, y, r, a, mat) {
    const A = K.ascii, P = E.P, dpr = E.dpr;
    const scroll = (pl.d * E.camX - E.c) * P;
    const hx = (u * P) / A.CW, hy = ((baseline(pl) + y) * P) / A.CH;
    const cells = new Map();
    for (let k = 0; k < 3; k++) {
      const b = a + (k * 2 * Math.PI) / 3;
      const dx = (Math.cos(b) * r * P) / A.CW, dy = (Math.sin(b) * r * P) / A.CH;
      const steep = Math.abs(dy) >= Math.abs(dx);
      const n = Math.max(1, Math.round(Math.max(Math.abs(dx), Math.abs(dy))));
      const rising = dx * dy < 0;
      let prevR = Math.floor(hy);
      for (let i = 1; i <= n; i++) {
        const c = Math.floor(hx + (dx * i) / n), rr = Math.floor(hy + (dy * i) / n);
        let ch;
        if (steep) ch = Math.abs(dx) < Math.abs(dy) * 0.35 ? "│" : rising ? "/" : "\\";
        else ch = rr !== prevR ? (rising ? "/" : "\\") : "─";
        prevR = rr;
        cells.set(c * 4096 + rr, ch);
      }
    }
    cells.set(Math.floor(hx) * 4096 + Math.floor(hy), "+");
    cells.forEach(function (ch, key) {
      const c = Math.floor(key / 4096), rr = key - c * 4096;
      const rgb = glyphRgb(pl, mat, (rr + 0.5) * A.CH, ch === "+" ? 0 : 1);
      glyphAt(ch, Math.round((c * A.CW - scroll) * dpr), Math.round(rr * A.CH * dpr) - offDev, rgb, 1);
    });
  };
  E.drawBlob = function (mat, pl, u, y, size, alpha) {
    if (alpha <= 0.01) return;
    if (E.ascii) {
      glyphAt(size > 2 ? "o" : size > 1 ? "°" : "·", E.screenX(pl, u) - ((K.ascii.CW * E.dpr) >> 1), E.devY(baseline(pl) + y) - ((K.ascii.CH * E.dpr) >> 1), glyphRgb(pl, mat, (baseline(pl) + y) * E.P, 1), alpha);
      return;
    }
    ctx.fillStyle = lutCss(pl.lut, mat, alpha);
    const s = size * E.pD;
    ctx.fillRect(E.screenX(pl, u) - (s >> 1), E.devY(baseline(pl) + y) - (s >> 1), s, s);
  };
  E.drawText = function (text, pl, u, y, mat) {
    if (E.ascii) {
      const x0 = E.screenX(pl, u), y0 = E.devY(baseline(pl) + y) - 4 * E.dpr;
      const chars = Array.from(text);
      const rgb = glyphRgb(pl, mat, (baseline(pl) + y) * E.P, 0);
      for (let i = 0; i < chars.length; i++) if (chars[i] !== " ") glyphAt(chars[i], x0 + i * K.ascii.CW * E.dpr, y0, rgb, 1);
      return;
    }
    const key = "t:" + text;
    let spr = textCache.get(key);
    if (!spr) {
      spr = new K.Spr(K.textWidth(text) + 1, 8);
      spr.text(text, 0, 3, mat);
      textCache.set(key, spr);
      if (textCache.size > 50) textCache.clear();
    }
    E.drawSpr(spr, pl, u, y + 5);
  };
  const textCache = new Map();
  E.drawLightAt = function (pl, u, y, w, h, mat, alpha) {
    if (E.ascii) {
      glyphAt("■", E.screenX(pl, u), E.devY(baseline(pl) + y) - 6 * E.dpr, lutRgb(pl.lut, M[mat]), alpha);
      return;
    }
    ctx.fillStyle = lutCss(pl.lut, M[mat], alpha);
    ctx.fillRect(E.screenX(pl, u), E.devY(baseline(pl) + y), w * E.pD, h * E.pD);
  };
  E.drawSky = function (spr, x, y, lights, cloud) {
    let ch = null, bottom = E.devY(y + spr.h);
    if (E.ascii) {
      const A = K.ascii;
      if (cloud) {
        // A cloud sits on the scene's rows, so its characters take the
        // tone of the rows they are on.
        const rows = Math.max(1, Math.ceil((spr.h * E.P) / A.CH));
        const r1 = Math.round(((y + spr.h) * E.P) / A.CH);
        bottom = Math.round(r1 * A.CH * E.dpr) - offDev;
        ch = { key: r1, base: 0, rows: function (n) { return rowsFrom(r1 - n, n); } };
      } else {
        ch = spriteRows((y + spr.h / 2) * E.P);
        ch.base = 1;
      }
    }
    putSpr(spr, E.ascii ? skyGlut : skyLut, lutVer + 0.5, Math.round(x * E.pD), bottom, lights, ch);
  };
  // The sky's colour at a height in CSS px from the top of the scene, as
  // drawSky paints it.
  function skyAt(yCss, out) {
    const look = E.look;
    const hz = (E.L.horizon + 2) * E.P;
    const t = K.clamp(yCss / hz, 0, 1);
    if (t < 0.55) K.mixRgb(look.top, K.mixRgb(look.top, look.hor, 0.42, SKYMID), t / 0.55, out);
    else K.mixRgb(K.mixRgb(look.top, look.hor, 0.42, SKYMID), look.hor, (t - 0.55) / 0.45, out);
    return out;
  }
  const SKYMID = [0, 0, 0];
  E.skyAt = skyAt;
  // Text in ink on the sky, set in the row nearest y, as the first drive set
  // its planes. (x, y) is in sprite px; level is 0, 1 or 2 for full, 0.8 and
  // 0.44 of the ink. With rgb, the text is in that colour instead.
  const INK_LV = [1, 0.8, 0.44];
  const inkRgb = [0, 0, 0];
  E.drawSkyInk = function (text, x, y, level, a, rgb) {
    if (a <= 0.01 || !ROWS.length) return;
    const A = K.ascii, dpr = E.dpr;
    const r = K.clamp(Math.round((y * E.P) / A.CH), 0, ROWS.length - 1);
    const row = ROWS[r];
    if (rgb) { inkRgb[0] = rgb[0]; inkRgb[1] = rgb[1]; inkRgb[2] = rgb[2]; }
    else {
      const ic = row.dark ? INK.light : INK.dark, k = INK_LV[level || 0];
      for (let j = 0; j < 3; j++) inkRgb[j] = row.tone[j] + (ic[j] - row.tone[j]) * k;
    }
    const chars = Array.from(text);
    for (let i = 0; i < chars.length; i++) {
      if (chars[i] !== " ") glyphAt(chars[i], Math.round(x * E.pD) + i * A.CW * dpr, Math.round(r * A.CH * dpr) - offDev, inkRgb, a);
    }
  };
  E.drawSkyGlyph = function (ch, x, y, mat, a) {
    glyphAt(ch, Math.round(x * E.pD), E.devY(y), glyphRgb(null, mat, y * E.P, 1), a === undefined ? 1 : a);
  };
  E.drawSkyPx = function (mat, x, y, a) {
    if (E.ascii) {
      glyphAt("─", Math.round(x * E.pD), E.devY(y) - 6 * E.dpr, glyphRgb(null, mat, y * E.P, 1), a);
      return;
    }
    ctx.fillStyle = lutCss(skyLut, mat, a);
    ctx.fillRect(Math.round(x * E.pD), E.devY(y), E.pD, E.pD);
  };
  E.drawBeam = function (pl, u, y, dir, reach, alpha) {
    const x = E.screenX(pl, u), yy = E.devY(baseline(pl) + y);
    const len = reach * E.pD;
    const g = ctx.createLinearGradient(x, 0, x + dir * len, 0);
    g.addColorStop(0, "rgba(255,236,170," + alpha + ")");
    g.addColorStop(1, "rgba(255,236,170,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, yy);
    ctx.lineTo(x + dir * len, yy - len * 0.06);
    ctx.lineTo(x + dir * len, yy + len * 0.09);
    ctx.closePath();
    ctx.fill();
  };
  // Light falling on the ground from above, such as floodlights on a pitch.
  E.drawPool = function (pl, u0, u1, yTop, yBot, alpha) {
    if (alpha < 0.01) return;
    const x0 = E.screenX(pl, u0), x1 = E.screenX(pl, u1);
    const y0 = E.devY(baseline(pl) + yTop), y1 = E.devY(baseline(pl) + yBot);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "rgba(230,236,255,0)");
    g.addColorStop(0.6, "rgba(230,236,255," + (0.16 * alpha).toFixed(3) + ")");
    g.addColorStop(1, "rgba(230,236,255," + (0.22 * alpha).toFixed(3) + ")");
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.globalCompositeOperation = op;
  };
  E.drawUfoBeam = function (pl, u, yTop, yGround, alpha) {
    const x = E.screenX(pl, u), y0 = E.devY(baseline(pl) + yTop), y1 = E.devY(baseline(pl) + yGround);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, "rgba(150,250,220," + 0.45 * alpha + ")");
    g.addColorStop(1, "rgba(150,250,220," + 0.12 * alpha + ")");
    ctx.fillStyle = g;
    const w0 = 3 * E.pD, w1 = 11 * E.pD;
    ctx.beginPath();
    ctx.moveTo(x - w0, y0);
    ctx.lineTo(x + w0, y0);
    ctx.lineTo(x + w1, y1);
    ctx.lineTo(x - w1, y1);
    ctx.closePath();
    ctx.fill();
  };

  function drawLights(lights, dx, dy) {
    const pD = E.pD;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l.kind.indexOf("rim") === 0) continue;
      const a = lightLevel(l.kind, l.id);
      if (a <= 0.01) continue;
      const mat = M[LIGHT_MAT[l.kind] || "winE"];
      ctx.fillStyle = lutCss(skyLut, mat, a);
      ctx.fillRect(dx + l.x * pD, dy + l.y * pD, l.w * pD, l.h * pD);
      if (l.kind === "lamp" || l.kind === "flood" || l.kind === "head") glow(dx + (l.x + l.w / 2) * pD, dy + (l.y + l.h / 2) * pD, (l.kind === "flood" ? 7 : 8) * pD, a * (l.kind === "flood" ? 0.14 : l.kind === "head" ? 0.24 * E.beam : 0.24), l.kind === "head" ? [255, 240, 200] : l.kind === "flood" ? [240, 244, 255] : [255, 214, 140]);
    }
  }

  // Lights over a sprite drawn in characters: a square in the light's
  // colour in the cell the light falls in.
  function drawLightsAscii(lights, x, bottom, sprH) {
    const A = K.ascii, P = E.P, dpr = E.dpr;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i];
      if (l.kind.indexOf("rim") === 0) continue;
      const a = lightLevel(l.kind, l.id);
      if (a <= 0.01) continue;
      const col = Math.floor(((l.x + l.w / 2) * P) / A.CW);
      const row = Math.floor(((sprH - l.y - l.h / 2) * P) / A.CH);
      const cx = x + col * A.CW * dpr, cy = bottom - (row + 1) * A.CH * dpr;
      const small = l.kind === "head" || l.kind === "tail" || l.kind === "pod" || l.kind === "beacon" || l.kind === "navR" || l.kind === "strobe";
      glyphAt(small ? "▪" : "■", cx, cy, lutRgb(skyLut, M[LIGHT_MAT[l.kind] || "winE"]), a);
      if (l.kind === "lamp" || l.kind === "flood" || l.kind === "head") glow(cx + (A.CW * dpr) / 2, cy + (A.CH * dpr) / 2, (l.kind === "flood" ? 7 : 8) * E.pD, a * (l.kind === "flood" ? 0.14 : l.kind === "head" ? 0.24 * E.beam : 0.24), l.kind === "head" ? [255, 240, 200] : l.kind === "flood" ? [240, 244, 255] : [255, 214, 140]);
    }
  }

  function glow(x, y, r, a, c) {
    if (a < 0.01 || !isFinite(x) || !isFinite(y)) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")");
    g.addColorStop(1, "rgba(" + c[0] + "," + c[1] + "," + c[2] + ",0)");
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalCompositeOperation = op;
  }

  // Only one event starts in any 8 seconds.
  E.event = function () {
    if (E.t - lastEvent < 8) return false;
    lastEvent = E.t;
    return true;
  };

  // ----------------------------------------------------------- the car ---
  const CAR = art.car();
  const WHEELS = art.wheel();
  const WHEEL_AT = [[4, 8], [27, 8]];
  let carDist = 0;

  // Bumps fixed to the road surface: gravel has many, the highway almost
  // none. Heights are in sprite pixels.
  function bumpAt(x) {
    const seg = E.route.segAt(x);
    const s = placeOf(seg).surface;
    const rough = s === "gravel" ? 0.9 : s === "desert" || s === "snow" ? 0.45 : s === "village" || s === "country" || s === "forest" ? 0.25 : s === "motorway" ? 0.04 : 0.12;
    const k = Math.floor(x / 7);
    const f = x / 7 - k;
    const h = K.hash2(k, 991) < 0.5 ? K.hash2(k, 992) * rough : 0;
    return h * Math.sin(Math.PI * f);
  }

  function updateCar(dt) {
    const x = E.carWorldX();
    bumpFront = bumpAt(x + 31);
    bumpRear = bumpAt(x + 8);
    // A soft spring keeps the body from jumping with every bump.
    const target = (bumpFront + bumpRear) / 2;
    bodyV += ((target - bodyY) * 90 - bodyV * 14) * dt;
    bodyY += bodyV * dt;
    carDist += E.speedNow * dt;
    // The car follows the bends of a rally stage, easing onto each step of
    // the road in the character look.
    const cx = E.carWorldX() + 20;
    const want = E.ascii ? E.roadShift(cx) : E.curveAt(cx) * CURVE_PX;
    carShift += (want - carShift) * (1 - Math.exp(-dt / 0.25));
    // Dipped headlights are on all day, as the law in Czechia asks. Their
    // beams show once it is dark around the road: at night, in fog or rain,
    // and on the dark page.
    const row = E.ascii && ROWS.length ? rowAt(E.L.roadTop * E.P) : null;
    // The indicators blink at 1.5 flashes a second while the car signals,
    // each flash starting at the start of a signal.
    if (traffic && traffic.signal && !E.still) {
      if (indT < 0) indT = E.t;
      const ph = K.mod((E.t - indT) * 1.5, 1);
      E.indicator = K.smooth(0, 0.06, ph) * (1 - K.smooth(0.46, 0.52, ph));
    } else {
      indT = -1;
      E.indicator = 0;
    }
    const dim = 1 - K.smooth(0.22, 0.42, K.lum(row ? row.tone : E.look.hor));
    E.beam = Math.max(K.smooth(0.28, 0.45, E.env.dark), dim, K.smooth(0.3, 0.5, E.weather.fog), K.smooth(0.3, 0.5, E.weather.precip));
  }

  function carTop() {
    const laneY = K.lerp(E.L.laneFar, E.L.laneNear, E.carLane) + carShift;
    let hop = 0;
    const since = E.t - hopT;
    if (since < 0.55) hop = Math.sin((since / 0.55) * Math.PI) * 5;
    return laneY - 17 - hop - bodyY;
  }

  function drawCar() {
    const road = E.planes.road;
    const x = Math.round(E.carXs * E.pD);
    const topY = carTop();
    const dy = Math.round(topY * E.pD) - offDev;
    const scroll = window.scrollY || 0;
    carFade = 1 - K.smooth(heroH * 0.15, heroH * 0.5, scroll);
    if (carFade <= 0) {
      carRect = null;
      return;
    }
    ctx.globalAlpha = carFade;
    putSpr(CAR, road.lut, road.ver, x, dy + CAR.h * E.pD, true);
    const turn = Math.floor(carDist / 1.4) % 4;
    for (let i = 0; i < 2; i++) {
      const w = WHEELS[E.still ? 0 : turn];
      const bump = i === 1 ? bumpFront : bumpRear;
      const wy = Math.round((topY + WHEEL_AT[i][1] + bodyY - bump) * E.pD) - offDev;
      putSpr(w, road.lut, road.ver, x + WHEEL_AT[i][0] * E.pD, wy + 9 * E.pD, false);
    }
    ctx.globalAlpha = 1;
    carRect = { x: x / E.dpr, y: dy / E.dpr, w: (CAR.w * E.pD) / E.dpr, h: (17 * E.pD) / E.dpr };
    // The beam nods as the front wheel rides over a bump before the rear.
    beam(x + 39 * E.pD, dy + 7 * E.pD, 46, E.beam * carFade, (bumpRear - bumpFront) * 8);
  }

  // A headlight beam reaching `len` sprite px forward from device point
  // (x, y), the top of the lamp. It is a cone of light that opens forward
  // and dips a little, and `tilt` sprite px more at its far end, so it
  // nods with the car over bumps. In the character look the cone is fainter
  // and holds characters, as the first drive drew its beam: ═ and = close
  // to the lamp, then - and · that thin out toward the edges and the far
  // end. The characters sit on the road's cells, so the lit road streams
  // through the beam as the car drives. Every beam drawn in a frame is kept
  // in E.beams, so rain and snow can catch its light.
  const BEAM_RGB = [255, 226, 160];
  // l is signed: a beam to the left has a negative length.
  function cone(x, y, l, drop, open, a) {
    const g = ctx.createLinearGradient(x, 0, x + l, 0);
    g.addColorStop(0, "rgba(255,240,190," + a.toFixed(3) + ")");
    g.addColorStop(1, "rgba(255,240,190,0)");
    const op = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y - E.pD);
    ctx.lineTo(x + l, y + drop - open);
    ctx.lineTo(x + l, y + drop + open);
    ctx.lineTo(x, y + 2 * E.pD);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = op;
  }
  // `dir` is 1 for a beam to the right and -1 for one to the left.
  function beam(x, y, len, k, tilt, dir) {
    if (k <= 0.02) return;
    dir = dir || 1;
    const pD = E.pD, l = len * pD;
    const drop = (len / 25 + (tilt || 0)) * pD, open = (len / 6.5) * pD;
    E.beams.push({ x: x, y: y + 0.5 * pD, l: l * dir, drop: drop, open: open, k: k });
    if (!E.ascii) {
      cone(x, y, l * dir, drop, open, 0.32 * k);
      beamWeather(x, y, l * dir, drop, open, k);
      return;
    }
    cone(x, y, l * dir, drop, open, 0.14 * k);
    beamWeather(x, y, l * dir, drop, open, k);
    const A = K.ascii, dpr = E.dpr, cw = A.CW * dpr, chd = A.CH * dpr, P = E.P;
    // Road cell wc starts at this device x.
    const colX = function (wc) { return ((wc * A.CW) / P - E.camX + E.c) * pD; };
    const xa = Math.min(x, x + l * dir), xb = Math.max(x, x + l * dir);
    const c0 = Math.floor(((xa / pD + E.camX - E.c) * P) / A.CW), c1 = Math.ceil((((xb / pD) + E.camX - E.c) * P) / A.CW);
    const yc0 = y + 0.5 * pD;
    for (let wc = c0; wc <= c1; wc++) {
      const cx = colX(wc);
      const f = (dir * (cx + cw / 2 - x)) / l;
      if (f < 0 || f > 1) continue;
      const yc = yc0 + drop * f, hw = pD + open * f;
      const fall = Math.pow(1 - f, 0.8);
      const ra = Math.floor((yc - hw + offDev) / chd), rb = Math.floor((yc + hw + offDev) / chd);
      for (let r = ra; r <= rb; r++) {
        const ry = r * chd - offDev + chd / 2;
        const d = (ry - yc) / (hw + chd * 0.5);
        const v = fall * Math.max(0, 1 - d * d);
        if (v < 0.08 || K.hash2(wc * 7 + 1, r * 3 + 40) > 0.35 + v) continue;
        const g = v > 0.7 ? "═" : v > 0.48 ? "=" : v > 0.26 ? "-" : "·";
        glyphAt(g, cx, r * chd - offDev, BEAM_RGB, k * Math.min(1, 0.35 + v));
      }
    }
  }
  // Rain or snow shows in a beam as it does in real headlights. The drops
  // hang at fixed places in the air, one in some of the 4 px slots along
  // the road, so they stream through the beam as the car drives. Each falls
  // at the weather's speed through the height of the cone and is lit by as
  // much of the beam as reaches it.
  function beamWeather(x, y, l, drop, open, k) {
    const w = E.weather, rain = w.rainAmt || 0, snow = w.snowAmt || 0;
    const amt = Math.max(rain, snow);
    if (amt < 0.05) return;
    const snowy = snow > rain, pD = E.pD, dpr = E.dpr;
    const fall = (snowy ? 25 : 110) * dpr;
    const lean = -E.speedNow * E.P + w.wind * 18 < -8 ? "/" : "|";
    const s0 = Math.floor((Math.min(x, x + l) / pD + E.camX - E.c) / 4), s1 = Math.ceil((Math.max(x, x + l) / pD + E.camX - E.c) / 4);
    const yc0 = y + 0.5 * pD;
    for (let s = s0; s <= s1; s++) {
      if (K.hash2(s, 731) > amt * 0.8) continue;
      const dx = ((s * 4 + 4 * K.hash2(s, 732)) - E.camX + E.c) * pD;
      const f = (dx - x) / l;
      if (f < 0.04 || f > 1) continue;
      const yc = yc0 + drop * f, hw = pD + open * f, H = hw * 2 + 6 * pD;
      const dy = K.mod(E.t * fall * (0.8 + 0.4 * K.hash2(s, 733)) + K.hash2(s, 734) * H, H) - H / 2;
      const d = dy / hw;
      if (d <= -1 || d >= 1) continue;
      const a = k * (1 - f) * (1 - d * d);
      if (a < 0.04) continue;
      if (E.ascii) {
        glyphAt(snowy ? "*" : lean, dx - (K.ascii.CW * dpr) / 2, yc + dy - (K.ascii.CH * dpr) / 2, BEAM_RGB, Math.min(1, a * 1.4));
        continue;
      }
      ctx.fillStyle = "rgba(255,236,180," + Math.min(1, a * 1.2).toFixed(2) + ")";
      if (snowy) ctx.fillRect(Math.round(dx), Math.round(yc + dy), pD, pD);
      else ctx.fillRect(Math.round(dx), Math.round(yc + dy - 2 * pD), Math.max(1, pD >> 1), 3 * pD);
    }
  }

  // How much headlight falls on device point (x, y), from 0 to 1.
  E.beamAt = function (x, y) {
    let best = 0;
    for (let i = 0; i < E.beams.length; i++) {
      const b = E.beams[i];
      const f = (x - b.x) / b.l;
      if (f < 0 || f > 1) continue;
      const half = E.pD + b.open * f;
      const d = (y - (b.y + b.drop * f)) / half;
      if (d <= -1 || d >= 1) continue;
      best = Math.max(best, b.k * (1 - f) * (1 - d * d));
    }
    return best;
  };
  E.BEAM_RGB = BEAM_RGB;

  E.drawVehicle = function (v, spr, lane) {
    const road = E.planes.road;
    const base = lane === 0 ? E.L.laneFar : E.L.laneNear;
    const x = E.screenX(road, v.x), bottom = E.devY(base + 1 + E.roadShift(v.x + spr.w / 2));
    putSpr(spr, road.lut, road.ver, x, bottom, true);
    if (E.beam <= 0.02 || !spr.lights) return;
    // Oncoming vehicles face left and light the road ahead of them.
    const dir = v.speed < 0 ? -1 : 1;
    for (let i = 0; i < spr.lights.length; i++) {
      const l = spr.lights[i];
      if (l.kind !== "head") continue;
      beam(x + (dir > 0 ? l.x + l.w : l.x) * E.pD, bottom - (spr.h - l.y - 1) * E.pD, 36, E.beam, 0, dir);
      break;
    }
  };

  // --------------------------------------------------------------- dust ---
  // Dust leaves the rear wheel from the surface under it. Once in the air it
  // stays where it was released: it drifts, rises, spreads and fades.
  const DUST = {
    gravel: { rate: 90, cols: [M.sandL, M.sandD, M.soil], life: [2.8, 5.2], grow: 9, rise: 9, spread: 0.6, stones: 7 },
    desert: { rate: 40, cols: [M.sandL, M.sand, M.sandD], life: [2, 3.8], grow: 4, rise: 2.5 },
    shore: { rate: 8, cols: [M.sandL, M.sand], life: [1, 2], grow: 2, rise: 1.5 },
    snow: { rate: 24, cols: [M.snow, M.snowS], life: [0.7, 1.4], grow: 2, rise: 3 },
  };
  function updateDust(dt) {
    if (E.still) {
      dust.length = 0;
      return;
    }
    const x = E.carWorldX() + 8;
    const seg = E.route.segAt(x);
    const surf = placeOf(seg).surface;
    let spec = DUST[surf];
    const wet = E.weather.wet;
    if (wet > 0.3 && surf !== "snow") spec = { rate: 30 * wet, cols: [M.greyL, M.cloudS], life: [0.4, 0.9], grow: 2, rise: 1, spray: true };
    const y0 = carTop() + 16;
    if (spec && carFade > 0) {
      const every = 1 / spec.rate;
      while (E.t - lastDust > every) {
        lastDust += every;
        if (dust.length > 420) break;
        const r = E.rng.next();
        dust.push({ x: x + E.rng.range(-1, 1), y: y0 - E.rng.range(0, 1.5), vx: E.speedNow * E.rng.range(0.04, spec.spray ? 0.2 : spec.spread || 0.35), vy: -E.rng.range(0.5, spec.rise), age: 0, life: E.rng.range(spec.life[0], spec.life[1]), grow: spec.grow, col: spec.cols[Math.floor(r * spec.cols.length)], stone: false });
        if (spec.stones && E.rng.chance(spec.stones / spec.rate)) dust.push({ x: x, y: y0 - 1, vx: E.speed * E.rng.range(0.1, 0.4), vy: -E.rng.range(5, 11), age: 0, life: 2, grow: 0, col: M.gravelD, stone: true, g: 28 });
      }
    } else lastDust = E.t;
    // Exhaust puffs now and then.
    if (E.t - lastPuff > 0.35 && carFade > 0) {
      lastPuff = E.t;
      dust.push({ x: E.carWorldX(), y: carTop() + 11, vx: E.speed * 0.25, vy: -0.8, age: 0, life: 0.9, grow: 2, col: M.cloudD, stone: false, puff: true });
    }
    const top = E.L.roadTop - 30;
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.age += dt;
      if (d.age > d.life) {
        dust.splice(i, 1);
        continue;
      }
      d.x += d.vx * dt;
      d.vx *= Math.exp(-dt * 1.3);
      d.x += E.weather.wind * 1.2 * dt;
      if (d.stone) {
        d.vy += d.g * dt;
        d.y += d.vy * dt;
        if (d.y > y0 + 1) dust.splice(i, 1);
      } else {
        d.y += d.vy * dt;
        d.vy *= Math.exp(-dt * 0.8);
        if (d.y < top) d.y = top;
      }
    }
  }
  function drawDust() {
    const road = E.planes.road;
    for (let i = 0; i < dust.length; i++) {
      const d = dust[i];
      const k = d.age / d.life;
      const size = 1 + Math.floor(k * d.grow);
      const a = (d.stone ? 1 : d.puff ? 0.5 : 0.75) * (1 - k * k) * carFade;
      if (a < 0.02) continue;
      if (E.ascii) {
        // A grown puff of dust covers two or three cells.
        const ch = d.stone ? "." : d.puff ? (size > 1 ? "o" : "°") : size > 4 ? "░" : size > 2 ? "°" : size > 1 ? "·" : ".";
        const gx = E.screenX(road, d.x) - ((K.ascii.CW * E.dpr) >> 1), gy = E.devY(d.y) - K.ascii.CH * E.dpr;
        // Dust keeps its own colour, as solid blocks do, so it stays sand
        // and does not turn to soot on a pale row.
        const rgb = K.ascii.colour(K.lutRgb(road.glut, d.col, [0, 0, 0]), rowAt(d.y * E.P), 0, 1, true);
        glyphAt(ch, gx, gy, rgb, a);
        if (!d.stone && !d.puff && size > 2) glyphAt(size > 4 ? "°" : "·", gx - K.ascii.CW * E.dpr, gy + (K.ascii.CH * E.dpr) / 2, rgb, a * 0.7);
        if (!d.stone && !d.puff && size > 4) glyphAt("·", gx + K.ascii.CW * E.dpr, gy - (K.ascii.CH * E.dpr) / 3, rgb, a * 0.6);
        continue;
      }
      ctx.fillStyle = lutCss(road.lut, d.col, a);
      const s = size * E.pD;
      ctx.fillRect(E.screenX(road, d.x) - (s >> 1), E.devY(d.y) - s, s, s);
    }
  }

  // -------------------------------------------------------------- sky ---
  const stars = [];
  function makeStars() {
    stars.length = 0;
    const rng = new K.Rng(seed ^ 0x51a7);
    for (let i = 0; i < 160; i++) stars.push({ x: rng.next(), y: Math.pow(rng.next(), 1.3), b: Math.pow(rng.next(), 2.2), p: rng.range(2.5, 6), ph: rng.range(0, 6.3) });
  }

  // The moon in characters, as the first drive drew it: a crescent 15 CSS px
  // across its radius on a 1200 px wide window, set in the page's cells in
  // quarter blocks. Each cell's quarters are lit where their middle falls
  // inside the moon's disc and outside a smaller disc set up and to the
  // right of it. (x, y) is the moon's middle in CSS px from the top left of
  // the scene. Its colour is the first drive's night colour, pale on a
  // dark row and ochre on a light one, and it has no glow.
  const QUAD_CH = Array.from(" ▗▖▄▝▐▞▟▘▚▌▙▀▜▛█");
  const moonRgb = [0, 0, 0];
  // With `stripes`, the lower half of the disc is cut into bands, as the
  // first drive drew a low sun.
  function discBits(x, y, cx, cy, R, stripes) {
    const A = K.ascii, qx = A.CW / 4, qy = A.CH / 4;
    let bits = 0;
    for (let k = 0; k < 4; k++) {
      const dx = x + (k & 1 ? qx : -qx) - cx, dy = y + (k & 2 ? qy : -qy) - cy;
      if (dx * dx + dy * dy > R * R) continue;
      if (stripes && dy > R * 0.1 && Math.floor(dy / (R * 0.2)) % 2 === 1) continue;
      bits |= 8 >> k;
    }
    return bits;
  }
  // The sun in characters, as the first drive drew it: a disc of quarter
  // blocks 20 CSS px in radius on a 1200 px wide window, growing to 36 at
  // dusk, in the first drive's sun colour. When it is low it turns to the
  // dusk colour and its lower half is striped. It has no glow. (x, y) is its
  // middle in CSS px from the top left of the scene.
  const SUN_RGB = { day: [K.rgb("#e3931a"), K.rgb("#f4b73c")], dusk: [K.rgb("#d4694e"), K.rgb("#f0957a")] };
  function drawSunAscii(x, y, a) {
    const A = K.ascii, dpr = E.dpr, dusk = TONE.dusk;
    const R = (20 + 16 * dusk) * K.clamp(vw / 1200, 0.7, 1.2);
    const low = dusk > 0.35;
    const c0 = Math.floor((x - R) / A.CW) - 1, c1 = Math.ceil((x + R) / A.CW) + 1;
    const r0 = Math.floor((y - R) / A.CH) - 1, r1 = Math.ceil((y + R) / A.CH) + 1;
    for (let r = r0; r <= r1; r++) {
      const row = ROWS[K.clamp(r, 0, ROWS.length - 1)];
      if (!row) continue;
      const rgb = (low ? SUN_RGB.dusk : SUN_RGB.day)[row.dark || darkPage ? 1 : 0];
      for (let c = c0; c <= c1; c++) {
        const bits = discBits((c + 0.5) * A.CW, (r + 0.5) * A.CH, x, y, R, low);
        if (bits) glyphAt(QUAD_CH[bits], c * A.CW * dpr, Math.round(r * A.CH * dpr) - offDev, rgb, a);
      }
    }
  }
  function drawMoonAscii(x, y, a) {
    const A = K.ascii, dpr = E.dpr;
    const R = 15 * K.clamp(vw / 1200, 0.7, 1.2);
    const c0 = Math.floor((x - R) / A.CW) - 1, c1 = Math.ceil((x + R) / A.CW) + 1;
    const r0 = Math.floor((y - R) / A.CH) - 1, r1 = Math.ceil((y + R) / A.CH) + 1;
    for (let r = r0; r <= r1; r++) {
      const row = ROWS[K.clamp(r, 0, ROWS.length - 1)];
      if (!row) continue;
      for (let c = c0; c <= c1; c++) {
        const px = (c + 0.5) * A.CW, py = (r + 0.5) * A.CH;
        let bits = discBits(px, py, x, y, R);
        if (bits) bits &= ~discBits(px, py, x + R * 0.5, y - R * 0.15, R * 0.85);
        if (!bits) continue;
        if (row.dark) { moonRgb[0] = 241; moonRgb[1] = 227; moonRgb[2] = 166; }
        else { moonRgb[0] = 156; moonRgb[1] = 138; moonRgb[2] = 74; }
        glyphAt(QUAD_CH[bits], c * A.CW * dpr, Math.round(r * A.CH * dpr) - offDev, moonRgb, a);
      }
    }
  }

  // The moon's path on the distant sea, as the first drive drew it: short
  // lines in the moon's colour on the water below the moon, in a band that
  // widens toward the road. In the character look they are ─ in the far
  // plane's cells, ═ along the middle of the path, in some cells only; in
  // the pixel look they are short streaks. The lines belong to the water, so they drift through the path
  // as the sea moves and fade in and out at its edges.
  const glitRgb = [0, 0, 0];
  function drawGlitter(pl) {
    const env = E.env, L = E.L, P = E.P, dpr = E.dpr;
    if (env.moonEl <= 0) return;
    const vis = K.smooth(0.35, 0.7, env.dark) * K.smooth(0, 0.12, env.moonEl) * (1 - 0.8 * E.look.cover);
    if (vis < 0.02) return;
    const mx = E.Wsp * (0.12 + 0.76 * env.moonUp) * P;
    const R = 15 * K.clamp(vw / 1200, 0.7, 1.2);
    const scrollSp = pl.d * E.camX - E.c;
    const sea = function (xCss, yCss) {
      const m = idxAt(pl, xCss / P + scrollSp, yCss / P - L.horizon);
      return m && K.FLAG[m] & K.F.WATER;
    };
    if (E.ascii) {
      const A = K.ascii, cw = A.CW, chh = A.CH;
      const rH = Math.floor((L.horizon * P) / chh), rEnd = Math.floor((L.roadTop * P) / chh);
      const scroll = scrollSp * P;
      for (let r = rH + 1; r < rEnd; r++) {
        const w = R * (0.4 + (r - rH) * 0.06);
        const row = ROWS[K.clamp(r, 0, ROWS.length - 1)];
        if (!row) continue;
        if (row.dark) { glitRgb[0] = 241; glitRgb[1] = 227; glitRgb[2] = 166; }
        else { glitRgb[0] = 156; glitRgb[1] = 138; glitRgb[2] = 74; }
        const c0 = Math.floor((mx - w + scroll) / cw) - 1, c1 = Math.ceil((mx + w + scroll) / cw);
        for (let cc = c0; cc <= c1; cc++) {
          if (K.hash2(cc, r + 1900) >= 0.6) continue;
          const xc = cc * cw - scroll;
          const d = Math.abs(xc + cw / 2 - mx) / w;
          const a = vis * (1 - K.smooth(0.55, 1, d));
          if (a < 0.03 || !sea(xc + cw / 2, (r + 0.5) * chh)) continue;
          glyphAt(d < 0.3 ? "═" : "─", Math.round(xc * dpr), Math.round(r * chh * dpr) - offDev, glitRgb, a);
        }
      }
      return;
    }
    const pD = E.pD;
    for (let y = L.horizon + 1; y < L.roadTop; y++) {
      const w = R * (0.4 + (((y - L.horizon) * P) / 14) * 0.06);
      const k0 = Math.floor((mx - w) / P / 3 + scrollSp / 3) - 1, k1 = Math.ceil((mx + w) / P / 3 + scrollSp / 3);
      for (let k = k0; k <= k1; k++) {
        if (K.hash2(k, y + 1900) >= 0.45) continue;
        const xs = k * 3 - scrollSp;
        const a = vis * (1 - K.smooth(w * 0.55, w, Math.abs((xs + 1) * P - mx)));
        if (a < 0.03 || !sea((xs + 1) * P, (y + 0.5) * P)) continue;
        ctx.fillStyle = "rgba(250,240,205," + a.toFixed(3) + ")";
        ctx.fillRect(Math.round(xs * pD), E.devY(y), 2 * pD, pD);
      }
    }
  }

  // The rows and the grid, drawn once per change of tone.
  let backdrop = null, backdropKey = "";
  function drawBackdrop() {
    const A = K.ascii, dpr = E.dpr;
    const key = lastSky + ":" + vw + ":" + ROWS.length + ":" + E.L.roadTop + ":" + darkPage + ":" + dpr;
    if (key !== backdropKey) {
      backdropKey = key;
      if (!backdrop) backdrop = document.createElement("canvas");
      const W = Math.ceil(vw), H = ROWS.length * A.CH;
      backdrop.width = W;
      backdrop.height = H;
      const b = backdrop.getContext("2d");
      const roadTop = E.L.roadTop * E.P;
      for (let r = 0; r < ROWS.length; r++) {
        const row = ROWS[r];
        b.fillStyle = K.css(row.tone);
        b.fillRect(0, r * A.CH, W, A.CH);
        // The page's dotted grid runs through the sky, every sixth column.
        if ((r + 1) * A.CH > roadTop) continue;
        const ink = row.dark ? INK.light : INK.dark;
        const c = K.mixRgb(row.tone, ink, 0.16);
        const st = A.stamp("┊", c);
        for (let x = 0; x < W; x += 6 * A.CW) b.drawImage(st, x, r * A.CH);
      }
    }
    // A hidden window can measure 0 wide, and then there is nothing to draw.
    if (!backdrop.width || !backdrop.height) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(backdrop, 0, -offDev, backdrop.width * dpr, backdrop.height * dpr);
  }

  function drawSky() {
    const L = E.L, look = E.look, env = E.env;
    if (E.ascii) {
      computeRows();
      INK.duskK = K.smooth(0.25, 0.7, TONE.dusk);
      drawBackdrop();
      drawSkyThings(L, look, env);
      return;
    }
    const y0 = E.devY(0), yH = E.devY(L.horizon + 2), yEnd = E.devY(L.groundEnd);
    const g = ctx.createLinearGradient(0, y0, 0, yH);
    g.addColorStop(0, K.css(look.top));
    g.addColorStop(0.55, K.css(K.mixRgb(look.top, look.hor, 0.42)));
    g.addColorStop(1, K.css(look.hor));
    ctx.fillStyle = g;
    ctx.fillRect(0, y0, canvas.width, yH - y0);
    ctx.fillStyle = K.css(look.hor);
    ctx.fillRect(0, yH, canvas.width, yEnd - yH);
    drawSkyThings(L, look, env);
  }

  // Stars in the character look, as the first drive drew them. From dusk on
  // about one sky cell in 45 holds a star, set in the page's cells as ·, +
  // or ✦, with the bright ones fewest. Each star fades in as the sky darkens
  // and twinkles by changing brightness slowly.
  let starCells = [], starKey = "";
  const starRgb = [0, 0, 0];
  function drawStarsAscii(L, look, env) {
    const dens = 0.022 * K.smooth(0.3, 0.75, env.dark) * (1 - 0.7 * look.cover);
    if (dens < 0.001 || !ROWS.length) return;
    const A = K.ascii, dpr = E.dpr;
    const cols = Math.ceil(vw / A.CW);
    const r0 = Math.ceil((L.skyTop * E.P) / A.CH), r1 = Math.floor((L.horizon * E.P) / A.CH);
    const key = cols + ":" + r0 + ":" + r1 + ":" + seed;
    if (key !== starKey) {
      starKey = key;
      starCells = [];
      for (let r = r0; r < r1; r++) {
        for (let c = 0; c < cols; c++) {
          const hs = K.hash2(c * 7 + 3 + (seed & 255), r * 13 + 1);
          if (hs >= 0.022) continue;
          const tw = K.hash2(c + 11, r * 5 + 7);
          starCells.push({ c: c, r: r, hs: hs, g: tw < 0.72 ? "·" : tw < 0.92 ? "+" : "✦", lv: tw < 0.72 ? 2 : tw < 0.92 ? 1 : 0, p: 2.5 + 4 * K.hash2(c, r + 90), ph: 6.28 * K.hash2(c + 5, r) });
        }
      }
    }
    for (let i = 0; i < starCells.length; i++) {
      const s = starCells[i];
      if (s.hs >= dens) continue;
      const a = K.smooth(s.hs, s.hs + 0.004, dens) * (0.7 + 0.3 * Math.sin((E.t * 6.283) / s.p + s.ph));
      const row = ROWS[K.clamp(s.r, 0, ROWS.length - 1)];
      if (row.dark) { starRgb[0] = 241; starRgb[1] = 227; starRgb[2] = 166; }
      else { starRgb[0] = 156; starRgb[1] = 138; starRgb[2] = 74; }
      K.ascii.colour(starRgb, row, s.lv, 0);
      glyphAt(s.g, s.c * A.CW * dpr, Math.round(s.r * A.CH * dpr) - offDev, starRgb, a);
    }
  }

  function drawSkyThings(L, look, env) {
    // Stars fade in as the sky darkens, brightest first.
    if (E.ascii) drawStarsAscii(L, look, env);
    const vis = E.ascii ? 0 : K.smooth(0.3, 0.75, env.dark) * (1 - 0.7 * look.cover);
    if (vis > 0.01) {
      const skyH = L.horizon - L.skyTop - 6;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const a = vis * K.smooth(1 - vis, 1.2 - vis, s.b + 0.2) * (0.75 + 0.25 * Math.sin(E.t * (6.283 / s.p) + s.ph));
        if (a < 0.03) continue;
        ctx.fillStyle = "rgba(255,248,224," + a.toFixed(3) + ")";
        ctx.fillRect(Math.round(s.x * E.Wsp) * E.pD, E.devY(L.skyTop + Math.round(s.y * skyH)), E.pD, E.pD);
      }
    }
    // The moon, and the sun with a glow around it. Both set behind the far
    // plane, which is drawn over them. The pixel moon has its phase and a
    // glow; the character moon is the first drive's crescent.
    if (env.moonEl > -0.1) {
      const mx = E.Wsp * (0.12 + 0.76 * env.moonUp), my = L.horizon - env.moonEl * (L.horizon - L.skyTop) * 0.78;
      const r = 4;
      const cx = Math.round(mx * E.pD), cy = E.devY(my);
      if (E.ascii) drawMoonAscii(mx * E.P, my * E.P, 0.3 + 0.7 * env.dark);
      else glow(cx, cy, 22 * E.pD, 0.12 * K.smooth(0.3, 0.8, env.dark), [210, 220, 255]);
      if (!E.ascii) for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
        if (xx * xx + yy * yy > r * r + 1) continue;
        const lit = (xx - E.moonPhase * r * 2) * (xx - E.moonPhase * r * 2) + yy * yy > r * r;
        if (!lit) continue;
        ctx.fillStyle = "rgba(244,236,208," + (0.3 + 0.7 * env.dark).toFixed(2) + ")";
        ctx.fillRect(cx + xx * E.pD, cy + yy * E.pD, E.pD, E.pD);
      }
    }
    if (env.sunEl > -0.2) {
      const sx = E.Wsp * (0.1 + 0.8 * K.clamp(env.sunUp, 0, 1)), sy = L.horizon - env.sunEl * (L.horizon - L.skyTop) * 0.85;
      const cx = Math.round(sx * E.pD), cy = E.devY(sy);
      const cov = 1 - look.cover * 0.85;
      if (!E.ascii) glow(cx, cy, (26 + 30 * env.low) * E.pD, (0.18 + 0.3 * env.low) * cov, [env.sun[0], env.sun[1], env.sun[2]]);
      const r = 5 + env.low;
      ctx.fillStyle = K.css(env.sun, cov);
      if (E.ascii) drawSunAscii(sx * E.P, sy * E.P, cov);
      else for (let yy = -Math.ceil(r); yy <= Math.ceil(r); yy++) for (let xx = -Math.ceil(r); xx <= Math.ceil(r); xx++) {
        if (xx * xx + yy * yy > r * r) continue;
        ctx.fillRect(cx + xx * E.pD, cy + yy * E.pD, E.pD, E.pD);
      }
    }
    // Clouds.
    const w = E.weather;
    for (let i = 0; i < w.clouds.length; i++) {
      const c = w.clouds[i];
      const x = c.u - w.skyShift;
      if (x + c.spr.w < 0 || x > E.Wsp) continue;
      ctx.globalAlpha = c.alpha;
      E.drawSky(c.spr, x, c.y - c.spr.h, false, true);
      ctx.globalAlpha = 1;
    }
  }

  // ------------------------------------------------------------ planes ---
  let paintBudget = 0;
  function drawPlane(pl) {
    if (E.ascii) {
      drawPlaneAscii(pl);
      return;
    }
    const def = pl.def;
    const scroll = pl.d * E.camX - E.c;
    const k0 = Math.floor(scroll / CW), k1 = Math.floor((scroll + E.Wsp) / CW);
    const top = E.devY(baseline(pl) + def.top);
    const h = def.bot - def.top;
    for (let k = k0; k <= k1; k++) {
      const ch = getChunk(pl, k);
      if (ch.ver !== pl.ver && (paintBudget > 0 || !ch.cv)) {
        paintChunk(pl, ch);
        paintBudget--;
      }
      const x = Math.round((k * CW - scroll) * E.pD);
      ctx.drawImage(ch.cv, x, top, CW * E.pD, h * E.pD);
      if (ch.snowCv && E.look.snow > 0.01) {
        ctx.globalAlpha = K.clamp(E.look.snow * 1.6, 0, 1);
        ctx.drawImage(ch.snowCv, x, top, CW * E.pD, h * E.pD);
        ctx.globalAlpha = 1;
      }
      if (ch.lights.length && E.env.dark > 0.1) drawLights(ch.lights, x, top);
    }
  }

  function paintChunk(pl, ch) {
    if (!ch.cv) {
      ch.cv = document.createElement("canvas");
      ch.cv.width = CW;
      ch.cv.height = ch.h;
      ch.cx = ch.cv.getContext("2d");
      ch.img = ch.cx.createImageData(CW, ch.h);
      ch.u32 = new Uint32Array(ch.img.data.buffer);
    }
    const lut = pl.lut, idx = ch.idx, u32 = ch.u32;
    for (let i = 0; i < idx.length; i++) u32[i] = lut[idx[i]];
    ch.cx.putImageData(ch.img, 0, 0);
    if (ch.snowMask && E.look.snow > 0.01) {
      if (!ch.snowCv) {
        ch.snowCv = document.createElement("canvas");
        ch.snowCv.width = CW;
        ch.snowCv.height = ch.h;
        ch.sx = ch.snowCv.getContext("2d");
        ch.simg = ch.sx.createImageData(CW, ch.h);
        ch.s32 = new Uint32Array(ch.simg.data.buffer);
      }
      const snow = lut[M.snow] & 0xffffff, snowS = lut[M.snowS] & 0xffffff;
      const m = ch.snowMask, s32 = ch.s32;
      for (let i = 0; i < m.length; i++) s32[i] = m[i] === 2 ? (255 << 24) | snow : m[i] === 1 ? (150 << 24) | snowS : 0;
      ch.sx.putImageData(ch.simg, 0, 0);
    }
    ch.ver = pl.ver;
  }

  // ------------------------------------------------ planes in characters ---
  // A plane's character strips are ACOLS cells wide. Their rows line up with
  // the rows of the page's glyph field, and their columns move with the
  // plane.
  const ACOLS = 64;
  function idxAt(pl, u, yl) {
    const k = Math.floor(u / CW);
    const ch = getChunk(pl, k);
    const x = Math.floor(u - k * CW), y = Math.floor(yl - pl.def.top);
    if (y < 0 || y >= ch.h) return 0;
    return (ch.bare || ch.idx)[y * CW + x];
  }
  // A strip is read a few rows at a time: started ahead of the right edge
  // and finished over the next frames, or at once if it is needed now.
  function startAChunk(pl, k) {
    const A = K.ascii, P = E.P, def = pl.def, b = baseline(pl);
    const r0 = Math.floor(((b + def.top) * P) / A.CH), r1 = Math.ceil(((b + def.bot) * P) / A.CH);
    const rows = r1 - r0, cols = ACOLS;
    const x0 = k * ACOLS * A.CW;
    const ch = { k: k, cols: cols, rows: rows, r0: r0, x0: x0, b: b, cells: A.cells(cols, rows), next: 0, ready: false, target: {}, ver: -1, lights: [] };
    ch.sample = function (x, y) {
      return idxAt(pl, (x0 + x) / P, (r0 * A.CH + y) / P - b);
    };
    pl.achunks.set(k, ch);
    return ch;
  }
  function stepAChunk(pl, ch, until) {
    const A = K.ascii;
    while (ch.next < ch.rows && (until === Infinity || performance.now() < until)) {
      A.convert(ch.sample, ch.cols, ch.rows, ch.k * ACOLS, ch.r0, ch.cells, ch.next, ch.next + 4);
      ch.next += 4;
    }
    if (ch.next >= ch.rows && !ch.ready) finishAChunk(pl, ch);
  }
  // Redraws a strip's cells the way the first drive built its scene. The
  // road and the fences come from the route, not from the pictures.
  function draftAChunk(pl, ch) {
    const A = K.ascii, P = E.P, L = E.L, cells = ch.cells, CHc = A.CH, cols = ch.cols;
    const o = { sample: ch.sample, kind: pl.name, base: BASE[pl.name], cx0: ch.k * ACOLS, ry0: ch.r0 };
    // The road's rows are those whose middle lies on the road.
    const roadTop = L.roadTop * P, roadEnd = (L.roadTop + L.roadH) * P;
    const first = Math.ceil(roadTop / CHc - 0.5), n = Math.ceil(roadEnd / CHc - 0.5) - first;
    if (pl.name === "far") o.horizon = Math.floor((L.horizon * P) / CHc) - ch.r0;
    if (pl.name === "road") {
      o.fgRow = first + n - ch.r0;
      o.fgRows = Math.ceil((L.groundEnd * P) / CHc) - (first + n);
    }
    A.draft(cells, o);
    if (pl.name === "road") {
      const ci = K.clamp(Math.floor(((L.roadTop + L.roadH / 2) * P) / CHc) - first, 1, n - 2);
      for (let c = 0; c < cols; c++) {
        const uA = (ch.x0 + c * A.CW) / P, uB = (ch.x0 + (c + 1) * A.CW) / P;
        const seg = surfaceAt((uA + uB) / 2);
        const kind = placeOf(seg).surface;
        // Where one surface meets the next there is a joint across the road.
        let joint = null;
        const at = seg.x0 >= uA && seg.x0 < uB ? seg.x0 - 1 : seg.x1 >= uA && seg.x1 < uB ? seg.x1 + 1 : null;
        if (at !== null) {
          const other = placeOf(surfaceAt(at)).surface;
          if (other !== kind) joint = kind === "gravel" || other === "gravel" ? "chequer" : "joint";
        }
        // A bend in a rally stage moves the road down one row, with a pale
        // sand shoulder in the row above it. Where the road steps down or back up,
        // its edges are drawn as \ or /.
        const bend = Math.round(E.curveAt((uA + uB) / 2));
        const prev = Math.round(E.curveAt((uA + uB) / 2 - A.CW / P));
        for (let r = 0; r < ch.rows; r++) {
          const gr = ch.r0 + r, k = r * cols + c;
          if (gr < first) {
            cells.fg[k] = cells.dom[k] = cells.bg[k] = 0;
            cells.glyph[k] = A.G(" ");
          } else if (gr >= first + bend && gr < first + bend + n) A.road(cells, k, kind, gr - first - bend, n, ci, ch.k * ACOLS + c, joint);
          else if (gr < first + bend) {
            A.road(cells, k, kind, 0, n, ci, ch.k * ACOLS + c, null);
            cells.bg[k] = M.sandL;
          }
        }
        if (bend !== prev && !joint) {
          const step = A.G(bend > prev ? "\\" : "/");
          const rows = [first, first + n - 1 + bend];
          for (let i = 0; i < 2; i++) {
            const r = rows[i] - ch.r0;
            if (r < 0 || r >= ch.rows) continue;
            const k = r * cols + c;
            cells.glyph[k] = step;
            cells.fg[k] = M.soilD;
          }
        }
      }
    }
    if (pl.name === "roadside") {
      // The fence runs along the row just above the road.
      const rf = first - 1 - ch.r0;
      if (rf < 0 || rf >= ch.rows) return;
      for (let c = 0; c < cols; c++) {
        const uA = (ch.x0 + c * A.CW) / P, uB = (ch.x0 + (c + 1) * A.CW) / P;
        const seg = vergeAt(Math.floor((uA + uB) / 32) * 16);
        let e = placeOf(seg).edge;
        if (seg.place === "city" && seg.coast) e = "railing";
        if (e === "poles") {
          if (Math.ceil(uA / 34) * 34 < uB) for (let h = 0; h < 3 && rf - h >= 0; h++) A.pole(cells, (rf - h) * cols + c, h);
          continue;
        }
        A.fence(cells, rf * cols + c, e, ch.k * ACOLS + c);
      }
    }
  }

  function finishAChunk(pl, ch) {
    const A = K.ascii, P = E.P, def = pl.def, b = ch.b, x0 = ch.x0, r0 = ch.r0;
    draftAChunk(pl, ch);
    // Sign text and lights from the pictures underneath.
    const u0 = x0 / P, u1 = (x0 + ch.cols * A.CW) / P;
    const runs = [], seen = new Set();
    for (let kp = Math.floor(u0 / CW); kp <= Math.floor(u1 / CW); kp++) {
      const pc = getChunk(pl, kp);
      for (let i = 0; i < pc.texts.length; i++) {
        const t = pc.texts[i];
        const key = "t" + Math.round(pc.u0 + t.x) + ":" + t.y + t.text;
        if (seen.has(key)) continue;
        seen.add(key);
        runs.push({ text: t.text, x: (pc.u0 + t.x) * P - x0, y: (b + def.top + t.y + 2.5) * P - r0 * A.CH, w: t.w * P, mat: t.mat });
      }
      for (let i = 0; i < pc.lights.length; i++) {
        const l = pc.lights[i];
        const ux = pc.u0 + l.x + l.w / 2, yl = def.top + l.y + l.h / 2;
        const c = Math.floor((ux * P - x0) / A.CW), r = Math.floor(((b + yl) * P) / A.CH) - r0;
        if (c < 0 || c >= ch.cols || r < 0 || r >= ch.rows) continue;
        const key = l.id + ":" + c + ":" + r;
        if (seen.has(key)) continue;
        seen.add(key);
        ch.lights.push({ c: c, r: r, kind: l.kind, id: l.id });
      }
    }
    A.setText(ch.cells, runs, 0, 0);
    ch.ready = true;
  }
  let buildUntil = 0;
  // How much snow lies on things, and its colour on a plane.
  const SNOW = { amt: 0, rgb: [0, 0, 0] };
  function snowLook(pl) {
    SNOW.amt = E.look.snow;
    K.lutRgb(pl.glut, M.snow, SNOW.rgb);
    return SNOW;
  }
  function drawPlaneAscii(pl) {
    const A = K.ascii, dpr = E.dpr;
    const scroll = (pl.d * E.camX - E.c) * E.P;
    const span = ACOLS * A.CW;
    const k0 = Math.floor(scroll / span), k1 = Math.floor((scroll + vw) / span);
    const dark = E.env.dark > 0.1;
    // The next strip is read ahead in the time left this frame.
    let nx = pl.achunks.get(k1 + 1);
    if (!nx) nx = startAChunk(pl, k1 + 1);
    if (!nx.ready) stepAChunk(pl, nx, buildUntil);
    else if (!nx.target.cv && performance.now() < buildUntil) {
      A.paint(nx.cells, pl.glut, nx.target, rowsFrom(nx.r0, nx.rows), BASE[pl.name], INK, snowLook(pl), true);
      nx.ver = pl.ver;
    }
    for (let k = k0; k <= k1; k++) {
      let ch = pl.achunks.get(k);
      if (!ch) ch = startAChunk(pl, k);
      if (!ch.ready) stepAChunk(pl, ch, Infinity);
      if (ch.ver !== pl.ver && (paintBudget > 0 || !ch.target.cv)) {
        A.paint(ch.cells, pl.glut, ch.target, rowsFrom(ch.r0, ch.rows), BASE[pl.name], INK, snowLook(pl), true);
        ch.ver = pl.ver;
        paintBudget--;
      }
      const x = Math.round((ch.x0 - scroll) * dpr), y = Math.round(ch.r0 * A.CH * dpr) - offDev;
      ctx.drawImage(ch.target.cv, x, y, ch.cols * A.CW * dpr, ch.rows * A.CH * dpr);
      if (!dark) continue;
      for (let i = 0; i < ch.lights.length; i++) {
        const l = ch.lights[i];
        const a = lightLevel(l.kind, l.id);
        if (a <= 0.01) continue;
        const cx = x + l.c * A.CW * dpr, cy = y + l.r * A.CH * dpr;
        glyphAt(l.kind === "beacon" ? "▪" : "■", cx, cy, lutRgb(skyLut, M[LIGHT_MAT[l.kind] || "winE"]), a);
        if (l.kind === "lamp" || l.kind === "flood") glow(cx + (A.CW * dpr) / 2, cy + (A.CH * dpr) / 2, (l.kind === "flood" ? 7 : 8) * E.pD, a * (l.kind === "flood" ? 0.14 : 0.24), l.kind === "flood" ? [240, 244, 255] : [255, 214, 140]);
      }
    }
  }

  // Arches across the road, such as the rally's start and finish. Layer 0
  // is the far leg, standing on the far edge of the road behind all the
  // traffic. Layer 1 is the near leg and the banner, standing on the near
  // edge and drawn over the car, which drives between the legs.
  function drawGates(layer) {
    const road = E.planes.road;
    for (let i = E.gates.length - 1; i >= 0; i--) {
      const g = E.gates[i];
      const x = E.screenXsp(1, g.X);
      if (x + g.front.w < -E.Wsp) {
        E.gates.splice(i, 1);
        continue;
      }
      if (x + g.front.w < 0 || x > E.Wsp) continue;
      if (layer === 0) E.drawSpr(g.back, road, g.X, 0);
      else E.drawSpr(g.front, road, g.X, E.L.roadH);
    }
  }

  function drawActors(pl) {
    const scroll = pl.d * E.camX - E.c;
    for (let i = 0; i < pl.actors.length; i++) {
      const a = pl.actors[i];
      const u = a.u || 0;
      if (a.gone || u > scroll + E.Wsp + 60 || u + 320 < scroll) continue;
      a.draw(E);
    }
  }
  function updateActors(pl, dt) {
    const scroll = pl.d * E.camX - E.c;
    for (let i = 0; i < pl.actors.length; i++) {
      const a = pl.actors[i];
      const u = a.u || 0;
      if (u > scroll + E.Wsp + 300 || u + 400 < scroll) continue;
      a.update(E, dt);
    }
  }

  // --------------------------------------------------------------- UFO ---
  function maybeUfo() {
    if (ufoDone || E.still || E.env.dark < 0.75 || E.weather.fog > 0.3 || E.weather.precip > 0.1) return;
    const mid = E.planes.mid;
    for (let i = 0; i < mid.objs.length; i++) {
      const o = mid.objs[i];
      if (!o.ufo) continue;
      const sx = E.screenXsp(0.3, o.u) / E.Wsp;
      if (sx > 0.5 && sx < 0.72) {
        o.ufo = false;
        if (!E.event("ufo")) continue;
        ufo = new K.Ufo(E, o);
        ufo.plane = mid;
        mid.actors.push(ufo);
        ufoDone = true;
        return;
      }
    }
  }

  // ------------------------------------------------------------- frame ---
  // The car's pace: 1.5 on a rally stage, 2.5 in a highway sprint and 1
  // elsewhere, eased over about three seconds.
  function updatePace(dt) {
    let want = 1;
    if (!E.still) {
      if (E.route.segAt(E.carWorldX()).place === "rally") want = 1.5;
      if (traffic && traffic.sprint) want = 2.5;
    }
    E.pace += (want - E.pace) * (1 - Math.exp(-dt / 1.1));
    E.speedNow = E.speed * E.pace;
  }

  function update(dt) {
    E.dt = dt;
    E.t += dt;
    updatePace(dt);
    E.camX += E.speedNow * dt;
    const env = K.timeOfDay(hourNow(), E.env);
    const cl = E.route.climateAt(E.carWorldX());
    E.weather.update(dt, cl, env, forced);
    updateLook(dt, false);
    for (let i = 0; i < planes.length; i++) generate(planes[i]);
    E.weather.updateClouds(dt, E);
    E.weather.updateDrops(dt, E);
    traffic.update(E, dt);
    trains.update(E, dt);
    boats.update(E, dt);
    sky.update(E, dt);
    for (let i = 0; i < planes.length; i++) updateActors(planes[i], dt);
    maybeUfo();
    updateCar(dt);
    updateDust(dt);
  }

  function draw() {
    offDev = heroOffDev();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const bottom = E.devY(E.L.groundEnd);
    if (bottom <= 0) return;
    paintBudget = 2;
    buildUntil = performance.now() + 2.5;
    E.beams.length = 0;
    drawSky();
    sky.draw(E);
    const far = E.planes.far, mid = E.planes.mid, rs = E.planes.roadside, road = E.planes.road;
    drawPlane(far);
    drawGlitter(far);
    drawActors(far);
    boats.draw(E, true);
    drawPlane(mid);
    trains.draw(E);
    drawActors(mid);
    boats.draw(E, false);
    E.weather.drawDrops(E, 0, ctx);
    drawPlane(rs);
    drawActors(rs);
    E.weather.drawDrops(E, 1, ctx);
    drawPlane(road);
    drawGates(0);
    traffic.draw(E, 0);
    drawDust();
    drawCar();
    traffic.draw(E, 1);
    drawGates(1);
    E.weather.drawDrops(E, 2, ctx);
    // The scene fades into the page at the bottom. In the character view
    // the rows themselves fade.
    const f0 = E.devY(E.L.fadeTop), f1 = bottom;
    if (!E.ascii) {
      const g = ctx.createLinearGradient(0, f0, 0, f1);
      g.addColorStop(0, K.css(pageBg, 0));
      g.addColorStop(1, K.css(pageBg, 1));
      ctx.fillStyle = g;
      ctx.fillRect(0, f0, canvas.width, f1 - f0 + 1);
    }
    ctx.clearRect(0, f1 + 1, canvas.width, canvas.height);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 1 / 60;
    lastNow = now;
    const scroll = window.scrollY || 0;
    // Nothing to do once the scene has scrolled away.
    if (scroll * (1 - PARALLAX) > (E.L.groundEnd * E.P) + 40) {
      if (!E.cleared) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        E.cleared = true;
      }
      return;
    }
    E.cleared = false;
    for (let i = 0; i < E.rate; i++) update(dt);
    draw();
  }

  // A still picture for reduced motion, drawn again only when something
  // changes.
  let stillQueued = false;
  function drawStill() {
    if (stillQueued) return;
    stillQueued = true;
    requestAnimationFrame(function () {
      stillQueued = false;
      updateLook(0, true);
      for (let i = 0; i < planes.length; i++) generate(planes[i]);
      draw();
    });
  }

  function start() {
    if (started) return;
    started = true;
    K.ascii.init();
    E.still = reducedMQ.matches;
    readColors();
    readInk();
    layout();
    reset({});
    E.moonPhase = E.rng.range(-0.9, 0.9);
    makeStars();
    if (E.still) {
      // Let the weather and the scene settle into a moment.
      for (let i = 0; i < 30; i++) {
        E.weather.update(4, E.route.climateAt(E.carWorldX()), E.env, forced);
      }
      drawStill();
    } else raf = requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------ events ---
  let resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (!started) return;
      const changed = layout();
      farCache.clear();
      if (changed) rebuildPlanes();
      updateLook(0, true);
      if (E.still) drawStill();
    }, 150);
  });
  window.addEventListener("scroll", function () {
    if (started && E.still) drawStill();
  }, { passive: true });
  // layout() sizes the canvas again, which clears it, so a still picture is
  // drawn again after it.
  if (window.ResizeObserver && document.body) {
    new ResizeObserver(function () {
      if (!started) return;
      layout();
      if (E.still) drawStill();
    }).observe(document.body);
  }
  function onTheme() {
    if (!started) return;
    readColors();
    readInk();
    backdropKey = "";
    const car = CAR;
    car._cache = null;
    updateLook(0, true);
    if (E.still) drawStill();
  }
  new MutationObserver(onTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
  darkMQ.addEventListener("change", onTheme);
  reducedMQ.addEventListener("change", function () {
    if (!started) return;
    cancelAnimationFrame(raf);
    E.still = reducedMQ.matches;
    lastNow = 0;
    reset({ seed: seed });
    if (E.still) drawStill();
    else raf = requestAnimationFrame(frame);
  });
  document.addEventListener("langchange", function () {
    if (!started) return;
    requestAnimationFrame(function () {
      layout();
      if (E.still) drawStill();
    });
  });

  // The pointer turns into a hand over the car and the UFO. Clicking the car
  // makes it hop, and clicking the UFO sends it away.
  function overCar(x, y) {
    return carRect && x >= carRect.x && x <= carRect.x + carRect.w && y >= carRect.y - 8 && y <= carRect.y + carRect.h;
  }
  function overUfo(x, y) {
    if (!ufo || ufo.gone) return false;
    const sx = E.screenX(E.planes.mid, ufo.u) / E.dpr, sy = E.devY(E.L.roadTop + ufo.y - 10) / E.dpr;
    return x >= sx - 6 && x <= sx + 30 * E.P + 6 && y >= sy - 6 && y <= sy + 10 * E.P + 6;
  }
  window.addEventListener("pointermove", function (e) {
    if (!started) return;
    root.classList.toggle("over-car", !!(overCar(e.clientX, e.clientY) || overUfo(e.clientX, e.clientY)));
  }, { passive: true });
  function hop() {
    if (E.t - hopT > 0.55) hopT = E.t;
    if (window.Field && carRect) window.Field.pulse(carRect.x + carRect.w / 2, carRect.y + carRect.h / 2);
  }
  window.addEventListener("click", function (e) {
    if (!started || E.still) return;
    if (e.target instanceof Element && e.target.closest("a, button, input, label")) return;
    if (overUfo(e.clientX, e.clientY)) {
      ufo.shoo();
      return;
    }
    if (overCar(e.clientX, e.clientY)) hop();
  });

  // For field.js: whether the scene is dark at a height on screen, so the
  // ruler under the top bar can use light ink.
  window.Drive = {
    get seed() { return seed; },
    darkAt: function (y) {
      if (!E.look) return false;
      if (E.ascii && ROWS.length) return rowAt(y + (window.scrollY || 0) * PARALLAX).dark;
      return K.lum(E.look.top) < 0.4;
    },
    get style() { return E.style; },
    // Switches between the characters ("ascii") and the pixel pictures
    // ("pixel"). The scenery is built again in the new style.
    setStyle: function (style) {
      style = style === "pixel" ? "pixel" : "ascii";
      if (style === E.style) return;
      E.style = style;
      E.ascii = style !== "pixel";
      K.asciiText = E.ascii;
      if (!started) return;
      rebuildPlanes();
      backdropKey = "";
      updateLook(0, true);
      if (E.still) drawStill();
    },
    // Jumps to a place, an hour or a weather for checking the art, for
    // example Drive.jump({ place: "village", hour: 21, weather: { precip: 1, temp: -3 } }).
    jump: function (o) {
      o = o || {};
      if (o.seed === undefined) o.seed = seed;
      reset(o);
      E.moonPhase = E.rng.range(-0.9, 0.9);
      makeStars();
      if (E.still) drawStill();
    },
    // Makes the car hop, as a click on it does.
    hop: function () {
      if (started && !E.still) hop();
    },
    get rate() { return E.rate; },
    // Runs the drive at 1 to 8 times its speed.
    setRate: function (n) {
      E.rate = Math.max(1, Math.min(8, Math.round(n) || 1));
    },
    // Measures the page again, for a page that shows or hides blocks in the
    // hero without a resize. The road moves to keep clear of them.
    refresh: function () {
      if (!started) return;
      layout();
      if (E.still) drawStill();
    },
    engine: E,
  };

  const fontReady = document.fonts && document.fonts.load ? document.fonts.load('11px "Departure Mono"') : Promise.resolve();
  Promise.race([fontReady, new Promise(function (r) { setTimeout(r, 1500); })]).then(start, start);
})();
