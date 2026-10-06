// A globe drawn as text in a <pre data-figure="globe">. It is shaded as a lit
// sphere and marks Jablonec nad Nisou. It turns slowly until someone drags it,
// and the strip under it names the country under the pointer. It is redrawn
// only while it is on screen, and drawn once when reduced motion is on.
(function () {
  "use strict";

  // The width and height of a cell in pixels. metrics() measures them in the
  // .plot style once IBM Plex Mono has loaded, and again whenever the font or
  // its size changes. These are the values for 11px Plex Mono.
  let CW = 6.6;
  let LH = 14;
  // Plex Mono has no block or box-drawing glyphs, so the browser takes them
  // from another monospace font, whose advance can differ from Plex Mono's.
  // FIX holds the letter-spacing in pixels that brings each of those glyphs
  // back to the width of a cell.
  const FIX = new Map();
  const reducedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");
  const STILL_T = 12;

  function lang() {
    return document.documentElement.lang === "cs" ? "cs" : "en";
  }

  // Cell classes: 0 ink, 1 accent, 2 muted, 3 faint, 4 inverted, 5 accent fill.
  // cls() adds combinations as they are needed, such as the globe's shading.
  const CLS = ["", "a", "d", "g", "i", "ai"];
  const CLS_INDEX = new Map(CLS.map(function (c, i) { return [c, i]; }));
  function cls(name) {
    let i = CLS_INDEX.get(name);
    if (i === undefined) {
      i = CLS.length;
      CLS.push(name);
      CLS_INDEX.set(name, i);
    }
    return i;
  }

  function Grid(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    this.ch = new Array(cols * rows).fill(" ");
    this.cl = new Uint16Array(cols * rows);
  }
  Grid.prototype.put = function (x, y, str, cls) {
    if (y < 0 || y >= this.rows) return;
    const chars = Array.from(String(str));
    for (let i = 0; i < chars.length; i++) {
      const xx = x + i;
      if (xx < 0 || xx >= this.cols) continue;
      this.ch[y * this.cols + xx] = chars[i];
      this.cl[y * this.cols + xx] = cls || 0;
    }
  };
  Grid.prototype.html = function () {
    const out = [];
    for (let y = 0; y < this.rows; y++) {
      let line = "";
      let run = "";
      let runCls = -1;
      let runFix = 0;
      for (let x = 0; x < this.cols; x++) {
        const i = y * this.cols + x;
        const c = this.cl[i];
        const chr = this.ch[i];
        const fix = FIX.get(chr) || 0;
        if (c !== runCls || fix !== runFix) {
          line += wrap(run, runCls, runFix);
          run = "";
          runCls = c;
          runFix = fix;
        }
        run += chr === "<" ? "&lt;" : chr === ">" ? "&gt;" : chr === "&" ? "&amp;" : chr;
      }
      out.push(line + wrap(run, runCls, runFix));
    }
    return out.join("\n");
  };
  function wrap(text, cls, fix) {
    if (!text) return "";
    if (!cls && !fix) return text;
    return "<span" + (cls > 0 ? ' class="' + CLS[cls] + '"' : "") + (fix ? ' style="letter-spacing:' + fix + 'px"' : "") + ">" + text + "</span>";
  }

  function num(x, digits) {
    const s = x.toFixed(digits);
    return lang() === "cs" ? s.replace(".", ",") : s;
  }

  // ------------------------------------------------------------------ globe ---

  // The wheel, a pinch, a double click or the buttons zoom in as far as single
  // countries. Home has a short label for when the globe is zoomed out and its
  // full name for when it is zoomed in.
  const HOME = { lat: 50.7243, lon: 15.1711, name: "Jablonec nad Nisou", short: "JBC" };
  const D = Math.PI / 180;
  const ZMAX = 40;
  const HOME_ZOOM = 14;
  const SPIN = 0.18;
  const QUADS = " ▗▖▄▝▐▞▟▘▚▌▙▀▜▛█";
  const QUAD_COUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
  const GRID_STEPS = [30, 15, 10, 5, 2, 1, 0.5];

  // The globe is lit from the upper left and a little in front. The sea also
  // shines where the light reflects straight back at the viewer.
  function unit(x, y, z) {
    const n = Math.hypot(x, y, z);
    return [x / n, y / n, z / n];
  }
  const LIGHT = unit(-0.5, 0.55, 0.67);
  const GLINT = unit(LIGHT[0], LIGHT[1], LIGHT[2] + 1);
  // Shading has sixteen tones. A 4×4 ordered dither blends the steps between
  // them.
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(function (b) { return (b + 0.5) / 16; });

  function wrapAngle(a) {
    return a - 2 * Math.PI * Math.floor((a + Math.PI) / (2 * Math.PI));
  }

  // The map is a grey PNG in which each pixel holds a country index, 0 for
  // sea. Its last row is a ramp from 0 to 255 that maps whatever the browser
  // decoded back to the stored values. Land is kept at four sizes so a sample
  // can read the one that matches its footprint on the globe. `base` is the
  // path of the two files without their extension.
  function loadWorld(base, done) {
    const img = new Image();
    Promise.all([
      fetch(base + ".json").then(function (r) { return r.json(); }),
      new Promise(function (resolve, reject) {
        img.onload = resolve;
        img.onerror = reject;
        img.src = base + ".png";
      }),
    ]).then(function (res) {
      const meta = res[0];
      const w = meta.w, h = meta.h;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h + 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, w, h + 1).data;
      canvas.width = canvas.height = 0;
      const lut = new Uint8Array(256);
      for (let x = 0; x < w; x++) lut[px[(h * w + x) * 4]] = Math.floor((x * 256) / w);
      const idx = new Uint8Array(w * h);
      const land = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        idx[i] = lut[px[i * 4]];
        land[i] = idx[i] ? 255 : 0;
      }
      const countries = meta.countries;
      const bySize = countries.map(function (c, i) { return i + 1; }).sort(function (a, b) { return countries[b - 1][5] - countries[a - 1][5]; });
      done({ w: w, h: h, idx: idx, levels: shrink(land, w, h), countries: countries, bySize: bySize });
    }).catch(function () { /* without the map the globe is all sea */ });
  }

  function shrink(d, w, h) {
    const levels = [{ w: w, h: h, d: d }];
    while (w % 2 === 0 && h % 2 === 0 && w > 400) {
      const nw = w / 2, nh = h / 2, nd = new Uint8Array(nw * nh);
      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          const i = 2 * y * w + 2 * x;
          nd[y * nw + x] = (d[i] + d[i + 1] + d[i + w] + d[i + w + 1] + 2) >> 2;
        }
      }
      levels.push({ w: nw, h: nh, d: nd });
      d = nd;
      w = nw;
      h = nh;
    }
    return levels;
  }

  // The smallest level with at least one pixel per land sample.
  function levelFor(world, R) {
    const need = (2 * Math.PI * R) / (CW / 2);
    for (let i = world.levels.length - 1; i > 0; i--) if (world.levels[i].w >= need) return world.levels[i];
    return world.levels[0];
  }

  // Share of land at a point, interpolated between the four nearest pixels.
  function landAt(L, lat, lon) {
    const u = (wrapAngle(lon) / (2 * Math.PI) + 0.5) * L.w - 0.5;
    const v = (0.5 - lat / Math.PI) * L.h - 0.5;
    const x0 = Math.floor(u), y0 = Math.floor(v);
    const fx = u - x0, fy = v - y0;
    const xa = (x0 + L.w) % L.w, xb = (x0 + 1) % L.w;
    const ya = Math.max(0, y0) * L.w, yb = Math.min(L.h - 1, y0 + 1) * L.w;
    const d = L.d;
    const top = d[ya + xa] + (d[ya + xb] - d[ya + xa]) * fx;
    const bot = d[yb + xa] + (d[yb + xb] - d[yb + xa]) * fx;
    return (top + (bot - top) * fy) / 255;
  }

  function countryAt(world, lat, lon) {
    const x = Math.min(world.w - 1, Math.floor((wrapAngle(lon) / (2 * Math.PI) + 0.5) * world.w));
    const y = Math.min(world.h - 1, Math.max(0, Math.floor((0.5 - lat / Math.PI) * world.h)));
    return world.idx[y * world.w + x];
  }

  const regionNames = {};
  function countryName(world, i) {
    const c = world.countries[i - 1];
    const l = lang();
    if (!c[0]) return l === "cs" ? c[2] : c[1];
    try {
      if (!regionNames[l]) regionNames[l] = new Intl.DisplayNames([l], { type: "region" });
      return regionNames[l].of(c[0]) || c[0];
    } catch (e) {
      return c[0];
    }
  }

  function coords(lat, lon) {
    lon = wrapAngle(lon);
    const a = num(Math.abs(lat / D), 2) + "°", b = num(Math.abs(lon / D), 2) + "°";
    if (lang() === "cs") return a + (lat < 0 ? " j. š. " : " s. š. ") + b + (lon < 0 ? " z. d." : " v. d.");
    return a + (lat < 0 ? "S " : "N ") + b + (lon < 0 ? "W" : "E");
  }

  // The map fills the rows between the ruler and the three rows of readings.
  function view(s) {
    const top = 1, bottom = s.rows - 3;
    const w = s.cols * CW, h = (bottom - top) * LH;
    return {
      top: top,
      bottom: bottom,
      cx: w / 2,
      cy: top * LH + h / 2,
      R: Math.min(w, h) * 0.44 * s.zoom,
      lon0: s.lon,
      sin0: Math.sin(s.lat),
      cos0: Math.cos(s.lat),
    };
  }

  // Orthographic projection centred on (lat0, lon0), in pixels. z is below 0
  // on the far side.
  function project(v, lat, lon) {
    const cl = Math.cos(lat), dl = lon - v.lon0;
    const x = cl * Math.sin(dl);
    const y = v.cos0 * Math.sin(lat) - v.sin0 * cl * Math.cos(dl);
    const z = v.sin0 * Math.sin(lat) + v.cos0 * cl * Math.cos(dl);
    return [v.cx + v.R * x, v.cy - v.R * y, z];
  }

  // The point on the globe under pixel (px, py), or null off the globe.
  function unproject(v, px, py) {
    const x = (px - v.cx) / v.R, y = (v.cy - py) / v.R;
    const rr = x * x + y * y;
    if (rr > 1) return null;
    const z = Math.sqrt(1 - rr);
    return [Math.asin(z * v.sin0 + y * v.cos0), v.lon0 + Math.atan2(x, z * v.cos0 - y * v.sin0)];
  }

  // Turns the globe so that (lat, lon) sits under pixel (px, py). Of the two
  // centre latitudes that do this, it keeps the one nearer the current one.
  function pin(s, lat, lon, px, py) {
    const v = view(s);
    let x = (px - v.cx) / v.R, y = (v.cy - py) / v.R;
    const rr = x * x + y * y;
    if (rr > 0.998) {
      const k = Math.sqrt(0.998 / rr);
      x *= k;
      y *= k;
    }
    const z = Math.sqrt(1 - x * x - y * y);
    const q = Math.sin(lat) / Math.hypot(y, z);
    if (Math.abs(q) > 1) return;
    const a = Math.asin(q), phi = Math.atan2(y, z);
    let best = null;
    [a - phi, Math.PI - a - phi].forEach(function (c) {
      c = wrapAngle(c);
      if (Math.abs(c) <= Math.PI / 2 && (best === null || Math.abs(c - s.lat) < Math.abs(best - s.lat))) best = c;
    });
    if (best === null) return;
    s.lat = best;
    s.lon = lon - Math.atan2(x, z * Math.cos(best) - y * Math.sin(best));
  }

  // Sets the zoom and keeps the point under pixel (px, py) where it is.
  function zoomAt(s, zoom, px, py) {
    const at = unproject(view(s), px, py);
    s.zoom = Math.max(1, Math.min(ZMAX, zoom));
    if (at) pin(s, at[0], at[1], px, py);
  }

  // Eases towards a zoom, or jumps there when motion is reduced.
  function zoomTo(s, zoom, px, py) {
    zoom = Math.max(1, Math.min(ZMAX, zoom));
    if (reducedMQ.matches) {
      zoomAt(s, zoom, px, py);
      s.target = null;
    } else {
      s.target = { zoom: zoom, px: px, py: py };
    }
  }

  // Moves the globe the way a drag of (dx, dy) pixels would.
  function turn(s, dx, dy) {
    const R = view(s).R;
    const dlon = -dx / (R * Math.max(0.2, Math.cos(s.lat)));
    const dlat = dy / R;
    s.lon += dlon;
    s.lat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, s.lat + dlat));
    return [dlon, dlat];
  }

  // Flies to Jablonec. From far away it pulls back in the middle of the
  // flight, by more the further it has to go.
  function flyHome(s) {
    const to = { lat: HOME.lat * D, lon: HOME.lon * D, zoom: HOME_ZOOM };
    s.target = null;
    if (reducedMQ.matches) {
      s.lat = to.lat;
      s.lon = to.lon;
      s.zoom = to.zoom;
      return;
    }
    const cosFar = Math.sin(s.lat) * Math.sin(to.lat) + Math.cos(s.lat) * Math.cos(to.lat) * Math.cos(to.lon - s.lon);
    const far = Math.acos(Math.max(-1, Math.min(1, cosFar)));
    const hop = Math.min(far * 2.5, Math.log(Math.max(s.zoom, to.zoom)));
    s.fly = { p: 0, lat: s.lat, lon: s.lon, zoom: s.zoom, hop: hop, to: to };
  }

  function step(s, dt, still) {
    if (s.fly) {
      const f = s.fly;
      f.p = still ? 1 : Math.min(1, f.p + dt / 1.6);
      const e = f.p < 0.5 ? 2 * f.p * f.p : 1 - Math.pow(2 - 2 * f.p, 2) / 2;
      const z0 = Math.log(f.zoom), z1 = Math.log(f.to.zoom);
      s.zoom = Math.max(1, Math.exp(z0 + (z1 - z0) * e - f.hop * Math.sin(Math.PI * e)));
      s.lat = f.lat + (f.to.lat - f.lat) * e;
      s.lon = f.lon + wrapAngle(f.to.lon - f.lon) * e;
      if (f.p >= 1) s.fly = null;
      return;
    }
    if (s.target) {
      const k = still ? 1 : 1 - Math.exp(-dt * 14);
      const z = Math.exp(Math.log(s.zoom) + (Math.log(s.target.zoom) - Math.log(s.zoom)) * k);
      const done = Math.abs(Math.log(z / s.target.zoom)) < 0.002;
      zoomAt(s, done ? s.target.zoom : z, s.target.px, s.target.py);
      if (done) s.target = null;
    }
    if (still) return;
    if (s.spin && !s.pointers.size) s.lon -= SPIN * dt;
    if ((s.vlon || s.vlat) && !s.pointers.size) {
      s.lon += s.vlon * dt;
      s.lat = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, s.lat + s.vlat * dt));
      const f = Math.exp(-dt * 4);
      s.vlon *= f;
      s.vlat *= f;
      if (Math.hypot(s.vlon, s.vlat) * view(s).R < 6) s.vlon = s.vlat = 0;
    }
  }

  // The glyph for a line through one cell, from the points where it crosses
  // the cell's edges (0–1 across and down). A line that only clips a corner
  // gets a dot in that corner, nearly flat lines sit high, in the middle or
  // low in the cell, and the rest are upright or slanted.
  function stroke(ax, ay, bx, by) {
    const dx = (bx - ax) * CW, dy = (by - ay) * LH;
    if (Math.hypot(dx, dy) < 6) {
      const top = ay + by < 1, left = ax + bx < 1;
      return top ? (left ? "`" : "'") : left ? "," : ".";
    }
    const ang = Math.atan2(Math.abs(dy), Math.abs(dx));
    if (ang < 0.5) {
      const m = (ay + by) / 2;
      return m < 0.34 ? "¯" : m > 0.66 ? "_" : "-";
    }
    if (ang > 1.2) return "│";
    return dx * dy > 0 ? "\\" : "/";
  }

  // Where the level `lv` crosses a cell, given the field at its top-left,
  // top-right, bottom-left and bottom-right corners.
  function contour(tl, tr, bl, br, lv) {
    const p = [];
    function edge(a, b, x0, y0, x1, y1) {
      if (a < lv === b < lv) return;
      const f = (lv - a) / (b - a);
      p.push(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f);
    }
    edge(tl, tr, 0, 0, 1, 0);
    edge(tr, br, 1, 0, 1, 1);
    edge(bl, br, 0, 1, 1, 1);
    edge(tl, bl, 0, 0, 0, 1);
    if (p.length === 4) return stroke(p[0], p[1], p[2], p[3]);
    return p.length ? "+" : "";
  }

  // The first grid line of spacing `stepR` inside a cell, as a glyph.
  function gridLine(tl, tr, bl, br, stepR, limit) {
    const lv = Math.ceil(Math.min(tl, tr, bl, br) / stepR) * stepR;
    if (lv > Math.max(tl, tr, bl, br) || Math.abs(lv) >= limit) return "";
    return contour(tl, tr, bl, br, lv);
  }

  // A border between two countries, from the countries at the cell corners.
  // It leaves the cell through each edge whose two corners differ, so the
  // box-drawing glyph with arms on those edges joins up with its neighbours.
  // Indexed by top·1 + right·2 + bottom·4 + left·8.
  const ARMS = "   └ │┌├ ┘─┴┐┤┬┼";
  function border(tl, tr, bl, br) {
    const arms = (tl && tr && tl !== tr ? 1 : 0) | (tr && br && tr !== br ? 2 : 0) | (bl && br && bl !== br ? 4 : 0) | (tl && bl && tl !== bl ? 8 : 0);
    return ARMS[arms].trim();
  }

  function niceKm(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    const m = x / p;
    return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * p;
  }

  const GLOBE = {
    fps: 15,
    init: function (s) {
      s.lat = 0.38;
      s.lon = (HOME.lon + 25) * D;
      s.zoom = 1;
      s.spin = true;
      s.vlon = s.vlat = 0;
      s.target = null;
      s.fly = null;
      s.pointers = new Map();
      s.hover = null;
      s.engaged = false;
      s.tap = null;
      s.t = -1;
      s.cols = s.rows = 0;
      s.world = null;
      s.el = null;
      s.touch = "";
    },
    busy: function (s) {
      return !!(s.fly || s.target || s.vlon || s.vlat);
    },
    bind: function (el, s, redraw) {
      s.el = el;
      const fig = el.parentNode;

      // The map is fetched once the globe comes near the screen, from the
      // path in data-world, or data/world.json and data/world.png.
      const near = new IntersectionObserver(function (entries) {
        if (!entries.some(function (e) { return e.isIntersecting; })) return;
        near.disconnect();
        loadWorld(el.getAttribute("data-world") || "data/world", function (world) {
          s.world = world;
          redraw();
        });
      }, { rootMargin: "600px" });
      near.observe(el);

      function local(e) {
        const r = el.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
      }
      function takeOver() {
        s.spin = false;
        s.fly = null;
      }

      // Holding the globe pauses its spin. Dragging or clicking it stops the
      // spin for good, while a swipe that turns into a page scroll does not.
      el.addEventListener("pointerdown", function (e) {
        if (!s.cols || e.button !== 0) return;
        const p = local(e);
        s.fly = null;
        s.target = null;
        s.vlon = s.vlat = 0;
        s.engaged = true;
        s.hover = p;
        el.setPointerCapture(e.pointerId);
        s.pointers.set(e.pointerId, { x: p[0], y: p[1], x0: p[0], y0: p[1], t: e.timeStamp });
        el.classList.add("grabbing");
        redraw();
      });

      el.addEventListener("pointermove", function (e) {
        if (!s.cols) return;
        const p = local(e);
        const ptr = s.pointers.get(e.pointerId);
        s.hover = p;
        if (ptr) s.spin = false;
        if (ptr && s.pointers.size === 1) {
          const d = turn(s, p[0] - ptr.x, p[1] - ptr.y);
          const dt = Math.max(8, e.timeStamp - ptr.t) / 1000;
          s.vlon = s.vlon * 0.5 + (d[0] / dt) * 0.5;
          s.vlat = s.vlat * 0.5 + (d[1] / dt) * 0.5;
        } else if (ptr) {
          // Two fingers: the distance between them zooms and their midpoint pans.
          let other = null;
          s.pointers.forEach(function (o, id) { if (id !== e.pointerId) other = o; });
          const d0 = Math.hypot(ptr.x - other.x, ptr.y - other.y);
          const d1 = Math.hypot(p[0] - other.x, p[1] - other.y);
          turn(s, (p[0] - ptr.x) / 2, (p[1] - ptr.y) / 2);
          if (d0 > 0) zoomAt(s, (s.zoom * d1) / d0, (p[0] + other.x) / 2, (p[1] + other.y) / 2);
          s.vlon = s.vlat = 0;
        }
        if (ptr) {
          ptr.x = p[0];
          ptr.y = p[1];
          ptr.t = e.timeStamp;
        }
        redraw();
      });

      function release(e) {
        const ptr = s.pointers.get(e.pointerId);
        if (!ptr) return;
        s.pointers.delete(e.pointerId);
        if (!s.pointers.size) el.classList.remove("grabbing");
        if (e.timeStamp - ptr.t > 80 || s.pointers.size || reducedMQ.matches) s.vlon = s.vlat = 0;
        // Two taps in the same place zoom in on it.
        if (e.type === "pointerup" && Math.hypot(ptr.x - ptr.x0, ptr.y - ptr.y0) < 6) {
          s.spin = false;
          s.vlon = s.vlat = 0;
          if (s.tap && e.timeStamp - s.tap.t < 350 && Math.hypot(ptr.x - s.tap.x, ptr.y - s.tap.y) < 16) {
            zoomTo(s, (s.target ? s.target.zoom : s.zoom) * 2, ptr.x, ptr.y);
            s.tap = null;
          } else {
            s.tap = { t: e.timeStamp, x: ptr.x, y: ptr.y };
          }
        }
        redraw();
      }
      el.addEventListener("pointerup", release);
      el.addEventListener("pointercancel", release);
      el.addEventListener("pointerleave", function (e) {
        if (e.pointerType !== "mouse") return;
        s.hover = null;
        s.engaged = false;
        redraw();
      });

      // The wheel zooms once the globe has been clicked, so scrolling past it
      // still scrolls the page. A pinch on a trackpad arrives as a wheel with
      // ctrlKey and always zooms.
      el.addEventListener("wheel", function (e) {
        if (!s.cols || (!e.ctrlKey && !s.engaged)) return;
        const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
        const from = s.target ? s.target.zoom : s.zoom;
        if (!e.ctrlKey && ((dy > 0 && from <= 1) || (dy < 0 && from >= ZMAX))) return;
        e.preventDefault();
        takeOver();
        const p = local(e);
        zoomTo(s, from * Math.exp(-dy * (e.ctrlKey ? 0.01 : 0.003)), p[0], p[1]);
        redraw();
      }, { passive: false });

      fig.querySelectorAll("[data-globe]").forEach(function (button) {
        button.addEventListener("click", function () {
          if (!s.cols) return;
          const what = button.getAttribute("data-globe");
          const v = view(s);
          takeOver();
          if (what === "home") flyHome(s);
          else zoomTo(s, (s.target ? s.target.zoom : s.zoom) * (what === "in" ? 2 : 0.5), v.cx, v.cy);
          redraw();
        });
      });
    },
    draw: function (s, g, t, still) {
      const dt = s.t < 0 ? 0 : Math.max(0, Math.min(0.1, t - s.t));
      s.t = t;
      s.cols = g.cols;
      s.rows = g.rows;
      step(s, dt, still);
      // Zoomed out, a vertical swipe scrolls the page. Zoomed in, every drag
      // moves the map.
      const touch = s.zoom > 1.01 ? "none" : "pan-y";
      if (s.el && s.touch !== touch) s.el.style.touchAction = s.touch = touch;

      for (let x = 0; x < g.cols; x += 4) {
        g.put(x, 0, "╷", 3);
        g.put(x + 1, 0, String((x / 4) * 2 + 1).padStart(2, "0"), 2);
      }

      const v = view(s);
      const world = s.world;
      const top = v.top, rows = v.bottom - v.top, cols = g.cols, CN = cols + 1;

      // Every cell corner on the globe: where it falls and in which country.
      // The grid and the borders are traced between corners.
      const n = CN * (rows + 1);
      const cLat = new Float64Array(n), cLon = new Float64Array(n), cC = new Uint8Array(n);
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) {
          const k = j * CN + i;
          const x = (i * CW - v.cx) / v.R, y = (v.cy - (top + j) * LH) / v.R;
          const rr = x * x + y * y;
          if (rr > 1) continue;
          const z = Math.sqrt(1 - rr);
          cLat[k] = Math.asin(z * v.sin0 + y * v.cos0);
          cLon[k] = wrapAngle(v.lon0 + Math.atan2(x, z * v.cos0 - y * v.sin0));
          if (world) cC[k] = countryAt(world, cLat[k], cLon[k]);
        }
      }

      const L = world ? levelFor(world, v.R) : null;
      let gridStep = GRID_STEPS[0];
      for (let i = 0; i < GRID_STEPS.length && GRID_STEPS[i] * D * v.R >= 56; i++) gridStep = GRID_STEPS[i];
      const gridR = gridStep * D;
      const borders = world && s.zoom >= 3;

      // Each cell is shaded by the light on the sphere at its middle. Sea is
      // the cell's background and land is drawn over it in quarter blocks.
      // On the rim, the quarters inside the disc take the colour of whichever
      // of the two covers more of them.
      for (let j = 0; j < rows; j++) {
        const row = top + j;
        for (let i = 0; i < cols; i++) {
          let inBits = 0, landBits = 0;
          for (let q = 0; q < 4; q++) {
            const x = ((i + (q & 1 ? 0.75 : 0.25)) * CW - v.cx) / v.R;
            const y = (v.cy - (row + (q & 2 ? 0.75 : 0.25)) * LH) / v.R;
            const rr = x * x + y * y;
            if (rr > 1) continue;
            inBits |= 8 >> q;
            if (!L) continue;
            const z = Math.sqrt(1 - rr);
            if (landAt(L, Math.asin(z * v.sin0 + y * v.cos0), v.lon0 + Math.atan2(x, z * v.cos0 - y * v.sin0)) >= 0.5) landBits |= 8 >> q;
          }
          if (!inBits) continue;

          const mx = ((i + 0.5) * CW - v.cx) / v.R, my = (v.cy - (row + 0.5) * LH) / v.R;
          const mz = Math.sqrt(Math.max(0, 1 - mx * mx - my * my));
          const lit = Math.max(0, Math.min(1, (mx * LIGHT[0] + my * LIGHT[1] + mz * LIGHT[2] + 0.3) / 1.3));
          const glint = Math.pow(Math.max(0, mx * GLINT[0] + my * GLINT[1] + mz * GLINT[2]), 40);
          const dither = BAYER[(row & 3) * 4 + (i & 3)];
          const land = "l" + Math.min(15, Math.floor(lit * 15 + dither));
          const sea = "s" + Math.min(15, Math.floor(Math.min(1, lit * 0.85 + glint * 0.5) * 15 + dither));

          if (inBits !== 15) {
            const onLand = QUAD_COUNT[landBits] * 2 >= QUAD_COUNT[inBits];
            g.put(i, row, QUADS[inBits], cls(onLand ? land + " lf" : sea + " sf"));
            continue;
          }
          const tl = j * CN + i, tr = tl + 1, bl = tl + CN, br = bl + 1;
          if (landBits === 15 && borders) {
            const b = border(cC[tl], cC[tr], cC[bl], cC[br]);
            if (b) {
              g.put(i, row, b, cls(land + " lb cut"));
              continue;
            }
          }
          // A cell that is all land is filled with its background, which
          // covers the whole row where a full block glyph might not.
          if (landBits === 15) {
            g.put(i, row, " ", cls(land + " lb"));
            continue;
          }
          if (landBits) {
            g.put(i, row, QUADS[landBits], cls(sea + " " + land + " sb lf"));
            continue;
          }
          // The grid fades out before the rim, where its lines crowd together.
          let line = "";
          if (1 - mx * mx - my * my >= 0.2) {
            const par = gridLine(cLat[tl], cLat[tr], cLat[bl], cLat[br], gridR, Math.PI / 2 - 1e-6);
            // Meridians stop short of the poles, where they would bunch up.
            // Longitudes are unwrapped around the top-left corner so a cell on
            // the 180° line reads as one span.
            let mer = "";
            if (Math.max(Math.abs(cLat[tl]), Math.abs(cLat[br])) < 80 * D) {
              const base = cLon[tl];
              mer = gridLine(base, base + wrapAngle(cLon[tr] - base), base + wrapAngle(cLon[bl] - base), base + wrapAngle(cLon[br] - base), gridR, Infinity);
            }
            line = par && mer ? "+" : par || mer;
          }
          g.put(i, row, line || " ", cls(sea + (line ? " sb gr" : " sb")));
        }
      }

      // Zoomed out, the axis through the poles sticks out a little at both
      // ends, where it is not behind the globe.
      const nY = v.cos0, nZ = v.sin0;
      for (let k = 0; k <= 24 && s.zoom < 2; k++) {
        const f = 1 + k * 0.008;
        [1, -1].forEach(function (sign) {
          const py = sign * nY * f, pz = sign * nZ * f;
          if (py * py <= 1 && pz < 0) return;
          const row = Math.floor((v.cy - v.R * py) / LH);
          if (row >= top && row < v.bottom) g.put(Math.floor(v.cx / CW), row, "│", 2);
        });
      }

      // Labels. Home comes first and countries after it, from the largest
      // down. A country label keeps a clear cell to each side and a clear row
      // above and below, and gets the country's name when there is room and
      // its code when there is not.
      const taken = new Uint8Array(g.cols * g.rows);
      function free(col, row, len, rowPad) {
        if (row < top || row >= v.bottom || col < 0 || col + len > g.cols) return false;
        for (let y = Math.max(0, row - rowPad); y <= Math.min(g.rows - 1, row + rowPad); y++) {
          for (let x = Math.max(0, col - 1); x <= Math.min(g.cols - 1, col + len); x++) if (taken[y * g.cols + x]) return false;
        }
        return true;
      }
      function take(col, row, len) {
        for (let x = col; x < col + len; x++) taken[row * g.cols + x] = 1;
      }

      // Home's label goes to the right of its marker, or to the left when it
      // would run off the edge.
      let mark = null;
      const hp = project(v, HOME.lat * D, HOME.lon * D);
      const hCol = Math.floor(hp[0] / CW), hRow = Math.floor(hp[1] / LH);
      if (hp[2] > 0 && hRow >= top && hRow < v.bottom && hCol >= 0 && hCol < g.cols) {
        mark = { col: hCol, row: hRow, from: hCol, to: hCol, text: "" };
        take(hCol, hRow, 1);
        const text = s.zoom >= 8 ? HOME.name : HOME.short;
        const left = hCol - 1 - text.length;
        if (free(hCol + 2, hRow, text.length, 0)) {
          take(hCol + 1, hRow, text.length + 1);
          mark.to = hCol + 1 + text.length;
          mark.text = " " + text;
        } else if (free(left, hRow, text.length, 0)) {
          take(left, hRow, text.length + 1);
          mark.from = left;
          mark.text = text + " ";
        }
      }

      if (world && s.zoom >= 2) {
        for (let k = 0; k < world.bySize.length; k++) {
          const i = world.bySize[k];
          const c = world.countries[i - 1];
          const size = ((c[5] / 6371) * v.R) / CW;
          if (size < 4) break;
          const p = project(v, c[4] * D, c[3] * D);
          if (p[2] < 0.3) continue;
          const name = countryName(world, i);
          const row = Math.floor(p[1] / LH);
          [size >= name.length + 2 ? name : "", c[0]].some(function (text) {
            const col = Math.round(p[0] / CW - text.length / 2);
            if (!text || !free(col, row, text.length, 1)) return false;
            take(col, row, text.length);
            g.put(col, row, text, cls("tag"));
            return true;
          });
        }
      }

      // Home's marker blinks.
      if (mark) {
        const dot = !still && Math.floor(t * 2) % 2 === 0 ? "□" : "■";
        if (mark.from < mark.col) g.put(mark.from, mark.row, mark.text + dot, cls("tag a"));
        else g.put(mark.col, mark.row, dot + mark.text, cls("tag a"));
      }

      // Readings: the scale at the centre, then the country and coordinates
      // under the pointer, or at the centre when there is no pointer.
      const kmPx = 6371 / v.R;
      const km = niceKm(kmPx * CW * 12);
      const len = Math.max(2, Math.round(km / kmPx / CW));
      g.put(0, g.rows - 3, "├" + "─".repeat(len - 2) + "┤ " + km + " km", 2);

      // Over home's marker or its label, the readings are for home.
      const room = g.cols - 17;
      let place = null;
      if (s.hover && mark) {
        const hc = Math.floor(s.hover[0] / CW), hr = Math.floor(s.hover[1] / LH);
        if (hr === mark.row && hc >= mark.from - 1 && hc <= mark.to + 1) place = HOME;
      }
      let at = null;
      if (place) at = [place.lat * D, place.lon * D];
      else if (!s.hover) at = unproject(v, v.cx, v.cy);
      else if (s.hover[1] < v.bottom * LH) at = unproject(v, s.hover[0], s.hover[1]);
      if (at) {
        const i = world ? countryAt(world, at[0], at[1]) : 0;
        let name = i ? countryName(world, i) : "";
        if (place) name = name && place.name.length + name.length + 2 <= room ? place.name + ", " + name : place.name;
        if (name) g.put(0, g.rows - 2, name.slice(0, room), 0);
        g.put(0, g.rows - 1, coords(at[0], at[1]).slice(0, room), 2);
      }
    },
  };

  // ------------------------------------------------------------------- loop ---

  // Every <pre data-figure="globe"> on the page gets a globe of its own.
  const items = [];
  document.querySelectorAll('[data-figure="globe"]').forEach(function (el) {
    const def = GLOBE;
    const item = { el: el, def: def, state: {}, cols: 0, rows: 0, visible: false, last: -1, dirty: false };
    def.init(item.state);
    if (def.bind) def.bind(el, item.state, function () { redraw(item); });
    items.push(item);
  });
  if (!items.length) return;

  // A globe that takes input asks for a new frame here. The loop draws it on
  // its next pass. With reduced motion there is no loop, so it is drawn still.
  let pending = 0;
  function redraw(item) {
    item.dirty = true;
    if (!reducedMQ.matches || pending) return;
    pending = requestAnimationFrame(function () {
      pending = 0;
      items.forEach(function (it) {
        if (!it.dirty) return;
        it.dirty = false;
        if (!it.cols) measure(it);
        render(it, STILL_T, true);
      });
    });
  }

  function measure(item) {
    item.cols = Math.max(20, Math.floor(item.el.clientWidth / CW));
    item.rows = Math.max(4, Math.floor(item.el.clientHeight / LH));
  }

  // The cell size comes from a hidden copy of the first globe's <pre>, with
  // the same classes and so the same font. Its first line is a run of digits.
  // The lines after it hold a run of each block and box-drawing glyph the
  // globe draws. The cell width is the width of the digits divided by their
  // count, and the cell height is the probe's height divided by its lines.
  const PROBE_RUN = 40;
  const PROBE_GLYPHS = Array.from(QUADS.trim() + "│┼├┤─┌┐└┘┬┴╷■□");
  const probe = document.createElement("pre");
  probe.className = items[0].el.className;
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:absolute;left:0;top:0;width:auto;height:auto;max-width:none;visibility:hidden;pointer-events:none";
  probe.innerHTML = ["0"].concat(PROBE_GLYPHS).map(function (c) { return "<span>" + c.repeat(PROBE_RUN) + "</span>"; }).join("\n");
  items[0].el.parentNode.appendChild(probe);

  // Returns true when the cell size changed.
  function metrics() {
    const spans = probe.children;
    const cw = spans[0].getBoundingClientRect().width / PROBE_RUN;
    const lh = probe.getBoundingClientRect().height / spans.length;
    if (!(cw > 0 && lh > 0)) return false;
    FIX.clear();
    for (let i = 1; i < spans.length; i++) {
      const fix = Math.round((cw - spans[i].getBoundingClientRect().width / PROBE_RUN) * 1000) / 1000;
      if (fix) FIX.set(PROBE_GLYPHS[i - 1], fix);
    }
    const changed = cw !== CW || lh !== LH;
    CW = cw;
    LH = lh;
    return changed;
  }

  // The probe changes size when the font loads or its size changes, and the
  // globes are laid out again.
  new ResizeObserver(function () {
    if (!metrics()) return;
    items.forEach(measure);
    if (reducedMQ.matches) renderStill();
  }).observe(probe);

  function render(item, t, still) {
    const g = new Grid(item.cols, item.rows);
    item.def.draw(item.state, g, t, still);
    item.el.innerHTML = g.html();
  }

  function renderStill() {
    items.forEach(function (item) {
      measure(item);
      render(item, STILL_T, true);
    });
  }

  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t = now / 1000;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.visible) continue;
      // A globe that is moving on its own draws every frame until it settles.
      const busy = item.dirty || (item.def.busy && item.def.busy(item.state));
      if (!busy && t - item.last < 1 / item.def.fps) continue;
      item.last = t;
      item.dirty = false;
      render(item, t, false);
    }
  }

  const io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      const item = items.find(function (it) { return it.el === e.target; });
      if (item) item.visible = e.isIntersecting;
    });
  }, { rootMargin: "80px" });

  function start() {
    cancelAnimationFrame(raf);
    metrics();
    items.forEach(measure);
    if (reducedMQ.matches) renderStill();
    else {
      items.forEach(function (item) { render(item, performance.now() / 1000, false); });
      raf = requestAnimationFrame(frame);
    }
  }

  items.forEach(function (item) { io.observe(item.el); });

  let resizeTimer = 0;
  window.addEventListener("resize", function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      items.forEach(measure);
      if (reducedMQ.matches) renderStill();
    }, 150);
  });

  // Country names and coordinates follow the page's language. A page that
  // switches language sends a "langchange" event on the document.
  document.addEventListener("langchange", function () {
    if (reducedMQ.matches) renderStill();
  });
  reducedMQ.addEventListener("change", start);

  // The globe starts once IBM Plex Mono has loaded, or without it when it
  // cannot load.
  const ready = document.fonts ? document.fonts.load('11px "IBM Plex Mono"') : Promise.resolve();
  ready.then(start, start);
})();
