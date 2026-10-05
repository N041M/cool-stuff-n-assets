// People, animals and vehicles. These move or animate, so they are drawn on
// every frame rather than into the scenery. Frames are built once and
// recoloured with the light by the engine.
(function () {
  "use strict";

  const K = window.DriveKit;
  const M = K.M, Spr = K.Spr;
  const art = (K.art = K.art || {});

  // ------------------------------------------------------------- people ---
  // People on the roadside are 11 px tall, with 3 empty rows above the head
  // for raised arms. Keys: t top, a sleeve, x armband, p trousers or shorts,
  // l bare leg, o sock, b shoe, c card, n notebook, f flag, F flag second
  // colour, w white collar. The head is 3 px: h the top of the head, k the
  // back of the head, s the face, e an eye, m the upper lip. Around it, L is
  // long hair or a headscarf beside the face, M the same over the shoulders
  // (the top where there is none) and B the brim of a cap. Side views face
  // right, with the back of the head on the left.
  const P = {
    stand: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksm.", "..Mt..", "..tat.", "..tat.", "..tss.", "..pp..", "..pp..", "..pp..", "..bb..",
    ],
    walk1: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksm.", "..Mt..", ".atta.", ".stt.s", "..tt..", "..pp..", ".p..p.", ".p..p.", ".b...b",
    ],
    walk2: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksm.", "..Mt..", "..tat.", "..tat.", "..tss.", "..pp..", "..pp..", "..p.p.", "..bbb.",
    ],
    walk3: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksm.", "..Mt..", ".atta.", "s.tts.", "..tt..", "..pp..", ".p..p.", "p...p.", "b...b.",
    ],
    run1: [
      "......", "......", "......",
      "...hhh", "...kes", "...ksm", "..Mt..", ".atta.", "s.tt.s", "..tt..", "..pp..", ".p..p.", "p....p", "b.....",
    ],
    run2: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksm.", "..Mt..", "..tat.", "..tat.", "..tss.", "..pp..", "..pp..", "..pp..", "..bb..",
    ],
    run3: [
      "......", "......", "......",
      "...hhh", "...kes", "...ksm", "..Mt..", ".atta.", ".stts.", "..tt..", "..pp..", ".p..p.", ".p...p", "b....b",
    ],
    whistle: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksss", "..Mta.", "..ta..", "..tt..", "..tt..", "..pp..", "..pp..", "..pp..", "..bb..",
    ],
    point: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksm.", "..Mt..", "..taaa", "..tt.s", "..tt..", "..pp..", "..pp..", "..pp..", "..bb..",
    ],
    pointDown: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksm.", "..Mt..", "..ta..", "..tta.", "..tt.a", "..pp..s", "..pp..", "..pp..", "..bb..",
    ],
    armUp: [
      "...s..", "...a..", "...a..",
      "..hah.", "..kes.", "..ksm.", "..Mt..", "..tt..", "..tt..", "..tt..", "..pp..", "..pp..", "..pp..", "..bb..",
    ],
    card: [
      "...c..", "...c..", "...a..",
      "..hah.", "..kes.", "..ksm.", "..Mt..", "..tt..", "..tt..", "..tt..", "..pp..", "..pp..", "..pp..", "..bb..",
    ],
    notebook: [
      "......", "......", "......",
      "..hhhB", "..khs.", "..kss.", "..Mt..", "..tas.", "..tnn.", "..tt..", "..pp..", "..pp..", "..pp..", "..bb..",
    ],
    watch: [
      "......", "......", "......",
      "..hhhB", "..khs.", "..kss.", "..Mt..", "..taa.", "..tt..", "..tt..", "..pp..", "..pp..", "..pp..", "..bb..",
    ],
    flagUp: [
      "..fF..", "..Ff..", "...a..",
      "..hah.", "..kes.", "..ksm.", "..Mt..", "..tt..", "..tt..", "..tt..", "..pp..", "..pp..", "..pp..", "..bb..",
    ],
    flagDown: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksm.", "..Mt..", "..tat.", "..tat.", "..tsfF", "..ppFf", "..pp..", "..pp..", "..bb..",
    ],
    kick: [
      "......", "......", "......",
      "..hhhB", "..kes.", "..ksm.", "..Mt..", ".atta.", "s.tt..", "..tt..", "..pp..", "..p.p.", ".p...pp", ".b.....",
    ],
    front: [
      ".....", ".....", ".....",
      ".hhh.", "LeseL", "LsmsL", "MtttM", "ttttx", "stttS", "sppps", ".ppp.", ".l.l.", ".o.o.", ".b.b.",
    ],
    frontBowed: [
      ".....", ".....", ".....",
      ".....", ".hhh.", "LsssL", "MtttM", "ttttx", "stttS", "sppps", ".ppp.", ".l.l.", ".o.o.", ".b.b.",
    ],
    cheer: [
      "s...s", "a...a", "a...a",
      "ahhha", "LeseL", "LsmsL", "MtttM", ".ttt.", ".ttt.", ".ttt.", ".ppp.", ".p.p.", ".p.p.", ".b.b.",
    ],
  };
  const FALLEN = [
    "...........", "...........", "...........", "...........", "...........", "...........", "...........", "...........", "...........", "...........",
    "...........", ".sa.........", "hsttttppllob", "ksttttppllob",
  ];

  // Colour sets for a person. `kit` is a football kit. `head` is the style
  // of the head: "short", "long", "bald", "cap" or "scarf". `cap` is the
  // colour of a cap or a headscarf, and `tache` gives a moustache.
  function personKeys(o) {
    const skin = o.skin || M.skin, hair = o.hair || M.hairB, top = o.top || M.clothB;
    const style = o.head || "short", cap = o.cap || M.clothN;
    const k = {
      t: top, a: o.sleeve || top, x: o.band || o.sleeve || top, S: skin, s: skin,
      p: o.legs || M.clothN, l: skin, o: o.socks || o.legs || M.clothN, b: o.shoes || M.black,
      c: M.signYellow, n: M.white, f: M.signYellow, F: M.signRed, w: M.white,
      // Eyes are darker skin, and very dark on dark skin.
      e: skin === M.skinB ? M.hairK : M.skinB, m: o.tache ? hair : skin,
      h: hair, k: hair, L: 0, M: top, B: 0,
    };
    if (style === "long") { k.L = hair; k.M = hair; }
    else if (style === "bald") { k.h = skin; k.k = M.hairG; }
    else if (style === "cap") { k.h = cap; k.B = cap; }
    else if (style === "scarf") { k.h = cap; k.k = cap; k.L = cap; }
    return k;
  }

  // Builds every frame of a person in one colour set, facing right, and the
  // same frames mirrored to face left.
  art.person = function (o) {
    const keys = personKeys(o || {});
    const frames = {};
    for (const k in P) {
      const s = Spr.from(P[k], keys);
      if (o && o.collar) s.px(2, 6, M.white);
      frames[k] = s;
      frames[k + "L"] = s.flipped();
    }
    frames.fallen = Spr.from(FALLEN, keys);
    return frames;
  };

  const HAIRS = [M.hairK, M.hairB, M.hairB, M.hairY, M.hairG];
  const SKINS = [M.skin, M.skin, M.skin, M.skinD, M.skinB];
  const TOPS = [M.clothR, M.clothB, M.clothG, M.clothY, M.clothP, M.clothO, M.clothW, M.clothK, M.clothSky, M.clothN];
  const LEGS = [M.clothN, M.clothK, M.clothBr, M.clothB, M.grey];
  // Heads of the time: mostly short hair, some long, the odd bald head, flat
  // caps and headscarves.
  const HEADS = [[5, "short"], [3, "long"], [1, "bald"], [2, "cap"], [1.5, "scarf"]];
  const CAPS = [M.clothN, M.clothBr, M.clothK, M.grey, M.clothR];
  const SCARVES = [M.clothR, M.clothW, M.clothY, M.clothP, M.clothSky];
  art.randomPerson = function (rng) {
    const head = rng.weighted(HEADS);
    return art.person({
      hair: rng.pick(HAIRS), skin: rng.pick(SKINS), top: rng.pick(TOPS), legs: rng.pick(LEGS), head: head,
      cap: head === "scarf" ? rng.pick(SCARVES) : rng.pick(CAPS), tache: head !== "scarf" && rng.chance(0.25),
    });
  };
  art.HEADS = HEADS;

  // ------------------------------------------------------------ animals ---
  // Cows, sheep, deer and a fox on the roadside at 6 px to the metre, facing
  // right. Each has a grazing frame and a head-up frame.
  art.cow = function (rng, o) {
    const spotted = rng ? rng.chance(0.5) : true;
    const b = spotted ? M.cow : M.cow, spot = rng && rng.chance(0.5) ? M.cowK : M.hullR;
    const keys = { w: b, k: spot, p: M.cowP, h: M.dark, e: M.black };
    const up = Spr.from([
      "............ee.",
      "..........kwwww",
      ".wwwkkwwwwwwwwp",
      "wwkkkwwwkkwww..",
      "wwwkwwwwkkww...",
      ".wwwwwwwwwww...",
      ".w.w.....w.w...",
      ".w.w.....w.w...",
      ".h.h.....h.h...",
    ], keys);
    const graze = Spr.from([
      "...............",
      "...............",
      ".wwwkkwwwwwwe..",
      "wwkkkwwwkkwwwk.",
      "wwwkwwwwkkwwwww",
      ".wwwwwwwwwww.wp",
      ".w.w.....w.w...",
      ".w.w.....w.w...",
      ".h.h.....h.h...",
    ], keys);
    return { up: up, graze: graze, upL: up.flipped(), grazeL: graze.flipped() };
  };

  art.sheep = function () {
    const keys = { w: M.sheep, d: M.sheepD };
    const up = Spr.from([
      "......dd",
      ".wwwwwdd",
      "wwwwwww.",
      "wwwwwww.",
      ".d.d.d..",
      ".d.d.d..",
    ], keys);
    const graze = Spr.from([
      "........",
      ".wwwww..",
      "wwwwwww.",
      "wwwwwwdd",
      ".d.d.ddd",
      ".d.d.d..",
    ], keys);
    return { up: up, graze: graze, upL: up.flipped(), grazeL: graze.flipped() };
  };

  art.deer = function (rng) {
    const stag = rng && rng.chance(0.4);
    const keys = { d: M.deer, l: M.deerL, a: M.woodD, e: M.black, w: M.white };
    const up = Spr.from([
      stag ? "........a.a" : "...........",
      stag ? ".........a." : "........d.d",
      "........ddd",
      "........dde",
      "l.......dd.",
      "ddddddddd..",
      "dddddddd...",
      "wddddddd...",
      ".d.d...d.d.",
      ".d.d...d.d.",
      ".d.d...d.d.",
    ], keys);
    const graze = Spr.from([
      "...........",
      "...........",
      "...........",
      "...........",
      "l..........",
      "ddddddddd..",
      "ddddddddddd",
      "wdddddddd.dd",
      ".d.d...d.d.",
      ".d.d...d.d.",
      ".d.d...d.d.",
    ], keys);
    return { up: up, graze: graze, upL: up.flipped(), grazeL: graze.flipped() };
  };

  art.fox = function () {
    const keys = { f: M.fox, w: M.white, k: M.black };
    const a = Spr.from([
      ".......f.f",
      "ffff...fff",
      "wfffffffffk",
      "..ffffffw..",
      "..f.f..f.f.",
    ], keys);
    const b = Spr.from([
      ".......f.f",
      "ffff...fff",
      "wfffffffffk",
      "..ffffffw..",
      "...ff..ff..",
    ], keys);
    return { a: a, b: b, aL: a.flipped(), bL: b.flipped() };
  };

  art.dog = function () {
    const keys = { d: M.dog, k: M.black };
    const a = Spr.from(["......dd", "d.....dk", ".dddddd.", ".d.d.d.d", ".d.d.d.d"], keys);
    const b = Spr.from(["......dd", "d.....dk", ".dddddd.", "..dd.dd.", "..d..d.."], keys);
    return { a: a, b: b, aL: a.flipped(), bL: b.flipped() };
  };

  // A cow in the middle distance, for the pasture the UFO visits.
  art.midCow = function () {
    const keys = { w: M.cow, k: M.cowK };
    const s = Spr.from(["......k", ".wkwwww", "wwwkww.", ".w..w.."], keys);
    return { up: s, upL: s.flipped() };
  };

  // A bird in two wing positions.
  art.bird = function (gull) {
    const c = gull ? M.gull : M.bird;
    const up = Spr.from(["#.#", ".#."], { "#": c });
    const flat = Spr.from(["...", "###"], { "#": c });
    const down = Spr.from([".#.", "#.#"], { "#": c });
    return [up, flat, down, flat];
  };

  // ------------------------------------------------------------ vehicles ---
  // A vehicle in sprite pixels, 10 to the metre. Each shape is [key, y0, y1,
  // left at y0, left at y1, right at y0, right at y1]. The body is outlined,
  // then windows and lights go on top, then the wheels with their arches.
  function vehicleRows(W, H, body, details, wheels) {
    const g = [];
    for (let y = 0; y < H; y++) g.push(new Array(W).fill("."));
    function shape(s) {
      for (let y = s[1]; y <= s[2]; y++) {
        const f = s[2] === s[1] ? 0 : (y - s[1]) / (s[2] - s[1]);
        const xl = Math.round(s[3] + (s[4] - s[3]) * f), xr = Math.round(s[5] + (s[6] - s[5]) * f);
        for (let x = Math.max(0, xl); x <= Math.min(W - 1, xr); x++) if (y >= 0 && y < H) g[y][x] = s[0];
      }
    }
    body.forEach(shape);
    const edge = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (g[y][x] === ".") continue;
        if (y === 0 || x === 0 || y === H - 1 || x === W - 1 || g[y - 1][x] === "." || g[y + 1][x] === "." || g[y][x - 1] === "." || g[y][x + 1] === ".") edge.push(y * W + x);
      }
    }
    edge.forEach(function (i) { g[(i / W) | 0][i % W] = "k"; });
    details.forEach(shape);
    wheels.forEach(function (wh) {
      const cx = wh[0], r = wh[1], cy = H - r;
      for (let y = Math.floor(cy - r - 2); y < H; y++) {
        for (let x = Math.floor(cx - r - 2); x <= cx + r + 2; x++) {
          if (x < 0 || x >= W || y < 0) continue;
          const dd = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (dd <= r) g[y][x] = dd <= r * 0.42 ? "s" : "k";
          else if (dd <= r + 1.2 && y + 0.5 < cy && g[y][x] !== ".") g[y][x] = "d";
        }
      }
    });
    return g.map(function (row) { return row.join(""); });
  }

  const VEHICLES = [
    { name: "hatchback", weight: 3, rows: vehicleRows(42, 15,
      [["b", 5, 11, 1, 0, 40, 41], ["b", 0, 4, 9, 6, 26, 35], ["B", 10, 11, 0, 0, 41, 41]],
      [["g", 1, 4, 10, 8, 17, 17], ["g", 1, 4, 20, 20, 27, 33], ["G", 1, 1, 21, 21, 24, 24], ["t", 6, 7, 0, 0, 1, 1], ["h", 6, 7, 40, 40, 41, 41]],
      [[8.5, 3.5], [33.5, 3.5]]) },
    { name: "saloon", weight: 3, rows: vehicleRows(48, 15,
      [["b", 5, 11, 1, 0, 46, 47], ["b", 0, 4, 14, 9, 30, 38], ["B", 10, 11, 0, 0, 47, 47]],
      [["g", 1, 4, 14, 11, 21, 21], ["g", 1, 4, 24, 24, 31, 36], ["G", 1, 1, 25, 25, 28, 28], ["t", 6, 7, 0, 0, 1, 1], ["h", 6, 7, 46, 46, 47, 47]],
      [[10.5, 3.5], [38.5, 3.5]]) },
    { name: "estate", weight: 2, rows: vehicleRows(47, 16,
      [["b", 5, 12, 1, 0, 45, 46], ["b", 0, 4, 2, 1, 30, 37], ["B", 11, 12, 0, 0, 46, 46]],
      [["g", 1, 4, 4, 3, 13, 13], ["g", 1, 4, 16, 16, 22, 22], ["g", 1, 4, 25, 25, 31, 35], ["t", 6, 8, 0, 0, 1, 1], ["h", 6, 7, 45, 45, 46, 46]],
      [[9.5, 3.6], [37.5, 3.6]]) },
    { name: "van", weight: 2, rows: vehicleRows(58, 25,
      [["b", 0, 9, 1, 0, 48, 57], ["b", 10, 20, 0, 0, 57, 57], ["B", 18, 20, 0, 0, 57, 57]],
      [["g", 2, 8, 42, 42, 49, 54], ["G", 2, 2, 43, 43, 46, 46], ["d", 4, 17, 38, 38, 38, 38], ["t", 10, 13, 0, 0, 1, 1], ["h", 11, 12, 56, 56, 57, 57]],
      [[11.5, 4.5], [46.5, 4.5]]) },
    { name: "truck", weight: 1.5, rows: vehicleRows(86, 34,
      [["w", 0, 26, 0, 0, 61, 61], ["b", 7, 14, 64, 64, 80, 85], ["b", 15, 27, 64, 64, 85, 85], ["d", 27, 29, 0, 0, 85, 85]],
      [["b", 20, 22, 1, 1, 60, 60], ["g", 9, 15, 67, 67, 76, 78], ["g", 9, 14, 81, 82, 82, 84], ["t", 23, 25, 0, 0, 1, 1], ["h", 21, 23, 84, 84, 85, 85]],
      [[12.5, 5], [24.5, 5], [73.5, 5]]) },
    { name: "coach", weight: 1, rows: vehicleRows(120, 34,
      [["b", 0, 2, 3, 1, 116, 118], ["b", 3, 29, 0, 0, 119, 119], ["B", 25, 29, 0, 0, 119, 119]],
      [["g", 4, 13, 5, 5, 15, 15], ["g", 4, 13, 18, 18, 28, 28], ["g", 4, 13, 31, 31, 41, 41], ["g", 4, 13, 44, 44, 54, 54],
       ["g", 4, 13, 57, 57, 67, 67], ["g", 4, 13, 70, 70, 80, 80], ["g", 4, 13, 83, 83, 93, 93], ["G", 4, 4, 5, 5, 93, 93],
       ["g", 5, 26, 102, 102, 109, 109], ["d", 5, 26, 105, 105, 105, 105], ["g", 3, 16, 113, 113, 118, 118],
       ["y", 1, 2, 104, 104, 115, 115], ["w", 17, 18, 1, 1, 100, 100], ["t", 20, 23, 0, 0, 1, 1], ["h", 21, 23, 118, 118, 119, 119]],
      [[22.5, 5], [92.5, 5]]) },
    { name: "lorry", weight: 1, rows: vehicleRows(164, 40,
      [["w", 0, 30, 0, 0, 117, 117], ["d", 31, 32, 0, 0, 117, 117], ["b", 4, 12, 124, 124, 156, 163], ["b", 13, 33, 124, 124, 163, 163], ["d", 33, 34, 118, 118, 163, 163]],
      [["b", 24, 25, 1, 1, 116, 116], ["g", 8, 15, 146, 146, 154, 156], ["g", 6, 16, 157, 159, 159, 162], ["s", 27, 31, 128, 128, 140, 140],
       ["d", 0, 10, 143, 143, 143, 143], ["t", 27, 29, 0, 0, 1, 1], ["h", 27, 29, 162, 162, 163, 163]],
      [[12.5, 5.5], [25.5, 5.5], [38.5, 5.5], [133.5, 5.5], [153.5, 5.5]]) },
  ];

  // A red tractor with a white cab roof, which the car overtakes on country
  // roads. It is drawn rather than written out as rows.
  VEHICLES.push({ name: "tractor", weight: 0, slow: true, draw: function () {
    const t = new Spr(40, 28);
    const b = t.h;
    // Rear mudguard, bonnet and grille.
    t.rect(15, b - 16, 22, 8, M.clothR);
    t.hline(15, 36, b - 16, M.body8);
    t.rect(36, b - 15, 2, 6, M.carD);
    t.rect(15, b - 9, 20, 2, M.carD);
    t.ellipse(9.5, b - 9, 9, 8, M.clothR, function (x, y, dx, dy) { return dy < -0.55 ? M.clothR : 0; });
    // The cab: two posts, glass and a white roof.
    t.rect(3, b - 27, 17, 2, M.white);
    t.vline(4, b - 25, b - 16, M.carD);
    t.vline(18, b - 25, b - 16, M.carD);
    t.rect(5, b - 24, 13, 7, M.carGlassL);
    t.rect(9, b - 23, 3, 3, M.hairB);
    t.rect(9, b - 20, 4, 3, M.clothB);
    // The exhaust.
    t.vline(27, b - 22, b - 17, M.carD);
    // Wheels: a big one at the back and a small one in front.
    t.disc(9.5, b - 7.5, 7.5, M.tyre);
    t.disc(9.5, b - 7.5, 3.6, M.clothR);
    t.disc(9.5, b - 7.5, 1.2, M.carSpoke);
    t.disc(32, b - 4.5, 4.5, M.tyre);
    t.disc(32, b - 4.5, 2, M.clothR);
    t.light(37, b - 14, 1, 2, "head", 0);
    t.light(2, b - 14, 1, 2, "tail", 0);
    return t;
  } });

  // A cyclist, in two pedalling frames.
  const CYCLIST = [
    [
      "......hh....",
      ".....hss....",
      ".....tt.....",
      "....ttta....",
      "...tt...a...",
      "...pp.......",
      "..kkkkkkk...",
      ".k..p.k..k..",
      "k.k.p.kk.kk.",
      "k.k.b.k.k.k.",
      ".k.....k.k..",
    ],
    [
      "......hh....",
      ".....hss....",
      ".....tt.....",
      "....ttta....",
      "...tt...a...",
      "...pp.......",
      "..kkkkkkk...",
      ".k.p..k..k..",
      "k.kp..kk.kk.",
      "k.kb..k.k.k.",
      ".k.....k.k..",
    ],
  ];

  art.VEHICLES = VEHICLES;
  art.vehicle = function (spec, body, bodyD) {
    if (spec.draw) return spec.draw();
    const keys = {
      k: M.carK, b: body, B: bodyD, w: M.carW, d: M.carD, g: M.carGlass, G: M.carGlassL, s: M.carSpoke,
      y: M.carAmber, t: M.carTail, h: M.carHead,
    };
    const spr = Spr.from(spec.rows, keys);
    // Head and tail lights are drawn over the picture when they are on.
    for (let y = 0; y < spr.h; y++) {
      for (let x = 0; x < spr.w; x++) {
        const ch = spec.rows[y][x];
        if (ch === "h") spr.light(x, y, 1, 1, "head", 0);
        if (ch === "t") spr.light(x, y, 1, 1, "tail", 0);
      }
    }
    return spr;
  };
  art.cyclist = function (rng) {
    const keys = { h: rng.pick(HAIRS), s: M.skin, t: rng.pick(TOPS), a: M.skin, p: rng.pick(LEGS), b: M.black, k: M.dark };
    return CYCLIST.map(function (rows) { return Spr.from(rows, keys); });
  };

  // --------------------------------------------------------------- the car ---
  // The rally hatchback facing right: the page's accent colour with a white
  // and navy stripe, a door number, a rear wing, a light pod on the bonnet and
  // a driver in a white helmet. The wheels are drawn on their own so they turn.
  const CAR = [
    ".kkkkkkkk........kkk....................",
    ".kddddddk..kkkkkkdddkkkkkk..............",
    "...k..k...krrrrrrrrrrrrrrrk.............",
    "...k..k..kGgggkggggggwwggggk...dyyyyd...",
    ".kkkkkkkkGggggkggggggwbbggggkkkkkkkkkk..",
    ".ktrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrrk.",
    ".ktrrrrrrrrrrrrrrwwwwwwrrrrrrrrrrrrrrhhk",
    ".kwwwwwwwwwwwwwwwwkkkkwwwwwwwwwwwwwwwhhk",
    ".kbbbbbbbbbbbbbbbwwwwkwbbbbbbbbbbbbbbbrk",
    ".krrrrrrrrrrrrrrrwwwkwwrrrrrrrrrrrrrrrrk",
    "dkRRRRRRRRRRRRRRRwwwwwwRRRRRRRRRRRRRRRRk",
    ".kdd.........dddddddddddddd.........dddk",
    "...d.........kkkkkkkkkkkkkd.........kkk.",
    "...d......................d.............",
  ];
  art.car = function () {
    const keys = {
      k: M.carK, d: M.carD, r: M.accent, R: M.accentD, w: M.carW, b: M.carNavy, g: M.carGlass, G: M.carGlassL,
      y: M.carPod, t: M.carTail, h: M.carHead,
    };
    const spr = Spr.from(CAR, keys);
    spr.light(37, 6, 2, 2, "head", 0);
    spr.light(2, 5, 1, 2, "tail", 0);
    spr.light(32, 3, 4, 1, "pod", 0);
    // Indicators on the front and rear corners.
    spr.light(38, 8, 1, 2, "ind", 0);
    spr.light(2, 7, 1, 2, "ind", 0);
    return spr;
  };
  // A wheel with five spokes in four steps of turn.
  art.wheel = function () {
    const frames = [];
    for (let f = 0; f < 4; f++) {
      const s = new Spr(9, 9);
      s.disc(4.5, 4.5, 4.5, M.tyre);
      s.disc(4.5, 4.5, 3.1, M.carRim);
      const a0 = (f / 4) * ((2 * Math.PI) / 5);
      for (let k = 0; k < 5; k++) {
        const a = a0 + (k * 2 * Math.PI) / 5;
        for (let r = 0.6; r < 3; r += 0.5) s.px(4.5 + Math.cos(a) * r - 0.5 + 0.5, 4.5 + Math.sin(a) * r - 0.5 + 0.5, M.carSpoke);
      }
      s.px(4, 4, M.carK);
      frames.push(s);
    }
    return frames;
  };

  // ------------------------------------------------------ middle distance ---
  // Trains at 3 px to the metre: a locomotive and carriages or wagons.
  art.trainCar = function (kind, rng) {
    if (kind === "loco") {
      const s = new Spr(46, 13);
      const body = rng.pick([M.signRed, M.clothB, M.body0]);
      s.rect(1, 3, 44, 8, body);
      s.rect(0, 5, 46, 4, body);
      s.hline(1, 44, 7, M.white);
      s.rect(2, 4, 4, 2, M.glass);
      s.rect(40, 4, 4, 2, M.glass);
      s.rect(1, 11, 44, 1, M.dark);
      for (const x of [5, 11, 34, 40]) s.rect(x, 11, 3, 2, M.black);
      s.line(18, 3, 22, 0, M.dark);
      s.line(22, 0, 26, 3, M.dark);
      s.light(0, 8, 1, 1, "head", 0);
      s.light(45, 8, 1, 1, "tail", 0);
      return s;
    }
    if (kind === "coach") {
      const s = new Spr(70, 12);
      const body = rng.pick([M.clothG, M.clothB, M.plasterB]);
      s.rect(1, 1, 68, 9, body);
      s.hline(1, 68, 1, M.metal);
      s.hline(1, 68, 8, M.cream);
      const id = rng.int(0, 1e8);
      for (let x = 4; x < 66; x += 5) {
        s.rect(x, 3, 3, 3, M.glass);
        s.light(x, 3, 3, 3, "win", id + x);
      }
      s.rect(1, 10, 68, 1, M.dark);
      for (const x of [6, 10, 58, 62]) s.rect(x, 10, 3, 2, M.black);
      return s;
    }
    const s = new Spr(46, 12);
    const k = rng.pick(["box", "tank", "flat"]);
    if (k === "box") {
      s.rect(1, 1, 44, 9, rng.pick([M.brickD, M.woodD, M.container2]));
      for (let x = 3; x < 44; x += 4) s.vline(x, 1, 9, M.dark);
    } else if (k === "tank") {
      s.rect(2, 3, 42, 6, M.grey);
      s.ellipse(3, 6, 2, 3, M.grey);
      s.ellipse(43, 6, 2, 3, M.grey);
      s.hline(2, 43, 3, M.greyL);
    } else {
      s.rect(1, 1, 20, 8, rng.pick([M.container1, M.container3, M.container4]));
      s.rect(23, 1, 20, 8, rng.pick([M.container1, M.container2, M.container4]));
    }
    s.rect(1, 10, 44, 1, M.dark);
    for (const x of [4, 8, 36, 40]) s.rect(x, 10, 3, 2, M.black);
    return s;
  };

  // A sailboat or a fishing boat at 3 px to the metre.
  art.boat = function (rng) {
    if (rng.chance(0.65)) {
      const H = rng.int(18, 26);
      const s = new Spr(22, H + 5);
      const b = s.h;
      const sail = rng.pick([M.sail, M.sail, M.signRed, M.signYellow]);
      s.vline(11, 0, b - 5, M.dark);
      for (let y = 1; y < b - 6; y++) {
        const f = y / (b - 6);
        for (let x = 12; x < 12 + Math.round(f * 8); x++) s.px(x, y, sail);
        for (let x = Math.round(11 - f * 6); x < 11; x++) if (y > 3) s.px(x, y, sail === M.sail ? M.cream : M.sail);
      }
      s.trap(b - 5, b - 2, 0, 3, 21, 18, rng.pick([M.white, M.hull, M.hullR]));
      s.hline(1, 20, b - 5, M.dark);
      s.light(11, 0, 1, 1, "mast", 0);
      return s;
    }
    const s = new Spr(26, 12);
    const b = s.h;
    s.trap(b - 5, b - 1, 0, 3, 25, 22, rng.pick([M.hull, M.hullR, M.clothB]));
    s.hline(1, 24, b - 5, M.white);
    s.rect(14, b - 10, 7, 5, M.white);
    s.rect(15, b - 9, 5, 2, M.glass);
    s.light(15, b - 9, 5, 2, "win", rng.int(0, 1e8));
    s.vline(6, 0, b - 5, M.dark);
    s.line(6, 1, 13, b - 6, M.dark);
    return s;
  };

  // Ships on the horizon, at the horizon's own small scale.
  art.ship = function (rng) {
    if (rng.chance(0.5)) {
      const s = new Spr(30, 7);
      s.trap(4, 6, 0, 2, 29, 27, M.hull);
      for (let x = 4; x < 22; x += 3) s.rect(x, 2, 3, 2, rng.pick([M.container1, M.container2, M.container3, M.container4]));
      s.rect(23, 0, 4, 4, M.white);
      s.px(24, 1, M.glass);
      s.light(24, 1, 2, 1, "win", rng.int(0, 1e8));
      return s;
    }
    const s = new Spr(26, 7);
    s.trap(4, 6, 0, 2, 25, 23, M.white);
    s.rect(4, 2, 18, 2, M.white);
    s.rect(7, 0, 12, 2, M.white);
    s.hline(4, 21, 3, M.glass);
    s.light(4, 3, 18, 1, "win", rng.int(0, 1e8));
    s.px(13, 0, M.signRed);
    return s;
  };

  // --------------------------------------------------------------- the sky ---
  // A rock lying on a rally stage, 3 to 6 px wide.
  art.roadRock = function (rng) {
    const w = rng.int(3, 6), h = w > 4 ? 3 : 2;
    const s = new Spr(w, h);
    for (let y = 0; y < h; y++) {
      const inset = h - 1 - y === h - 1 ? 1 : 0;
      for (let x = inset; x < w - inset; x++) s.px(x, y, y === 0 ? M.rockL : x < w / 2 ? M.rock : M.rockD);
    }
    return s;
  };

  // An airliner in side view, nose to the left: a rounded nose with the
  // cockpit window, a long white fuselage with a blue line along its lower
  // side, a swept fin, the wing seen edge on and an engine under it.
  art.airliner = function () {
    const s = Spr.from([
      "..................dd..",
      ".................ddd..",
      "..wwwwwwwwwwwwwwwwddd.",
      ".gwwwwwwwwwwwwwwwwwwww",
      "..llllllllllllllllll..",
      ".......dddddd.........",
      "........ee............",
    ], { w: M.plane, d: M.planeD, g: M.glass, l: M.clothB, e: M.planeD });
    s.light(7, 5, 1, 1, "navR", 0);
    s.light(19, 0, 1, 1, "strobe", 0);
    return { right: s.flipped(), left: s };
  };

  art.balloon = function (rng) {
    const cols = [[M.balloonR, M.balloonY], [M.balloonB, M.balloonY], [M.balloonR, M.white], [M.clothG, M.balloonY]];
    const c = rng.pick(cols);
    const s = new Spr(15, 22);
    s.ellipse(7.5, 7, 7.5, 7.5, c[0], function (x, y, dx) {
      const band = Math.floor((dx + 1) * 3.5) % 2;
      return band ? c[1] : c[0];
    });
    s.trap(13, 16, 3, 5, 11, 9, c[0]);
    s.vline(5, 16, 18, M.dark);
    s.vline(9, 16, 18, M.dark);
    s.rect(5, 18, 5, 4, M.basket);
    s.light(6, 16, 3, 2, "flame", 0);
    return s;
  };

  art.ufo = function () {
    const s = new Spr(30, 10);
    s.ellipse(15, 3.5, 5.5, 3.5, M.glassL, function (x, y, dx, dy) { return dx < -0.2 && dy < -0.1 ? M.white : M.glassL; });
    s.ellipse(15, 6.5, 15, 2.6, M.ufo, function (x, y, dx, dy) { return dy > 0.25 ? M.ufoD : M.ufo; });
    s.hline(3, 26, 6, M.ufoD);
    for (let i = 0; i < 6; i++) s.light(4 + i * 4, 6, 2, 1, "rim" + i, 0);
    return s;
  };
})();
