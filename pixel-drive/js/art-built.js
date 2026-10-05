// Buildings, fences, signs and other things people made. Builders take a
// random stream and options and return a sprite standing on its bottom row.
// `s` is the plane's pixels per metre.
(function () {
  "use strict";

  const K = window.DriveKit;
  const M = K.M, Spr = K.Spr;
  const art = (K.art = K.art || {});

  const WALLS = [M.plasterW, M.plasterC, M.plasterP, M.plasterB, M.plasterG, M.plasterY, M.plasterS];

  // Rows of roof tiles between y0 and y1, with the lit course at the top.
  function tiles(spr, y0, y1, l0, l1, r0, r1, base, dark, lit) {
    for (let y = y0; y <= y1; y++) {
      const f = y1 === y0 ? 0 : (y - y0) / (y1 - y0);
      const l = Math.round(l0 + (l1 - l0) * f), r = Math.round(r0 + (r1 - r0) * f);
      const c = y === y0 ? lit : (y - y0) % 2 === 1 ? dark : base;
      for (let x = l; x <= r; x++) spr.px(x, y, c);
    }
  }

  // A window: a white frame, glass with a cross bar, and a light behind it at
  // night. `id` makes each window light on its own schedule.
  function window6(spr, x, y, w, h, id, frame) {
    spr.rect(x, y, w, h, frame || M.plasterW);
    spr.rect(x + 1, y + 1, w - 2, h - 2, M.glass);
    if (w >= 5) spr.vline(x + (w >> 1), y + 1, y + h - 2, frame || M.plasterW);
    if (h >= 6) spr.hline(x + 1, x + w - 2, y + Math.floor(h * 0.45), frame || M.plasterW);
    spr.px(x + 1, y + 1, M.glassL);
    spr.light(x + 1, y + 1, w - 2, h - 2, "win", id);
  }
  art.window6 = window6;

  // A village house seen from the street: plastered walls on a plinth, windows
  // with white frames, a door, and a red tiled roof. The gable faces the road
  // on some houses and the eaves on others.
  art.house = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(rng.range(o.wmin || 7, o.wmax || 11) * s);
    const floors = o.floors || (rng.chance(0.28) ? 2 : 1);
    const wallH = Math.round((floors * 2.9 + 0.5) * s);
    const gable = rng.chance(0.5);
    const roofH = gable ? Math.round(W * 0.5) : Math.round(rng.range(3.2, 4.2) * s);
    const over = Math.max(1, Math.round(s * 0.35));
    const spr = new Spr(W + over * 2 + 2, wallH + roofH + Math.round(s * 1.2));
    const x0 = over + 1, base = spr.h;
    const wall = o.wall || rng.pick(WALLS);
    const top = base - wallH;
    spr.rect(x0, top, W, wallH, wall);
    spr.rect(x0, base - Math.round(s * 0.5), W, Math.round(s * 0.5), M.plinth);
    // A shaded corner on the right so the house reads as a solid.
    spr.vline(x0 + W - 1, top, base - 1, M.plasterS);
    const id0 = rng.int(0, 1e8);
    const ww = Math.max(4, Math.round(s * 1.1)), wh = Math.max(5, Math.round(s * 1.35));
    // Windows, and a door on some houses.
    const hasDoor = rng.chance(0.55);
    for (let f = 0; f < floors; f++) {
      const wy = base - Math.round((f * 2.9 + 1.4) * s) - wh;
      const n = Math.max(1, Math.floor((W - s) / (ww + Math.round(s * 1.3))));
      const gap = (W - n * ww) / (n + 1);
      for (let i = 0; i < n; i++) {
        const wx = Math.round(x0 + gap + i * (ww + gap));
        if (f === 0 && hasDoor && i === n - 1 && n > 1) {
          const dw = Math.max(3, Math.round(s * 0.95)), dh = Math.round(s * 2.05);
          spr.rect(wx, base - dh, dw, dh, M.woodD);
          spr.rect(wx + 1, base - dh + 1, dw - 2, dh - 1, M.wood);
          spr.px(wx + dw - 2, base - Math.round(dh * 0.5), M.metalL);
          continue;
        }
        window6(spr, wx, wy, ww, wh, id0 + f * 16 + i);
        if (f === 0 && o.flowers !== false && rng.chance(0.35)) {
          spr.hline(wx, wx + ww - 1, wy + wh, M.woodD);
          for (let k = 0; k < ww; k++) if (rng.chance(0.7)) spr.px(wx + k, wy + wh - 1, rng.pick([M.flowerR, M.flowerR, M.flowerW, M.leaf]));
        }
      }
    }
    const roof = o.roof || (rng.chance(0.85) ? "tile" : "slate");
    const rb = roof === "tile" ? [M.roof, M.roofD, M.roofL] : [M.slate, M.slateD, M.metal];
    const ry1 = top - 1, ry0 = top - roofH;
    if (gable) {
      // The gable end faces the road: a triangle of wall under two roof edges.
      const mid = x0 + W / 2;
      spr.trap(ry0 + 2, ry1, mid, x0 + 1, mid, x0 + W - 2, wall);
      for (let y = ry0; y <= ry1 + 1; y++) {
        const f = (y - ry0) / (ry1 + 1 - ry0);
        const hw = (W / 2 + over) * f;
        for (let k = 0; k < 2; k++) {
          spr.px(Math.round(mid - hw) + k, y, k === 0 ? rb[1] : rb[0]);
          spr.px(Math.round(mid + hw) - k, y, k === 0 ? rb[1] : rb[0]);
        }
      }
      spr.px(Math.round(mid), ry0 - 1, rb[0]);
      // An attic window.
      const aw = Math.max(3, Math.round(s * 0.7));
      if (roofH > aw + 5) window6(spr, Math.round(mid - aw / 2), ry1 - Math.round(roofH * 0.45), aw, Math.max(4, aw + 1), id0 + 99);
    } else {
      tiles(spr, ry0, ry1, x0 + Math.round(roofH * 0.55), x0 - over, x0 + W - 1 - Math.round(roofH * 0.55), x0 + W - 1 + over, rb[0], rb[1], rb[2]);
      spr.hline(x0 - over, x0 + W - 1 + over, ry1 + 1, M.woodD);
      if (rng.chance(0.3)) {
        // A dormer.
        const dw = Math.round(s * 1.4), dx = Math.round(x0 + W * rng.range(0.3, 0.6));
        spr.rect(dx, ry0 + 2, dw, Math.round(roofH * 0.55), wall);
        spr.hline(dx - 1, dx + dw, ry0 + 1, rb[1]);
        window6(spr, dx + 1, ry0 + 3, dw - 2, Math.max(4, Math.round(roofH * 0.4)), id0 + 77);
      }
    }
    // A chimney through the roof.
    const cx = Math.round(x0 + W * rng.range(0.25, 0.75));
    const cy = gable ? ry0 + Math.round(roofH * 0.35) : ry0 - Math.round(s * 0.4);
    spr.rect(cx, cy - Math.round(s * 0.9), Math.max(2, Math.round(s * 0.5)), Math.round(s * 1.4), M.brick);
    spr.hline(cx - 1, cx + Math.max(2, Math.round(s * 0.5)), cy - Math.round(s * 0.9), M.brickD);
    spr.chimney = { x: cx + 1, y: cy - Math.round(s * 0.9) - 1 };
    // Things by the wall: a bench, a bicycle or a satellite dish.
    const extra = rng.next();
    if (extra < 0.18 && W > 6 * s) {
      const bx = x0 + 2, by = base - Math.round(s * 0.5);
      spr.hline(bx, bx + Math.round(s * 1.6), by - 2, M.wood);
      spr.px(bx, by - 1, M.woodD);
      spr.px(bx + Math.round(s * 1.6), by - 1, M.woodD);
    } else if (extra < 0.3) {
      const bx = x0 + 1, by = base - 1;
      spr.disc(bx + 2, by - 1.5, 1.6, M.dark);
      spr.disc(bx + 7, by - 1.5, 1.6, M.dark);
      spr.line(bx + 2, by - 2, bx + 5, by - 4, M.clothR);
      spr.line(bx + 5, by - 4, bx + 7, by - 2, M.clothR);
    } else if (extra < 0.38 && !gable) {
      spr.disc(x0 + W - 4, top + 3, 1.6, M.greyL);
      spr.px(x0 + W - 3, top + 4, M.grey);
    }
    return spr;
  };

  // A farm barn in vertical planks with big doors.
  art.barn = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(rng.range(10, 15) * s), wallH = Math.round(rng.range(3.5, 4.5) * s), roofH = Math.round(rng.range(3.5, 5) * s);
    const spr = new Spr(W + 4, wallH + roofH + 1);
    const x0 = 2, base = spr.h, top = base - wallH;
    const plank = rng.chance(0.6) ? [M.wood, M.woodD] : [M.brick, M.brickD];
    for (let x = x0; x < x0 + W; x++) for (let y = top; y < base; y++) spr.px(x, y, (x - x0) % 3 === 2 ? plank[1] : plank[0]);
    const dw = Math.round(s * 3), dx = x0 + Math.round((W - dw) * rng.range(0.3, 0.7));
    spr.rect(dx, base - Math.round(s * 3), dw, Math.round(s * 3), M.woodD);
    spr.line(dx, base - Math.round(s * 3), dx + dw - 1, base - 1, M.wood);
    spr.line(dx + dw - 1, base - Math.round(s * 3), dx, base - 1, M.wood);
    const roofC = rng.chance(0.5) ? [M.slate, M.slateD, M.metal] : [M.roof, M.roofD, M.roofL];
    tiles(spr, top - roofH, top - 1, x0 + Math.round(roofH * 0.7), x0 - 2, x0 + W - 1 - Math.round(roofH * 0.7), x0 + W + 1, roofC[0], roofC[1], roofC[2]);
    return spr;
  };

  // A log cabin with a shingle roof, a lit window and a chimney.
  art.cabin = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(rng.range(6, 8.5) * s), wallH = Math.round(rng.range(2.6, 3.1) * s), roofH = Math.round(W * 0.42);
    const spr = new Spr(W + 6, wallH + roofH + Math.round(s * 1.5));
    const x0 = 3, base = spr.h, top = base - wallH;
    for (let y = top; y < base; y++) {
      const log = Math.floor((base - 1 - y) / 2);
      for (let x = x0; x < x0 + W; x++) spr.px(x, y, (base - 1 - y) % 2 === 1 ? M.woodD : log % 2 ? M.wood : M.woodL);
      // Log ends at the corners.
      if ((base - 1 - y) % 2 === 0) {
        spr.px(x0 - 1, y, M.woodL);
        spr.px(x0 + W, y, M.woodL);
      }
    }
    const ww = Math.round(s * 1.1);
    window6(spr, x0 + Math.round(W * 0.2), top + Math.round(wallH * 0.25), ww, Math.round(s * 1.1), rng.int(0, 1e8), M.woodL);
    const dw = Math.round(s * 1), dx = x0 + Math.round(W * 0.62);
    spr.rect(dx, base - Math.round(s * 2), dw, Math.round(s * 2), M.woodD);
    const snowy = o.snowy;
    const r0 = snowy ? M.snow : M.slate, r1 = snowy ? M.snowS : M.slateD;
    for (let y = top - roofH; y < top; y++) {
      const f = (y - (top - roofH)) / roofH;
      const hw = (W / 2 + 2) * f;
      const mid = x0 + W / 2;
      for (let x = Math.round(mid - hw); x <= Math.round(mid + hw); x++) spr.px(x, y, (y & 1) ? r1 : r0);
    }
    const cx = x0 + Math.round(W * 0.72);
    spr.rect(cx, top - Math.round(roofH * 0.85), Math.round(s * 0.6), Math.round(roofH * 0.6), M.rockD);
    spr.chimney = { x: cx + 1, y: top - Math.round(roofH * 0.85) - 1 };
    if (snowy) spr.hline(cx, cx + Math.round(s * 0.6) - 1, top - Math.round(roofH * 0.85), M.snow);
    return spr;
  };

  // Street lamps. A street lamp has a curved arm and a head, a park lamp a
  // lantern on a short post. The light is lit by the engine.
  art.lamp = function (rng, o) {
    const s = o.s || 6;
    const kind = o.kind || "street";
    if (kind === "park") {
      const H = Math.round(3.6 * s);
      const spr = new Spr(5, H);
      spr.vline(2, 3, H - 1, M.dark);
      spr.hline(1, 3, H - 1, M.dark);
      spr.rect(1, 1, 3, 3, M.dark);
      spr.px(2, 2, M.glassL);
      spr.px(2, 0, M.dark);
      spr.light(1, 1, 3, 3, "lamp", rng.int(0, 1e8));
      return spr;
    }
    const H = Math.round((kind === "highway" ? 11 : 7.5) * s);
    const arm = Math.round((kind === "highway" ? 2.2 : 1.4) * s);
    const dir = o.dir || 1;
    const spr = new Spr(arm + 4, H);
    const px = dir > 0 ? 1 : spr.w - 2;
    spr.vline(px, 2, H - 1, M.metalD);
    spr.px(px + dir * 0 + (dir > 0 ? 1 : -1), H - 1, M.metalD);
    for (let i = 1; i <= arm; i++) spr.px(px + dir * i, i < 2 ? 1 : 0, M.metalD);
    const hx = px + dir * arm;
    spr.px(hx, 1, M.metal);
    spr.px(hx - dir, 1, M.metal);
    spr.light(Math.min(hx, hx - dir), 1, 2, 1, "lamp", rng.int(0, 1e8));
    return spr;
  };

  // A wooden telegraph pole with its cross arm.
  art.pole = function (rng, o) {
    const s = o.s || 6;
    const H = Math.round(rng.range(6.5, 7.5) * s);
    const spr = new Spr(7, H);
    spr.vline(3, 1, H - 1, M.woodD);
    spr.hline(0, 6, 2, M.woodD);
    spr.px(0, 1, M.white);
    spr.px(6, 1, M.white);
    spr.px(2, 1, M.white);
    spr.wire = [{ x: 0, y: 1 }, { x: 6, y: 1 }];
    return spr;
  };

  // A park bench.
  art.bench = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(1.8 * s);
    const spr = new Spr(W, Math.round(0.9 * s));
    spr.hline(0, W - 1, 0, M.wood);
    spr.hline(0, W - 1, 2, M.wood);
    spr.vline(1, 2, spr.h - 1, M.dark);
    spr.vline(W - 2, 2, spr.h - 1, M.dark);
    return spr;
  };

  // Round straw bales, alone or stacked.
  art.hayBale = function (rng, o) {
    const s = o.s || 6;
    const r = 0.75 * s;
    const n = rng.int(1, 3);
    const spr = new Spr(Math.ceil(r * 2 * n + 2), Math.ceil(r * 2 + (n === 3 ? r * 1.7 : 0)) + 1);
    const wrapped = rng.chance(0.25);
    for (let i = 0; i < Math.min(n, 2); i++) {
      const cx = 1 + r + i * r * 2.05, cy = spr.h - r;
      spr.disc(cx, cy, r, wrapped ? M.white : M.hay);
      spr.disc(cx + r * 0.25, cy + r * 0.2, r * 0.55, wrapped ? M.greyL : M.hayD);
      spr.px(cx + r * 0.25, cy + r * 0.2, wrapped ? M.grey : M.woodD);
    }
    if (n === 3) {
      const cx = 1 + r * 2.03, cy = spr.h - r * 2.7;
      spr.disc(cx, cy, r, wrapped ? M.white : M.hay);
      spr.disc(cx + r * 0.25, cy + r * 0.2, r * 0.55, wrapped ? M.greyL : M.hayD);
    }
    return spr;
  };

  // A stack of logs.
  art.woodPile = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(rng.range(2, 4) * s), rows = rng.int(2, 4);
    const spr = new Spr(W, rows * 3);
    for (let r = 0; r < rows; r++) {
      const y = spr.h - 2 - r * 3 + 1;
      for (let x = (r & 1) + 0; x < W - (r & 1); x += 3) {
        spr.rect(x, y - 1, 3, 3, M.wood);
        spr.px(x + 1, y, M.woodL);
        spr.px(x + 2, y + 1, M.woodD);
      }
    }
    return spr;
  };

  // A snowman in a hat, with a carrot nose.
  art.snowman = function (rng, o) {
    const s = o.s || 6;
    const spr = new Spr(Math.round(s * 1.3) + 2, Math.round(s * 1.9) + 3);
    const cx = spr.w / 2, b = spr.h;
    const r1 = s * 0.6, r2 = s * 0.42, r3 = s * 0.3;
    spr.disc(cx, b - r1, r1, M.snow);
    spr.disc(cx, b - r1 * 2 - r2 + 1, r2, M.snow);
    spr.disc(cx, b - r1 * 2 - r2 * 2 - r3 + 2, r3, M.snow);
    const hy = Math.round(b - r1 * 2 - r2 * 2 - r3 * 2 + 1);
    spr.rect(Math.round(cx - r3), hy - 2, Math.round(r3 * 2), 1, M.black);
    spr.rect(Math.round(cx - r3 * 0.6), hy - 4, Math.round(r3 * 1.3), 2, M.black);
    spr.px(cx + 1, hy + 1, M.clothO);
    spr.px(cx + 2, hy + 1, M.clothO);
    spr.px(cx - 1, hy, M.black);
    spr.px(cx - 1, Math.round(b - r1 * 2 - 1), M.black);
    spr.px(cx - 1, Math.round(b - r1 * 1.3), M.black);
    for (let i = 0; i < spr.w; i++) for (let y = 0; y < spr.h; y++) {
      const v = spr.get(i, y);
      if (v === M.snow && i > cx + 1 && spr.get(i + 1, y) !== M.snow) spr.px(i, y, M.snowS);
    }
    return spr;
  };

  // A wooden wayside cross under a little roof, on a stone base.
  art.cross = function (rng, o) {
    const s = o.s || 6;
    const H = Math.round(3.4 * s);
    const spr = new Spr(Math.round(1.6 * s) + 2, H);
    const cx = Math.floor(spr.w / 2);
    spr.rect(cx - 2, H - 3, 5, 3, M.rockL);
    spr.hline(cx - 2, cx + 2, H - 3, M.rock);
    spr.vline(cx, 3, H - 4, M.woodD);
    spr.hline(cx - Math.round(s * 0.5), cx + Math.round(s * 0.5), Math.round(H * 0.3), M.woodD);
    spr.px(cx, Math.round(H * 0.3) + 1, M.metalL);
    spr.hline(cx - 2, cx + 2, 1, M.roofD);
    spr.hline(cx - 1, cx + 1, 0, M.roofD);
    return spr;
  };

  // A hunting stand on braced legs.
  art.stand = function (rng, o) {
    const s = o.s || 6;
    const H = Math.round(5.5 * s), W = Math.round(2 * s);
    const spr = new Spr(W + 4, H);
    const x0 = 2, x1 = x0 + W - 1;
    const cab = Math.round(1.8 * s);
    for (let y = cab + 2; y < H; y++) {
      const f = (y - cab) / (H - cab);
      spr.px(Math.round(x0 - f * 2), y, M.woodD);
      spr.px(Math.round(x1 + f * 2), y, M.woodD);
    }
    for (let k = 0; k < 2; k++) {
      const ya = cab + 3 + k * Math.round((H - cab) / 2), yb = ya + Math.round((H - cab) / 2) - 2;
      spr.line(x0, ya, x1, yb, M.wood);
      spr.line(x1, ya, x0, yb, M.wood);
    }
    spr.rect(x0, 2, W, cab, M.wood);
    for (let x = x0; x <= x1; x += 2) spr.vline(x, 2, cab + 1, M.woodD);
    spr.rect(x0 + 2, 4, W - 4, 2, M.dark);
    spr.hline(x0 - 1, x1 + 1, 1, M.woodD);
    spr.hline(x0, x1, 0, M.woodD);
    return spr;
  };

  // A sign panel on one or two posts. Text uses the drive's pixel font.
  art.sign = function (rng, o) {
    const s = o.s || 6;
    const text = o.text || "";
    const pad = o.pad === undefined ? 2 : o.pad;
    const tw = K.textWidth(text);
    const accents = /[ÁÉÍÓÚÝČĎĚŇŘŠŤŽŮ]/.test(text);
    const pw = Math.max(o.minW || 0, tw + pad * 2 + 2);
    const ph = 5 + pad * 2 + (accents ? 2 : 0) + 2;
    const postH = Math.round((o.postM === undefined ? 1.6 : o.postM) * s);
    const spr = new Spr(pw, ph + postH);
    const bg = o.bg || M.signWhite, fg = o.fg || M.signInk;
    spr.rect(0, 0, pw, ph, bg);
    // The character look frames light signs in characters of its own.
    if (o.border && !K.asciiText) {
      spr.rect(0, 0, pw, 1, o.border);
      spr.rect(0, ph - 1, pw, 1, o.border);
      spr.rect(0, 0, 1, ph, o.border);
      spr.rect(pw - 1, 0, 1, ph, o.border);
    }
    spr.text(text, Math.floor((pw - tw) / 2), 1 + pad + (accents ? 2 : 0), fg);
    if (o.strike) spr.line(1, ph - 2, pw - 2, 1, M.signRed);
    const posts = o.posts === undefined ? (pw > 16 ? 2 : 1) : o.posts;
    const postC = o.postC || M.metalD;
    if (posts === 1) spr.vline(Math.floor(pw / 2), ph, ph + postH - 1, postC);
    else if (posts === 2) {
      spr.vline(2, ph, ph + postH - 1, postC);
      spr.vline(pw - 3, ph, ph + postH - 1, postC);
    }
    return spr;
  };

  // A bus shelter with a glass back wall and a stop sign on a pole.
  art.busStop = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(3.4 * s), H = Math.round(2.5 * s);
    const spr = new Spr(W + Math.round(1.5 * s), Math.round(2.9 * s));
    const b = spr.h;
    spr.rect(0, b - H, W, 1, M.metalD);
    spr.rect(0, b - H - 1, W, 1, M.metal);
    spr.vline(0, b - H, b - 1, M.metalD);
    spr.vline(W - 1, b - H, b - 1, M.metalD);
    spr.rect(1, b - H + 1, W - 2, H - 3, M.glassL);
    spr.hline(1, W - 2, b - 4, M.wood);
    spr.light(1, b - H + 1, W - 2, 1, "lamp", rng.int(0, 1e8));
    const px = W + Math.round(0.8 * s);
    spr.vline(px, 3, b - 1, M.metalD);
    spr.rect(px - 2, 0, 5, 4, M.signYellow);
    spr.rect(px - 1, 1, 3, 2, M.signBlue);
    return spr;
  };

  // A small kiosk with a striped awning.
  art.kiosk = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(rng.range(2.6, 3.4) * s), H = Math.round(2.6 * s);
    const spr = new Spr(W + 2, H + 3);
    const b = spr.h;
    spr.rect(1, b - H, W, H, rng.pick([M.plasterW, M.plasterC, M.plasterB]));
    spr.rect(2, b - H + 3, W - 2, Math.round(H * 0.4), M.glass);
    spr.light(2, b - H + 3, W - 2, Math.round(H * 0.4), "win", rng.int(0, 1e8));
    const stripe = rng.pick([M.accent, M.clothG, M.clothB]);
    for (let x = 0; x < W + 2; x++) for (let y = b - H - 2; y < b - H + 2; y++) spr.px(x, y, ((x >> 1) & 1) ? M.white : stripe);
    return spr;
  };

  // --------------------------------------------------------------- fences ---
  // Edge features run along the front of the roadside plane. Each returns the
  // material at column u and row h above the ground, or 0.
  const EDGE = {};
  EDGE.picket = function (u, h) {
    if (h > 6) return 0;
    if (h === 3 || h === 5) return M.plasterW;
    return u % 2 === 0 && h <= 6 ? (h === 6 ? M.plasterS : M.plasterW) : 0;
  };
  EDGE.rail = function (u, h) {
    if (h > 6) return 0;
    if (K.mod(u, 12) === 0) return M.woodD;
    return h === 3 || h === 6 ? M.wood : 0;
  };
  EDGE.tape = function (u, h) {
    if (h > 6) return 0;
    const p = K.mod(u, 18);
    if (p === 0) return h <= 6 ? M.woodD : 0;
    const sag = Math.round(Math.sin((Math.PI * p) / 18) * 1.2);
    if (h === 5 - sag) return (u >> 1) & 1 ? M.signRed : M.tape;
    return 0;
  };
  EDGE.guard = function (u, h) {
    if (h > 5) return 0;
    if (h === 4) return M.metalL;
    if (h === 3) return M.metal;
    return K.mod(u, 12) === 0 && h <= 3 ? M.metalD : 0;
  };
  EDGE.railing = function (u, h) {
    if (h > 6) return 0;
    if (h === 6) return M.metalD;
    if (h === 1) return M.metalD;
    return K.mod(u, 3) === 0 ? M.metalD : 0;
  };
  EDGE.wall = function (u, h) {
    if (h > 3) return 0;
    if (h === 3) return (u >> 1) & 1 ? M.rockL : M.rock;
    return ((u + (h & 1) * 2) % 4 === 0) ? M.rockD : M.rock;
  };
  EDGE.hedge = function (u, h) {
    const top = 4 + Math.round(K.noise1(u / 5, 77) * 3);
    if (h > top) return 0;
    if (h === top) return M.leafL;
    return (u * 7 + h * 3) % 5 === 0 ? M.leafD : M.leaf;
  };
  EDGE.poles = function (u, h) {
    if (K.mod(u, 34) !== 0 || h > 8) return 0;
    return h === 0 ? M.dark : ((h - 1) >> 1) & 1 ? M.white : M.signRed;
  };
  EDGE.none = function () {
    return 0;
  };
  art.EDGE = EDGE;

  // ------------------------------------------------------------ landmarks ---

  // A fuel station: pumps under a canopy on two posts, and a kiosk.
  art.fuelStation = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(26 * s), cH = Math.round(5 * s), canW = Math.round(15 * s);
    const fascia = 8;
    const spr = new Spr(W, cH + fascia);
    const b = spr.h;
    // The canopy: a white fascia with the name and a red stripe, on two posts.
    spr.rect(0, 0, canW, fascia - 1, M.white);
    spr.rect(0, fascia - 1, canW, 1, M.accent);
    spr.text("PHM · BUFET", Math.round((canW - K.textWidth("PHM · BUFET")) / 2), 1, M.signInk);
    spr.light(2, fascia, canW - 4, 1, "lamp", rng.int(0, 1e8));
    spr.rect(3, fascia, 2, cH, M.metalD);
    spr.rect(canW - 5, fascia, 2, cH, M.metalD);
    for (let p = 0; p < 2; p++) {
      const px = Math.round(canW * (0.3 + 0.35 * p));
      spr.rect(px, b - 11, 5, 11, M.accent);
      spr.rect(px + 1, b - 9, 3, 3, M.glassL);
      spr.px(px + 5, b - 7, M.dark);
      spr.px(px + 6, b - 6, M.dark);
      spr.rect(px - 1, b - 1, 7, 1, M.concreteD);
    }
    // The shop, with a flat roof and a big window.
    const kx = canW + Math.round(2 * s), kw = W - kx - 1, kh = Math.round(3.4 * s);
    spr.rect(kx, b - kh, kw, kh, M.plasterW);
    spr.vline(kx + kw - 1, b - kh, b - 1, M.plasterS);
    spr.rect(kx - 1, b - kh - 2, kw + 2, 2, M.accent);
    spr.rect(kx + 3, b - kh + 4, kw - 12, Math.round(kh * 0.45), M.glass);
    spr.light(kx + 3, b - kh + 4, kw - 12, Math.round(kh * 0.45), "win", rng.int(0, 1e8));
    spr.rect(kx + kw - 7, b - Math.round(2.1 * s), 4, Math.round(2.1 * s), M.glass);
    spr.light(kx + kw - 7, b - Math.round(2.1 * s), 4, Math.round(2.1 * s), "win", rng.int(0, 1e8));
    return spr;
  };

  // The arch over the start or finish of the rally stage, with a banner.
  // An arch across the road at the start or the finish of a rally stage.
  // Its right leg stands on the near edge of the road and its left leg on
  // the far edge, `depth` sprite px further up the screen, so the car drives
  // between them. `front` holds the near leg and the banner and is drawn
  // over the car. `back` holds the far leg and is drawn behind the car and
  // the far lane. Both are the same width and share their left edge and
  // their top.
  art.rallyGate = function (rng, o) {
    const s = o.s || 10;
    const W = Math.round((o.wM || 7) * s), H = Math.round((o.hM || 4.4) * s), depth = o.depth || 16;
    const front = new Spr(W, H), back = new Spr(W, H - depth);
    function leg(spr, x) {
      spr.rect(x, 0, 3, spr.h, M.poleK);
      for (let y = 0; y < spr.h; y += 4) spr.rect(x, y, 3, 2, M.poleY);
    }
    leg(front, W - 3);
    leg(back, 0);
    const bh = 11;
    front.rect(3, 1, W - 6, bh, o.finish ? M.signInk : M.accent);
    const text = o.text || "START";
    front.text(text, Math.round((W - K.textWidth(text)) / 2), 4 + (/[ÁÉÍÓÚÝČĎĚŇŘŠŤŽŮ]/.test(text) ? 1 : 0), M.white);
    if (o.finish && K.asciiText) {
      // The character look draws a row of chequer above and below the name.
      front.rect(3, 1, W - 6, 3, M.chequer);
      front.rect(3, bh - 2, W - 6, 3, M.chequer);
    } else if (o.finish) {
      for (let x = 3; x < W - 3; x++) {
        front.px(x, 1, ((x >> 1) & 1) ? M.white : M.signInk);
        front.px(x, bh, ((x >> 1) & 1) ? M.signInk : M.white);
      }
    }
    return { front: front, back: back };
  };

  // The timing booth at the start, with the number of the stage (RZ, a
  // special stage in Czech rallying) over the window.
  art.booth = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(2.4 * s), H = Math.round(2.8 * s);
    const spr = new Spr(W, H + 2);
    const b = spr.h;
    spr.rect(0, b - H, W, H, M.white);
    spr.rect(0, b - H - 2, W, 2, M.accent);
    spr.rect(2, b - H + 3, W - 4, 4, M.glass);
    spr.light(2, b - H + 3, W - 4, 4, "win", rng.int(0, 1e8));
    const stage = "RZ" + rng.int(1, 9);
    spr.text(stage, Math.round((W - K.textWidth(stage)) / 2), b - H + 9, M.accent);
    return spr;
  };

  // The rock walls of a cutting on the road into the mountains.
  art.rockWall = function (rng, o) {
    const s = o.s || 6;
    const W = Math.round(rng.range(22, 30) * s), H = Math.round(rng.range(7, 10) * s);
    const spr = new Spr(W, H + 8);
    const b = spr.h;
    for (let x = 0; x < W; x++) {
      const f = x / (W - 1);
      const h = Math.round(H * Math.pow(Math.sin(Math.PI * f), 0.55) * (0.85 + 0.15 * K.noise1(x / 6, 5)));
      for (let y = b - h; y < b; y++) {
        const layer = Math.floor((b - y + K.noise1(x / 9, 3) * 4) / 5);
        let c = layer % 2 ? M.rock : M.rockL;
        if (x > 1 && spr.get(x - 1, y) === 0) c = M.rockL;
        if ((x * 13 + y * 7) % 11 === 0) c = M.rockD;
        spr.px(x, y, c);
      }
      if (h > 4 && x % 7 === 3 && rng.chance(0.6)) {
        const t = art.conifer(rng, { s: s * 0.6, hmin: 4, hmax: 7 });
        spr.blit(t, x - (t.w >> 1), b - h - t.h + 1);
      }
    }
    return spr;
  };

  // --------------------------------------------------- the middle distance ---

  // A house in the middle distance, at 3 px to the metre.
  art.midHouse = function (rng, o) {
    const s = o.s || 3;
    const W = Math.round(rng.range(7, 11) * s), wallH = Math.round(rng.range(3.2, 6) * s), roofH = Math.round(rng.range(2.6, 4) * s);
    const spr = new Spr(W + 2, wallH + roofH + 2);
    const b = spr.h, top = b - wallH, x0 = 1;
    spr.rect(x0, top, W, wallH, o.wall || rng.pick(WALLS));
    spr.vline(x0 + W - 1, top, b - 1, M.plasterS);
    const id = rng.int(0, 1e8);
    for (let x = x0 + 2; x < x0 + W - 2; x += 4) {
      for (let y = top + 2; y < b - 2; y += Math.round(3 * s)) {
        spr.rect(x, y, 2, 2, M.glass);
        spr.light(x, y, 2, 2, "win", id + x * 31 + y);
      }
    }
    const roof = o.roof || (rng.chance(0.8) ? [M.roof, M.roofD, M.roofL] : [M.slate, M.slateD, M.metal]);
    tiles(spr, top - roofH, top - 1, x0 + Math.round(roofH * 0.7), x0 - 1, x0 + W - 1 - Math.round(roofH * 0.7), x0 + W, roof[0], roof[1], roof[2]);
    const cx = x0 + Math.round(W * rng.range(0.3, 0.7));
    spr.rect(cx, top - roofH - 1, 1, 3, M.brick);
    spr.chimney = { x: cx, y: top - roofH - 2 };
    return spr;
  };

  // A baroque village church: a white nave with a red roof and a tower with a
  // green onion dome.
  art.church = function (rng, o) {
    const s = o.s || 3;
    const nave = Math.round(rng.range(15, 19) * s), naveH = Math.round(8 * s), tw = Math.round(5 * s), towerH = Math.round(rng.range(16, 19) * s);
    const spr = new Spr(nave + tw + 2, towerH + Math.round(9 * s));
    const b = spr.h, x0 = 1;
    const tx = rng.chance(0.5) ? x0 : x0 + nave;
    const nx = tx === x0 ? x0 + tw : x0;
    spr.rect(nx, b - naveH, nave, naveH, M.plasterW);
    for (let x = nx + 3; x < nx + nave - 3; x += Math.round(3 * s)) {
      spr.rect(x, b - naveH + 4, 2, Math.round(naveH * 0.45), M.glass);
      spr.px(x, b - naveH + 3, M.glass);
      spr.light(x, b - naveH + 4, 2, Math.round(naveH * 0.45), "win", rng.int(0, 1e8));
    }
    const roofH = Math.round(4.5 * s);
    tiles(spr, b - naveH - roofH, b - naveH - 1, nx + roofH * 0.6, nx - 1, nx + nave - 1 - roofH * 0.6, nx + nave, M.roof, M.roofD, M.roofL);
    spr.rect(tx, b - towerH, tw, towerH, M.plasterW);
    spr.vline(tx + tw - 1, b - towerH, b - 1, M.plasterS);
    spr.rect(tx + Math.floor(tw / 2) - 1, b - towerH + 3, 2, 4, M.glass);
    spr.disc(tx + tw / 2, b - towerH + Math.round(towerH * 0.3), 1.6, M.dark);
    // The onion dome, the lantern and the cross.
    const cx = tx + tw / 2;
    spr.ellipse(cx, b - towerH - 3, tw * 0.62, 3.6, M.pineL, function (x, y, dx) { return dx > 0.2 ? M.pine : M.pineL; });
    spr.rect(Math.round(cx) - 1, b - towerH - 9, 2, 3, M.pine);
    spr.ellipse(cx, b - towerH - 10, 1.8, 1.6, M.pineL);
    spr.vline(Math.round(cx) - 1, b - towerH - 16, b - towerH - 11, M.carRim);
    spr.hline(Math.round(cx) - 2, Math.round(cx), b - towerH - 14, M.carRim);
    return spr;
  };

  // A prefab apartment block, at 3 px to the metre.
  art.panelBlock = function (rng, o) {
    const s = o.s || 3;
    const floors = rng.int(o.fmin || 5, o.fmax || 8);
    const bays = rng.int(o.bmin || 6, o.bmax || 14);
    const bw = Math.round(3.4 * s), fh = Math.round(2.8 * s);
    const W = bays * bw + 2, H = floors * fh + 3;
    const spr = new Spr(W, H + 1);
    const b = spr.h;
    const wall = rng.pick([M.concreteL, M.concrete, M.plasterC, M.plasterS]);
    spr.rect(0, b - H, W, H, wall);
    spr.rect(0, b - H, W, 2, M.concreteD);
    const bal = rng.chance(0.5) ? rng.pick([M.clothY, M.clothO, M.clothB, M.clothG, M.clothR]) : 0;
    const id = rng.int(0, 1e8);
    for (let f = 0; f < floors; f++) {
      for (let i = 0; i < bays; i++) {
        const x = 1 + i * bw + 1, y = b - (f + 1) * fh + 1;
        spr.rect(x, y, bw - 2, Math.max(2, fh - 5), M.glass);
        spr.light(x, y, bw - 2, Math.max(2, fh - 5), "win", id + f * 97 + i);
        if (bal && i % 3 === 1 && f > 0) spr.rect(x - 1, y + fh - 4, bw, 2, bal);
      }
    }
    spr.vline(W - 1, b - H, b - 1, M.concreteD);
    return spr;
  };

  // An older town house with a steep roof.
  art.townHouse = function (rng, o) {
    const s = o.s || 3;
    const floors = rng.int(3, 5);
    const W = Math.round(rng.range(8, 13) * s), fh = Math.round(3.2 * s), roofH = Math.round(rng.range(3, 5) * s);
    const H = floors * fh;
    const spr = new Spr(W + 2, H + roofH + 3);
    const b = spr.h, x0 = 1;
    spr.rect(x0, b - H, W, H, rng.pick(WALLS));
    spr.vline(x0 + W - 1, b - H, b - 1, M.plasterS);
    const id = rng.int(0, 1e8);
    for (let f = 0; f < floors; f++) {
      for (let x = x0 + 2; x < x0 + W - 2; x += Math.round(2.6 * s)) {
        const y = b - (f + 1) * fh + 2;
        spr.rect(x, y, 2, Math.round(fh * 0.5), M.glass);
        spr.light(x, y, 2, Math.round(fh * 0.5), "win", id + f * 53 + x);
      }
    }
    if (rng.chance(0.4)) spr.rect(x0, b - Math.round(fh * 0.7), W, 1, M.accent);
    tiles(spr, b - H - roofH, b - H - 1, x0 + Math.round(roofH * 0.4), x0 - 1, x0 + W - 1 - Math.round(roofH * 0.4), x0 + W, M.roof, M.roofD, M.roofL);
    return spr;
  };

  // A factory hall with a sawtooth roof and a tall chimney.
  art.factory = function (rng, o) {
    const s = o.s || 3;
    const W = Math.round(rng.range(22, 34) * s), H = Math.round(rng.range(6, 8) * s);
    const stack = Math.round(rng.range(18, 26) * s);
    const spr = new Spr(W + 6, stack + 2);
    const b = spr.h;
    spr.rect(0, b - H, W, H, M.brick);
    for (let x = 0; x < W; x += 6) spr.rect(x + 2, b - H + 3, 3, 3, M.glass);
    for (let x = 0; x + 8 <= W; x += 8) {
      for (let k = 0; k < 6; k++) spr.vline(x + k, b - H - Math.round(k * 0.7), b - H - 1, k === 5 ? M.glassL : M.metalD);
    }
    const sx = W + 1;
    spr.rect(sx, b - stack, 3, stack, M.brickD);
    for (let y = b - stack + 2; y < b; y += 6) spr.hline(sx, sx + 2, y, M.white);
    spr.chimney = { x: sx + 1, y: b - stack - 1 };
    return spr;
  };

  // A lighthouse in red and white bands on a rock.
  art.lighthouse = function (rng, o) {
    const s = o.s || 3;
    const H = Math.round(rng.range(16, 20) * s);
    const spr = new Spr(Math.round(7 * s), H + 6);
    const b = spr.h, cx = spr.w / 2;
    spr.ellipse(cx, b - 1, spr.w / 2, 4, M.rock, function (x, y, dx, dy) { return dy < -0.3 ? M.rockL : dx > 0.3 ? M.rockD : M.rock; });
    for (let y = b - H; y < b - 3; y++) {
      const f = (y - (b - H)) / H;
      const hw = 1.5 + f * 2.2;
      const band = Math.floor((b - y) / Math.round(2.5 * s)) & 1;
      for (let x = Math.round(cx - hw); x <= Math.round(cx + hw); x++) spr.px(x, y, x > cx + hw * 0.4 ? (band ? M.steelD : M.plasterS) : band ? M.signRed : M.white);
    }
    spr.hline(Math.round(cx - 3), Math.round(cx + 3), b - H, M.dark);
    spr.rect(Math.round(cx - 1), b - H - 3, 3, 3, M.glassL);
    spr.light(Math.round(cx - 1), b - H - 3, 3, 3, "beacon", rng.int(0, 1e8));
    spr.hline(Math.round(cx - 2), Math.round(cx + 2), b - H - 4, M.signRed);
    spr.px(Math.round(cx), b - H - 5, M.dark);
    spr.beam = { x: Math.round(cx), y: b - H - 2 };
    return spr;
  };

  // A harbour crane: two legs joined by a portal beam, a machine house on top
  // and a boom reaching out over the water with a container on the hook.
  art.crane = function (rng, o) {
    const s = o.s || 3;
    const H = Math.round(rng.range(20, 24) * s), W = Math.round(10 * s);
    const boom = Math.round(13 * s);
    const spr = new Spr(W + boom + 4, H + 2);
    const b = spr.h;
    const lx = 2, rx = lx + W;
    const beam = b - Math.round(H * 0.42);
    const top = b - H + 7;
    for (let y = top; y < b; y++) {
      spr.px(lx, y, M.crane);
      spr.px(lx + 1, y, M.craneD);
      spr.px(rx, y, M.crane);
      spr.px(rx + 1, y, M.craneD);
    }
    spr.rect(lx, beam, W + 2, 2, M.crane);
    spr.line(lx + 2, beam + 2, lx + Math.round(W * 0.3), b - 1, M.craneD);
    spr.line(rx - 1, beam + 2, rx - Math.round(W * 0.3), b - 1, M.craneD);
    spr.rect(lx - 2, top - 2, W + 6, 2, M.crane);
    spr.rect(lx + 1, top - 7, 8, 5, M.white);
    spr.rect(lx + 2, top - 6, 3, 2, M.glass);
    spr.light(lx + 2, top - 6, 3, 2, "win", rng.int(0, 1e8));
    spr.rect(rx - 1, top - 3, spr.w - rx - 1, 1, M.crane);
    spr.line(lx + 5, top - 9, spr.w - 2, top - 3, M.craneD);
    spr.vline(lx + 5, top - 9, top - 7, M.craneD);
    const hx = spr.w - 7;
    spr.vline(hx, top - 2, b - Math.round(H * 0.5), M.dark);
    spr.rect(hx - 5, b - Math.round(H * 0.5), 11, Math.round(2.6 * s), rng.pick([M.container1, M.container2, M.container3, M.container4]));
    spr.px(lx + 5, top - 10, M.beaconE);
    spr.light(lx + 5, top - 10, 1, 1, "beacon", rng.int(0, 1e8));
    return spr;
  };

  // Stacks of shipping containers on the quay.
  art.containers = function (rng, o) {
    const s = o.s || 3;
    const n = rng.int(2, 5), cw = Math.round(6 * s), chh = Math.round(2.6 * s);
    const spr = new Spr(n * cw + 2, chh * 3 + 1);
    const b = spr.h;
    const cols = [M.container1, M.container2, M.container3, M.container4];
    for (let i = 0; i < n; i++) {
      const stack = rng.int(1, 3);
      for (let k = 0; k < stack; k++) {
        const c = rng.pick(cols);
        const x = 1 + i * cw, y = b - (k + 1) * chh;
        spr.rect(x, y, cw - 1, chh - 1, c);
        for (let q = x + 1; q < x + cw - 2; q += 2) spr.vline(q, y, y + chh - 2, c === M.container3 ? M.craneD : M.dark);
      }
    }
    return spr;
  };

  // Flat-topped mesas in layered red rock.
  art.mesa = function (rng, o) {
    const s = o.s || 3;
    const W = Math.round(rng.range(o.wmin || 22, o.wmax || 50) * s), H = Math.round(rng.range(o.hmin || 7, o.hmax || 14) * s);
    const spr = new Spr(W + 2, H + 1);
    const b = spr.h;
    const steps = rng.int(1, 2);
    for (let x = 0; x < W; x++) {
      const e = Math.min(x, W - 1 - x);
      let h = e < 3 ? Math.round(H * (0.35 + 0.2 * e)) : H;
      if (steps === 2 && Math.abs(x - W / 2) > W * 0.3) h = Math.min(h, Math.round(H * 0.7));
      h = Math.round(h * (0.94 + 0.06 * K.noise1(x / 3, 17)));
      for (let y = b - h; y < b; y++) {
        const layer = Math.floor((b - y) / 3 + K.noise1(x / 7, 9));
        let c = layer % 3 === 0 ? M.mesaD : layer % 3 === 1 ? M.mesa : M.mesaL;
        if (y === b - h) c = M.mesaL;
        if (x > W * 0.62) c = c === M.mesaL ? M.mesa : M.mesaD;
        spr.px(x + 1, y, c);
      }
    }
    return spr;
  };

  // A lattice pylon for a power line.
  art.pylon = function (rng, o) {
    const s = o.s || 3;
    const H = Math.round(rng.range(13, 16) * s);
    const spr = new Spr(Math.round(5.5 * s), H);
    const cx = Math.floor(spr.w / 2);
    for (let y = 3; y < H; y++) {
      const f = (y - 3) / (H - 3);
      const hw = Math.round(0.6 + f * 2.4);
      spr.px(cx - hw, y, M.pylon);
      spr.px(cx + hw, y, M.pylon);
      if ((y & 3) === 0) spr.hline(cx - hw, cx + hw, y, M.pylon);
    }
    spr.hline(0, spr.w - 1, 3, M.pylon);
    spr.hline(2, spr.w - 3, 7, M.pylon);
    spr.wire = [{ x: 0, y: 4 }, { x: spr.w - 1, y: 4 }, { x: 2, y: 8 }];
    return spr;
  };

  // A barn silo or a water tower.
  art.silo = function (rng, o) {
    const s = o.s || 3;
    const H = Math.round(rng.range(10, 14) * s), W = Math.round(rng.range(3, 4.5) * s);
    const spr = new Spr(W + 2, H + 3);
    const b = spr.h;
    spr.rect(1, b - H, W, H, M.concreteL);
    spr.vline(W, b - H, b - 1, M.concreteD);
    spr.ellipse(1 + W / 2, b - H, W / 2 + 0.5, 2.5, M.metal);
    return spr;
  };

  // A ski lift tower.
  art.liftTower = function (rng, o) {
    const s = o.s || 3;
    const H = Math.round(9 * s);
    const spr = new Spr(Math.round(3 * s), H);
    const cx = Math.floor(spr.w / 2);
    spr.vline(cx, 2, H - 1, M.metalD);
    spr.hline(0, spr.w - 1, 2, M.metalD);
    spr.wire = [{ x: 0, y: 3 }, { x: spr.w - 1, y: 3 }];
    return spr;
  };

  // ---------------------------------------------------------- the horizon ---

  // Ještěd: the ridge with the tower on the summit. The tower is a curved
  // cone that flares at its base, drawn about three times true size so its
  // shape reads from far away.
  art.jested = function (rng, o) {
    const W = 170, H = 50;
    const spr = new Spr(W, H);
    const b = H;
    const peak = 96;
    const ridge = [];
    for (let x = 0; x < W; x++) {
      const d = (x - peak) / (x < peak ? 96 : 74);
      let h = 30 * Math.max(0, 1 - Math.pow(Math.abs(d), 1.35));
      h += (K.noise1(x / 9, 41) - 0.5) * 2.2 + (K.noise1(x / 23, 42) - 0.5) * 3;
      ridge.push(Math.max(0, h));
    }
    for (let x = 0; x < W; x++) {
      const h = Math.round(ridge[x]);
      for (let y = b - h; y < b; y++) {
        const slope = (ridge[Math.min(W - 1, x + 1)] - ridge[Math.max(0, x - 1)]) / 2;
        let c = slope > 0.25 ? M.pineL : slope < -0.25 ? M.pineD : M.pine;
        if (y > b - h + 3 && (x * 7 + y * 3) % 9 === 0) c = M.pineD;
        spr.px(x, y, c);
      }
    }
    const top = b - Math.round(ridge[peak]);
    // The tower: a hotel ring at the base and a curved cone above it.
    const th = 18;
    for (let k = 0; k < th; k++) {
      const f = k / th;
      const hw = 0.45 + 3.9 * Math.pow(1 - f, 1.8);
      const y = top - 2 - k;
      for (let x = Math.round(peak - hw); x <= Math.round(peak + hw); x++) spr.px(x, y, x > peak ? M.greyL : M.white);
    }
    spr.rect(peak - 5, top - 3, 11, 3, M.white);
    spr.hline(peak - 5, peak + 5, top - 2, M.glass);
    spr.light(peak - 5, top - 2, 11, 1, "win", 4242);
    spr.vline(peak, top - th - 6, top - th - 1, M.metalD);
    spr.light(peak, top - th - 6, 1, 1, "beacon", 4243);
    spr.light(peak, top - th + 2, 1, 1, "beacon", 4244);
    spr.jested = { peak: peak, top: top, base: { x: peak - 58, y: b - Math.round(ridge[peak - 58]) } };
    return spr;
  };

  // A distant town: a cluster of small blocks and a church spire.
  art.farTown = function (rng, o) {
    const W = rng.int(26, 46);
    const spr = new Spr(W, 12);
    const b = spr.h;
    let x = 0;
    while (x < W - 2) {
      const w = rng.int(2, 4), h = rng.int(2, 5);
      spr.rect(x, b - h, w, h, rng.pick([M.plasterS, M.plasterW, M.concrete]));
      if (h > 2) spr.px(x + 1, b - h + 1, M.glass);
      spr.light(x + 1, b - h + 1, 1, 1, "win", rng.int(0, 1e8));
      x += w;
    }
    const sx = rng.int(4, W - 5);
    spr.rect(sx, b - 8, 2, 8, M.plasterW);
    spr.px(sx, b - 9, M.pine);
    spr.px(sx + 1, b - 9, M.pine);
    spr.px(sx, b - 11, M.dark);
    spr.px(sx, b - 10, M.pine);
    return spr;
  };

  // A wind turbine mast. The blades are drawn turning by the engine.
  // A wind turbine in the middle distance: a white tower that tapers from
  // two pixels at its foot to one at the top, with the nacelle and hub on
  // top. The blades turn as an actor on the hub, each a little over half
  // the tower's height.
  art.turbine = function (rng) {
    const H = rng.int(30, 38);
    const spr = new Spr(5, H);
    for (let y = 2; y < H; y++) {
      spr.px(2, y, M.white);
      if (y > H * 0.45) spr.px(3, y, M.greyL);
    }
    // The character look draws the hub as + and leaves the nacelle out.
    if (!K.asciiText) {
      spr.rect(1, 0, 4, 2, M.greyL);
      spr.px(1, 0, M.white);
    } else spr.vline(2, 1, 2, M.white);
    spr.hub = { x: 2, y: 1, r: Math.round(H * 0.58) };
    return spr;
  };
})();
