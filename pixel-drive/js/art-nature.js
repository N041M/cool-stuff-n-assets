// Trees, plants and rocks. Every builder takes a random stream and options and
// returns a sprite that stands on its bottom row. Sizes are in metres and `s`
// is the plane's pixels per metre (6 on the roadside, 3 in the middle).
(function () {
  "use strict";

  const K = window.DriveKit;
  const M = K.M, Spr = K.Spr;
  const art = (K.art = K.art || {});

  // Fills a crown made of overlapping blobs and shades it with light from the
  // upper left: a lit rim, the body, a shaded side and a dark underside. The
  // light is mostly that of the whole crown and partly that of each blob, so
  // the crown reads as one shape with clumps in it. Lit by its blob alone,
  // every pixel changed tone wherever two blobs met, which drew diagonal
  // bands across the crown.
  function crown(s, blobs, tones, rng) {
    const w = s.w, h = s.h;
    let gx0 = Infinity, gx1 = -Infinity, gy0 = Infinity, gy1 = -Infinity;
    for (let b = 0; b < blobs.length; b++) {
      const o = blobs[b];
      gx0 = Math.min(gx0, o.x - o.rx); gx1 = Math.max(gx1, o.x + o.rx);
      gy0 = Math.min(gy0, o.y - o.ry); gy1 = Math.max(gy1, o.y + o.ry);
    }
    const gcx = (gx0 + gx1) / 2, gcy = (gy0 + gy1) / 2;
    const grx = Math.max(1, (gx1 - gx0) / 2), gry = Math.max(1, (gy1 - gy0) / 2);
    const owner = new Int16Array(w * h).fill(-1);
    for (let b = 0; b < blobs.length; b++) {
      const o = blobs[b];
      for (let y = Math.floor(o.y - o.ry); y <= Math.ceil(o.y + o.ry); y++) {
        for (let x = Math.floor(o.x - o.rx); x <= Math.ceil(o.x + o.rx); x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const dx = (x + 0.5 - o.x) / o.rx, dy = (y + 0.5 - o.y) / o.ry;
          const q = dx * dx + dy * dy;
          // A ragged edge: pixels near the rim drop out now and then.
          if (q > 1 || (q > 0.72 && rng.next() < 0.28)) continue;
          owner[y * w + x] = b;
        }
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const b = owner[y * w + x];
        if (b < 0) continue;
        const o = blobs[b];
        const dx = (x + 0.5 - o.x) / o.rx, dy = (y + 0.5 - o.y) / o.ry;
        const gdx = (x + 0.5 - gcx) / grx, gdy = (y + 0.5 - gcy) / gry;
        const light = 0.65 * (-gdx * 0.55 - gdy * 0.85) + 0.35 * (-dx * 0.55 - dy * 0.85);
        const above = y > 0 ? owner[(y - 1) * w + x] : -1;
        const below = y < h - 1 ? owner[(y + 1) * w + x] : -1;
        let t;
        if (light > 0.62 && above < 0) t = tones[0];
        else if (light > 0.35) t = rng.next() < 0.18 ? tones[1] : tones[0];
        else if (light > -0.25) t = rng.next() < 0.12 ? tones[2] : tones[1];
        else if (below < 0 && dy > 0.3) t = tones[3];
        else t = rng.next() < 0.1 ? tones[3] : tones[2];
        s.d[y * w + x] = t;
      }
    }
    return owner;
  }

  const LEAF = [M.leafL, M.leaf, M.leafD, M.leafDD];
  const LEAF_DRY = [M.meadow, M.leafL, M.leaf, M.leafD];
  const BIRCH_LEAF = [M.grassL, M.leafL, M.leaf, M.leafD];

  // Crops a sprite to the columns that hold anything and to the rows from its
  // first filled one down, keeping the bottom row it stands on. Builders draw
  // with room to spare around the picture and trim it afterwards, so a crown
  // or a branch that reaches past the planned size is never cut off.
  function trim(spr) {
    const w = spr.w, h = spr.h, d = spr.d;
    let x0 = w, x1 = -1, y0 = h;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (!d[y * w + x]) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
      }
    }
    if (x1 < 0) return spr;
    const out = new Spr(x1 - x0 + 1, h - y0);
    for (let y = y0; y < h; y++) {
      for (let x = x0; x <= x1; x++) out.d[(y - y0) * out.w + (x - x0)] = d[y * w + x];
    }
    return out;
  }
  art.trim = trim;

  // A broadleaf tree: round (oak, linden), tall and narrow (poplar), birch, or
  // a small fruit tree.
  art.tree = function (rng, o) {
    const s = o.s || 6;
    const kind = o.kind || "round";
    let hM, wM;
    if (kind === "poplar") { hM = rng.range(12, 18); wM = hM * rng.range(0.22, 0.3); }
    else if (kind === "apple") { hM = rng.range(3.5, 5); wM = hM * rng.range(0.9, 1.15); }
    else if (kind === "birch") { hM = rng.range(9, 14); wM = hM * rng.range(0.4, 0.55); }
    else { hM = rng.range(o.hmin || 8, o.hmax || 13); wM = hM * rng.range(0.62, 0.85); }
    const H = Math.max(6, Math.round(hM * s)), Wd = Math.max(5, Math.round(wM * s));
    // The crown's side blobs can reach 0.62 of the width from the middle and
    // rise above the planned top, so the sprite has room on both sides and
    // above, and is trimmed at the end. PT is the room above.
    const PX = Math.ceil(Wd * 0.15) + 1, PT = Math.ceil(H * 0.12) + 1;
    const spr = new Spr(Wd + 4 + PX * 2, H + PT);
    const cx = spr.w / 2;
    const trunkH = Math.round(H * (kind === "poplar" ? 0.16 : kind === "apple" ? 0.34 : kind === "birch" ? 0.4 : 0.32));
    const tw = Math.max(1, Math.round(s * (kind === "apple" ? 0.22 : kind === "birch" ? 0.3 : 0.4)));
    const bark = kind === "birch" ? M.birch : M.bark;
    // The trunk, with a branch or two into the crown.
    for (let y = PT + H - trunkH - 2; y < PT + H; y++) {
      for (let i = 0; i < tw; i++) spr.px(Math.round(cx - tw / 2 + i), y, i === tw - 1 && tw > 1 ? (kind === "birch" ? M.greyL : M.barkD) : bark);
    }
    if (kind === "birch") {
      for (let y = PT + H - trunkH; y < PT + H; y += 2 + rng.int(0, 2)) spr.px(Math.round(cx - tw / 2 + rng.int(0, tw - 1)), y, M.black);
    }
    const blobs = [];
    const top = PT, bot = PT + H - trunkH + (kind === "apple" ? 1 : 2);
    const ch = bot - top;
    if (kind === "poplar") {
      const n = 4;
      for (let i = 0; i < n; i++) {
        const f = (i + 0.5) / n;
        blobs.push({ x: cx + rng.range(-0.6, 0.6), y: top + ch * f, rx: (Wd / 2) * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(0.95, f + 0.1))), ry: ch / n * 0.85 });
      }
    } else {
      const n = kind === "apple" ? 3 : rng.int(4, 6);
      blobs.push({ x: cx, y: top + ch * 0.52, rx: Wd * 0.44, ry: ch * 0.44 });
      for (let i = 0; i < n; i++) {
        const a = rng.range(-Math.PI, 0.2);
        blobs.push({
          x: cx + Math.cos(a) * Wd * rng.range(0.18, 0.3),
          y: top + ch * 0.5 + Math.sin(a) * ch * rng.range(0.22, 0.34),
          rx: Wd * rng.range(0.22, 0.32),
          ry: ch * rng.range(0.2, 0.3),
        });
      }
    }
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      b.ry = Math.min(b.ry, b.y + 0.2, bot - b.y + 1.5);
    }
    const tones = kind === "birch" ? BIRCH_LEAF : o.dry ? LEAF_DRY : LEAF;
    crown(spr, blobs, tones, rng);
    if (kind === "apple" || (o.fruit && rng.chance(0.5))) {
      const n = Math.round(Wd * 0.6);
      for (let i = 0; i < n; i++) {
        const x = rng.int(1, spr.w - 2), y = rng.int(2, bot - 2);
        const v = spr.get(x, y);
        if (v === M.leaf || v === M.leafD) spr.px(x, y, M.apple);
      }
    }
    return trim(spr);
  };

  // A conifer. A spruce is a narrow cone of drooping tiers down to the
  // ground. A pine has a tall bare trunk and a flat, uneven crown.
  art.conifer = function (rng, o) {
    const s = o.s || 6;
    const kind = o.kind || "spruce";
    const hM = rng.range(o.hmin || (kind === "pine" ? 13 : 9), o.hmax || (kind === "pine" ? 18 : 15));
    const H = Math.max(7, Math.round(hM * s));
    if (kind === "pine") {
      // A Scots pine: a bare, slightly crooked trunk for the lower half, then
      // a broad, uneven crown in a few flat clumps.
      const Wd = Math.round(H * rng.range(0.5, 0.64));
      // The outer clumps reach past the planned width and above the top, so
      // the sprite has room around them and is trimmed at the end.
      const PX = Math.ceil(Wd * 0.2) + 2, PT = Math.ceil(H * 0.08) + 1;
      const spr = new Spr(Wd + 2 + PX * 2, H + PT);
      const cx = Math.floor(spr.w / 2) + rng.int(-1, 1);
      const crownTop = PT, crownBot = PT + Math.round(H * rng.range(0.42, 0.52));
      const tw = Math.max(1, Math.round(s * 0.35));
      let x = cx;
      for (let y = spr.h - 1; y > crownTop + 2; y--) {
        if (y < crownBot && rng.chance(0.12)) x += rng.chance(0.5) ? 1 : -1;
        for (let i = 0; i < tw; i++) spr.px(x + i, y, i === 0 ? M.palmT : M.bark);
      }
      // A few branches out to the clumps.
      const blobs = [];
      const n = rng.int(4, 6);
      for (let i = 0; i < n; i++) {
        const bx = cx + (i / (n - 1) - 0.5) * Wd * 0.8 + rng.range(-2, 2);
        const by = crownTop + (crownBot - crownTop) * rng.range(0.22, 0.75);
        blobs.push({ x: bx, y: by, rx: Wd * rng.range(0.14, 0.22), ry: (crownBot - crownTop) * rng.range(0.16, 0.26) });
        spr.line(cx, by + 3, bx, by + 1, M.barkD);
      }
      blobs.push({ x: cx, y: crownTop + (crownBot - crownTop) * 0.35, rx: Wd * 0.22, ry: (crownBot - crownTop) * 0.3 });
      crown(spr, blobs, [M.pineL, M.pine, M.pineD, M.leafDD], rng);
      if (o.snowy) snowCap(spr, rng);
      return trim(spr);
    }
    const Wd = Math.max(5, Math.round(H * rng.range(0.36, 0.46)));
    const spr = new Spr(Wd + 2, H);
    const cx = spr.w / 2;
    const trunk = Math.max(1, Math.round(H * 0.07));
    for (let y = H - trunk; y < H; y++) spr.px(Math.floor(cx), y, M.barkD);
    const tiers = Math.max(3, Math.round(H / (s * 1.6)));
    const bodyH = H - trunk;
    for (let t = 0; t < tiers; t++) {
      const f0 = t / tiers, f1 = (t + 1) / tiers;
      const y0 = Math.round(bodyH * Math.pow(f0, 0.92) * 0.9);
      const y1 = Math.round(bodyH * (0.12 + 0.88 * f1));
      const hw1 = (Wd / 2) * (0.22 + 0.78 * f1);
      for (let y = y0; y <= y1 && y < bodyH; y++) {
        const k = (y - y0) / Math.max(1, y1 - y0);
        const hw = 0.5 + hw1 * (0.25 + 0.75 * k);
        for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) {
          const dx = (x + 0.5 - cx) / Math.max(1, hw);
          if (Math.abs(dx) > 1) continue;
          // The bottom of each tier droops and ends in a ragged line.
          if (k > 0.8 && rng.next() < 0.4 * Math.abs(dx)) continue;
          let c = M.pine;
          if (dx < -0.45) c = rng.next() < 0.7 ? M.pineL : M.pine;
          else if (dx > 0.35) c = rng.next() < 0.75 ? M.pineD : M.pine;
          if (k > 0.85 && dx > -0.2) c = M.pineD;
          spr.px(x, y, c);
        }
      }
    }
    spr.px(Math.floor(cx), 0, M.pine);
    if (o.snowy) snowCap(spr, rng);
    return spr;
  };

  // Snow resting on every upward edge, for trees in the winter valley.
  function snowCap(spr, rng) {
    const w = spr.w;
    for (let y = spr.h - 2; y >= 0; y--) {
      for (let x = 0; x < w; x++) {
        const v = spr.d[y * w + x];
        if (!v || v === M.snow || v === M.snowS) continue;
        const up = y > 0 ? spr.d[(y - 1) * w + x] : 0;
        if (!up && rng.next() < 0.85) {
          spr.d[y * w + x] = M.snow;
          if (y + 1 < spr.h && spr.d[(y + 1) * w + x] && rng.next() < 0.35) spr.d[(y + 1) * w + x] = M.snowS;
        }
      }
    }
  }
  art.snowCap = snowCap;

  // A shrub or a hedge.
  art.bush = function (rng, o) {
    const s = o.s || 6;
    const wM = rng.range(o.wmin || 1.2, o.wmax || 3), hM = rng.range(0.8, 1.6);
    const W = Math.max(3, Math.round(wM * s)), H = Math.max(2, Math.round(hM * s));
    const n = Math.max(1, Math.round(W / 4));
    // The end blobs reach a quarter of a blob past each end, so the sprite
    // has room for them and is trimmed at the end.
    const PX = Math.ceil((W / n) * 0.25) + 1;
    const spr = new Spr(W + 2 + PX * 2, H + 1);
    const blobs = [];
    for (let i = 0; i < n; i++) blobs.push({ x: PX + 1 + (W * (i + 0.5)) / n, y: H * 0.55 + 1, rx: (W / n) * 0.75, ry: H * 0.55 });
    const tones = o.kind === "dry" ? [M.meadow, M.bushD, M.hayD, M.soilD] : LEAF;
    crown(spr, blobs, tones, rng);
    if (o.kind === "flower") {
      const cols = [M.flowerR, M.flowerY, M.flowerW, M.flowerP];
      const c = rng.pick(cols);
      for (let i = 0; i < W; i++) {
        const x = rng.int(0, spr.w - 1), y = rng.int(0, spr.h - 2);
        if (spr.get(x, y)) spr.px(x, y, c);
      }
    }
    return trim(spr);
  };

  // A palm with a curved trunk and drooping fronds.
  art.palm = function (rng, o) {
    const s = o.s || 6;
    const H = Math.round(rng.range(7, 11) * s);
    const lean = rng.range(0.1, 0.3) * (rng.chance(0.5) ? 1 : -1);
    const fr = Math.round(H * 0.34);
    const spr = new Spr(fr * 2 + 6, H + 2);
    const bx = spr.w / 2 - lean * H * 0.5;
    let tx = 0, ty = 0;
    for (let y = spr.h - 1; y >= fr * 0.4; y--) {
      const f = (spr.h - 1 - y) / H;
      const x = bx + lean * H * f * f;
      spr.px(x, y, (y & 1) ? M.palmT : M.woodD);
      spr.px(x + 1, y, M.palmT);
      tx = x;
      ty = y;
    }
    const n = rng.int(6, 8);
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / (n - 1) - 0.5) * Math.PI * 1.25 + rng.range(-0.15, 0.15);
      const len = fr * rng.range(0.75, 1.05);
      for (let k = 0; k <= len; k++) {
        const f = k / len;
        const x = tx + 1 + Math.cos(a) * k;
        const y = ty + Math.sin(a) * k + f * f * len * 0.55;
        spr.px(x, y, f < 0.5 ? M.palm : M.palmD);
        if (f > 0.25 && f < 0.85) spr.px(x, y + 1, M.palmD);
      }
    }
    return spr;
  };

  // A saguaro with an arm or two, or a small barrel cactus.
  art.cactus = function (rng, o) {
    const s = o.s || 6;
    if (o.kind === "small") {
      const spr = new Spr(4, 4);
      spr.rect(0, 1, 4, 3, M.cactus);
      spr.rect(1, 0, 2, 1, M.cactus);
      spr.vline(3, 1, 3, M.cactusD);
      if (rng.chance(0.5)) spr.px(1, 0, M.flowerP);
      return spr;
    }
    const H = Math.round(rng.range(4, 8) * s);
    const tw = Math.max(2, Math.round(s * 0.5));
    const spr = new Spr(tw * 5 + 2, H);
    const cx = Math.floor(spr.w / 2 - tw / 2);
    for (let y = 1; y < H; y++) for (let i = 0; i < tw; i++) spr.px(cx + i, y, i === tw - 1 ? M.cactusD : M.cactus);
    for (let i = 1; i < tw - 1; i++) spr.px(cx + i, 0, M.cactus);
    const arms = rng.int(1, 2);
    for (let a = 0; a < arms; a++) {
      const side = a === 0 ? -1 : 1;
      const ay = Math.round(H * rng.range(0.35, 0.6));
      const up = Math.round(H * rng.range(0.18, 0.3));
      const out = tw + rng.int(0, 1);
      const x0 = side < 0 ? cx - out : cx + tw;
      for (let i = 0; i < out; i++) for (let k = 0; k < tw - 1; k++) spr.px(x0 + i, ay + k, M.cactus);
      const ax = side < 0 ? cx - out : cx + tw + out - (tw - 1);
      for (let y = ay - up; y < ay + tw - 1; y++) for (let k = 0; k < tw - 1; k++) spr.px(ax + k, y, k === tw - 2 ? M.cactusD : M.cactus);
    }
    return spr;
  };

  // Rocks and boulders.
  art.rocks = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(rng.range(o.wmin || 1, o.wmax || 3) * s), H = Math.max(2, Math.round(W * rng.range(0.4, 0.7)));
    const spr = new Spr(W + 2, H + 1);
    const tones = o.kind === "red" ? [M.mesaL, M.mesa, M.mesaD, M.mesaD] : [M.rockL, M.rock, M.rockD, M.rockD];
    const n = rng.int(1, 3);
    const blobs = [];
    for (let i = 0; i < n; i++) {
      const rx = (W / n) * rng.range(0.5, 0.7);
      blobs.push({ x: 1 + (W * (i + 0.5)) / n, y: H + 1 - rx * 0.55, rx: rx, ry: Math.min(H, rx * rng.range(0.7, 1)) });
    }
    crown(spr, blobs, tones, rng);
    return spr;
  };

  // A dead tree in the desert.
  art.deadTree = function (rng, o) {
    const s = o.s || 6;
    const H = Math.round(rng.range(3, 5) * s);
    // The branches can reach past the planned size, so the sprite has room
    // around them and is trimmed at the end.
    const P = Math.ceil(H * 0.3);
    const spr = new Spr(Math.round(H * 0.8) + P * 2, H + P);
    const cx = Math.floor(spr.w / 2);
    function branch(x, y, a, len, depth) {
      for (let k = 0; k < len; k++) {
        x += Math.cos(a);
        y += Math.sin(a);
        spr.px(x, y, depth === 0 ? M.woodD : M.bark);
      }
      if (depth < 3 && len > 2) {
        branch(x, y, a - rng.range(0.35, 0.7), len * 0.62, depth + 1);
        if (rng.chance(0.7)) branch(x, y, a + rng.range(0.35, 0.7), len * 0.55, depth + 1);
      }
    }
    for (let y = P + H - 1; y > P + H * 0.55; y--) spr.px(cx, y, M.woodD);
    branch(cx, P + H * 0.55, -Math.PI / 2 + rng.range(-0.2, 0.2), H * 0.3, 0);
    return trim(spr);
  };

  // Tufts of grass or reeds.
  art.tuft = function (rng, o) {
    const W = rng.int(3, 6), H = rng.int(2, 4);
    const spr = new Spr(W, H);
    const c = o.kind === "dry" ? M.hay : o.kind === "reed" ? M.meadow : M.grassD;
    for (let x = 0; x < W; x++) {
      const h = rng.int(1, H);
      for (let y = H - h; y < H; y++) spr.px(x, y, (x + y) % 3 === 0 ? M.grassDD : c);
    }
    return spr;
  };
})();
