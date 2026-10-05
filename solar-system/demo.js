// The explorer's controls. The sky is drawn by window.Orrery (js/orrery.js),
// and this file drives it with the gestures, the buttons, the body list, the
// info panel, the clock and the tab's icon.
(function () {
  'use strict';

  const OR = window.Orrery, INFO = window.BODY_INFO, Sf = window.Surfaces, Eph = window.Ephemeris;
  if (!OR || !INFO) return;

  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const root = document.documentElement;
  const stage = $('stage'), bodiesEl = $('bodies'), info = $('info'), controls = $('controls'), top = $('top');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motion.matches;
  // the same query as the narrow layout in demo.css, and a screen with room
  // for the body list beside the sky
  const narrow = window.matchMedia('(max-width: 719px)');
  const roomy = window.matchMedia('(min-width: 720px) and (min-height: 600px)');

  // Each body's colour, for its name, its orbit and the HUD while it is in
  // focus. A moon without one of its own takes its planet's, and a star of
  // the Pleiades the cluster's.
  const COLOUR = {
    sun: '#ffc24a', mercury: '#d6a47c', venus: '#ecc76a', earth: '#5ea9ff', moon: '#a7b6d1', mars: '#ec6f45',
    jupiter: '#dd8f5f', saturn: '#f0a14a', uranus: '#7dd9d5', neptune: '#6d8dff', pluto: '#f0b49c',
    io: '#e3d24f', europa: '#d9a779', titan: '#e9a246', enceladus: '#b9e2ff', triton: '#e6b7b0', halley: '#8fc3ff', jwst: '#f2c14e',
    proxima: '#ff7a52', alphacena: '#ffe0a0', alphacenb: '#ffba74', siriusa: '#bcd2ff', siriusb: '#a8c2ff', vega: '#c4d6ff',
    arcturus: '#ffad66', polaris: '#ffe2a8', betelgeuse: '#ff8a52', rigel: '#9fbaff', pleiades: '#8aaeff',
    helix: '#ff8a78', orionnebula: '#ff8cc0', ringnebula: '#b4e88e', eagle: '#6fd6c2', crab: '#ffa45c', carina: '#ff9e86',
    sgra: '#ffa23e', s2: '#a9c1ff'
  };
  function colourOf(key) {
    const S = Sf ? Sf.BODIES : {};
    for (let k = key; k; k = S[k] ? S[k].parent || S[k].host : null) if (COLOUR[k]) return COLOUR[k];
    return '#f0a14a';
  }

  const B = INFO.bodies;
  const nameOf = (k) => (B[k] ? B[k].name : k);
  const listName = (k) => (B[k] ? B[k].short || B[k].name : k);
  // a body's name in a sentence, with "the" before the Sun and the Moon
  const theName = (k) => (k === 'sun' || k === 'moon' ? 'the ' + nameOf(k) : nameOf(k));

  /* ------------------------------------------------------------------------
     Start the sky
     ------------------------------------------------------------------------ */
  // The space the controls take at the top, the bottom and the right of the
  // screen, in CSS pixels. On a narrow screen the panels
  // lie across the bottom. On a short, wide one the info panel takes the
  // right. On a large screen the panels lie over the sky.
  function insets() {
    const vh = window.innerHeight, vw = window.innerWidth;
    const topH = top.getBoundingClientRect().bottom;
    let bottom = vh, right = 0;
    const els = narrow.matches ? [controls, info, bodiesEl] : [controls];
    for (const e of els) {
      const r = e.getBoundingClientRect();
      if (r.height && r.top > vh / 2) bottom = Math.min(bottom, r.top);
    }
    if (!narrow.matches && !roomy.matches) {
      const r = info.getBoundingClientRect();
      if (r.width) right = vw - r.left;
    }
    return [Math.round(topH), Math.round(vh - bottom), Math.round(right)];
  }

  const sky = $('sky'), hud = $('hud');
  root.style.setProperty('--controls-h', controls.offsetHeight + 'px');
  OR.init(sky, hud, {
    font: getComputedStyle(document.body).fontFamily,
    fontWeight: 400,
    accent: colourOf('saturn'),
    background: '#050608',
    fps: 30,
    reducedMotion: reduced,
    insets: insets()
  });
  const labels = { num: (x, d) => x.toFixed(d), int: (x) => fmtInt(x) };
  Object.keys(B).forEach((k) => { labels[k] = B[k].label; });
  OR.setLabels(labels);
  OR.setColours(Object.fromEntries(Object.keys(Sf.BODIES).map((k) => [k, colourOf(k)])));
  OR.setSites(Object.fromEntries(Object.keys(B).filter((k) => B[k].sites)
    .map((k) => [k, B[k].sites.map((s) => [s.name, +s.t.slice(0, 4), s.at[0], s.at[1]])])));
  // The glyphs are measured again once the font has loaded.
  if (document.fonts && document.fonts.load) {
    document.fonts.load('400 16px "IBM Plex Mono"').then(() => { OR.remeasure(); measure(); }, () => {});
  }
  motion.addEventListener && motion.addEventListener('change', (e) => { reduced = e.matches; OR.setReducedMotion(reduced); });

  // The sky frames the body in focus in the part of the screen the controls
  // leave free, and keeps the galaxy's names off them.
  let measureKey = '';
  function measure() {
    const h = controls.offsetHeight;
    root.style.setProperty('--controls-h', h + 'px');
    const box = (e) => { const r = e.getBoundingClientRect(); return r.width && r.height ? [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)] : null; };
    const boxes = [top, controls, info, bodiesEl].map(box).filter(Boolean);
    const ins = insets(), key = JSON.stringify([boxes, ins]);
    if (key === measureKey) return;
    measureKey = key;
    OR.setCovered(boxes);
    OR.setGutter(parseFloat(getComputedStyle(root).getPropertyValue('--gutter')) || 16);
    OR.setInsets(ins[0], Math.max(0, Math.round(OR.size[1] - window.innerHeight)) + ins[1], ins[2]);
  }
  window.addEventListener('resize', measure);
  narrow.addEventListener && narrow.addEventListener('change', measure);
  roomy.addEventListener && roomy.addEventListener('change', () => { if (!roomy.matches) setBodies(false); measure(); });

  /* ------------------------------------------------------------------------
     The body list holds the planets with their moons under them, Pluto and
     Halley, the stars, the nebulae, the galactic centre and the spacecraft,
     then the whole system and the whole galaxy.
     ------------------------------------------------------------------------ */
  const fly = (k) => '<button type="button" data-fly="' + k + '" style="--hue:' + colourOf(k) + '">' + esc(listName(k)) + '</button>';
  let html = '';
  INFO.groups.forEach((g) => {
    html += '<p class="head">' + esc(g.name) + '</p>';
    g.items.forEach((it) => {
      if (!Array.isArray(it)) { html += fly(it); return; }
      html += fly(it[0]) + '<div class="kids">' + it[1].map(fly).join('') + '</div>';
    });
  });
  html += '<p class="head">Views</p><button type="button" data-fly="all">Whole system</button><button type="button" data-fly="milkyway">Whole galaxy</button>';
  bodiesEl.innerHTML = html;
  const flyBtns = [...bodiesEl.querySelectorAll('[data-fly]')];
  const openBodies = $('open-bodies'), openInfo = $('open-info');

  function setBodies(open, refocus) {
    bodiesEl.hidden = !open;
    openBodies.setAttribute('aria-expanded', String(open));
    if (open) {
      const on = flyBtns.find((b) => b.getAttribute('aria-current') === 'true');
      if (on) on.scrollIntoView({ block: 'nearest' });
    } else if (refocus) openBodies.focus({ preventScroll: true });
    measure();
  }
  openBodies.addEventListener('click', () => setBodies(bodiesEl.hidden));
  flyBtns.forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.fly;
    if (k === 'all') OR.overview(); else OR.flyTo(k);
    showSite(null);
    setInfo(true);
    // where the list covers the sky, it closes
    if (!roomy.matches) setBodies(false);
  }));

  /* ------------------------------------------------------------------------
     The info panel
     ------------------------------------------------------------------------ */
  function setInfo(open) {
    info.hidden = !open;
    openInfo.setAttribute('aria-expanded', String(open));
    if (open) update(true);
    measure();
  }
  openInfo.addEventListener('click', () => setInfo(info.hidden));
  $('info-close').addEventListener('click', () => { setInfo(false); openInfo.focus({ preventScroll: true }); });

  // A landing site clicked on the globe in focus is described in the panel
  // until another click, Esc, the back button or a flight away.
  let site = null;
  function showSite(i) {
    site = i == null || i < 0 ? null : { body: OR.focus, i: i };
    OR.setSite(site ? i : -1);
    if (site) { setInfo(true); say(B[site.body].sites[i].name); }
    update(true);
  }
  $('info-back').addEventListener('click', () => { showSite(null); stage.focus({ preventScroll: true }); });

  const said = $('said');
  function say(text) { said.textContent = text; }

  OR.onFocus((key) => {
    if (site && site.body !== key) { site = null; OR.setSite(-1); }
    root.style.setProperty('--accent', colourOf(key));
    OR.setAccent(colourOf(key));
    say(nameOf(key));
    flyBtns.forEach((b) => b.setAttribute('aria-current', String(b.dataset.fly === key)));
    update(true);
  });

  /* ------------------------------------------------------------------------
     Numbers for the panel
     ------------------------------------------------------------------------ */
  const INT = new Intl.NumberFormat('en-GB');
  const fmtInt = (x) => INT.format(Math.round(x));
  const num = (x, d) => x.toFixed(d);
  const years = (x) => x + ' years', days = (x) => x + ' days', ly = (x) => x + ' light-years';
  function fmtDuration(hours) {
    // whole minutes first, so 4.995 h reads 5 h 00 min
    const m = Math.round(Math.abs(hours) * 60), a = Math.abs(hours);
    if (m < 48 * 60) return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min';
    return days(num(a / 24, a / 24 < 100 ? 1 : 0));
  }
  function fmtYears(d) {
    const y = d / 365.25;
    if (y < 2) return days(fmtInt(d));
    return years(y >= 1000 ? fmtInt(Math.round(y / 100) * 100) : num(y, y < 20 ? 1 : 0));
  }
  function fmtSize(km) {
    if (km >= 100) return fmtInt(km) + ' km';
    if (km >= 1) return num(km, 1) + ' km';
    return fmtInt(km * 1000) + ' m';
  }
  // how long light takes, from seconds
  function lightText(s) {
    if (s < 120) return num(s, 1) + ' s';
    if (s < 7200) return num(s / 60, 1) + ' min';
    if (s < 63e6) return fmtDuration(s / 3600);
    return years(s < 3.2e9 ? num(s / 31557600, 2) : fmtInt(s / 31557600));
  }
  const isoDay = (jd) => new Date((jd - 2440587.5) * 86400000).toISOString().slice(0, 10);
  const AU = Eph.AU_KM, LY_AU = 63241.077;
  // the last and the next perihelion of a comet or a probe, from its elements
  function perihelion(key, now) {
    const el = Eph.SMALL[key];
    if (!el) return null;
    const jd = now.getTime() / 86400000 + 2440587.5, P = 365.25 * Math.pow(el.q / (1 - el.e), 1.5);
    const last = el.T + Math.floor((jd - el.T) / P) * P, known = B[key] && B[key].next;
    // the known date is the return after el.T, so it holds only until then
    return isoDay(last) + ', next ' + (known && jd >= el.T && jd < el.T + P * 1.5 ? known : isoDay(last + P));
  }
  // as many decimals as the catalogue gives, up to two
  const deg = (x) => Math.abs(x).toFixed(Math.min(2, (String(x).split('.')[1] || '').length)) + '°\u00a0';
  const latLon = (la, lo) => deg(la) + (la < 0 ? 'S' : 'N') + ', ' + deg(lo) + (lo < 0 ? 'W' : 'E');

  // the panel's title, rows and note for what is in view
  function describe() {
    const d = OR.date, gal = OR.galaxyShown > 0.5, key = gal ? 'milkyway' : OR.focus;
    const b = B[key] || {}, rows = [];
    if (!gal && site) {
      const S = B[site.body].sites[site.i];
      rows.push(['Landed', new Date(S.t + 'T00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })]);
      rows.push(['Sent by', INFO.by[S.by]]);
      if (S.crew) rows.push(['Crew', S.crew]);
      if (S.stay) rows.push(['On the surface', S.stay]);
      if (S.place) rows.push(['Place', S.place]);
      rows.push(['Coordinates', latLon(S.at[0], S.at[1])]);
      return { title: S.name, rows: rows, note: S.note, back: 'Back to ' + theName(site.body) };
    }
    if (gal) {
      rows.push(['Sun to centre', ly(fmtInt(Math.round(Eph.GALAXY.R0 * 3261.56 / 100) * 100))]);
      rows.push(['Diameter', 'about ' + ly('100,000')]);
      rows.push(['Sun’s orbit', '230 million years']);
      rows.push(['Stars', '100 to 400 billion']);
      return { title: b.name, rows: rows, note: [b.note, b.unreal].filter(Boolean).join(' ') };
    }
    const inf = OR.info(key), cls = inf.cls;
    const parent = inf.parent ? theName(inf.parent) : '';
    if (cls === 'nebula') {
      const l = inf.dist / LY_AU, sz = b.size, one = (x) => (Number.isInteger(x) ? fmtInt(x) : num(x, 1));
      rows.push(['From the Sun', ly(fmtInt(l))]);
      rows.push(['Light to Earth', lightText(inf.lightMin * 60)]);
      rows.push(['Across', sz.length > 1 ? ly(one(sz[0]) + ' × ' + one(sz[1])) : 'about ' + ly(one(sz[0]))]);
      rows.push(['Kind', INFO.kinds[b.kind]]);
      rows.push(['Constellation', b.in]);
    } else if (cls === 'hole') {
      // as far as the galaxy's centre, to the nearest hundred light-years,
      // and the ring the Event Horizon Telescope saw round it
      const l = fmtInt(Math.round(inf.dist / LY_AU / 100) * 100);
      rows.push(['From the Sun', ly(l)]);
      rows.push(['Light to Earth', years(l)]);
      rows.push(['Mass', num(b.mass / 1e6, 1) + ' million Suns']);
      rows.push(['Ring', 'about ' + fmtInt(inf.radius * 2 / 1e6) + ' million km across']);
      rows.push(['Kind', INFO.kinds[b.kind]]);
      rows.push(['Constellation', b.in]);
    } else if (inf.dist > 20000) {
      // the stars, Proxima's planets and S2, which goes round Sagittarius A*
      if (inf.parent) {
        const dp = inf.distParent;
        rows.push(['From ' + parent, dp > 1.5e9 ? fmtInt(dp / AU) + ' AU' : num(dp / 1e6, 2) + ' million km']);
      }
      if (inf.speed) rows.push(['Speed', fmtInt(inf.speed) + ' km/s']);
      const l = inf.dist / LY_AU, far = l >= 10000 ? fmtInt(Math.round(l / 100) * 100) : null;
      rows.push(['From the Sun', ly(far || num(l, l < 100 ? 2 : 0))]);
      rows.push(['Light to Earth', far ? years(far) : lightText(inf.lightMin * 60)]);
      rows.push(['Radius', (cls === 'planet' ? 'about ' : '') + fmtSize(inf.radius)]);
      if (typeof b.day === 'number') rows.push(['Day', fmtDuration(b.day)]);
      if (b.year) rows.push(['Year', (b.year < 365 ? days(num(b.year, 1)) : fmtYears(b.year)) + ' round ' + b.round]);
      // when a star round the hole was last closest to it, and will be next
      const so = Eph.SGRA_STARS[key];
      if (so) {
        const y = 2000 + (d.getTime() / 86400000 + 2440587.5 - 2451545) / 365.25, last = so.T + Math.floor((y - so.T) / so.P) * so.P;
        const jd = (yr) => 2451545 + (yr - 2000) * 365.25;
        rows.push(['Closest', isoDay(jd(last)) + ', next ' + isoDay(jd(last + so.P))]);
      }
    } else if (cls === 'moon') {
      rows.push(['From ' + parent, fmtInt(inf.distParent) + ' km']);
      if (key !== 'moon') rows.push(['From the Sun', num(inf.dist, 3) + ' AU']);
      rows.push(['Light to Earth', lightText(inf.lightMin * 60)]);
      rows.push(['Radius', fmtSize(inf.radius)]);
      rows.push(['Day', b.day === 'sync' ? 'keeps one face to ' + parent : fmtDuration(b.day)]);
      const yr = Math.abs(b.year);
      rows.push(['Year', days(num(yr, yr < 10 ? 2 : 1)) + ' round ' + parent + (b.year < 0 ? ', backwards' : '')]);
    } else {
      if (key !== 'sun') rows.push(['From the Sun', num(inf.dist, inf.dist < 100 ? 3 : 1) + ' AU']);
      if (key !== 'earth') {
        const de = inf.distEarth;
        rows.push(['From Earth', de < 0.05 ? num(de * AU / 1e6, 2) + ' million km' : num(de, de < 100 ? 3 : 1) + ' AU']);
        rows.push([cls === 'craft' ? 'Signal to Earth' : 'Light to Earth', lightText(inf.lightMin * 60)]);
      }
      if (cls === 'comet') rows.push(['Nucleus', 'about ' + fmtSize(inf.radius * 2) + ' across']);
      else if (cls !== 'craft') rows.push(['Radius', fmtSize(inf.radius)]);
      if (inf.speed && (cls === 'craft' || cls === 'comet')) rows.push(['Speed', num(inf.speed, 1) + ' km/s']);
      if (typeof b.day === 'number' && cls !== 'comet') rows.push(['Day', fmtDuration(b.day) + (b.day < 0 ? ', backwards' : '')]);
      if (key === 'sun') rows.push(['Year', '230 million years round the galaxy']);
      else if (b.year) rows.push(['Year', fmtYears(b.year)]);
      // the orbits of Halley and Parker Solar Probe, and when they pass closest to the Sun
      const el = Eph.SMALL[key];
      if (el) {
        rows.push(['Orbit', fmtYears(365.25 * Math.pow(el.q / (1 - el.e), 1.5))]);
        rows.push(['Perihelion', perihelion(key, d)]);
      }
      if (cls === 'craft') rows.push(['Launched', String(b.craft)]);
    }
    const approx = cls === 'craft' || (cls === 'moon' && key !== 'moon') || b.approx ? 'Its position is approximate.' : '';
    return { title: b.name, rows: rows, note: [b.note, b.unreal, approx].filter(Boolean).join(' ') };
  }

  /* ------------------------------------------------------------------------
     The clock and time
     ------------------------------------------------------------------------ */
  // seconds of the clock a second, from a month a second backwards to a month forwards
  const WARPS = [-2592000, -604800, -86400, -3600, -60, 1, 60, 3600, 86400, 604800, 2592000];
  const UNITS = [[2592000, '30 days'], [604800, 'week'], [86400, 'day'], [3600, 'h'], [60, 'min']];
  let warpIdx = WARPS.indexOf(1), paused = false;
  const pauseBtn = $('pause');
  function rateLabel() {
    if (paused) return 'Paused';
    const w = WARPS[warpIdx];
    if (w === 1) return OR.live ? 'Live' : 'Real time';
    const u = UNITS.find((x) => Math.abs(w) >= x[0]);
    return (w > 0 ? '+' : '−') + '1 ' + u[1] + '/s';
  }
  function setWarp(i) {
    warpIdx = clamp(i, 0, WARPS.length - 1);
    paused = false;
    OR.setWarp(WARPS[warpIdx]);
    showClock();
  }
  function setPaused(on) {
    paused = on;
    OR.setWarp(on ? 0 : WARPS[warpIdx]);
    showClock();
  }
  document.querySelectorAll('[data-warp]').forEach((b) => b.addEventListener('click', () => setWarp(warpIdx + Number(b.dataset.warp))));
  pauseBtn.addEventListener('click', () => setPaused(!paused));
  $('now').addEventListener('click', () => { warpIdx = WARPS.indexOf(1); paused = false; OR.setWarp(1); OR.resetTime(); showClock(); update(true); });

  const dateEl = $('date'), rateEl = $('rate');
  function showClock() {
    const iso = OR.date.toISOString();
    const text = iso.slice(0, 10) + ' ' + iso.slice(11, 16) + ' UTC';
    if (dateEl.textContent !== text) dateEl.textContent = text;
    const r = rateLabel();
    if (rateEl.textContent !== r) rateEl.textContent = r;
    pauseBtn.classList.toggle('is-paused', paused);
    pauseBtn.setAttribute('aria-label', paused ? 'Play' : 'Pause');
    pauseBtn.title = paused ? 'Play' : 'Pause';
  }

  /* ------------------------------------------------------------------------
     Keeping the panel, the clock and the framing up to date
     ------------------------------------------------------------------------ */
  const nameEl = $('info-name'), rowsEl = $('info-rows'), noteEl = $('info-note'), backEl = $('info-back');
  let lastUpdate = 0;
  function update(now) {
    const t = performance.now();
    // a few times a second while the clock runs fast, once a second at real time
    if (!now && t - lastUpdate < (paused || WARPS[warpIdx] === 1 ? 1000 : 250)) return;
    lastUpdate = t;
    showClock();
    if (info.hidden) return;
    const D = describe();
    if (nameEl.textContent !== D.title) nameEl.textContent = D.title;
    const html = D.rows.map((r) => '<div><dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd></div>').join('');
    if (rowsEl._html !== html) rowsEl.innerHTML = rowsEl._html = html;
    if (noteEl.textContent !== D.note) noteEl.textContent = D.note;
    noteEl.hidden = !D.note;
    backEl.hidden = !D.back;
    if (D.back && backEl.textContent !== D.back) backEl.textContent = D.back;
    measure();
  }
  (function tick() {
    update(false);
    requestAnimationFrame(tick);
  })();


  // Once the panels hold their text, the body in focus is framed in the
  // space they leave.
  OR.setAccent(colourOf(OR.focus));
  root.style.setProperty('--accent', colourOf(OR.focus));
  flyBtns.forEach((b) => b.setAttribute('aria-current', String(b.dataset.fly === OR.focus)));
  update(true);
  OR.frameFocus();

  /* ------------------------------------------------------------------------
     Buttons that turn and zoom. Holding one down repeats it.
     ------------------------------------------------------------------------ */
  const STEP = 36;
  function act(b) {
    if (b.dataset.zoom) OR.zoom(0.3 * Number(b.dataset.zoom));
    else if (b.dataset.turn) OR.rotate(STEP * Number(b.dataset.turn), 0);
    else if (b.dataset.tilt) OR.rotate(0, STEP * Number(b.dataset.tilt));
  }
  document.querySelectorAll('[data-zoom], [data-turn], [data-tilt]').forEach((b) => {
    let hold = 0, repeated = false;
    const stop = () => { clearTimeout(hold); clearInterval(hold); hold = 0; };
    b.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      repeated = false;
      stop();
      hold = setTimeout(() => { repeated = true; act(b); hold = setInterval(() => act(b), 120); }, 400);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, stop));
    b.addEventListener('click', () => { if (!repeated) act(b); repeated = false; });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  /* ------------------------------------------------------------------------
     On the sky, the wheel zooms toward the body near the pointer,
     a drag turns the view, a touch swipe turns sideways and zooms up and
     down, two fingers pinch to zoom and move together to tilt, and a tap or
     a click flies to a body or picks a landing site.
     ------------------------------------------------------------------------ */
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    let dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? window.innerHeight : 1);
    if (e.ctrlKey) dy *= 5;
    OR.zoom(clamp(dy * 0.003, -0.8, 0.8), e.clientX, e.clientY);
  }, { passive: false });

  const pointers = new Map();
  let drag = null, pinch = 0, pinchMid = null, fling = 0;
  // A quick sideways swipe goes on turning the view after the finger lifts,
  // slowing to a stop within a second.
  function startFling(v) {
    if (reduced || Math.abs(v) < 0.25) return;
    let last = performance.now();
    const id = ++fling;
    const step = (now) => {
      if (id !== fling || OR.scene.fly) return;
      const dt = Math.min(now - last, 50);
      last = now;
      v *= Math.exp(-dt / 220);
      if (Math.abs(v) < 0.02) return;
      OR.rotate(v * dt, 0);
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  stage.addEventListener('pointerdown', (e) => {
    fling++;
    // a pointer that has already gone cannot be captured
    try { stage.setPointerCapture(e.pointerId); } catch (err) { /* nothing to capture */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) drag = { x0: e.clientX, y0: e.clientY, moved: 0, touch: e.pointerType !== 'mouse' };
    else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      pinchMid = (a.y + b.y) / 2;
      drag = null;
    }
  });
  stage.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) {
      if (e.pointerType === 'mouse') stage.classList.toggle('is-pick', !!OR.hover(e.clientX, e.clientY));
      return;
    }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && pointers.size >= 2) {
      const [a, b] = [...pointers.values()], dist = Math.hypot(a.x - b.x, a.y - b.y), mid = (a.y + b.y) / 2;
      if (dist > 0) OR.zoom(Math.log(pinch / dist), (a.x + b.x) / 2, mid);
      if (pinchMid != null) OR.rotate(0, (mid - pinchMid) * 0.6);
      pinch = dist; pinchMid = mid;
      return;
    }
    if (!drag) return;
    drag.moved += Math.abs(dx) + Math.abs(dy);
    // a fingertip wanders a little during a tap, so a touch has to go further before it drags
    if (!drag.on && (drag.touch ? Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 10 : drag.moved < 6)) return;
    drag.on = true;
    stage.classList.add('is-drag');
    if (drag.touch) {
      OR.rotate(dx, 0);
      OR.zoom(-dy * 0.008, drag.x0, drag.y0);
      const now = performance.now(), dt = now - (drag.t || now);
      if (dt > 0) drag.vx = drag.vx == null ? dx / dt : drag.vx * 0.6 + (dx / dt) * 0.4;
      drag.t = now;
    } else OR.rotate(dx, dy);
  });
  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (drag && !drag.on && e.type === 'pointerup') {
      // a fingertip gets more reach than a mouse
      const si = OR.pickSite(e.clientX, e.clientY, drag.touch ? 22 : 10);
      if (si >= 0) showSite(si);
      else {
        const k = OR.pick(e.clientX, e.clientY, drag.touch ? 30 : 18);
        if (k) {
          if (site) showSite(null);
          OR.flyTo(k);
          setInfo(true);
        }
      }
    }
    if (drag && drag.touch && drag.on && e.type === 'pointerup' && performance.now() - drag.t < 80) startFling(drag.vx || 0);
    if (pointers.size < 2) { pinch = 0; pinchMid = null; }
    if (!pointers.size) { drag = null; stage.classList.remove('is-drag'); }
  }
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);
  stage.addEventListener('pointerleave', () => { if (!pointers.size) { OR.hover(null); stage.classList.remove('is-pick'); } });

  const KEY_BODIES = ['sun', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  window.addEventListener('keydown', (e) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    const k = e.key;
    if (k === 'Escape') {
      if (!bodiesEl.hidden && !roomy.matches) setBodies(false, true);
      else if (site) showSite(null);
      else if (!info.hidden) setInfo(false);
      else return;
    } else if ((k === 'Enter' || k === ' ') && e.target.closest && e.target.closest('button, a')) return;
    else if (k === '+' || k === '=' || k === 'ArrowUp') OR.zoom(-0.3);
    else if (k === '-' || k === '_' || k === 'ArrowDown') OR.zoom(0.3);
    else if (k === 'ArrowLeft') OR.rotate(-STEP, 0);
    else if (k === 'ArrowRight') OR.rotate(STEP, 0);
    else if (/^[0-8]$/.test(k)) { OR.flyTo(KEY_BODIES[+k]); setInfo(true); }
    else if (k === 'm' || k === 'M') { OR.flyTo('moon'); setInfo(true); }
    else if (k === 'Home') OR.overview();
    else return;
    e.preventDefault();
  });

  /* ------------------------------------------------------------------------
     The tab's icon is the body in focus, ray-cast from the explorer's own
     camera, inside corner brackets in the body's colour. In a background
     tab it is drawn again every minute at the current time. Browsers that
     keep the first icon they load show the one in the page's head.
     ------------------------------------------------------------------------ */
  (function tabIcon() {
    const SIZE = 32, ARM = 7, LINE = 2, INSET = 2;
    const tile = document.createElement('canvas'), body = document.createElement('canvas');
    tile.width = tile.height = body.width = body.height = SIZE;
    const c = tile.getContext('2d');
    let link = null, drawnSig = '', drawnAt = 0;
    function draw() {
      c.clearRect(0, 0, SIZE, SIZE);
      c.fillStyle = '#050608';
      c.beginPath();
      if (c.roundRect) c.roundRect(0, 0, SIZE, SIZE, 6); else c.rect(0, 0, SIZE, SIZE);
      c.fill();
      const exact = OR.icon(body, { fill: 0.86 });
      c.drawImage(body, 0, 0);
      c.fillStyle = colourOf(OR.focus);
      for (const [x, y, sx, sy] of [[INSET, INSET, 1, 1], [SIZE - INSET, INSET, -1, 1], [INSET, SIZE - INSET, 1, -1], [SIZE - INSET, SIZE - INSET, -1, -1]]) {
        c.fillRect(sx > 0 ? x : x - ARM, sy > 0 ? y : y - LINE, ARM, LINE);
        c.fillRect(sx > 0 ? x : x - LINE, sy > 0 ? y : y - ARM, LINE, ARM);
      }
      if (!link) {
        document.querySelectorAll('link[rel="icon"]').forEach((l) => l.remove());
        link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        document.head.append(link);
      }
      link.href = tile.toDataURL('image/png');
      return exact;
    }
    // the icon depends on the body, the direction the camera looks from
    // and the hour on the clock
    function signature() {
      const s = OR.scene, z = OR.zoomLevel;
      return [OR.focus, s.psi, s.th, s.top, s.roll, z.o].map((v) => (typeof v === 'number' ? Math.round(v * 20) : v)).join() +
        ',' + Math.round(OR.date.getTime() / 3.6e6);
    }
    // timers in a background tab run at most once a second, and after a few
    // minutes once a minute, which is all the icon needs there
    function tick() {
      const now = Date.now(), sig = document.hidden ? '' : signature();
      if (document.hidden ? now - drawnAt < 60e3 : sig === drawnSig && now - drawnAt < 10e3) return;
      drawnSig = draw() ? sig : '';
      drawnAt = now;
    }
    tick();
    setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
  })();
})();
