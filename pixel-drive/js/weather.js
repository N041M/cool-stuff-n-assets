// Weather: a handful of numbers that drift toward the climate of the current
// place, clouds that form, drift and dissolve, and rain or snow falling on
// three layers. Rule 8 in docs/drive-rules.md.
(function () {
  "use strict";

  const K = window.DriveKit;
  const M = K.M, Spr = K.Spr;

  function Weather(rng) {
    this.rng = rng;
    // Where each number is now.
    this.cover = rng.range(0.05, 0.45);
    this.precip = 0;
    this.temp = 12;
    this.wind = rng.range(-0.4, 0.6);
    this.fog = rng.range(0, 0.15);
    this.wet = 0;
    this.snow = 0;
    // A slow random front runs on its own clock.
    this.front = rng.range(0, 1000);
    this.clouds = [];
    this.skyShift = 0;
    this.drops = [[], [], []];
    this.fogCol = [206, 210, 216];
  }
  K.Weather = Weather;

  function approach(v, target, dt, tau) {
    return v + (target - v) * (1 - Math.exp(-dt / tau));
  }

  // Moves the weather on by dt seconds. `cl` is the climate at the car and
  // `env` the time of day.
  Weather.prototype.update = function (dt, cl, env, force) {
    this.front += dt;
    const f = this.front;
    // The front: a slow wave that sometimes brings cloud and rain.
    const wave = K.fbm1(f / 260, 911, 3);
    const storm = K.smooth(0.55, 0.78, wave);
    const tCover = K.clamp(0.12 + wave * 0.7 + cl.rain * 0.35, 0, 1);
    const tPrecip = K.clamp(storm * (0.35 + cl.rain * 1.6) - 0.15, 0, 1);
    const tFog = K.clamp(cl.fog * (0.35 + 0.9 * K.smooth(0.4, 0.8, env.dark) * (1 - env.dark * 0.5)) + storm * 0.2 + (K.fbm1(f / 180, 313, 2) - 0.5) * 0.3, 0, 0.85);
    const tTemp = cl.temp - env.dark * 5 - storm * 3;
    const tWind = (K.fbm1(f / 150, 71, 2) - 0.45) * 2.2;
    if (force) {
      if (force.cover !== undefined) this.cover = force.cover;
      if (force.precip !== undefined) this.precip = force.precip;
      if (force.fog !== undefined) this.fog = force.fog;
      if (force.temp !== undefined) this.temp = force.temp;
      if (force.snow !== undefined) this.snow = force.snow;
      if (force.wet !== undefined) this.wet = force.wet;
    } else {
      this.cover = approach(this.cover, tCover, dt, 60);
      this.precip = approach(this.precip, Math.min(tPrecip, this.cover * 1.1), dt, 40);
      this.fog = approach(this.fog, tFog, dt, 70);
      this.temp = approach(this.temp, tTemp, dt, 90);
    }
    this.wind = approach(this.wind, tWind, dt, 40);
    // Rain wets the ground within a minute and it dries over five. Snow
    // settles over a couple of minutes and melts over four.
    const rain = this.precip * K.smooth(0, 2, this.temp);
    const snowing = this.precip * (1 - K.smooth(-0.5, 1.5, this.temp));
    this.wet = K.clamp(this.wet + dt * (rain * 0.02 - (1 - rain) * 0.0035 * (this.temp > 0 ? 1 : 0.3)), 0, 1);
    this.snow = K.clamp(this.snow + dt * (snowing * 0.009 - (this.temp > 1 ? 0.004 * K.smooth(1, 6, this.temp) + 0.001 : 0)), 0, 1);
    this.rainAmt = rain;
    this.snowAmt = snowing;
    K.mixRgb([206, 210, 216], cl.haze, 0.8, this.fogCol);
  };

  // ------------------------------------------------------------ clouds ---
  // A cloud has a puffy top made of overlapping domes and a flatter, slightly
  // ragged base. It is lit from above, with a shaded band along the base.
  // A cloud in the character look, as the first drive drew its clouds: a
  // patch of a noise field twice as wide as it is tall, dense in its thick
  // parts and lighter toward its edges and its base, with holes and ragged
  // streaks. The field is faded out toward the patch's edges.
  function asciiCloud(rng, kind) {
    let W, H;
    if (kind === "stratus") { W = rng.int(110, 180); H = rng.int(8, 14); }
    else if (kind === "big") { W = rng.int(70, 130); H = rng.int(16, 26); }
    else { W = rng.int(40, 70); H = rng.int(10, 16); }
    const s = new Spr(W, H);
    const seed = rng.int(0, 1e6);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = (K.noise2(x / 46, y / 23, seed) * 0.62 + K.noise2(x / 20, y / 10, seed + 1) * 0.38 - 0.5) * 2;
        const ex = (x + 0.5 - W / 2) / (W / 2), ey = (y + 0.5 - H * 0.45) / (H / 2);
        const v = d + 0.3 - 0.9 * K.smooth(0.3, 1, ex * ex + ey * ey) - 0.3 * (y / H);
        const c = v > 0.26 ? M.cloud : v > 0.13 ? M.cloudS : v > 0.03 ? M.cloudD : 0;
        if (c) s.d[y * W + x] = c;
      }
    }
    return s;
  }

  function cloudSprite(rng, kind) {
    if (K.asciiText) return asciiCloud(rng, kind);
    let W, H;
    if (kind === "stratus") { W = rng.int(60, 130); H = rng.int(6, 10); }
    else if (kind === "big") { W = rng.int(44, 80); H = rng.int(16, 24); }
    else { W = rng.int(16, 44); H = rng.int(6, 13); }
    const s = new Spr(W, H);
    const n = Math.max(2, Math.round(W / (kind === "stratus" ? 14 : 10)));
    const domes = [];
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n;
      const env = kind === "stratus" ? 0.5 + 0.3 * Math.sin(Math.PI * f) : Math.sin(Math.PI * Math.min(0.97, Math.max(0.03, f)));
      domes.push({ x: W * f + rng.range(-2, 2), r: Math.max(2, H * env * rng.range(0.75, 1.05)) });
    }
    const seed = rng.int(0, 1e6);
    for (let x = 0; x < W; x++) {
      let top = H;
      for (let i = 0; i < domes.length; i++) {
        const d = domes[i];
        const dx = (x + 0.5 - d.x) / (d.r * (kind === "stratus" ? 1.8 : 1.25));
        if (Math.abs(dx) < 1) top = Math.min(top, H - d.r * Math.sqrt(1 - dx * dx));
      }
      // The base lifts toward the ends and is a little ragged.
      const end = Math.min(x, W - 1 - x) / W;
      const base = H - 1 - Math.round((1 - K.smooth(0, 0.18, end)) * H * 0.3 + K.noise1(x / 5, seed) * 1.5);
      const t = Math.round(top + K.noise1(x / 3, seed + 1) * 1.2);
      for (let y = Math.max(0, t); y <= base; y++) {
        const fromTop = y - t, fromBase = base - y;
        let c = M.cloud;
        if (fromBase < Math.max(1, (base - t) * 0.28)) c = M.cloudD;
        else if (fromTop > (base - t) * 0.45) c = M.cloudS;
        s.d[y * W + x] = c;
      }
    }
    return s;
  }

  // Keeps the sky's clouds in step with the cover. New clouds drift in from
  // the right, and when the sky clears or fills, clouds also form or dissolve
  // slowly where they are.
  Weather.prototype.updateClouds = function (dt, E) {
    const skyW = E.Wsp;
    const top = E.L.skyTop, bottom = E.L.horizon - 12;
    const speed = 0.02 * E.speed + 0.4 + Math.max(-0.25, this.wind * 0.35);
    this.skyShift += Math.max(0.12, speed) * dt;
    const want = this.cover * 1.25;
    let have = 0;
    for (let i = 0; i < this.clouds.length; i++) have += this.clouds[i].area * this.clouds[i].target;
    have /= skyW * Math.max(20, bottom - top) * 0.45;
    const rng = this.rng;
    // Drift in from the right edge.
    if (this.clouds.length < 40 && this.nextCloud <= this.skyShift + skyW + 40) {
      if (have < want + 0.1) this.addCloud(E, this.nextCloud, 1, false);
      this.nextCloud += rng.range(30, 110) * (1.2 - this.cover);
    }
    if (this.nextCloud === undefined || this.nextCloud < this.skyShift + skyW) this.nextCloud = this.skyShift + skyW + rng.range(10, 60);
    // Form or dissolve in place, slowly.
    if (have < want - 0.15 && rng.chance(dt * 0.05)) this.addCloud(E, this.skyShift + rng.range(0, skyW), 0, true);
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      if (have > want + 0.2 && c.target > 0 && rng.chance(dt * 0.01)) c.target = 0;
      c.alpha = approach(c.alpha, c.target, dt, 12);
      if ((c.target === 0 && c.alpha < 0.01) || c.u + c.spr.w < this.skyShift - 20) this.clouds.splice(i, 1);
    }
  };

  Weather.prototype.addCloud = function (E, u, alpha, forming) {
    const rng = this.rng;
    const kind = this.cover > 0.75 && rng.chance(0.6) ? (rng.chance(0.5) ? "stratus" : "big") : rng.chance(0.25) ? "big" : "small";
    const spr = cloudSprite(rng, kind);
    const top = E.L.skyTop, bottom = E.L.horizon - 14;
    const y = K.lerp(top + spr.h, Math.max(top + spr.h + 4, bottom), Math.pow(rng.next(), 1.5) * 0.85);
    this.clouds.push({ u: u, y: y, spr: spr, area: spr.w * spr.h, alpha: alpha, target: 1, forming: forming });
  };

  // ---------------------------------------------------------- rain, snow ---
  // Three layers at different depths. Each drop drifts sideways with its
  // layer and the wind, and when it reaches the ground it starts again above
  // the top of the screen. When the rain eases, drops stop being replaced.
  const LAYERS = [
    { d: 0.2, n: 70, alpha: 0.3, len: 2 },
    { d: 0.5, n: 60, alpha: 0.45, len: 3 },
    { d: 1.0, n: 45, alpha: 0.6, len: 4 },
  ];
  Weather.prototype.updateDrops = function (dt, E) {
    const amount = Math.max(this.rainAmt || 0, this.snowAmt || 0);
    const rng = this.rng;
    const Wsp = E.Wsp, top = E.L.skyTop - 8;
    for (let l = 0; l < 3; l++) {
      const layer = LAYERS[l], drops = this.drops[l];
      const ground = l === 0 ? E.L.horizon + 4 : l === 1 ? E.L.roadTop - 2 : E.L.groundEnd;
      const want = Math.round(layer.n * amount);
      while (drops.length < want && rng.chance(0.4)) {
        drops.push({ x: rng.range(0, Wsp), y: rng.range(top - 60, top), snow: false, s: rng.range(0.7, 1.3), ph: rng.range(0, 6.28) });
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i];
        const snowK = 1 - K.smooth(-0.5, 1.5, this.temp);
        if (d.y < top) d.snow = rng.next() < snowK;
        // Rain falls at up to 110 px/s and snow at up to 25 px/s, in CSS px.
        const fall = d.snow ? (14 + 10 * d.s) : (80 + 30 * d.s);
        const side = -layer.d * E.speedNow * E.P + this.wind * (d.snow ? 10 : 18);
        d.y += (fall / E.P) * layer.d * (0.55 + 0.45 * layer.d) * dt * (l === 2 ? 1 : 1.3);
        d.x += ((side + (d.snow ? Math.sin(E.t * 0.8 + d.ph) * 3 : 0)) / E.P) * dt;
        if (d.x < -4) d.x += Wsp + 8;
        if (d.x > Wsp + 4) d.x -= Wsp + 8;
        if (d.y > ground) {
          if (drops.length > want) drops.splice(i, 1);
          else {
            d.y = top - rng.range(0, 30);
            d.x = rng.range(0, Wsp);
          }
        }
      }
    }
  };

  Weather.prototype.drawDrops = function (E, l, g) {
    const drops = this.drops[l];
    if (!drops.length) return;
    const layer = LAYERS[l];
    const pD = E.pD;
    const rainC = E.lutCss("sky", M.greyL, layer.alpha * (0.6 + 0.4 * (1 - E.env.dark)));
    const snowC = E.lutCss("sky", M.snow, 0.55 + 0.35 * layer.d);
    if (E.ascii) {
      // Rain falls as slashes leaning with the wind and snow as stars.
      const rain = E.lutRgbOf("sky", M.greyL), snow = E.lutRgbOf("sky", M.snow);
      const lean = -layer.d * E.speedNow * E.P + this.wind * 18 < -8 ? "/" : "|";
      const ra = layer.alpha * (0.6 + 0.4 * (1 - E.env.dark)), sa = 0.55 + 0.35 * layer.d;
      for (let i = 0; i < drops.length; i++) {
        const d = drops[i];
        const x = Math.round(d.x * pD), y = E.devY(d.y);
        // Drops close to the road catch the headlights they fall through.
        const lit = l === 2 ? E.beamAt(x, y) : 0;
        const ch = d.snow ? (d.s > 1.1 ? "*" : "·") : lean;
        if (lit > 0.05) E.glyphAt(ch, x, y - 7 * E.dpr, E.BEAM_RGB, Math.min(1, (d.snow ? sa : ra) + lit));
        else E.glyphAt(ch, x, y - 7 * E.dpr, d.snow ? snow : rain, d.snow ? sa : ra);
      }
      return;
    }
    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const x = Math.round(d.x * pD), y = E.devY(d.y);
      const lit = l === 2 ? E.beamAt(x, y) : 0;
      if (d.snow) {
        g.fillStyle = lit > 0.05 ? "rgba(255,236,180," + Math.min(1, 0.55 + lit).toFixed(2) + ")" : snowC;
        g.fillRect(x, y, pD, pD);
      } else {
        g.fillStyle = lit > 0.05 ? "rgba(255,236,180," + Math.min(1, layer.alpha + lit).toFixed(2) + ")" : rainC;
        const len = layer.len;
        const slant = (-layer.d * E.speedNow * E.P + this.wind * 18) / 110;
        for (let k = 0; k < len; k++) g.fillRect(Math.round((d.x - slant * k) * pD), Math.round(y - k * pD), Math.max(1, pD >> 1), pD);
      }
    }
  };
})();
