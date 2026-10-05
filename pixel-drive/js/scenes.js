// Things that live and move: groups of people and animals, the football
// pitch, and the managers that send traffic, trains, boats, birds, planes and
// the UFO. Rules 7, 9 and 10 in docs/drive-rules.md.
//
// An actor belongs to a plane and stands at a plane position `u`, with `y` the
// row of its feet relative to the plane's ground line (negative is up). The
// engine calls update(E, dt) and draw(E) on every frame the actor is near the
// screen.
(function () {
  "use strict";

  const K = window.DriveKit;
  const M = K.M, art = K.art, Spr = K.Spr, world = K.world;
  const objects = (K.objects = {});
  const managers = (K.managers = {});

  // A blank sprite of a given width, for groups that are only actors.
  function blank(w) {
    return new Spr(Math.max(1, w), 1);
  }

  // ------------------------------------------------------------- people ---
  // A person standing about. Every few seconds they turn round, and now and
  // then they raise an arm. Each pose is held for at least half a second.
  function Stander(frames, u, y, rng) {
    this.f = frames;
    this.u = u;
    this.y = y;
    this.rng = rng;
    this.face = rng.chance(0.5) ? "" : "L";
    this.pose = "stand";
    this.next = rng.range(3, 9);
  }
  Stander.prototype.update = function (E, dt) {
    this.next -= dt;
    if (this.next > 0) return;
    const r = this.rng.next();
    if (this.pose !== "stand") this.pose = "stand";
    else if (r < 0.55) this.face = this.face ? "" : "L";
    else if (r < 0.62 && E.env.dark < 0.7) this.pose = "cheer";
    this.next = this.pose === "stand" ? this.rng.range(4, 11) : this.rng.range(0.8, 1.6);
  };
  Stander.prototype.draw = function (E) {
    const k = this.pose === "cheer" ? "cheer" : this.pose + this.face;
    E.drawSpr(this.f[k] || this.f.stand, this.plane, this.u, this.y);
  };

  objects.people = function (rng, o) {
    const n = rng.int(1, (o && o.n) || 2);
    const acts = [];
    for (let i = 0; i < n; i++) acts.push(new Stander(art.randomPerson(rng), i * 6 + rng.int(0, 2), 0, rng.fork(i)));
    return { spr: blank(n * 7), actors: acts };
  };

  // Spectators at the rally stage. They cheer when the car comes past.
  function Spectator(frames, u, y, rng) {
    Stander.call(this, frames, u, y, rng);
    this.face = "";
  }
  Spectator.prototype = Object.create(Stander.prototype);
  Spectator.prototype.update = function (E, dt) {
    const near = Math.abs(E.screenX(this.plane, this.u) - E.carX()) < 40 * E.pD;
    if (near && this.pose !== "cheer" && this.rng.chance(dt * 3)) {
      this.pose = "cheer";
      this.next = this.rng.range(1.2, 2.4);
      return;
    }
    Stander.prototype.update.call(this, E, dt);
  };
  Spectator.prototype.draw = function (E) {
    E.drawSpr(this.pose === "cheer" ? this.f.cheer : this.f.front, this.plane, this.u, this.y);
  };
  objects.spectators = function (rng) {
    const n = rng.int(3, 6);
    const acts = [];
    for (let i = 0; i < n; i++) acts.push(new Spectator(art.randomPerson(rng), i * 6 + rng.int(0, 1), -rng.int(0, 1), rng.fork(i)));
    return { spr: blank(n * 6 + 2), actors: acts };
  };

  // ------------------------------------------------------------ animals ---
  // Grazing animals lift their heads now and then and turn round rarely.
  function Grazer(frames, u, y, rng) {
    this.f = frames;
    this.u = u;
    this.y = y;
    this.rng = rng;
    this.face = rng.chance(0.5) ? "" : "L";
    this.up = rng.chance(0.3);
    this.next = rng.range(2, 8);
  }
  Grazer.prototype.update = function (E, dt) {
    this.next -= dt;
    if (this.next > 0) return;
    if (this.up && this.rng.chance(0.25)) this.face = this.face ? "" : "L";
    this.up = !this.up;
    this.next = this.up ? this.rng.range(1.5, 4) : this.rng.range(4, 12);
  };
  Grazer.prototype.draw = function (E) {
    const k = (this.up ? "up" : "graze") + this.face;
    if (this.lift) {
      if (this.lift >= 1) return;
      E.drawSpr(this.f.up, this.plane, this.u, this.y - this.lift * (this.liftTo || 24), false, false, 1 - K.smooth(0.8, 1, this.lift));
      return;
    }
    E.drawSpr(this.f[k] || this.f.up, this.plane, this.u, this.y);
  };

  objects.pasture = function (rng, o) {
    const kind = (o && o.kind) || "cow";
    const n = rng.int(2, kind === "sheep" ? 5 : 3);
    const acts = [];
    let u = 0;
    for (let i = 0; i < n; i++) {
      const f = kind === "sheep" ? art.sheep() : art.cow(rng);
      acts.push(new Grazer(f, u, -rng.int(1, 5), rng.fork(i)));
      u += (kind === "sheep" ? 9 : 16) + rng.int(0, 8);
    }
    return { spr: blank(u + 4), actors: acts };
  };

  objects.animals = function (rng) {
    const n = rng.int(1, 3);
    const acts = [];
    for (let i = 0; i < n; i++) acts.push(new Grazer(art.deer(rng), i * 14 + rng.int(0, 5), -rng.int(1, 4), rng.fork(i)));
    return { spr: blank(n * 16 + 4), actors: acts };
  };

  // Cows in the middle distance. One pasture in a while is where the UFO
  // comes down at night.
  objects.midPasture = function (rng) {
    const n = rng.int(2, 4);
    const acts = [];
    for (let i = 0; i < n; i++) {
      const f = art.midCow();
      const g = new Grazer({ up: f.up, graze: f.up, upL: f.upL, grazeL: f.upL }, i * 9 + rng.int(0, 4), -rng.int(0, 2), rng.fork(i));
      acts.push(g);
    }
    const spr = new Spr(n * 10 + 6, 3);
    for (let x = 0; x < spr.w; x += 4) spr.vline(x, 0, 2, M.woodD);
    spr.hline(0, spr.w - 1, 1, M.wood);
    return { spr: spr, actors: acts, pasture: true };
  };

  // ---------------------------------------------------------------- signs ---
  objects.townSign = function (rng, o, seg) {
    const name = (seg && seg.name) || rng.pick(world.TOWNS);
    return { spr: art.sign(rng, { text: name, border: M.signInk, strike: o.end, postM: 1.4 }) };
  };
  objects.villageSign = function (rng, o, seg) {
    const name = (seg && seg.name) || rng.pick(world.VILLAGES);
    return { spr: art.sign(rng, { text: name, border: M.signInk, strike: o.end, postM: 1.4 }) };
  };
  objects.roadSign = function (rng) {
    const text = rng.pick(world.DIRECTIONS) + " →";
    return { spr: art.sign(rng, { text: text, bg: M.signGreen, fg: M.signWhite, border: M.signWhite, postM: 3.4, pad: 3 }) };
  };
  // A brown tourist sign to a ski area in the Jizera Mountains.
  objects.winterSign = function (rng) {
    return { spr: art.sign(rng, { text: rng.pick(world.SKI) + " →", bg: M.signBrown, fg: M.signWhite, postM: 1.6 }) };
  };
  objects.jestedSign = function (rng) {
    return { spr: art.sign(rng, { text: "JEŠTĚD →", bg: M.signBrown, fg: M.signWhite, postM: 1.6 }) };
  };

  // The rally start: an arch across the road, which the car drives through,
  // and on the roadside the timing booth and a marshal who waves the flag
  // as the car comes through. The engine builds the arch at the road's
  // scale from `gate`.
  objects.rallyStart = function (rng) {
    const booth = art.booth(rng, {});
    const marshal = new Marshal(art.person({ top: M.clothO, sleeve: M.clothO, legs: M.clothK, hair: M.hairB }), -8, 0);
    return { spr: booth, actors: [marshal], gate: { text: "START" } };
  };
  // The finish: the arch across the road, and the STOP board a little
  // after it where the cars pull up.
  objects.rallyFinish = function (rng) {
    // The board stands about 15 m past the finish line.
    const stop = art.sign(rng, { text: "STOP", bg: M.signRed, fg: M.signWhite, postM: 1.3 });
    const spr = new Spr(stop.w + 160, stop.h);
    spr.blit(stop, 160, 0);
    const marshal = new Marshal(art.person({ top: M.clothO, sleeve: M.clothO, legs: M.clothK, hair: M.hairK }), -8, 0);
    return { spr: spr, actors: [marshal], gate: { text: "CÍL", finish: true } };
  };
  function Marshal(frames, u, y) {
    this.f = frames;
    this.u = u;
    this.y = y;
    this.t = 0;
  }
  Marshal.prototype.update = function (E, dt) {
    const near = Math.abs(E.screenX(this.plane, this.u) - E.carX()) < 60 * E.pD;
    this.t = near ? this.t + dt : 0;
  };
  Marshal.prototype.draw = function (E) {
    const up = this.t > 0 && Math.floor(this.t / 0.6) % 2 === 0;
    E.drawSpr(up ? this.f.flagUp : this.f.flagDown, this.plane, this.u, this.y);
  };

  // The bridge: steel arches, one per span, with hangers down to the deck.
  objects.bridge = function (rng, o) {
    const s = 6;
    const span = Math.round(45 * s), H = Math.round(12 * s);
    const n = Math.max(1, o.spans || 3);
    const spr = new Spr(span * n + 4, H + 6);
    const b = spr.h - 1;
    for (let k = 0; k < n; k++) {
      const x0 = 2 + k * span;
      for (let x = 0; x <= span; x++) {
        const f = x / span;
        const y = b - 2 - Math.round(H * 4 * f * (1 - f));
        spr.px(x0 + x, y, M.steel);
        spr.px(x0 + x, y + 1, M.steelD);
        if (x % 10 === 5 && y < b - 3) spr.vline(x0 + x, y + 2, b - 1, M.metalD);
      }
      // A portal where two arches meet.
      spr.rect(x0 - 2, b - 8, 5, 8, M.steelD);
    }
    spr.rect(span * n, b - 8, 5, 8, M.steelD);
    spr.hline(0, spr.w - 1, b, M.steelD);
    spr.hline(0, spr.w - 1, b - 1, M.steel);
    return { spr: spr };
  };

  // --------------------------------------------------------- the pitch ---
  // A small village ground: a green between two touchlines, goals at both
  // ends, a railing with spectators on the far side, floodlights, a clubhouse
  // and a board scoreboard. The match is an actor; see Match below.
  const PITCH_W = 240, BAND = 16;
  objects.pitch = function (rng, o, seg) {
    const s = 6;
    const club = 46, board = 60;
    const W = PITCH_W + club + 8;
    const H = 84;
    const spr = new Spr(W, H);
    const b = H - 1;
    const px0 = club + 6;
    // The green, mown in stripes, with its lines.
    for (let y = b - BAND; y <= b; y++) {
      for (let x = px0 - 4; x < px0 + PITCH_W + 4; x++) spr.px(x, y, (Math.floor((x - px0) / 20) & 1) ? M.pitchGrass : M.pitchGrassL);
    }
    const line = M.pitchLine;
    spr.hline(px0, px0 + PITCH_W, b - 1, line);
    spr.hline(px0 + 4, px0 + PITCH_W - 4, b - BAND + 1, line);
    // The halfway line and the centre circle, drawn in perspective.
    for (let y = b - BAND + 1; y <= b - 1; y++) {
      const f = (b - 1 - y) / (BAND - 2);
      spr.px(Math.round(px0 + PITCH_W / 2 + f * 2), y, line);
      spr.px(Math.round(px0 + f * 4), y, line);
      spr.px(Math.round(px0 + PITCH_W - f * 4), y, line);
    }
    spr.ellipse(px0 + PITCH_W / 2 + 1, b - BAND / 2, 22, BAND * 0.32, 0, function (x, y, dx, dy, q) { return q > 0.72 ? line : spr.get(x, y); });
    // Penalty areas.
    for (const side of [0, 1]) {
      const gx = side ? px0 + PITCH_W - 4 : px0 + 4;
      const dir = side ? -1 : 1;
      const x1 = gx + dir * 40;
      for (let y = b - BAND + 3; y <= b - 3; y++) spr.px(x1 + Math.round(((b - 3 - y) / (BAND - 6)) * 2) * dir * -1, y, line);
      spr.hline(Math.min(gx, x1), Math.max(gx, x1), b - 3, line);
      spr.hline(Math.min(gx, x1), Math.max(gx, x1), b - BAND + 3, line);
      spr.px(gx + dir * 27, b - BAND / 2, line);
      // The goal, seen from the side: posts, crossbar and the net.
      const gy = b - Math.round(BAND / 2);
      const post = Math.round(2.44 * s);
      spr.vline(gx, gy - post, gy, M.white);
      spr.vline(gx - dir * 10, gy - post + 3, gy, M.greyL);
      for (let k = 1; k < 10; k++) {
        const yy = gy - post + Math.round((k / 10) * 3);
        if (k % 2 === 0) spr.vline(gx - dir * k, yy, gy, M.greyL);
      }
      for (let y = gy - post; y < gy; y += 3) spr.hline(Math.min(gx, gx - dir * 9), Math.max(gx, gx - dir * 9), y, M.greyL);
      spr.hline(Math.min(gx, gx - dir * 10), Math.max(gx, gx - dir * 10), gy - post, M.white);
    }
    // The railing on the far side.
    const ry = b - BAND - 1;
    for (let x = px0 - 2; x < px0 + PITCH_W + 2; x++) {
      spr.px(x, ry - 5, M.metal);
      if (x % 8 === 0) spr.vline(x, ry - 5, ry, M.metalD);
    }
    // Floodlights.
    const fl = [px0 + 40, px0 + PITCH_W - 40];
    const lid = rng.int(0, 1e8);
    for (let i = 0; i < fl.length; i++) {
      const x = fl[i];
      spr.vline(x, ry - 66, ry, M.metalD);
      spr.rect(x - 4, ry - 70, 9, 4, M.metal);
      for (let k = 0; k < 3; k++) spr.light(x - 3 + k * 3, ry - 67, 2, 1, "flood", lid + i * 3 + k);
    }
    // The clubhouse, with a bench beside it and the scoreboard.
    const cw = club - 4, chh = 20, cy = b - BAND + 2;
    spr.rect(2, cy - chh, cw, chh, M.plasterS);
    spr.vline(1 + cw, cy - chh, cy - 1, M.plinth);
    spr.rect(1, cy - chh - 2, cw + 2, 2, M.roofD);
    spr.rect(6, cy - chh + 5, 8, 6, M.glass);
    spr.light(6, cy - chh + 5, 8, 6, "win", lid + 50);
    spr.rect(20, cy - chh + 5, 8, 6, M.glass);
    spr.light(20, cy - chh + 5, 8, 6, "win", lid + 51);
    spr.rect(32, cy - 12, 6, 12, M.woodD);
    spr.hline(4, 16, cy + 1, M.wood);
    // The scoreboard: black boards under DOMÁCÍ and HOSTÉ on two posts.
    const sbx = px0 + PITCH_W - board - 6, sby = ry - 30;
    spr.rect(sbx, sby, board, 18, M.signInk);
    spr.text("DOMÁCÍ", sbx + 3, sby + 5, M.white);
    spr.text("HOSTÉ", sbx + board - 3 - K.textWidth("HOSTÉ"), sby + 5, M.white);
    spr.vline(sbx + 4, sby + 18, ry - 1, M.woodD);
    spr.vline(sbx + board - 5, sby + 18, ry - 1, M.woodD);
    const match = new Match(rng, { px0: px0, ry: ry, sb: { x: sbx, y: sby, w: board }, first: o.first, silence: o.silence, W: W });
    return { spr: spr, actors: [match], nosnowLines: true };
  };

  // The match on the pitch. Positions are in pitch coordinates: x along the
  // pitch from the left goal line and d the depth, 0 at the near touchline and
  // 1 at the far one.
  const MOMENTS = ["foul", "freeKick", "indirect", "offside", "penalty", "final"];
  function Match(rng, o) {
    this.rng = rng;
    this.o = o;
    this.u = 0;
    this.y = 0;
    this.px0 = o.px0;
    this.t = 0;
    this.score = [rng.int(0, 2), rng.int(0, 2)];
    this.silence = o.silence !== undefined ? o.silence : o.first ? rng.chance(0.5) : rng.chance(0.2);
    this.moment = this.silence ? "silence" : rng.pick(MOMENTS);
    this.stage = this.silence ? "lined" : "play";
    this.stageT = 0;
    this.triggered = false;
    this.ball = { x: 120, d: 0.5, h: 0, from: null, to: null, k: 1, owner: -1 };
    const kitH = { top: M.kitW, sleeve: M.kitW, band: M.black, legs: M.kitShort, socks: M.kitW };
    const kitA = { top: M.kitB, sleeve: M.kitB, band: M.black, legs: M.white, socks: M.kitB };
    const keeperH = { top: M.clothG, sleeve: M.clothG, band: M.black, legs: M.clothK, socks: M.clothK };
    const keeperA = { top: M.clothY, sleeve: M.clothY, band: M.black, legs: M.clothK, socks: M.clothK };
    const hairs = [M.hairK, M.hairB, M.hairB, M.hairY, M.hairK];
    this.players = [];
    // A 4-4-2 on each side: home attacks to the right.
    const shape = [[0.04, 0.5], [0.2, 0.15], [0.2, 0.4], [0.2, 0.62], [0.2, 0.88], [0.34, 0.12], [0.34, 0.4], [0.34, 0.64], [0.34, 0.9], [0.45, 0.35], [0.45, 0.68]];
    for (let team = 0; team < 2; team++) {
      for (let i = 0; i < 11; i++) {
        // Footballers of the time: some long hair, some moustaches.
        const kit = Object.assign({ hair: rng.pick(hairs), skin: rng.chance(0.9) ? M.skin : M.skinD, head: rng.chance(0.3) ? "long" : "short", tache: rng.chance(0.2) }, i === 0 ? (team ? keeperA : keeperH) : team ? kitA : kitH);
        const hx = shape[i][0] * PITCH_W, hd = shape[i][1];
        const x = team ? PITCH_W - hx : hx;
        this.players.push({ f: art.person(kit), team: team, i: i, hx: x, hd: hd, x: x, d: hd, tx: x, td: hd, dist: 0, pose: null, face: team ? "L" : "" });
      }
    }
    const refKit = { top: M.refK, sleeve: M.refK, legs: M.refK, socks: M.refK, hair: M.hairG, collar: true };
    this.ref = { f: art.person(refKit), x: PITCH_W / 2 + 10, d: 0.45, tx: 0, td: 0, dist: 0, pose: null, face: "" };
    this.lines = { f: art.person(Object.assign({}, refKit, { hair: M.hairB })), x: PITCH_W / 2, d: -0.05, tx: PITCH_W / 2, td: -0.05, dist: 0, pose: "flagDown", face: "" };
    if (this.silence) this.lineUp();
    else this.kickOff();
  }
  K.Match = Match;

  // Everyone lines up across the middle of the pitch, facing the road: home
  // on one side of the officials and away on the other.
  Match.prototype.lineUp = function () {
    const mid = PITCH_W / 2;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      const k = p.team ? p.i : -1 - p.i;
      p.x = p.tx = mid + k * 5.5 + (p.team ? 8 : -8);
      p.d = p.td = 0.55;
      p.pose = "frontBowed";
    }
    this.ref.x = this.ref.tx = mid;
    this.ref.d = this.ref.td = 0.55;
    this.ref.pose = "frontBowed";
    this.lines.x = this.lines.tx = mid + 6;
    this.lines.d = this.lines.td = 0.55;
    this.lines.pose = "frontBowed";
    this.lines.x = mid - 7;
  };
  Match.prototype.kickOff = function () {
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      p.tx = p.hx;
      p.td = p.hd;
      p.pose = null;
    }
    this.ref.pose = null;
    this.lines.pose = "flagDown";
    this.lines.td = -0.05;
    this.ball.x = PITCH_W / 2;
    this.ball.d = 0.5;
    this.ball.owner = this.rng.int(9, 10);
    this.passT = 1;
  };

  // Each frame: move everyone toward their targets at a walk or a jog, and
  // run the chosen moment when the pitch reaches the middle of the screen.
  Match.prototype.update = function (E, dt) {
    this.t += dt;
    this.stageT += dt;
    const sx = E.screenX(this.plane, this.u + this.px0 + PITCH_W / 2) / E.pD;
    const centre = sx / E.Wsp;
    this.snowBall = E.look.snow > 0.3;
    if (this.stage === "lined") {
      // The minute's silence lasts until the pitch has come well into view.
      if (centre < 0.42 && this.stageT > 8) this.go("whistleEnd");
    } else if (this.stage === "whistleEnd") {
      this.ref.pose = "whistle";
      if (this.stageT > 1.6) {
        for (let i = 0; i < this.players.length; i++) this.players[i].pose = "front";
        this.ref.pose = "front";
        this.lines.pose = "front";
        this.go("applause");
      }
    } else if (this.stage === "applause") {
      if (this.stageT > 2) {
        this.kickOff();
        this.go("play");
      }
    } else if (this.stage === "play") {
      this.play(E, dt);
      if (!this.triggered && centre < 0.62 && centre > 0.3 && this.moment !== "silence") {
        this.triggered = true;
        this.startMoment();
      }
    } else this.runMoment(E, dt);
    const people = this.players.concat([this.ref, this.lines]);
    for (let i = 0; i < people.length; i++) move(people[i], dt, this.stage === "play" ? 2.2 : 3);
    this.moveBall(dt);
  };
  Match.prototype.go = function (stage) {
    this.stage = stage;
    this.stageT = 0;
  };

  function move(p, dt, speed) {
    const dx = p.tx - p.x, dd = (p.td - p.d) * BAND * 1.5;
    const dist = Math.hypot(dx, dd);
    if (dist < 0.05) return;
    const step = Math.min(dist, speed * dt);
    p.x += (dx / dist) * step;
    p.d += ((dd / dist) * step) / (BAND * 1.5);
    p.dist += step;
    if (Math.abs(dx) > 0.2 && !p.lockFace) p.face = dx < 0 ? "L" : "";
  }

  // Ordinary play: the ball goes from player to player and everyone drifts
  // with it. The referee keeps a few metres from the ball.
  Match.prototype.play = function (E, dt) {
    const rng = this.rng;
    this.passT -= dt;
    const b = this.ball;
    if (this.passT <= 0 && !b.from) {
      const owner = this.players[b.owner] || this.players[9];
      const mates = this.players.filter(function (p) { return p !== owner && (rng.chance(0.25) ? true : p.team === owner.team); });
      const to = mates[rng.int(0, mates.length - 1)];
      b.from = { x: b.x, d: b.d };
      b.to = to;
      b.k = 0;
      b.len = Math.max(0.6, Math.min(2.2, Math.abs(to.x - b.x) / 40));
      b.owner = this.players.indexOf(to);
      this.passT = rng.range(1.2, 3);
    }
    const shift = (b.x - PITCH_W / 2) * 0.35;
    for (let i = 0; i < this.players.length; i++) {
      const p = this.players[i];
      if (i === b.owner && !b.from) {
        p.tx = b.x - (p.team ? -2 : 2);
        p.td = b.d;
        continue;
      }
      const keeper = p.i === 0;
      p.tx = K.clamp(p.hx + (keeper ? shift * 0.1 : shift), 4, PITCH_W - 4) + Math.sin(this.t * 0.3 + i) * 3;
      p.td = K.clamp(p.hd + (b.d - 0.5) * 0.25, 0.05, 0.95);
      p.pose = null;
    }
    this.ref.tx = K.clamp(b.x + (b.x > PITCH_W / 2 ? -14 : 14), 10, PITCH_W - 10);
    this.ref.td = K.clamp(b.d + 0.18, 0.2, 0.8);
    this.ref.pose = null;
    this.lines.tx = K.clamp(b.x, 30, PITCH_W - 30);
    this.lines.lockFace = false;
  };

  Match.prototype.moveBall = function (dt) {
    const b = this.ball;
    if (!b.from) {
      const o = this.players[b.owner];
      if (o && this.stage === "play") {
        b.x += (o.x + (o.team ? -2 : 2) - b.x) * Math.min(1, dt * 6);
        b.d += (o.d - b.d) * Math.min(1, dt * 6);
      }
      b.h = 0;
      return;
    }
    b.k = Math.min(1, b.k + dt / b.len);
    const tx = b.to.x !== undefined ? b.to.x : b.to.tx, td = b.to.d !== undefined ? b.to.d : b.to.td;
    b.x = K.lerp(b.from.x, tx, b.k);
    b.d = K.lerp(b.from.d, td, b.k);
    b.h = Math.sin(Math.PI * b.k) * Math.min(6, b.len * 3);
    if (b.k >= 1) b.from = null;
  };

  // The referee's moments. Each is a list of steps; a step sets poses and
  // holds them for its time, never less than a second.
  Match.prototype.startMoment = function () {
    this.step = 0;
    this.go("moment");
    const b = this.ball;
    const rng = this.rng;
    const victim = this.players[b.owner] || this.players[9];
    const culprit = this.players.filter(function (p) { return p.team !== victim.team && p.i > 0; })[rng.int(0, 9)];
    this.victim = victim;
    this.culprit = culprit;
    const ref = this.ref, lines = this.lines;
    const dir = victim.team ? -1 : 1;
    const self = this;
    const at = function (x) { return K.clamp(x, 16, PITCH_W - 16); };
    const refTo = function () {
      ref.tx = at(b.x - dir * 12);
      ref.td = K.clamp(b.d + 0.15, 0.15, 0.85);
    };
    const freeze = function () {
      for (let i = 0; i < self.players.length; i++) {
        const p = self.players[i];
        p.tx = p.x;
        p.td = p.d;
      }
    };
    const resume = function () {
      if (victim.pose === "fallen") victim.pose = null;
      ref.pose = null;
      lines.pose = "flagDown";
      self.passT = 0.5;
      self.go("play");
    };
    const S = {
      foul: [
        [1.2, function () { freeze(); victim.pose = "fallen"; culprit.tx = victim.x - dir * 4; culprit.td = victim.d; refTo(); }],
        [1.4, function () { ref.pose = "whistle"; }],
        [2.2, function () { ref.pose = "card"; ref.face = culprit.x < ref.x ? "L" : ""; }],
        [2.6, function () { ref.pose = "notebook"; }],
        [1.2, function () { ref.pose = "point"; ref.face = dir > 0 ? "" : "L"; victim.pose = null; }],
        [0, resume],
      ],
      freeKick: [
        [1.2, function () { freeze(); victim.pose = "fallen"; refTo(); }],
        [1.4, function () { ref.pose = "whistle"; }],
        [2.4, function () { ref.pose = "point"; ref.face = dir > 0 ? "" : "L"; victim.pose = null; }],
        [0, resume],
      ],
      indirect: [
        [1.2, function () { freeze(); refTo(); }],
        [1.4, function () { ref.pose = "whistle"; }],
        [3.2, function () { ref.pose = "armUp"; }],
        [1, function () { ref.pose = "armUp"; self.kick(victim); }],
        [0, resume],
      ],
      offside: [
        [1.2, function () { lines.tx = at(b.x + dir * 20); lines.pose = "flagDown"; }],
        [2, function () { freeze(); lines.pose = "flagUp"; lines.face = dir > 0 ? "L" : ""; lines.lockFace = true; }],
        [1.4, function () { ref.pose = "whistle"; }],
        [2.2, function () { ref.pose = "armUp"; }],
        [0, resume],
      ],
      penalty: [
        [1.2, function () { freeze(); b.x = dir > 0 ? PITCH_W - 34 : 34; victim.tx = b.x; victim.pose = "fallen"; refTo(); }],
        [1.4, function () { ref.pose = "whistle"; }],
        [2.4, function () { ref.pose = "pointDown"; ref.face = dir > 0 ? "" : "L"; }],
        [3, function () {
          ref.pose = null;
          victim.pose = null;
          const spot = dir > 0 ? PITCH_W - 26 : 26;
          b.from = null;
          b.x = spot;
          b.d = 0.5;
          victim.tx = spot - dir * 8;
          victim.td = 0.5;
          for (let i = 0; i < self.players.length; i++) {
            const p = self.players[i];
            if (p === victim || p.i === 0) continue;
            p.tx = dir > 0 ? PITCH_W - 46 - (i % 5) * 3 : 46 + (i % 5) * 3;
          }
          ref.tx = spot - dir * 18;
          ref.td = 0.3;
        }],
        [1.2, function () { victim.tx = b.x - dir * 2; }],
        [2.4, function () { self.kick(victim, dir > 0 ? PITCH_W + 2 : -2); self.score[victim.team] += self.rng.chance(0.75) ? 1 : 0; }],
        [0, function () { b.x = PITCH_W / 2; b.d = 0.5; b.owner = self.rng.int(9, 10) + (victim.team ? 0 : 11); resume(); }],
      ],
      final: [
        [1.2, function () { refTo(); }],
        [2.2, function () { ref.pose = "watch"; }],
        [1.6, function () { ref.pose = "whistle"; freeze(); }],
        [1.6, function () { ref.pose = "armUp"; }],
        [4, function () {
          ref.pose = "stand";
          for (let i = 0; i < 11; i++) {
            const h = self.players[i], a = self.players[11 + i];
            const x = 40 + i * 16;
            h.tx = x - 3; h.td = 0.5; a.tx = x + 3; a.td = 0.5;
            h.lockFace = a.lockFace = true;
            h.face = ""; a.face = "L";
            h.pose = a.pose = "point";
          }
        }],
        [6, function () {
          for (let i = 0; i < self.players.length; i++) { self.players[i].pose = "stand"; }
        }],
        [0, function () {
          for (let i = 0; i < self.players.length; i++) self.players[i].lockFace = false;
          self.kickOff();
          self.go("play");
        }],
      ],
    };
    this.steps = S[this.moment] || S.freeKick;
    this.stepT = 0;
    this.steps[0][1]();
  };
  Match.prototype.kick = function (p, toX) {
    const b = this.ball;
    p.pose = "kick";
    b.from = { x: b.x, d: b.d };
    b.to = { x: toX !== undefined ? toX : K.clamp(b.x + (p.team ? -60 : 60), 10, PITCH_W - 10), d: toX !== undefined ? 0.5 : this.rng.range(0.2, 0.8) };
    b.k = 0;
    b.len = 1.1;
  };
  Match.prototype.runMoment = function (E, dt) {
    this.stepT += dt;
    const st = this.steps[this.step];
    if (this.stepT >= st[0]) {
      this.step++;
      this.stepT = 0;
      if (this.step < this.steps.length) this.steps[this.step][1]();
    }
  };

  // Draws everyone, back to front. The pitch is BAND rows deep.
  Match.prototype.draw = function (E) {
    const base = this.u + this.px0;
    // The floodlights light the pitch at night.
    const flood = E.lightLevel("flood", 11) * K.smooth(0.3, 0.7, E.env.dark);
    E.drawPool(this.plane, base - 6, base + PITCH_W + 6, this.y - 40, this.y, flood);
    const list = this.players.concat([this.ref, this.lines]);
    list.sort(function (a, b) { return b.d - a.d; });
    const baseY = this.y - 2;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      let k;
      if (p.pose) k = p.pose === "fallen" || p.pose.indexOf("front") === 0 || p.pose === "cheer" ? p.pose : p.pose + p.face;
      else {
        const moving = Math.abs(p.tx - p.x) > 0.3 || Math.abs(p.td - p.d) > 0.01;
        const step = Math.floor(p.dist / 1.6) % 4;
        k = moving ? (["run1", "run2", "run3", "run2"][step] + p.face) : "stand" + p.face;
      }
      const spr = p.f[k] || p.f.stand;
      E.drawSpr(spr, this.plane, base + p.x - 3, Math.round(baseY - p.d * (BAND - 3)) + 1);
    }
    // The ball, lifted by its height.
    const b = this.ball;
    E.drawPx(this.snowBall ? M.ballO : M.white, this.plane, base + b.x, baseY - b.d * (BAND - 3) - b.h, 1, "o");
    // The score on the board: wooden plates with white numbers.
    const sb = this.o.sb;
    const txt = this.score[0] + " : " + this.score[1];
    E.drawText(txt, this.plane, this.u + sb.x + Math.round((sb.w - K.textWidth(txt)) / 2), this.y - this.H + sb.y + 11, M.white);
  };

  // ------------------------------------------------------------ turbines ---
  // The blades of a wind turbine on the horizon, turning slowly.
  function Blades(u, y, r, seed) {
    this.u = u;
    this.y = y;
    this.r = r;
    this.a = seed * 7;
    this.w = 0.5 + (seed % 5) * 0.05;
  }
  Blades.prototype.update = function (E, dt) {
    this.a += dt * this.w;
  };
  // Three blades that taper from the hub, with the hub in white. In the
  // character look they are chains of line characters.
  Blades.prototype.draw = function (E) {
    if (E.ascii) {
      E.drawBladesAscii(this.plane, this.u, this.y, this.r, this.a, M.white);
      return;
    }
    const blade = M.white, shade = M.greyL, hub = M.greyL;
    for (let k = 0; k < 3; k++) {
      const a = this.a + (k * 2 * Math.PI) / 3, c = Math.cos(a), s = Math.sin(a);
      for (let i = 1; i <= this.r; i++) {
        E.drawPx(blade, this.plane, this.u + Math.round(c * i), this.y + Math.round(s * i), i > this.r * 0.75 ? 0.8 : 1);
        // The blade is two pixels wide near the hub, shaded on one side.
        if (i < this.r * 0.4) E.drawPx(shade, this.plane, this.u + Math.round(c * i - s), this.y + Math.round(s * i + c));
      }
    }
    E.drawPx(hub, this.plane, this.u, this.y);
  };
  K.Blades = Blades;

  // Smoke from a chimney: a few puffs that rise, drift with the wind, grow
  // and fade.
  function Smoke(u, y, seed) {
    this.u = u;
    this.y = y;
    this.seed = seed;
  }
  Smoke.prototype.update = function () {};
  Smoke.prototype.draw = function (E) {
    const lvl = E.look.chimneys;
    if (lvl <= 0.02) return;
    for (let i = 0; i < 5; i++) {
      const age = K.mod(E.t * 0.12 + i / 5 + this.seed * 0.37, 1);
      const x = this.u + age * (2 + E.weather.wind * 6) + Math.sin(E.t * 0.5 + i * 2 + this.seed) * 0.6;
      const y = this.y - age * 14;
      E.drawBlob(M.cloudS, this.plane, x, y, 1 + Math.floor(age * 2.5), lvl * (1 - age) * 0.8);
    }
  };
  K.Smoke = Smoke;

  // The lighthouse beam sweeping over the sea at night.
  function Beam(u, y) {
    this.u = u;
    this.y = y;
  }
  Beam.prototype.update = function () {};
  Beam.prototype.draw = function (E) {
    const on = E.lightLevel("lamp", 7);
    if (on < 0.02) return;
    const a = E.t * 0.9;
    const reach = Math.abs(Math.cos(a)) * 70;
    const dir = Math.cos(a) > 0 ? 1 : -1;
    E.drawBeam(this.plane, this.u, this.y, dir, reach, on * 0.5);
  };
  K.Beam = Beam;

  // The two cabins of the Ještěd cable car, travelling up and down the slope
  // in opposite directions.
  function CableCar(u, y, x1, y1) {
    this.u = u;
    this.y = y;
    this.x1 = x1;
    this.y1 = y1;
  }
  CableCar.prototype.update = function () {};
  CableCar.prototype.draw = function (E) {
    // A run takes about four minutes, with a pause at each end.
    const T = 240;
    const ph = K.mod(E.t, T) / T;
    const k = K.smooth(0.05, 0.45, ph) - K.smooth(0.55, 0.95, ph);
    const n = 24;
    const step = E.ascii ? 6 : 1;
    for (let i = 0; i <= n; i += step) E.drawPx(M.metalD, this.plane, this.u + (this.x1 * i) / n, this.y + (this.y1 * i) / n, 0.35);
    for (let c = 0; c < 2; c++) {
      const f = c ? 1 - k : k;
      E.drawPx(c ? M.signRed : M.signYellow, this.plane, this.u + this.x1 * f, this.y + this.y1 * f + 1, 1, "▪");
    }
  };
  K.CableCar = CableCar;

  // -------------------------------------------------------------- traffic ---
  // Vehicles in two lanes of the road. Speeds are in sprite px per second of
  // world travel. Vehicles slower than the car enter at the right edge and
  // slide left; faster ones enter at the left edge. The car overtakes slow
  // vehicles in its own lane, and the plan keeps the far lane clear while it
  // does. Vehicles in one lane never close up on screen.
  managers.Traffic = function (E) {
    this.v = [];
    this.nextT = 2;
    this.rng = E.rng.fork(401);
    this.lane = 1;
    this.laneK = 1;
    this.plan = null;
    // Overtakes run on their own timer. When it runs out, no more traffic
    // joins the far lane until it is clear, and then a slow vehicle comes
    // into the car's lane.
    this.otT = this.rng.range(5, 12);
    this.clearing = false;
    // A sprint once per stretch of highway: a cluster of slow vehicles the
    // car weaves through at two and a half times its pace. `sprintSeg` is the stretch it
    // waits for a clear road on, and `sprintDone` the last one it ran on.
    this.sprint = null;
    this.sprintSeg = -1;
    this.sprintDone = -1;
    // Rocks on a rally stage, which the car weaves around.
    this.rocks = [];
    this.rockT = 2;
    // The lane the car is heading for when it weaves: 0 far, 1 near.
    this.tLane = 1;
  };
  const Tr = managers.Traffic.prototype;
  // How busy the road is at x, from 0 (closed to traffic) to 1.
  Tr.allowed = function (E, x) {
    const seg = E.route.segAt(x);
    return world.PLACES[seg.place].traffic;
  };
  Tr.update = function (E, dt) {
    const rng = this.rng;
    const W = E.Wsp;
    this.nextT -= dt;
    for (let i = this.v.length - 1; i >= 0; i--) {
      const v = this.v[i];
      v.x += v.speed * dt;
      v.dist += v.speed * dt;
      // A vehicle goes once it has left the screen and is moving away. One
      // ahead that the car is catching up with stays.
      const sx = E.screenXsp(1, v.x), vs = v.speed - E.speedNow;
      if ((sx + v.spr.w < -40 && vs <= 0) || (sx > W + 60 && vs >= 0) || sx > W + 900) this.v.splice(i, 1);
    }
    const aheadX = E.camX + (W - E.c) + 20;
    const place = world.PLACES[E.route.segAt(aheadX).place];
    this.updateSprint(E, aheadX);
    this.updateRocks(E, dt, aheadX);
    const overtakes = (place.slowTraffic || place.traffic > 0.6) && !this.sprint && this.sprintSeg < 0;
    if (overtakes && !this.plan && !E.still) {
      this.otT -= dt;
      if (this.otT <= 0) this.clearing = true;
    }
    if (this.nextT <= 0) {
      this.nextT = rng.range(1.5, 4.5);
      const density = this.allowed(E, aheadX);
      if (density <= 0 || E.still || this.sprint || this.sprintSeg >= 0) {
        // Nothing joins here.
      } else if (this.clearing) {
        this.nextT = 1;
        if (this.spawn(E, aheadX, true)) {
          this.clearing = false;
          this.otT = rng.range(place.slowTraffic ? 20 : 25, place.slowTraffic ? 45 : 55);
        }
      } else if (rng.chance(0.25 + density * 0.6)) this.spawn(E, aheadX, false);
    }
    this.steer(E, dt);
  };
  // Adds a vehicle, or with `overtake` a slow one in the car's own lane.
  // Returns whether it was added.
  Tr.spawn = function (E, aheadX, overtake) {
    const rng = this.rng;
    const c = E.speed;
    const place = world.PLACES[E.route.segAt(aheadX).place];
    let spec, speed, lane, fromLeft = false;
    if (overtake) {
      lane = 1;
      if (place.slowTraffic && rng.chance(0.6)) spec = rng.chance(0.55) ? { name: "tractor", spr: art.vehicle(art.VEHICLES[art.VEHICLES.length - 1]) } : { name: "cyclist", frames: art.cyclist(rng) };
      speed = c * rng.range(0.1, 0.3);
    } else {
      lane = 0;
      // Most traffic in the far lane is slower than the car and slides past
      // to the left. Some is faster and overtakes the car from behind. On
      // the highway some comes the other way.
      fromLeft = E.pace < 1.05 && rng.chance(0.25);
      speed = fromLeft ? c * rng.range(1.2, 1.45) : c * rng.range(0.1, 0.55);
      if (place === world.PLACES.highway && rng.chance(0.4)) {
        fromLeft = false;
        speed = -c * rng.range(0.45, 0.75);
      }
    }
    if (!spec) {
      const list = art.VEHICLES.filter(function (v) { return v.weight > 0; });
      const pick = rng.weighted(list.map(function (v) { return [v.weight * (place.traffic > 0.6 ? 1 : v.name === "lorry" || v.name === "coach" ? 0.3 : 1), v]; }));
      const body = rng.pick(K.BODIES);
      spec = { name: pick.name, spr: art.vehicle(pick, body[0], body[1]) };
    }
    if (speed < 0 && spec.spr) spec.spr = spec.spr.flipped();
    const spr = spec.spr || spec.frames[0];
    const x = fromLeft ? E.camX - E.c - spr.w - 20 : aheadX + 4;
    const rel = c - speed;
    // How long it stays on screen, and whether its lane stays open to
    // traffic for that long.
    const life = fromLeft ? (E.Wsp + spr.w + 60) / -rel : (E.Wsp + spr.w + 80) / rel;
    for (let k = 0; k <= 4; k++) {
      if (this.allowed(E, x + (speed * life * k) / 4) <= 0) return false;
    }
    const v = { x: x, speed: speed, lane: lane, spr: spr, frames: spec.frames, name: spec.name, dist: 0 };
    // Vehicles in one lane never meet while on screen.
    for (let i = 0; i < this.v.length; i++) {
      const o = this.v[i];
      if (o.lane === lane && this.meets(o, v, Math.min(life, 200))) return false;
    }
    if (overtake) {
      // Plan the overtake: when the car pulls out and when it pulls back in.
      const carFront = E.carWorldX() + E.carW;
      const tOut = (x - carFront - 26) / rel;
      const tIn = (x + spr.w + 30 - E.carWorldX()) / rel;
      const tStart = E.t + tOut - 1.1, tEnd = E.t + tIn;
      // The far lane has to be free around the car for the whole manoeuvre.
      for (let i = 0; i < this.v.length; i++) {
        const o = this.v[i];
        if (o.lane === 0 && this.overlapsCar(E, o, tStart, tEnd + 1.2)) return false;
      }
      this.plan = { v: v, tStart: tStart, tEnd: tEnd };
    } else if (this.plan && this.overlapsCar(E, v, this.plan.tStart, this.plan.tEnd + 1.2)) return false;
    this.v.push(v);
    return true;
  };
  // The highway sprint. Once the car is a quarter of the way into a stretch
  // of highway, no more traffic joins, and when the road around and ahead of
  // the car is clear, four to six slow vehicles join ahead in alternating
  // lanes, far enough apart that the car can pass each in turn. The sprint ends
  // when the last of them is behind the car.
  Tr.updateSprint = function (E, aheadX) {
    const carX = E.carWorldX();
    const seg = E.route.segAt(carX);
    if (this.sprint) {
      const cars = this.sprint.cars;
      let ahead = false;
      for (let i = 0; i < cars.length; i++) if (this.v.indexOf(cars[i]) >= 0 && cars[i].x + cars[i].spr.w > carX - 12) ahead = true;
      if (!ahead) {
        this.sprintDone = this.sprint.seg;
        this.sprint = null;
      }
      return;
    }
    if (E.still || this.plan || seg.place !== "highway" || seg.id === this.sprintDone) {
      if (seg.place !== "highway") this.sprintSeg = -1;
      return;
    }
    const f = (carX - seg.x0) / (seg.x1 - seg.x0);
    if (this.sprintSeg !== seg.id) {
      if (f > 0.25 && f < 0.5) this.sprintSeg = seg.id;
      return;
    }
    // Wait for a clear road.
    for (let i = 0; i < this.v.length; i++) if (this.v[i].x + this.v[i].spr.w > carX - 30) return;
    const rng = this.rng, c = E.speed;
    const n = rng.int(4, 6), speed = c * 0.2;
    let x = aheadX + 4, lane = rng.chance(0.5) ? 1 : 0;
    const cars = [];
    for (let i = 0; i < n; i++) {
      const list = art.VEHICLES.filter(function (v) { return v.weight > 0 && v.name !== "lorry" && v.name !== "coach"; });
      const pick = rng.weighted(list.map(function (v) { return [v.weight, v]; }));
      const body = rng.pick(K.BODIES);
      const spr = art.vehicle(pick, body[0], body[1]);
      if (this.allowed(E, x + spr.w) <= 0) break;
      const v = { x: x, speed: speed, lane: lane, spr: spr, name: pick.name, dist: 0 };
      this.v.push(v);
      cars.push(v);
      // The car needs its own length and a lane change between a vehicle
      // and the next one in the other lane.
      const next = rng.chance(0.8) ? 1 - lane : lane;
      x += spr.w + (next !== lane ? rng.range(58, 68) : rng.range(12, 18));
      lane = next;
    }
    this.sprint = { seg: seg.id, cars: cars };
    this.sprintSeg = -1;
  };

  // Rocks on a rally stage: one now and then in either lane, lying still on
  // the road.
  Tr.updateRocks = function (E, dt, aheadX) {
    for (let i = this.rocks.length - 1; i >= 0; i--) if (this.rocks[i].x + 10 < E.camX - E.c) this.rocks.splice(i, 1);
    if (E.still || E.route.segAt(aheadX).place !== "rally") return;
    this.rockT -= dt * E.pace;
    if (this.rockT > 0) return;
    // Rocks lie 50 to 95 px apart, and never so close to the last one in the
    // other lane that both lanes are blocked at once.
    this.rockT = this.rng.range(7, 13);
    const lane = this.rng.chance(0.6) ? 1 : 0;
    const last = this.rocks[this.rocks.length - 1];
    if (last && last.lane !== lane && aheadX - last.x < E.carW + 30) return;
    this.rocks.push({ x: aheadX + 4, speed: 0, lane: lane, spr: art.roadRock(this.rng), dist: 0 });
  };

  // Where the car weaves in a sprint or on a rally stage: it keeps to its
  // lane until something is in the way within `look` px ahead, then moves to
  // the other lane if that is clear alongside and ahead.
  Tr.weave = function (E, things, look) {
    const carX = E.carWorldX(), front = carX + E.carW;
    const inWay = function (lane, x0, x1) {
      for (let i = 0; i < things.length; i++) {
        const o = things[i];
        if (o.lane === lane && o.x < x1 && o.x + o.spr.w > x0) return true;
      }
      return false;
    };
    if (inWay(this.tLane, front - 4, front + look) && !inWay(1 - this.tLane, carX - 8, front + look * 0.6)) this.tLane = 1 - this.tLane;
    else if (this.tLane === 0 && !inWay(1, carX - 8, front + look)) this.tLane = 1;
    // Something in the lane a little further ahead: the car signals before
    // it moves over.
    this.soon = inWay(this.tLane, front - 4, front + look * 1.6);
    return this.tLane;
  };

  // Whether two vehicles in one lane come within 20 px of each other in the
  // next `span` seconds.
  Tr.meets = function (a, b, span) {
    for (let t = 0; t <= span; t += 0.5) {
      const xa = a.x + a.speed * t, xb = b.x + b.speed * t;
      if (xa < xb + b.spr.w + 20 && xb < xa + a.spr.w + 20) return true;
    }
    return false;
  };
  // Whether vehicle o is alongside the car at any time in [t0, t1].
  Tr.overlapsCar = function (E, o, t0, t1) {
    const c = E.speed;
    for (let t = t0; t <= t1; t += 0.25) {
      const ox = o.x + o.speed * (t - E.t);
      const carX = E.carWorldX() + c * (t - E.t);
      if (ox < carX + E.carW + 16 && ox + o.spr.w > carX - 16) return true;
    }
    return false;
  };
  // The car pulls out and back in along an eased curve of about a second.
  Tr.steer = function (E, dt) {
    const p = this.plan;
    let target = 1, rate = dt / 1.1;
    if (this.sprint) {
      target = this.weave(E, this.v, 32);
      rate = dt / 0.45;
    } else if (this.rocks.length && E.route.segAt(E.carWorldX()).place === "rally") {
      // On a rally stage the car only moves a little way over.
      target = this.weave(E, this.rocks, 26) ? 1 : 0.4;
      rate = dt / 0.6;
    } else {
      this.tLane = 1;
      if (p) {
        if (E.t >= p.tStart && E.t < p.tEnd) target = 0;
        if (E.t > p.tEnd + 1.5) this.plan = null;
      }
    }
    if (target < this.laneK) this.laneK = Math.max(target, this.laneK - rate);
    else this.laneK = Math.min(target, this.laneK + rate);
    E.carLane = K.smoother(this.laneK);
    // The car signals while it changes lane, and for about a second before
    // it pulls out to overtake and before it pulls back in.
    // A signal, once on, lasts at least 1.4 s, which is two flashes.
    const soon = p && ((E.t > p.tStart - 1.2 && E.t < p.tStart) || (E.t > p.tEnd - 1 && E.t < p.tEnd));
    const weaving = (this.sprint || target !== 1 || this.laneK < 1) && this.soon;
    if (Math.abs(target - this.laneK) > 0.01 || soon || weaving) {
      if (!this.signal) this.sigUntil = E.t + 1.4;
      this.signal = true;
    } else if (!(E.t < this.sigUntil)) this.signal = false;
  };
  Tr.draw = function (E, lane) {
    for (let i = 0; i < this.rocks.length; i++) if (this.rocks[i].lane === lane) E.drawVehicle(this.rocks[i], this.rocks[i].spr, lane);
    for (let i = 0; i < this.v.length; i++) {
      const v = this.v[i];
      if (v.lane !== lane) continue;
      const spr = v.frames ? v.frames[Math.floor(v.dist / 2.5) % v.frames.length] : v.spr;
      E.drawVehicle(v, spr, lane);
    }
  };

  // -------------------------------------------------------------- trains ---
  // A train on the middle plane. It only starts when the rails reach past
  // both edges of the screen for its whole run, and it enters at an edge.
  managers.Trains = function (E) {
    this.rng = E.rng.fork(501);
    this.train = null;
    this.wait = this.rng.range(20, 60);
  };
  managers.Trains.prototype.update = function (E, dt) {
    const pl = E.planes.mid;
    if (this.train) {
      const t = this.train;
      t.u += t.v * dt;
      t.dist += Math.abs(t.v) * dt;
      const sx = E.screenXsp(0.3, t.u);
      if ((t.v < 0 && sx + t.len < -20) || (t.v > 0 && sx > E.Wsp + 20)) this.train = null;
      return;
    }
    this.wait -= dt;
    if (this.wait > 0 || E.still) return;
    this.wait = this.rng.range(25, 70);
    if (!E.event("train")) return;
    const rng = this.rng;
    const n = rng.int(2, 5);
    const cars = [art.trainCar("loco", rng)];
    const passenger = rng.chance(0.55);
    for (let i = 0; i < n; i++) cars.push(art.trainCar(passenger ? "coach" : "wagon", rng));
    let len = 0;
    for (let i = 0; i < cars.length; i++) len += cars[i].w + 1;
    // Westbound on screen at about 1.1 times the road speed.
    const scroll = 0.3 * E.camX - E.c;
    const vScreen = -(E.speed * 1.1);
    const v = vScreen + 0.3 * E.speed;
    const u0 = scroll + E.Wsp + 8;
    const life = (E.Wsp + len + 30) / Math.abs(vScreen);
    const uEnd = u0 + v * life;
    if (!E.railSpan(Math.min(u0, uEnd) - 10, Math.max(u0, uEnd) + len + 10)) return;
    this.train = { u: u0, v: v, cars: cars, len: len, dist: 0 };
  };
  managers.Trains.prototype.draw = function (E) {
    const t = this.train;
    if (!t) return;
    let u = t.u;
    for (let i = 0; i < t.cars.length; i++) {
      E.drawSpr(t.cars[i], E.planes.mid, u, E.railY, false, !!t.cars[i].lights);
      u += t.cars[i].w + 1;
    }
  };

  // --------------------------------------------------------------- boats ---
  // Sailboats and fishing boats on the bay, and ships on the horizon. They
  // start at an edge, only where there is water along their whole path.
  managers.Boats = function (E) {
    this.rng = E.rng.fork(601);
    this.boats = [];
    this.wait = 3;
  };
  managers.Boats.prototype.update = function (E, dt) {
    const rng = this.rng;
    for (let i = this.boats.length - 1; i >= 0; i--) {
      const b = this.boats[i];
      b.u += b.v * dt;
      const sx = E.screenXsp(b.d, b.u);
      if (sx + b.spr.w < -30 || sx > E.Wsp + 30) this.boats.splice(i, 1);
    }
    this.wait -= dt;
    if (this.wait > 0 || this.boats.length > 4 || E.still) return;
    this.wait = rng.range(6, 18);
    const far = rng.chance(0.4);
    const d = far ? 0.1 : 0.3;
    const spr = far ? art.ship(rng) : art.boat(rng);
    const left = rng.chance(0.5);
    const scroll = d * E.camX - E.c;
    // On screen, boats drift a little slower or faster than the water.
    const vScreen = (left ? 1 : -1) * rng.range(1.5, 3.5) - d * E.speed;
    const v = vScreen + d * E.speed;
    const u0 = left ? scroll - spr.w - 6 : scroll + E.Wsp + 6;
    const life = (E.Wsp + spr.w + 20) / Math.max(0.3, Math.abs(vScreen));
    const u1 = u0 + v * life;
    if (!E.waterSpan(d, Math.min(u0, u1) - 4, Math.max(u0, u1) + spr.w + 4)) return;
    this.boats.push({ u: u0, v: v, d: d, spr: spr, far: far, y: far ? rng.range(4, 12) : -rng.range(3, 10) });
  };
  managers.Boats.prototype.draw = function (E, far) {
    for (let i = 0; i < this.boats.length; i++) {
      const b = this.boats[i];
      if (b.far !== far) continue;
      E.drawSpr(b.spr, far ? E.planes.far : E.planes.mid, b.u, b.y);
    }
  };

  // ----------------------------------------------------------------- sky ---
  // Flocks of birds, an airliner, a balloon now and then, and the UFO.
  // The airliner in characters, flying left and flying right: the top row,
  // the bottom row, the windows over the bottom row, and the columns of the
  // wing light and the tip of the fin.
  const PLANE_ART = {
    left: [" _______/|", "<_______.'", "  ······  "],
    right: ["|\\_______ ", "'._______>", "  ······  "],
  };
  PLANE_ART.left.wing = 4;
  PLANE_ART.left.fin = 9;
  PLANE_ART.right.wing = 5;
  PLANE_ART.right.fin = 0;
  managers.Sky = function (E) {
    this.rng = E.rng.fork(701);
    this.things = [];
    this.wait = 6;
    this.ufoDone = false;
  };
  managers.Sky.prototype.update = function (E, dt) {
    const rng = this.rng;
    for (let i = this.things.length - 1; i >= 0; i--) {
      const s = this.things[i];
      s.x += s.vx * dt;
      s.y += (s.vy || 0) * dt;
      s.age += dt;
      if (s.update) s.update(E, dt);
      if (s.x < -80 || s.x > E.Wsp + 80 || s.gone) this.things.splice(i, 1);
    }
    this.wait -= dt;
    if (this.wait > 0 || E.still) return;
    this.wait = rng.range(8, 20);
    const wet = E.weather.precip > 0.3;
    const top = E.L.skyTop, hz = E.L.horizon;
    const r = rng.next();
    if (r < 0.45 && !wet && E.env.dark < 0.6) {
      if (!E.event("birds")) return;
      // A flock in a loose V, heading one way or the other.
      const left = rng.chance(0.65);
      const n = rng.int(4, 9);
      const y = K.lerp(top + 6, hz - 16, rng.range(0.15, 0.8));
      const vx = left ? -rng.range(2.5, 5) : rng.range(1.5, 3);
      const frames = art.bird(E.route.segAt(E.camX).coast && rng.chance(0.7));
      const birds = [];
      for (let i = 0; i < n; i++) birds.push({ dx: Math.abs(i - n / 2) * 5 * (left ? 1 : -1), dy: Math.abs(i - n / 2) * 2 + rng.range(-1, 1), ph: rng.range(0, 4) });
      this.things.push({ kind: "birds", x: left ? E.Wsp + 20 : -20, y: y, vx: vx, age: 0, birds: birds, frames: frames });
    } else if (r < 0.75) {
      if (!E.event("plane")) return;
      const left = rng.chance(0.6);
      const sp = art.airliner();
      this.things.push({ kind: "plane", x: left ? E.Wsp + 20 : -20, y: K.lerp(top + 3, hz - 30, rng.range(0, 0.35)), vx: left ? -rng.range(3, 4.5) : rng.range(2.2, 3.4), age: 0, spr: left ? sp.left : sp.right, trail: [] });
    } else if (r < 0.85 && E.env.dark < 0.3 && E.weather.wind < 0.6 && !wet) {
      if (!E.event("balloon")) return;
      const left = E.weather.wind < 0;
      this.things.push({ kind: "balloon", x: left ? E.Wsp + 10 : -16, y: K.lerp(top + 20, hz - 26, rng.range(0.2, 0.7)), vx: (left ? -1 : 1) * rng.range(0.6, 1.2), vy: -0.05, age: 0, spr: art.balloon(rng), burn: 0 });
    }
  };
  managers.Sky.prototype.draw = function (E) {
    for (let i = 0; i < this.things.length; i++) {
      const s = this.things[i];
      if (s.kind === "birds") {
        for (let k = 0; k < s.birds.length; k++) {
          const b = s.birds[k];
          const fi = Math.floor(s.age * 4 + b.ph) % 4;
          if (E.ascii) E.drawSkyGlyph(fi === 0 ? "v" : fi === 2 ? "^" : "-", s.x + b.dx, s.y + b.dy, s.frames[0].d.find(function (v) { return v; }));
          else E.drawSky(s.frames[fi], s.x + b.dx, s.y + b.dy);
        }
      } else if (s.kind === "plane" && E.ascii) {
        // An airliner in characters, two rows high: the fuselage between
        // two lines of _, the nose, the tail fin and a row of windows. By
        // day it trails a dashed contrail. At night its body fades, its
        // windows glow and it shows a red light on the wing and a white
        // strobe on the fin.
        const left = s.vx < 0, cell = K.ascii.CW / E.P, row = K.ascii.CH / E.P;
        const art = left ? PLANE_ART.left : PLANE_ART.right;
        const night = K.smooth(0.45, 0.65, E.env.dark);
        const body = 1 - night * 0.7;
        E.drawSkyInk(art[0], s.x, s.y, 1, body);
        E.drawSkyInk(art[1], s.x, s.y + row, 1, body);
        E.drawSkyInk(art[2], s.x, s.y + row, 2, body * (1 - night));
        if (night > 0) {
          E.drawSkyInk(art[2], s.x, s.y + row, 0, night * 0.9, [255, 214, 140]);
          E.drawSkyInk("•", s.x + art.wing * cell, s.y + row, 0, night, [226, 72, 58]);
          if (K.mod(E.t, 1.2) < 0.12) E.drawSkyInk("•", s.x + art.fin * cell, s.y, 0, night, [240, 244, 255]);
        }
        if (night < 1) {
          const w = art[0].length;
          for (let i = 0; i < 12; i++) {
            if ((i + Math.floor(E.t * 6)) % 3 === 0) continue;
            const x = left ? s.x + (w + i) * cell : s.x - (1 + i) * cell;
            E.drawSkyInk("-", x, s.y + row, i < 4 ? 1 : 2, (1 - night) * (1 - i / 13));
          }
        }
      } else if (s.kind === "plane") {
        // The contrail, fading out behind the plane.
        const dir = s.vx < 0 ? 1 : -1;
        const len = 60;
        for (let k = 0; k < len; k += E.ascii ? 7 / E.P : 1) {
          const a = 0.35 * (1 - k / len) * (1 - E.env.dark);
          if (a < 0.02) break;
          E.drawSkyPx(M.cloud, s.x + (dir > 0 ? s.spr.w : 0) + dir * k, s.y + 2, a);
        }
        E.drawSky(s.spr, s.x, s.y, true);
      } else if (s.kind === "balloon") {
        E.drawSky(s.spr, s.x, s.y, true);
      }
    }
  };

  // The UFO: once a visit at most, at night in clear air, over a pasture in
  // the middle distance. It comes down from the top of the sky, hovers,
  // lifts a cow in a soft beam and rises away.
  function Ufo(E, pasture) {
    this.p = pasture;
    this.plane = E.planes.mid;
    this.u = pasture.u + 4;
    this.y = E.L.skyTop - E.L.roadTop - 30;
    this.hoverY = pasture.y - 30;
    this.stage = "down";
    this.t = 0;
    this.beam = 0;
    this.spr = art.ufo();
    this.cow = pasture.actors[0];
    this.cowLift = 0;
  }
  K.Ufo = Ufo;
  Ufo.prototype.update = function (E, dt) {
    this.t += dt;
    if (this.stage === "down") {
      this.y += (this.hoverY - this.y) * Math.min(1, dt * 0.35);
      if (Math.abs(this.y - this.hoverY) < 1) this.go("hover");
    } else if (this.stage === "hover") {
      if (this.t > 2) this.go("beam");
    } else if (this.stage === "beam") {
      this.beam = Math.min(1, this.beam + dt / 1.5);
      if (this.t > 2) this.cowLift = Math.min(1, this.cowLift + dt / 9);
      if (this.cowLift >= 1) this.go("fade");
    } else if (this.stage === "fade") {
      this.beam = Math.max(0, this.beam - dt / 1.5);
      if (this.beam <= 0) this.go("up");
    } else if (this.stage === "up" || this.stage === "away") {
      this.y -= dt * (this.stage === "away" ? 9 : 5) * (1 + this.t * 0.3);
      if (E.devY(E.L.roadTop + this.y) < -40) this.gone = true;
    }
    if (this.cow && this.cowLift > 0) {
      this.cow.lift = this.cowLift;
      this.cow.liftTo = this.cow.y - this.hoverY - 4;
    }
  };
  Ufo.prototype.go = function (s) {
    this.stage = s;
    this.t = 0;
  };
  Ufo.prototype.shoo = function () {
    if (this.stage !== "up" && this.stage !== "away") {
      this.beam = 0;
      this.go("away");
    }
  };
  Ufo.prototype.draw = function (E) {
    if (this.beam > 0) E.drawUfoBeam(this.plane, this.u + 15, this.y, this.p.y, this.beam);
    E.drawSpr(this.spr, this.plane, this.u, this.y, false, true);
    // The rim lights run round once a second.
    const k = Math.floor(E.t * 6) % 6;
    E.drawLightAt(this.plane, this.u + 4 + k * 4, this.y - 4, 2, 1, "ufoE", 0.9);
  };
})();
