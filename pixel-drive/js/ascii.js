// Draws the drive's pictures in characters, built the way the first version
// of the drive built its scene. The pictures are read in cells the size of
// the page's glyph field (7 × 14 CSS px). Each cell first takes the material
// that covers most of it, and then gets the character the first drive drew
// for that material in that place. Walls are box outlines with square
// windows, and distant walls are hatched. Roofs have slope characters on
// their edges and hatching inside. Conifers are rows of ^ between / and \
// under a ▲. Hills and mountains have slope characters along their tops and
// hatching that follows the slope and thins out further down. Fields are
// rows of one character, and water is lines of swell over ░. People,
// animals, signs and boats are drawn in blocks. Every row of the scene has
// one flat tone, and each character is drawn on it at one of three
// strengths.
(function () {
  "use strict";

  const K = window.DriveKit;
  const M = K.M, MAT = K.MAT;
  const A = (K.ascii = {});
  const CWc = 7, CHc = 14;
  A.CW = CWc;
  A.CH = CHc;

  // Every glyph used here exists in Departure Mono.
  const QUADS = " ▗▖▄▝▐▞▟▘▚▌▙▀▜▛█";
  const TEXT = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ÁÉÍÓÚÝČĎĚŇŘŠŤŽŮ.,:-·/→★ ";
  const EXTRA = "%&@♣♠▲^\"',;`-=~:·.#X▒▓░═─━║│┃|▪■□•*°o+✦_¯≈—\\/v┊┌┐└┘┬┴┼╤╧╦╩╪┄╳▚▞╱";
  const GLYPHS = Array.from(new Set(Array.from(QUADS + TEXT + EXTRA)));
  const GI = new Map(GLYPHS.map(function (g, i) { return [g, i]; }));
  function G(ch) {
    const i = GI.get(ch);
    return i === undefined ? GI.get("#") : i;
  }
  function Gs(str) {
    return Array.from(str).map(G);
  }
  A.G = G;
  A.GLYPHS = GLYPHS;
  const Q = Gs(QUADS);
  const G_SPACE = G(" "), G_H = G("─"), G_HH = G("═"), G_V = G("│"), G_US = G("_"), G_OVER = G("¯");
  const G_DOT = G("·"), G_WIN = G("▪"), G_LIT = G("■"), G_OPEN = G("□"), G_SLASH = G("/"), G_BACK = G("\\");
  const G_DASH = G("-"), G_CARET = G("^"), G_TRI = G("▲"), G_TILDE = G("~"), G_SHADE = G("░");
  const G_DARK = G("▓"), G_STAR = G("*"), G_TL = G("┌"), G_TR = G("┐"), G_BL = G("└"), G_BR = G("┘");
  const G_TEE = G("┬"), G_CROSS = G("┼"), G_RAIL = G("╤"), G_POST = G("╧"), G_DTEE = G("╦"), G_JOINT = G("╪");
  const G_HEAVY = G("━"), G_HPIPE = G("┃"), G_DPIPE = G("║"), G_TAPE = G("┄"), G_X = G("╳"), G_HALF = G("▌");
  const G_CHK_A = G("▚"), G_CHK_B = G("▞");
  const DIGITS = Gs("0123456789");
  // The first drive's character sets.
  const BASE_CH = Gs(".:'`,");
  const ROCK_CH = Gs("#X=\\");
  const FIELD_CH = Gs("-=:~\"',");
  const CROP_CH = Gs("\"',;\"");
  const FERN_CH = Gs(",;'\"`");
  const CANOPY_CH = Gs("@%&♣");
  const PINE_CH = Gs("▲^♠");
  const SWELL_CH = Gs("─═-—~≈─");
  function pick(set, h) {
    return set[Math.min(set.length - 1, Math.floor(h * set.length))];
  }

  // The white glyph atlas, one CSS pixel per font pixel.
  let atlas = null;
  A.init = function () {
    atlas = document.createElement("canvas");
    atlas.width = GLYPHS.length * CWc;
    atlas.height = CHc;
    const a = atlas.getContext("2d");
    a.font = '11px "Departure Mono", ui-monospace, Menlo, monospace';
    a.textBaseline = "alphabetic";
    a.fillStyle = "#fff";
    for (let i = 0; i < GLYPHS.length; i++) a.fillText(GLYPHS[i], i * CWc, 11);
    stampCache.clear();
  };
  A.ready = function () {
    return !!atlas;
  };

  // --------------------------------------------------------- materials ---
  // Every material belongs to a kind, which decides how its cells are drawn.
  const WALL = 1, ROOF = 2, GLASS = 3, SIGN = 4, LEAF = 5, PINE = 6, TRUNK = 7, GRASS = 8, CROP = 9;
  const SAND = 10, SNOW = 11, ROCK = 12, MESA = 13, WATER = 14, ICE = 15, ROAD = 16, BEING = 17;
  const LIGHT = 18, CLOUD = 19, FLOWER = 20, BLOCK = 21, FOREST = 22, POST = 23, CHEQ = 24, PITCH = 25, LATTICE = 26;
  // A cell strength that draws one step stronger than the rest of its plane.
  // Outlines, slope tops and windows use it, so distant shapes stay defined
  // while their hatching recedes.
  const EDGE = 3;

  // A family is a set of materials drawn alike. `g` are the characters for
  // a first reading, before the kind's own rules redraw the cell. `mode` is
  // how the set is used: "hash" picks by cell, "row" alternates by row,
  // "rows" leaves every other row bare and "fixed" uses the first character.
  // `edge` is how a cell the material only partly covers is drawn: "slope"
  // for a line along the top, "quad" for quarter blocks and "tex" for the
  // inside's characters. `pat` is the pattern inside a wall or a roof.
  const FAMILY = new Array(256);
  function fam(names, glyphs, opts) {
    const f = Object.assign({ g: Gs(glyphs), mode: "hash", density: 1, edge: "slope", deep: 0, cls: BLOCK, pat: null }, opts || {});
    names.split(" ").forEach(function (n) {
      if (M[n]) FAMILY[M[n]] = f;
    });
  }
  fam("grassL grass grassD grassDD meadow mud", ",;'\"`", { cls: GRASS, density: 0.4, deep: 1 });
  fam("rape rapeD wheat wheatD soil soilD plough", "-=:~\"',", { cls: CROP, mode: "rows", density: 0.85 });
  fam("hay hayD", "█", { mode: "fixed", edge: "quad" });
  fam("sand sandD sandL", "~-·.", { cls: SAND, density: 0.4, deep: 1 });
  fam("rock rockD rockL", "#X=\\", { cls: ROCK, density: 0.5, deep: 1 });
  fam("mesa mesaD mesaL", "─", { cls: MESA, mode: "fixed" });
  fam("snow snowS", "░·", { cls: SNOW, density: 0.8 });
  fam("ice", "─-", { cls: ICE, mode: "row", density: 0.6, deep: 1 });
  fam("water waterD waterL foam", "░", { cls: WATER, water: true });
  fam("leafL leaf leafD leafDD bushD", "@%&♣", { cls: LEAF, edge: "tex" });
  // Palms are drawn in quarter blocks, as the first drive drew them.
  fam("palm palmD", "█", { mode: "fixed", edge: "quad" });
  fam("apple", "•", { cls: LEAF, mode: "fixed", edge: "tex" });
  fam("flowerR flowerY flowerW flowerP", "*", { cls: FLOWER, mode: "fixed", edge: "tex" });
  fam("pineL pine pineD", "^", { cls: PINE, mode: "fixed" });
  fam("woodsL woods woodsD woodsDD", "^", { cls: FOREST, mode: "fixed" });
  fam("bark barkD palmT birch", "│", { cls: TRUNK, mode: "fixed", edge: "quad" });
  fam("cactus cactusD", "┃", { cls: TRUNK, mode: "fixed", edge: "quad" });
  fam("asphalt asphaltD asphaltL", "·", { cls: ROAD, density: 0.04, deep: 1 });
  fam("line lineY", "━", { cls: ROAD, mode: "fixed" });
  fam("gravel gravelD gravelL", ".:·", { cls: ROAD, density: 0.5, deep: 1 });
  fam("plasterW plasterC plasterP plasterB plasterG plasterS plasterY white cream plinth", " ", { cls: WALL, pat: "plain" });
  fam("brick brickD", "─", { cls: WALL, pat: "courses" });
  fam("kerb concrete concreteD concreteL", " ", { cls: WALL, pat: "dots" });
  fam("wood woodD woodL", "═─", { cls: WALL, pat: "logs" });
  fam("metal metalD metalL steel steelD grey greyL", " ", { cls: WALL, pat: "plain" });
  fam("black dark", "▓", { cls: WALL, pat: "dark" });
  fam("rail sleeper", "═", { cls: WALL, pat: "rails" });
  fam("container1 container2 container3 container4", "║", { cls: WALL, pat: "ribs" });
  fam("crane craneD", "╳", { cls: WALL, pat: "lattice" });
  fam("roof roofD roofL", "/", { cls: ROOF, pat: "tiles" });
  fam("slate slateD", "─", { cls: ROOF, pat: "slates" });
  fam("glass glassL", "□", { cls: GLASS, mode: "fixed", edge: "quad", salient: true });
  // The legs of the rally arches are ║, as the first drive drew them, and
  // the finish banner has rows of chequer.
  fam("poleY poleK", "║", { cls: POST, mode: "fixed", edge: "quad" });
  fam("chequer", "▚", { cls: CHEQ, mode: "fixed", edge: "quad" });
  // Power pylons are a steel lattice.
  fam("pylon", "╳", { cls: LATTICE, mode: "fixed", edge: "quad" });
  // The football pitch is a plain green with its lines drawn over it.
  fam("pitchGrass pitchGrassL pitchLine", " ", { cls: PITCH, mode: "fixed", edge: "quad" });
  fam("signBlue signGreen signBrown signRed signYellow signWhite signInk accent accentD tape", "█", { cls: SIGN, mode: "fixed", edge: "quad" });
  fam("sail hull hullR", "█", { mode: "fixed", edge: "quad" });
  // Clouds are drawn in ink, as the first drive drew them: dense on top,
  // lighter below, with the odd digit.
  fam("cloud", "■■■▪═■", { cls: CLOUD, ink: 0, edge: "tex", digits: true });
  fam("cloudS", "=+□▪≈=", { cls: CLOUD, ink: 1, edge: "tex", digits: true });
  fam("cloudD", "-:·.'-", { cls: CLOUD, ink: 2, edge: "tex" });
  for (let i = 1; i < MAT.length; i++) {
    if (FAMILY[i]) continue;
    const f = MAT[i].flags;
    if (f.indexOf("e") >= 0) FAMILY[i] = { g: [G_LIT], mode: "fixed", density: 1, edge: "quad", salient: true, deep: 0, cls: LIGHT };
    else if (f.indexOf("p") >= 0) FAMILY[i] = { g: [Q[15]], mode: "fixed", density: 1, edge: "quad", deep: 0, cls: BEING };
    else FAMILY[i] = { g: [G_DARK], mode: "fixed", density: 1, edge: "quad", deep: 0, cls: BLOCK };
  }
  A.FAMILY = FAMILY;
  // Light signs are framed in ink, as the first drive framed its town signs.
  const LIGHT_SIGN = new Uint8Array(256);
  LIGHT_SIGN[M.signWhite] = LIGHT_SIGN[M.signYellow] = LIGHT_SIGN[M.tape] = 1;
  // The number of covered quarters for each set of quarter bits.
  const QCOUNT = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];
  // The characters fields of each crop are drawn in.
  const CROP_OF = new Uint16Array(256);
  CROP_OF[M.rape] = CROP_OF[M.rapeD] = G("=");
  CROP_OF[M.wheat] = CROP_OF[M.wheatD] = G("\"");
  CROP_OF[M.plough] = G("~");
  CROP_OF[M.soil] = CROP_OF[M.soilD] = G("-");
  // And the characters distant grass is drawn in, so each field in the
  // distance is a run of one character.
  const FIELD_OF = new Uint16Array(256);
  FIELD_OF[M.grassL] = G(",");
  FIELD_OF[M.grass] = G("-");
  FIELD_OF[M.grassD] = G("=");
  FIELD_OF[M.grassDD] = G(":");
  FIELD_OF[M.meadow] = G("'");
  FIELD_OF[M.mud] = G("~");

  // ------------------------------------------------------------ convert ---
  // Reads a picture in cells. `sample(x, y)` returns the material at a CSS
  // position, `cols` and `rows` are the size in cells, and (cx0, ry0) the
  // cell grid's position, used so a cell's character is the same every time
  // it is drawn. Each cell gets the material that covers most of it, which
  // quarters of it are covered, how far down its top edge is, and a first
  // character.
  const SX = 4, SY = 4;
  const counts = new Uint16Array(256);
  const seen = [];
  A.cells = function (cols, rows) {
    const n = cols * rows;
    return {
      cols: cols, rows: rows, glyph: new Uint16Array(n), fg: new Uint8Array(n), bg: new Uint8Array(n), level: new Uint8Array(n),
      mode: new Uint8Array(n), top: new Uint8Array(n), dom: new Uint8Array(n), bits: new Uint8Array(n), sub: new Uint8Array(n),
      wash: new Uint8Array(n),
    };
  };
  const grid = new Uint8Array(SX * SY);
  // The main material of each quarter of a cell.
  const quad = new Uint8Array(4);
  const colTop = new Int8Array(SX);
  A.convert = function (sample, cols, rows, cx0, ry0, out, rFrom, rTo) {
    out = out || A.cells(cols, rows);
    const ra = rFrom === undefined ? 0 : rFrom, rb = rTo === undefined ? rows : Math.min(rows, rTo);
    for (let r = ra; r < rb; r++) {
      for (let c = 0; c < cols; c++) {
        let filled = 0, j0 = SY;
        seen.length = 0;
        for (let j = 0; j < SY; j++) {
          for (let i = 0; i < SX; i++) {
            const m = sample(c * CWc + ((i + 0.5) * CWc) / SX, r * CHc + ((j + 0.5) * CHc) / SY);
            grid[j * SX + i] = m;
            if (m) {
              filled++;
              if (j < j0) j0 = j;
              if (!counts[m]) seen.push(m);
              counts[m]++;
            }
          }
        }
        const k = r * cols + c;
        if (!filled) continue;
        let dom = 0, dc = 0, sal = 0, sc = 0;
        for (let q = 0; q < seen.length; q++) {
          const m = seen[q];
          const f = FAMILY[m];
          if (f && f.salient && counts[m] > sc) { sal = m; sc = counts[m]; }
          if (counts[m] > dc) { dom = m; dc = counts[m]; }
        }
        for (let q = 0; q < seen.length; q++) counts[seen[q]] = 0;
        let bits = 0;
        for (let qd = 0; qd < 4; qd++) {
          const qx = (qd & 1) * (SX >> 1), qy = (qd >> 1) * (SY >> 1);
          let f = 0;
          for (let j = 0; j < SY >> 1; j++) for (let i = 0; i < SX >> 1; i++) if (grid[(qy + j) * SX + qx + i]) f++;
          // A quarter counts as filled when three of its four samples are.
          if (f * 4 >= (SX >> 1) * (SY >> 1) * 3) bits |= 8 >> qd;
        }
        const fd = FAMILY[dom];
        const col = cx0 + c, row = ry0 + r;
        const h = K.hash3(col, row, dom);
        out.fg[k] = dom;
        out.dom[k] = dom;
        out.bits[k] = bits;
        out.sub[k] = j0;
        out.mode[k] = 1;
        if (!(K.FLAG[dom] & (K.F.NOSNOW | K.F.GROUND | K.F.EMIT)) && (r === 0 || !out.fg[k - cols])) out.top[k] = 1;
        // A roof's edge crossing a wall, such as along a gable, and the red
        // bar across the sign at the end of a town are lines that lean the
        // way their samples in the cell lean.
        if (fd.cls === WALL || fd.cls === PITCH || (fd.cls === SIGN && LIGHT_SIGN[dom])) {
          const wall = fd.cls === WALL, pitch = fd.cls === PITCH;
          const lineM = pitch ? M.pitchLine : M.signRed;
          let rc = 0, si = 0, sj = 0, rm = 0;
          for (let q = 0; q < SX * SY; q++) {
            const m = grid[q];
            if (m && (wall ? FAMILY[m].cls === ROOF : m === lineM)) { rc++; si += q % SX; sj += (q / SX) | 0; rm = m; }
          }
          if (rc >= 2) {
            const mi = si / rc, mj = sj / rc;
            let cov = 0, vi = 0, vj = 0;
            for (let q = 0; q < SX * SY; q++) {
              const m = grid[q];
              if (!m || !(wall ? FAMILY[m].cls === ROOF : m === lineM)) continue;
              const di = (q % SX) - mi, dj = ((q / SX) | 0) - mj;
              cov += di * dj;
              vi += di * di;
              vj += dj * dj;
            }
            if (pitch) {
              // A pitch line: along the touchlines, down the halfway and goal
              // lines, or round the centre circle.
              // Two lines close together, such as the goal line beside the
              // edge of the penalty area, are a double line.
              const corr = cov / Math.sqrt(Math.max(1e-6, vi * vj));
              out.glyph[k] = vj > 2 * vi ? G_V : vi > 2 * vj ? G_H : Math.abs(corr) < 0.4 ? (vj >= vi ? G_HH : G_DPIPE) : corr < 0 ? G_SLASH : G_BACK;
              out.bg[k] = 0;
            } else if (wall) out.glyph[k] = cov < -0.12 * rc ? G_SLASH : cov > 0.12 * rc ? G_BACK : G_H;
            else {
              // The bar always rises from the bottom left, as the first
              // drive drew it.
              out.glyph[k] = G("╱");
              out.bg[k] = dom;
            }
            out.fg[k] = rm;
            continue;
          }
        }
        // A window or a light inside a wall shows as a square in it.
        if (sal && sal !== dom && sc >= 3 && !fd.salient && bits === 15) {
          out.glyph[k] = FAMILY[sal].cls === LIGHT ? G_LIT : G_WIN;
          out.fg[k] = sal;
          out.bg[k] = dom;
          continue;
        }
        // A person or an animal: where a full cell holds two materials, the
        // quarters of one are a quarter block over a fill of the other, so a
        // face shows under its hair and a shirt above its trousers.
        if (fd.cls === BEING && bits === 15 && seen.length > 1) {
          let a = 0, an = 0, b = 0, bn = 0;
          for (let qd = 0; qd < 4; qd++) {
            const qx = (qd & 1) * (SX >> 1), qy = (qd >> 1) * (SY >> 1);
            let m0 = 0, n0 = 0;
            for (let j = 0; j < SY >> 1; j++) for (let i = 0; i < SX >> 1; i++) {
              const m = grid[(qy + j) * SX + qx + i];
              if (!m) continue;
              let n = 0;
              for (let j2 = 0; j2 < SY >> 1; j2++) for (let i2 = 0; i2 < SX >> 1; i2++) if (grid[(qy + j2) * SX + qx + i2] === m) n++;
              if (n > n0) { m0 = m; n0 = n; }
            }
            quad[qd] = m0;
          }
          // a is the material of most quarters and b the next.
          for (let qd = 0; qd < 4; qd++) {
            const m = quad[qd];
            if (m === a || m === b) continue;
            let n = 0;
            for (let q2 = 0; q2 < 4; q2++) if (quad[q2] === m) n++;
            if (n > an) { b = a; bn = an; a = m; an = n; }
            else if (n > bn) { b = m; bn = n; }
          }
          if (b && an < 4) {
            let qb = 0;
            for (let qd = 0; qd < 4; qd++) if (quad[qd] === b) qb |= 8 >> qd;
            out.glyph[k] = Q[qb];
            out.fg[k] = b;
            out.bg[k] = a;
            out.mode[k] = 3;
            continue;
          }
        }
        if (bits === 15) {
          out.glyph[k] = inside(fd, dom, col, row, h, out, k);
          continue;
        }
        if (!bits) {
          // Too thin to fill a quarter: a line or a dot.
          let r0 = SY, r1 = -1, c0 = SX, c1 = -1;
          for (let j = 0; j < SY; j++) for (let i = 0; i < SX; i++) if (grid[j * SX + i]) { r0 = Math.min(r0, j); r1 = Math.max(r1, j); c0 = Math.min(c0, i); c1 = Math.max(c1, i); }
          let g = G_DOT;
          if (c1 - c0 >= 2 && r1 - r0 <= 1) g = r1 < 2 ? G_OVER : r0 > 2 ? G_US : G_H;
          else if (r1 - r0 >= 2 && c1 - c0 <= 1) g = G_V;
          out.glyph[k] = g;
          out.mode[k] = 2;
          continue;
        }
        // An edge.
        if (fd.edge === "quad") out.glyph[k] = Q[bits];
        else if (fd.edge === "tex" || fd.water) {
          out.glyph[k] = bits === 3 || bits === 12 || bits === 10 || bits === 5 || bits > 7 ? inside(fd, dom, col, row, h, out, k) : G_SPACE;
        } else {
          // A line that follows the top of the shape.
          for (let i = 0; i < SX; i++) {
            colTop[i] = -1;
            for (let j = 0; j < SY; j++) if (grid[j * SX + i]) { colTop[i] = j; break; }
          }
          const lt = colTop[0] < 0 ? SY : colTop[0], rt = colTop[SX - 1] < 0 ? SY : colTop[SX - 1];
          const mt = Math.min(colTop[1] < 0 ? SY : colTop[1], colTop[2] < 0 ? SY : colTop[2]);
          let g;
          if (lt - rt >= 2) g = G_SLASH;
          else if (rt - lt >= 2) g = G_BACK;
          else if (mt < lt && mt < rt) g = G_CARET;
          else {
            const t = (lt + rt) / 2;
            g = t >= 2.5 ? G_US : t >= 1 ? G_DASH : G_OVER;
          }
          out.glyph[k] = g;
        }
      }
    }
    return out;
  };

  // The first character inside a shape, or a blank for loose textures.
  function inside(fd, dom, col, row, h, out, k) {
    if (fd.water) {
      out.level[k] = 1;
      return G_SHADE;
    }
    if (fd.digits && h < 0.03) return DIGITS[Math.floor(h * 333) % 10];
    if (fd.mode === "rows") {
      if (row & 1) return G_SPACE;
      return h > fd.density ? G_SPACE : fd.g[Math.floor(K.hash2(col >> 2, row) * fd.g.length)];
    }
    if (h > fd.density) return G_SPACE;
    out.level[k] = fd.deep;
    if (fd.mode === "fixed") return fd.g[0];
    if (fd.mode === "row") return fd.g[K.mod(row, fd.g.length)];
    return fd.g[Math.floor(K.hash2(col * 7 + 3, row * 13 + dom) * fd.g.length)];
  }

  // The material covering most of cell (c, r) of a picture.
  function domAt(sample, c, r) {
    seen.length = 0;
    for (let j = 0; j < SY; j++) {
      for (let i = 0; i < SX; i++) {
        const m = sample(c * CWc + ((i + 0.5) * CWc) / SX, r * CHc + ((j + 0.5) * CHc) / SY);
        if (!m) continue;
        if (!counts[m]) seen.push(m);
        counts[m]++;
      }
    }
    let dom = 0, dc = 0;
    for (let q = 0; q < seen.length; q++) {
      if (counts[seen[q]] > dc) { dom = seen[q]; dc = counts[seen[q]]; }
      counts[seen[q]] = 0;
    }
    return dom;
  }

  // ------------------------------------------------------------- draft ---
  // Redraws converted cells the way the first drive built its scene. `o`:
  //   sample    the picture's sample function, used to look past its sides
  //   kind      "far", "mid", "roadside", "road" or "sprite"
  //   base      the plane's strength
  //   cx0, ry0  the cell grid's position, so patterns line up across strips
  //   horizon   on the far plane, the row of the horizon
  //   fgRow     on the road plane, the first row below the road, and
  //   fgRows    the number of rows from there to the bottom of the scene
  const LAND = 1, WET = 2, CONIFER = 3, BUILT = 4, CROWN = 5;
  function groupOf(c, far) {
    switch (c) {
      case GRASS: case CROP: case SAND: case SNOW: case ROCK: case MESA: case FOREST: return LAND;
      case PINE: return far ? LAND : CONIFER;
      case LEAF: return far ? LAND : CROWN;
      case WATER: case ICE: return WET;
      case WALL: case ROOF: case GLASS: case SIGN: case LIGHT: return BUILT;
      default: return 0;
    }
  }
  function built(c) {
    return c === WALL || c === ROOF || c === GLASS || c === SIGN || c === LIGHT;
  }
  // Working state for one call: the kind of each cell, its group, the top
  // of the run of its group it belongs to (in rows), the top of the run of
  // its own kind, and the top of the land at or below it.
  let cl = new Uint8Array(0), gp = new Uint8Array(0), top = new Float32Array(0), ctop = new Float32Array(0), below = new Float32Array(0);
  // Which cells a sign's panel fills.
  let pn = new Uint8Array(0);
  let C = null, O = null, COLS = 0, ROWS = 0;
  const peeks = new Map();

  // The kind of material in cell (c, r), looking past the sides of the grid.
  function clsAt(c, r) {
    if (r < 0) return 0;
    if (r >= ROWS) return -1;
    if (c >= 0 && c < COLS) return cl[r * COLS + c];
    if (!O.sample) return 0;
    const key = c * 8192 + r;
    let v = peeks.get(key);
    if (v === undefined) {
      const m = domAt(O.sample, c, r);
      v = m ? FAMILY[m].cls : 0;
      peeks.set(key, v);
    }
    return v;
  }

  function put(k, g, level, mode) {
    C.glyph[k] = g;
    C.level[k] = level;
    C.mode[k] = mode === undefined ? 1 : mode;
    C.bg[k] = 0;
  }

  A.draft = function (cells, o) {
    const cols = cells.cols, rows = cells.rows, n = cols * rows;
    if (cl.length < n) {
      cl = new Uint8Array(n);
      gp = new Uint8Array(n);
      top = new Float32Array(n);
      ctop = new Float32Array(n);
      below = new Float32Array(n);
      pn = new Uint8Array(n);
    }
    C = cells;
    O = o;
    COLS = cols;
    ROWS = rows;
    peeks.clear();
    const dom = cells.dom, far = o.kind === "far";
    for (let k = 0; k < n; k++) cl[k] = dom[k] ? FAMILY[dom[k]].cls : 0;
    // The darkest leaf shade is shared by broadleaf crowns and conifers. It
    // takes the kind of the cells around it.
    for (let k = 0; k < n; k++) {
      if (dom[k] !== M.leafDD) continue;
      let p = 0, l = 0;
      const nb = [k - cols, k + cols, k % cols ? k - 1 : -1, (k + 1) % cols ? k + 1 : -1];
      for (let i = 0; i < 4; i++) {
        const j = nb[i];
        if (j < 0 || j >= n) continue;
        if (cl[j] === PINE) p++;
        else if (cl[j] === LEAF) l++;
      }
      if (p > l) cl[k] = PINE;
    }
    for (let k = 0; k < n; k++) gp[k] = cl[k] ? groupOf(cl[k], far) : 0;
    // A sign fills the cells it covers half of, and a corner cell with the
    // sign above or below it and beside it.
    for (let k = 0; k < n; k++) pn[k] = cl[k] === SIGN && QCOUNT[cells.bits[k]] >= 2 ? 1 : 0;
    for (let k = 0; k < n; k++) {
      if (pn[k] !== 0 || cl[k] !== SIGN || !cells.bits[k]) continue;
      const c = k % cols, m = dom[k];
      const same = function (j) { return pn[j] === 1 && dom[j] === m; };
      const side = (c > 0 && same(k - 1)) || (c < cols - 1 && same(k + 1));
      const upDown = (k >= cols && same(k - cols)) || (k + cols < n && same(k + cols));
      if (side && upDown) pn[k] = 2;
    }
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const k = r * cols + c;
        if (!gp[k]) top[k] = -1;
        else top[k] = r > 0 && gp[k - cols] === gp[k] ? top[k - cols] : r + cells.sub[k] / SY;
        ctop[k] = r > 0 && cl[k - cols] === cl[k] ? ctop[k - cols] : r + cells.sub[k] / SY;
      }
      let nt = Infinity;
      for (let r = rows - 1; r >= 0; r--) {
        const k = r * cols + c;
        if (gp[k] === LAND) nt = top[k];
        below[k] = nt;
      }
    }
    const cx0 = o.cx0 || 0, ry0 = o.ry0 || 0, base = o.base || 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const k = r * cols + c;
        if (!dom[k]) continue;
        const col = cx0 + c, row = ry0 + r;
        switch (cl[k]) {
          case WALL: wall(k, c, r, col, row, base); break;
          case ROOF: roof(k, c, r, col, row); break;
          case GLASS:
            put(k, cells.bits[k] === 15 ? G_OPEN : G_WIN, EDGE);
            break;
          case POST: {
            // A leg split across cells is drawn once, in the cell it
            // covers most.
            const q = QCOUNT[cells.bits[k]];
            const lq = c > 0 && cl[k - 1] === POST ? QCOUNT[cells.bits[k - 1]] : -1;
            const rq = c < cols - 1 && cl[k + 1] === POST ? QCOUNT[cells.bits[k + 1]] : -1;
            put(k, q > lq && q >= rq ? G_DPIPE : G_SPACE, EDGE);
            break;
          }
          case LATTICE:
            lattice(k, c);
            break;
          case CHEQ:
            put(k, (col + row) & 1 ? G_CHK_A : G_CHK_B, EDGE, 4);
            C.fg[k] = M.white;
            C.bg[k] = M.signInk;
            break;
          case PITCH:
            // A line keeps its character; the green between is left plain.
            if (cells.fg[k] === M.pitchLine) put(k, cells.glyph[k], EDGE);
            else put(k, K.hash3(col, row, 41) < 0.05 ? G(",") : G_SPACE, 1);
            break;
          case SIGN:
            sign(k, c, r);
            break;
          case PINE:
            if (far) land(k, c, r, col, row);
            else pine(k, c, r, col, row);
            break;
          case LEAF:
            if (far) land(k, c, r, col, row);
            else leaf(k, c, r);
            break;
          case GRASS: case CROP: case SAND: case SNOW: case ROCK: case MESA: case FOREST:
            land(k, c, r, col, row);
            break;
          case TRUNK:
            trunk(k);
            break;
          case WATER: case ICE:
            water(k, c, r, col, row);
            break;
        }
      }
    }
    // Each mass gets a wash of its own colour behind its characters, so a
    // hill, a tree or a house stands apart from the sky behind it. Walls and
    // roofs get the most, as the first drive's village houses were solid,
    // then trees, then land and water in the distance. The ground at the
    // road keeps its row's tone.
    // Only the inside of a mass is washed, so its edges stay lines on the
    // sky, as in the first drive.
    const distant = o.kind === "far" || o.kind === "mid";
    const same = function (k, j) { return j < 0 || j >= n || gp[j] === gp[k]; };
    for (let k = 0; k < n; k++) {
      if (!dom[k] || cells.bg[k] || cells.bits[k] !== 15 || o.kind === "road" || o.kind === "sprite") continue;
      const c = k % cols;
      if (!same(k, k - cols) || !same(k, k + cols) || (c > 0 && !same(k, k - 1)) || (c < cols - 1 && !same(k, k + 1))) continue;
      const g = gp[k];
      cells.wash[k] = cl[k] === WALL || cl[k] === ROOF ? 3 : g === CONIFER || g === CROWN ? 2 : cl[k] === PITCH || (distant && (g === LAND || g === WET)) ? 1 : 0;
    }
    // A post or a cactus more than a cell wide would show as lines side by
    // side. It keeps the middle one.
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        const k = r * cols + c;
        const g = cells.glyph[k];
        if (g !== G_V && g !== G_HPIPE && g !== G_DPIPE) { c++; continue; }
        let e = c + 1;
        while (e < cols && cells.glyph[k + e - c] === g && cl[k + e - c] === cl[k]) e++;
        const edgeRun = (c > 0 && cl[k - 1] === cl[k]) || (e < cols && cl[r * cols + e] === cl[k]);
        if (e - c > 1 && !edgeRun) {
          const keep = c + ((e - c - 1) >> 1);
          for (let i = c; i < e; i++) if (i !== keep) cells.glyph[r * cols + i] = G_SPACE;
        }
        c = e;
      }
    }
    C = O = null;
  };

  // Signs are panels of whole cells in the sign's colour, as the first drive
  // drew them, with a cell counted in when the sign covers half of it. A
  // light sign is framed in ink, and the bar across the sign at the end of a
  // town is a red line.
  function panel(c, r, m) {
    if (r < 0 || r >= ROWS) return false;
    if (c < 0 || c >= COLS) return clsAt(c, r) === SIGN;
    const k = r * COLS + c;
    return C.dom[k] === m && pn[k] > 0;
  }
  function sign(k, c, r) {
    const m = C.dom[k];
    C.mode[k] = 1;
    C.level[k] = 0;
    if (!pn[k]) {
      C.glyph[k] = G_SPACE;
      C.bg[k] = 0;
      return;
    }
    C.bg[k] = m;
    const strike = C.fg[k] !== m;
    if (!strike) C.glyph[k] = G_SPACE;
    if (!LIGHT_SIGN[m]) return;
    // The frame goes round the edge, over the bar where they cross.
    const U = panel(c, r - 1, m), D = panel(c, r + 1, m), L = panel(c - 1, r, m), R = panel(c + 1, r, m);
    let g = G_SPACE;
    if (!U) g = !L ? G_TL : !R ? G_TR : G_H;
    else if (!D) g = !L ? G_BL : !R ? G_BR : G_H;
    else if (!L || !R) g = G_V;
    if (g === G_SPACE) return;
    C.glyph[k] = g;
    C.fg[k] = M.signInk;
    C.mode[k] = 4;
    C.level[k] = EDGE;
  }

  // Walls: box lines where a wall meets the sky or a gap, a pattern inside,
  // and windows and lamps as squares. Where a wall stands on something there
  // is no line under it.
  const PARTIAL = new Uint16Array(16);
  // Indexed by the covered quarters: top left 8, top right 4, bottom left 2,
  // bottom right 1.
  [[1, "/"], [2, "\\"], [3, "─"], [4, "\\"], [5, "│"], [6, "/"], [7, "/"], [8, "/"], [9, "\\"], [10, "│"], [11, "\\"], [12, "─"], [13, "\\"], [14, "/"]]
    .forEach(function (e) { PARTIAL[e[0]] = G(e[1]); });
  function wall(k, c, r, col, row, base) {
    const m = C.dom[k];
    C.bg[k] = 0;
    if (C.fg[k] !== m) {
      // A roof's edge keeps its line; a window or a lamp is a square.
      const fc = FAMILY[C.fg[k]].cls;
      put(k, fc === ROOF ? C.glyph[k] : fc === LIGHT ? G_LIT : G_OPEN, EDGE);
      return;
    }
    const bits = C.bits[k];
    C.mode[k] = 5;
    C.level[k] = EDGE;
    if (!bits) return;
    if (bits !== 15) {
      // The roof draws the line where a gable meets it.
      if (roofAt(c, r - 1) || roofAt(c - 1, r) || roofAt(c + 1, r) || roofAt(c, r + 1)) C.glyph[k] = G_SPACE;
      else C.glyph[k] = PARTIAL[bits];
      return;
    }
    const U = built(clsAt(c, r - 1)), D = clsAt(c, r + 1) !== 0;
    const L = built(clsAt(c - 1, r)), R = built(clsAt(c + 1, r));
    let g;
    if (U && D && L && R) {
      let lv = 1;
      switch (FAMILY[m].pat) {
        case "courses":
          if (base > 0) g = K.mod(col + row, 3) === 0 ? G_SLASH : G_SPACE;
          else g = row & 1 ? G_SPACE : G_H;
          lv = 2;
          break;
        case "dots":
          g = K.hash3(col, row, 77) < 0.08 ? G_DOT : G_SPACE;
          lv = 2;
          break;
        case "logs": g = row & 1 ? G_HH : G_H; break;
        case "dark": g = G_DARK; break;
        case "rails": g = G_HH; lv = 0; break;
        case "ribs": g = col & 1 ? G_SPACE : G_DPIPE; break;
        case "lattice": g = G_X; lv = 0; break;
        default:
          // Plain walls are left blank near the road and hatched further off.
          g = base > 0 && K.mod(col + row, 3) === 0 ? G_SLASH : G_SPACE;
      }
      C.glyph[k] = g;
      C.level[k] = lv;
      return;
    }
    if (!L && !R) g = U || D ? G_V : G_WIN;
    else if (!U && !D) g = G_HH;
    else if (!U) g = !L ? G_TL : !R ? G_TR : G_H;
    else if (!D) g = !L ? G_BL : !R ? G_BR : G_H;
    else g = G_V;
    C.glyph[k] = g;
  }

  // Trunks keep their width in blocks, as the first drive drew its linden,
  // and a trunk thinner than a quarter of a cell is a line. Cacti are ┃
  // with ━ arms, as the first drive drew its saguaros.
  function trunk(k) {
    C.bg[k] = 0;
    C.mode[k] = 1;
    C.level[k] = EDGE;
    const bits = C.bits[k];
    if (!bits) return;
    if (FAMILY[C.dom[k]].g[0] === G_HPIPE) C.glyph[k] = bits === 3 || bits === 12 ? G_HEAVY : G_HPIPE;
    else C.glyph[k] = Q[bits];
  }

  // A pylon is drawn as the first drive drew its crane: legs as lines that
  // lean with them, cross arms as ─ and the lattice between the legs as ╳.
  function lattice(k, c) {
    C.bg[k] = 0;
    C.mode[k] = 1;
    C.level[k] = EDGE;
    const bits = C.bits[k];
    if (!bits) return;
    if (bits === 15) {
      const L = c > 0 && cl[k - 1] === LATTICE, R = c < COLS - 1 && cl[k + 1] === LATTICE;
      C.glyph[k] = L && R ? G_X : !L && R ? G_SLASH : L && !R ? G_BACK : G_V;
      return;
    }
    C.glyph[k] = PARTIAL[bits];
  }

  // Whether cell (c, r) shows a roof or the edge of one.
  function roofAt(c, r) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return false;
    const f = C.fg[r * COLS + c];
    return !!f && FAMILY[f].cls === ROOF;
  }

  // Roofs: / and \ down their sides, ^ at a ridge, and tiles or slates
  // inside. Cells the roof only partly covers keep the slope character they
  // were read with.
  function roof(k, c, r, col, row) {
    C.bg[k] = 0;
    C.mode[k] = 1;
    C.level[k] = EDGE;
    if (C.bits[k] !== 15) return;
    const U = built(clsAt(c, r - 1)), L = built(clsAt(c - 1, r)), R = built(clsAt(c + 1, r));
    let g;
    if (!U) {
      if (!L && !R) g = G_CARET;
      else if (!L) g = G_SLASH;
      else if (!R) g = G_BACK;
      else {
        const t = top[k], tl = c > 0 ? top[k - 1] : t, tr = c < COLS - 1 ? top[k + 1] : t;
        g = tl > t + 0.2 && tr > t + 0.2 ? G_CARET : tl > tr + 0.2 ? G_SLASH : tr > tl + 0.2 ? G_BACK : G_H;
      }
    } else if (!L) g = G_SLASH;
    else if (!R) g = G_BACK;
    else {
      C.level[k] = 1;
      g = FAMILY[C.dom[k]].pat === "slates" ? (row & 1 ? G_SPACE : G_H) : (col + row) & 1 ? G_SLASH : G_SPACE;
    }
    C.glyph[k] = g;
  }

  // Conifers: / and \ down the sides, ▲ on top and ^ in every other cell
  // inside.
  function pine(k, c, r, col, row) {
    C.bg[k] = 0;
    C.mode[k] = 1;
    C.level[k] = EDGE;
    if (C.bits[k] !== 15) {
      if (C.glyph[k] === G_CARET) C.glyph[k] = G_TRI;
      return;
    }
    const U = clsAt(c, r - 1) === PINE, L = clsAt(c - 1, r) === PINE, R = clsAt(c + 1, r) === PINE;
    let g;
    if (!L && !R) g = G_TRI;
    else if (!L) g = G_SLASH;
    else if (!R) g = G_BACK;
    else if (!U) g = G_TRI;
    else {
      g = (col + row) & 1 ? G_CARET : G_SPACE;
      C.level[k] = 1;
    }
    C.glyph[k] = g;
  }

  // Broadleaf crowns keep their characters, fainter round the rim.
  function leaf(k, c, r) {
    C.bg[k] = 0;
    C.mode[k] = 1;
    const rim = clsAt(c, r - 1) !== LEAF || clsAt(c - 1, r) !== LEAF || clsAt(c + 1, r) !== LEAF || clsAt(c, r + 1) !== LEAF;
    C.level[k] = rim ? 1 : 0;
  }

  // Land. On the far and middle planes it is drawn as the first drive drew
  // its hills: a slope character along the top, then hatching or rows of
  // crops below. Near the road it is drawn as the first drive drew the ground
  // in front of the road.
  function land(k, c, r, col, row) {
    C.bg[k] = 0;
    C.mode[k] = 1;
    const kind = cl[k];
    const hv = K.hash3(col, row, 1900);
    const t = top[k], depth = r + 0.5 - t;
    // The slope of the top of the land here, from the tops beside it, as a
    // rise over run in CSS px. Positive means it falls away to the right.
    const tl = c > 0 ? below[k - 1] : Infinity, tr = c < COLS - 1 ? below[k + 1] : Infinity;
    let slope = 0, peak = false;
    if (isFinite(tl) && isFinite(tr)) {
      slope = tr - tl;
      peak = tl > t && tr > t;
    } else if (isFinite(tr)) slope = 2 * (tr - t);
    else if (isFinite(tl)) slope = 2 * (t - tl);
    const flat = kind === SAND ? G_TILDE : kind === GRASS || kind === CROP ? G_US : kind === MESA ? G_H : G_DASH;
    // Near the road small bumps in the verge stay flat.
    const steep = O.kind === "far" || O.kind === "mid" ? 0.3 : 0.8;
    const eg = slope < -steep ? G_SLASH : slope > steep ? G_BACK : peak && steep < 0.5 ? G_CARET : flat;
    const edge = depth < Math.max(1, Math.abs(slope) * 0.5 + 0.6);
    if (O.kind === "far" || O.kind === "mid") {
      if (O.kind === "far" && O.horizon !== undefined && r >= O.horizon) {
        // The land below the horizon: a line along it, then fields in rows,
        // each field a run of one character.
        if (r === O.horizon) return put(k, hv < 0.75 ? G_H : G_SPACE, EDGE);
        if (row & 1) return put(k, hv < 0.15 ? G_DOT : G_SPACE, 2);
        switch (kind) {
          case CROP: return put(k, CROP_OF[C.dom[k]] || G_DASH, 1);
          case SAND: return put(k, hv < 0.5 ? G_TILDE : G_SPACE, 1);
          case SNOW: return put(k, G_SHADE, 1);
          case FOREST: case PINE: case LEAF:
            return put(k, K.mod(col + (row >> 1), 3) === 0 && hv < 0.7 ? pick(PINE_CH, K.hash2(col, row)) : G_SPACE, 1);
          default: return put(k, FIELD_OF[C.dom[k]] || G_DASH, 1);
        }
      }
      if (kind === FOREST) {
        // Forest: ▲ along its top, then a scatter of tree tops that thins
        // out further in.
        if (edge) return put(k, G_TRI, EDGE);
        const cd = r + 0.5 - ctop[k];
        return put(k, K.mod(col + (row & 1) * 2, 3) === 0 && hv < 0.9 - cd * 0.05 ? pick(PINE_CH, K.hash2(col, row)) : G_SPACE, cd < 4 ? 1 : 2);
      }
      switch (kind) {
        case ROCK: {
          // Mountains: \ hatching on slopes that fall to the right, fainter
          // / hatching on the rest, thinning out further down.
          if (edge) return put(k, eg, EDGE);
          const fade = 1 - K.smooth(5, 24, depth);
          if (slope > 0.05) {
            if (K.mod(col - row, 3) === 0 && hv < 0.85 * fade + 0.1) return put(k, G_BACK, 1);
            if (hv < 0.15 * fade) return put(k, pick(ROCK_CH, K.hash2(col, row)), 1);
          } else if (K.mod(col + row, 4) === 0 && hv < 0.6 * fade) return put(k, G_SLASH, 2);
          return put(k, hv < 0.05 ? pick(BASE_CH, K.hash2(row, col)) : G_SPACE, 2);
        }
        case SNOW:
          if (edge) return put(k, eg, EDGE);
          if (depth < 3) return put(k, G_SHADE, 1);
          return put(k, hv < 0.06 ? G_DOT : G_SPACE, 2);
        case SAND:
          if (edge) return put(k, Math.abs(slope) < 0.3 ? G_TILDE : eg, EDGE);
          if (K.mod(row + Math.floor(col / 5), 3) === 0 && hv < 0.45) return put(k, G_TILDE, 1);
          return put(k, hv < 0.04 ? G_DOT : G_SPACE, 1);
        case MESA:
          if (edge) return put(k, Math.abs(slope) < 0.3 ? G_H : eg, EDGE);
          if (!(row & 1)) return put(k, G_H, 1);
          return put(k, K.mod(col * 7 + row, 5) === 0 ? G_DOT : G_SPACE, 0);
      }
      if (O.kind === "far" || kind === PINE || kind === LEAF) {
        // Distant hills.
        if (edge) return put(k, eg, EDGE);
        const fade = 1 - K.smooth(4, 16, depth);
        if (slope > 0.05) {
          if (K.mod(col - row, 3) === 0 && hv < 0.8 * fade + 0.15) return put(k, G_BACK, 2);
        } else if (K.mod(col + row, 4) === 0 && hv < 0.6 * fade + 0.1) return put(k, G_SLASH, 2);
        return put(k, hv < 0.04 ? pick(BASE_CH, K.hash2(row, col)) : G_SPACE, 2);
      }
      // Farmland: a row of each field's crop, then a row left bare.
      if (edge) return put(k, Math.abs(slope) < 0.3 ? G_US : eg, EDGE);
      if (kind === CROP) {
        if (row & 1) return put(k, hv < 0.3 ? G_DOT : G_SPACE, 2);
        return put(k, hv < 0.9 ? CROP_OF[C.dom[k]] || G_DASH : G_SPACE, 0);
      }
      const style = K.hash2(Math.floor(col / 10) * 31 + Math.floor(depth / 2.5), 3);
      if (style < 0.25) return put(k, G_SPACE, 0);
      if (!(row & 1)) return put(k, pick(FIELD_CH, style), 0);
      return put(k, style > 0.6 && hv < 0.5 ? G_DOT : G_SPACE, 2);
    }
    // Near the road.
    const road = O.kind === "road";
    const wi = road ? r - O.fgRow : Math.floor(depth);
    const fade = road ? 1 - K.smooth(5, Math.max(6, O.fgRows), wi) : 1;
    if (!road && edge) return put(k, eg, 0);
    switch (kind) {
      case GRASS:
        if (hv < 0.006 * fade) {
          put(k, G_STAR, 0);
          C.fg[k] = K.hash2(col, 5) < 0.5 ? M.flowerY : M.flowerR;
          return;
        }
        return put(k, hv < Math.max(0.12, 0.55 - wi * 0.035) * fade ? pick(FERN_CH, K.hash2(wi, col)) : G_SPACE, wi < 3 ? 0 : 1);
      case CROP:
        if (row & 1) return put(k, hv < 0.25 * fade ? G_US : G_SPACE, 2);
        if (hv < 0.009) {
          put(k, G_STAR, 0);
          C.fg[k] = M.flowerR;
          return;
        }
        return put(k, hv < 0.65 * fade ? pick(CROP_CH, K.hash2(wi, col)) : G_SPACE, wi < 4 ? 1 : 0);
      case SAND:
        if (K.hash2(Math.floor(col / 3), row + 221) < 0.3 * fade) return put(k, G_TILDE, wi < 4 ? 1 : 0);
        return put(k, K.hash2(col, row + 222) < 0.03 * fade ? G_DOT : G_SPACE, 1);
      case SNOW:
        if (K.hash2(Math.floor(col / 4), row + 272) < 0.35 * fade) return put(k, G_H, wi < 4 ? 1 : 2);
        return put(k, hv < 0.08 * fade ? G_DOT : G_SPACE, 1);
      case ROCK:
        // Rocky ground: ledges and stones.
        if (K.mod(row + (col >> 3), 3) === 0 && hv < 0.7) return put(k, G_H, 1);
        return put(k, hv < 0.3 ? pick(BASE_CH, K.hash2(col, row)) : G_SPACE, 1);
      case MESA:
        return put(k, row & 1 ? G_SPACE : G_H, 1);
    }
  }

  // Water: a line along its top, then short lines of swell, more of them
  // further from the shore. Ice has cracks and drifts of snow.
  function water(k, c, r, col, row) {
    C.bg[k] = 0;
    C.mode[k] = 1;
    const hv = K.hash3(col, row, 1900);
    const wi = Math.floor(r + 0.5 - top[k]);
    const road = O.kind === "road";
    const fade = road ? 1 - K.smooth(5, Math.max(6, O.fgRows), r - O.fgRow) : 1;
    if (cl[k] === ICE) {
      C.fg[k] = M.snow;
      if (wi === 0) return put(k, hv < 0.5 ? G_DOT : G_SPACE, 2);
      if (hv < 0.02 * fade) return put(k, hv < 0.01 ? G_SLASH : G_BACK, 0);
      if (K.hash2(Math.floor(col / 4), row + 272) < 0.35 * fade) return put(k, G_H, wi < 4 ? 1 : 2);
      return put(k, hv < 0.08 * fade ? G_DOT : G_SPACE, 1);
    }
    if (C.dom[k] === M.foam) return put(k, hv < 0.5 ? G_TILDE : G_DASH, 0);
    C.fg[k] = M.water;
    if (wi === 0) return put(k, K.hash2(col >> 2, 5) < 0.8 ? G_H : G_DASH, EDGE);
    const segLen = 2 + Math.floor(K.hash2(row, 71) * 6);
    const hs = K.hash2(Math.floor(col / segLen), row + 131);
    const dens = Math.min(0.4, 0.12 + wi * 0.03) * fade;
    if (hs < dens) return put(k, pick(SWELL_CH, hs / dens), wi < 4 ? 1 : 0);
    return put(k, hv < 0.06 * fade ? G_DOT : G_SPACE, 1);
  }

  // ------------------------------------------------- road and fences ---
  function set(cells, k, g, m, level, mode) {
    cells.glyph[k] = g;
    cells.fg[k] = m;
    cells.dom[k] = m;
    cells.bg[k] = 0;
    cells.level[k] = level;
    cells.mode[k] = mode;
    cells.top[k] = 0;
  }
  // The material of the road's top edge, by surface.
  const ROAD_EDGE = { city: M.kerb, village: M.kerb, bridge: M.steelD, mountain: M.rock, desert: M.sand, shore: M.sand, forest: M.soilD };
  // The surfaces with a centre line.
  const CENTRE = { desert: 1, bridge: 1, city: 1, shore: 1, forest: 1, mountain: 1 };
  // Sets cell k of the road, as the first drive drew it: an edge on top,
  // specks, dashes along the middle, and a verge, barrier or kerb at the
  // bottom that depends on the surface. `ri` is the row from the top of the
  // road, `n` the number of rows and `ci` the row of the centre line.
  // `joint` is "joint" where one surface meets the next, or "chequer" where
  // a rally stage starts or ends.
  A.road = function (cells, k, kind, ri, n, ci, col, joint) {
    const first = ri === 0, last = ri === n - 1;
    cells.bits[k] = 15;
    if (joint === "chequer") return set(cells, k, (col + ri) & 1 ? G_CHK_A : G_CHK_B, M.dark, 0, 5);
    if (joint) return set(cells, k, first || last ? G_JOINT : G_HPIPE, M.asphaltD, 1, 5);
    const hv = K.hash2(col, 88 + ri);
    switch (kind) {
      case "gravel":
        // The rally stage: dirt and sand with two ruts, on a fill of sand.
        if (first || last) set(cells, k, hv < 0.4 ? pick(BASE_CH, hv * 2.5) : G_SPACE, M.soil, 1, 1);
        else if ((ri === 1 || ri === n - 2) && K.mod(col + ri * 5, 13) < 9) set(cells, k, G_H, M.soilD, 1, 1);
        else set(cells, k, hv < 0.3 ? (hv < 0.12 ? G_TILDE : G_DOT) : G_SPACE, M.sandD, 1, 1);
        cells.bg[k] = M.sand;
        return;
      case "snow":
        // Packed snow with a bank on either side.
        if (first || last) return set(cells, k, hv < 0.55 ? G_SHADE : G_DOT, M.snowS, 2, 1);
        if (ri === ci) return set(cells, k, K.mod(col, 7) < 3 ? G_DASH : G_SPACE, M.lineY, 1, 1);
        return set(cells, k, hv < 0.06 ? G_DOT : G_SPACE, M.snow, 1, 1);
      case "motorway":
        // Lanes and a crash barrier.
        if (first) return set(cells, k, G_HH, M.concreteD, 0, 5);
        if (last) return set(cells, k, K.mod(col, 6) === 0 ? G_POST : G_HH, M.metal, 0, 5);
        if (ri === ci) return set(cells, k, K.mod(col, 8) < 4 ? G_HEAVY : G_SPACE, M.line, 1, 5);
        return set(cells, k, hv < 0.04 ? G_DOT : G_SPACE, M.asphaltL, 2, 1);
    }
    if (first) return set(cells, k, K.hash2(col >> 2, 91) < 0.85 ? G_H : G_HH, ROAD_EDGE[kind] || M.asphaltL, kind === "desert" ? 2 : 0, 5);
    if (last) {
      switch (kind) {
        case "city": return set(cells, k, K.mod(col, 5) === 0 ? G_POST : G_HH, M.kerb, 0, 5);
        case "shore": return set(cells, k, K.mod(col, 5) === 0 ? G_POST : G_H, M.kerb, 1, 5);
        case "bridge": return set(cells, k, col & 1 ? G_SLASH : G_BACK, M.steel, 1, 1);
        case "mountain": return set(cells, k, K.mod(col, 4) === 0 ? G_DTEE : G_HH, M.rock, 1, 5);
        case "village": return set(cells, k, G_OPEN, M.kerb, K.mod(col, 3) === 0 ? 1 : 2, 5);
        case "desert": return hv < 0.2 ? set(cells, k, pick(BASE_CH, hv * 5), M.sandD, 1, 1) : set(cells, k, G_H, M.sand, 2, 5);
        default: return set(cells, k, K.mod(col, 9) < 7 ? G_H : G_DASH, M.asphaltL, 2, 5);
      }
    }
    if (ri === ci && CENTRE[kind]) return set(cells, k, K.mod(col, 7) < 3 ? G_DASH : G_SPACE, M.lineY, 0, 1);
    return set(cells, k, hv < 0.04 ? G_DOT : G_SPACE, M.asphaltL, 2, 1);
  };

  // Sets cell k to the fence along the front of the roadside, in one row as
  // the first drive drew it. Returns false where there is no fence.
  A.fence = function (cells, k, kind, col) {
    switch (kind) {
      case "picket": set(cells, k, K.mod(col, 3) === 0 ? G_CROSS : G_H, M.plasterW, 1, 5); return true;
      case "rail": set(cells, k, K.mod(col, 4) === 0 ? G_CROSS : G_H, M.wood, 0, 5); return true;
      case "tape":
        if (K.mod(col, 12) === 0) set(cells, k, G_CROSS, M.woodD, 1, 5);
        else if ((col >> 1) & 1) set(cells, k, G_TAPE, M.signRed, 0, 1);
        else set(cells, k, G_TAPE, M.tape, 0, 5);
        return true;
      case "guard": set(cells, k, K.mod(col, 5) === 0 ? G_RAIL : G_HH, M.metal, 0, 5); return true;
      case "railing": set(cells, k, K.mod(col, 3) === 0 ? G_TEE : G_H, M.metalD, 0, 5); return true;
      case "wall": set(cells, k, K.mod(col, 4) === 0 ? G("╩") : G_HH, M.rock, 1, 5); return true;
      case "hedge": set(cells, k, pick(CANOPY_CH, K.hash2(col, 77)), K.hash2(col, 78) < 0.3 ? M.leafL : M.leaf, 0, 1); return true;
    }
    return false;
  };
  // A red and white snow pole, `h` cells up from the ground.
  A.pole = function (cells, k, h) {
    set(cells, k, G_HALF, h & 1 ? M.white : M.signRed, 0, 1);
  };

  // Sets text in characters over a converted picture: `runs` are
  // { text, x, y, w, mat } in CSS px from the picture's top left, centred in
  // their width. On a sign the letters keep the sign's colour behind them;
  // anywhere else they are set in ink.
  A.setText = function (cells, runs, ox, oy) {
    for (let i = 0; i < runs.length; i++) {
      const t = runs[i];
      const chars = Array.from(t.text);
      const row = Math.floor((t.y + oy) / CHc);
      if (row < 0 || row >= cells.rows) continue;
      const start = Math.round((t.x + ox + (t.w - chars.length * CWc) / 2) / CWc);
      for (let j = 0; j < chars.length; j++) {
        const c = start + j;
        if (c < 0 || c >= cells.cols) continue;
        const k = row * cells.cols + c;
        const under = cells.dom[k];
        const sign = under && FAMILY[under].cls === SIGN;
        const bg = cells.bg[k] || cells.fg[k];
        cells.glyph[k] = G(chars[j]);
        cells.bg[k] = sign ? bg : 0;
        cells.fg[k] = t.mat;
        cells.level[k] = 0;
        cells.mode[k] = sign ? 4 : 6;
      }
    }
  };

  // -------------------------------------------------------------- paint ---
  // The three strengths: how far a character's colour is mixed toward its
  // row's tone.
  const LEVEL = [0, 0.15, 0.3];
  // The colour each material washes with: one per family, so a mass is one
  // even tint whatever its shading.
  const WASH_OF = new Uint8Array(256);
  for (let i = 0; i < 256; i++) WASH_OF[i] = i;
  [["grass", "grassL grassD grassDD"], ["rock", "rockD rockL"], ["snow", "snowS"], ["sand", "sandD sandL"],
    ["mesa", "mesaD mesaL"], ["rape", "rapeD"], ["wheat", "wheatD"], ["soil", "soilD"], ["water", "waterD waterL foam"],
    ["pine", "pineL pineD"], ["pitchGrass", "pitchGrassL pitchLine"], ["woods", "woodsL woodsD woodsDD"], ["leaf", "leafL leafD leafDD bushD"],
    ["roof", "roofD roofL"], ["slate", "slateD"], ["brick", "brickD"], ["concrete", "concreteD concreteL kerb"],
    ["metal", "metalD metalL"], ["steel", "steelD"], ["wood", "woodD woodL"]].forEach(function (e) {
    e[1].split(" ").forEach(function (n) { if (M[n]) WASH_OF[M[n]] = M[e[0]]; });
  });
  // How far a wash moves a cell from its row's tone toward the colour of its
  // mass: none, land and water, trees, walls and roofs.
  const WASH = [0, 0.22, 0.3, 0.38];
  // The ink levels clouds use, as shares of the ink colour.
  const INK = [1, 0.8, 0.44];
  // How far walls, fences and kerbs are mixed toward ink, so pale walls show
  // on a pale sky.
  const LINE_INK = 0.5;
  function rgbOf(lut, m, out) {
    const v = lut[m];
    out[0] = v & 255;
    out[1] = (v >>> 8) & 255;
    out[2] = (v >>> 16) & 255;
    return out;
  }
  const mc = [0, 0, 0];
  let tmp = null, tmpX = null;
  // Paints converted cells into a canvas at one CSS pixel per pixel. `rows`
  // gives each cell row's tone, whether it is dark and how far it has faded
  // into the page. `base` is the plane's strength, `ink` the ink colours for
  // light and dark rows, and `solidBack` fills every occupied cell with its
  // row's tone, so a near plane hides what is behind it cell by cell. A
  // blank cell the picture only partly covers is left clear.
  // Cell modes: 1 a material's colour, 2 a thin line, 4 a letter on a sign,
  // 5 a line mixed toward ink, 6 a letter in ink.
  A.paint = function (cells, lut, target, rows, base, ink, snow, solidBack) {
    const cols = cells.cols, nrows = cells.rows;
    const W = cols * CWc, H = nrows * CHc;
    if (!target.mask) {
      target.mask = document.createElement("canvas");
      target.mask.width = W;
      target.mask.height = H;
      const mx = target.mask.getContext("2d");
      for (let k = 0; k < cols * nrows; k++) {
        const g = cells.glyph[k];
        if (!cells.fg[k] || g === G_SPACE) continue;
        mx.drawImage(atlas, g * CWc, 0, CWc, CHc, (k % cols) * CWc, Math.floor(k / cols) * CHc, CWc, CHc);
      }
      target.bgCv = document.createElement("canvas");
      target.bgCv.width = cols;
      target.bgCv.height = nrows;
      target.fgCv = document.createElement("canvas");
      target.fgCv.width = cols;
      target.fgCv.height = nrows;
      target.cv = document.createElement("canvas");
      target.cv.width = W;
      target.cv.height = H;
    }
    const bgx = target.bgCv.getContext("2d"), fgx = target.fgCv.getContext("2d");
    const bgI = bgx.createImageData(cols, nrows), fgI = fgx.createImageData(cols, nrows);
    const bd = bgI.data, fd = fgI.data;
    for (let k = 0; k < cols * nrows; k++) {
      const f = cells.fg[k];
      if (!f) continue;
      const r = Math.floor(k / cols);
      const row = rows[r];
      const tone = row.tone;
      const p = k * 4;
      const fam = FAMILY[f];
      // The fill: the colour of a sign behind a letter, a wash of the
      // mass's colour, or the row's tone.
      if (cells.bg[k]) {
        rgbOf(lut, cells.bg[k], mc);
        colour(mc, row, base, 0);
        bd[p] = mc[0]; bd[p + 1] = mc[1]; bd[p + 2] = mc[2]; bd[p + 3] = 255;
      } else if (cells.wash[k]) {
        rgbOf(lut, WASH_OF[cells.dom[k]], mc);
        const w = WASH[cells.wash[k]] * (1 - 0.15 * base) * (1 - row.fade);
        for (let j = 0; j < 3; j++) bd[p + j] = tone[j] + (mc[j] - tone[j]) * w;
        bd[p + 3] = 255;
      } else if (solidBack && (cells.bits[k] === 15 || cells.glyph[k] !== G_SPACE)) {
        bd[p] = tone[0]; bd[p + 1] = tone[1]; bd[p + 2] = tone[2]; bd[p + 3] = 255;
      }
      const md = cells.mode[k];
      if (fam.ink !== undefined) {
        // Clouds in ink, which turns pale on dark rows and warm at dusk.
        const ic = row.dark ? ink.light : ink.dark;
        const a = INK[fam.ink] * (1 - LEVEL[Math.min(2, base)] * 0.5);
        for (let j = 0; j < 3; j++) mc[j] = tone[j] + ((ink.dusk ? ink.dusk[j] * ink.duskK + ic[j] * (1 - ink.duskK) : ic[j]) - tone[j]) * a;
      } else {
        rgbOf(lut, f, mc);
        if (md === 5 || md === 6) {
          const ic = row.dark ? ink.light : ink.dark;
          const t = md === 6 ? 1 : LINE_INK;
          for (let j = 0; j < 3; j++) mc[j] += (ic[j] - mc[j]) * t;
        }
        const lv = cells.level[k];
        // People, animals and other solid blocks read by their shape, so they
        // keep close to their own colours.
        const solid = fam.cls === BEING || fam.cls === BLOCK;
        colour(mc, row, lv === EDGE ? Math.max(0, base - 1) : Math.min(2, base + lv), md === 4 || md === 6 ? 0 : 1, solid);
      }
      fd[p] = mc[0]; fd[p + 1] = mc[1]; fd[p + 2] = mc[2]; fd[p + 3] = 255;
      if (snow && snow.amt > 0.01 && cells.top[k]) {
        // Snow on a roof, a branch or a fence: the cell turns toward white.
        const t = Math.min(1, snow.amt * 1.4);
        for (let j = 0; j < 3; j++) fd[p + j] += (snow.rgb[j] - fd[p + j]) * t;
      }
    }
    bgx.putImageData(bgI, 0, 0);
    fgx.putImageData(fgI, 0, 0);
    if (!tmp || tmp.width < W || tmp.height < H) {
      tmp = document.createElement("canvas");
      tmp.width = Math.max(W, tmp ? tmp.width : 0);
      tmp.height = Math.max(H, tmp ? tmp.height : 0);
      tmpX = tmp.getContext("2d");
    }
    tmpX.globalCompositeOperation = "source-over";
    tmpX.imageSmoothingEnabled = false;
    tmpX.clearRect(0, 0, W, H);
    tmpX.drawImage(target.fgCv, 0, 0, W, H);
    tmpX.globalCompositeOperation = "destination-in";
    tmpX.drawImage(target.mask, 0, 0);
    tmpX.globalCompositeOperation = "source-over";
    const ox = target.cv.getContext("2d");
    ox.imageSmoothingEnabled = false;
    ox.clearRect(0, 0, W, H);
    ox.drawImage(target.bgCv, 0, 0, W, H);
    ox.drawImage(tmp, 0, 0, W, H, 0, 0, W, H);
    return target.cv;
  };

  // A character's colour on its row: brighter on a dark row, as the first
  // drive's night colours were, then mixed toward the row's tone by its
  // strength and by how far the row has faded into the page.
  function colour(c, row, level, lift, keep) {
    if (row.dark && lift) {
      c[0] += (255 - c[0]) * 0.22;
      c[1] += (255 - c[1]) * 0.22;
      c[2] += (255 - c[2]) * 0.22;
    }
    const t = 1 - (1 - LEVEL[level]) * (1 - row.fade);
    c[0] += (row.tone[0] - c[0]) * t;
    c[1] += (row.tone[1] - c[1]) * t;
    c[2] += (row.tone[2] - c[2]) * t;
    if (lift && A.ink) floor(c, row, (keep ? 0.12 : MIN_CONTRAST[level]) * (1 - row.fade));
    return c;
  }
  // A character is at least this much lighter or darker than its row at
  // each strength, whichever way the row's ink lies. Pale walls, sand and
  // snow darken on a pale sky, and dark ones lighten at night.
  const MIN_CONTRAST = [0.6, 0.5, 0.4];
  function floor(c, row, want) {
    const lt = K.lum(row.tone), lc = K.lum(c);
    if (Math.abs(lc - lt) >= want) return;
    const ic = row.dark ? A.ink.light : A.ink.dark;
    const li = K.lum(ic);
    if (Math.abs(li - lc) < 0.01) return;
    const target = row.dark ? Math.min(1, lt + want) : Math.max(0, lt - want);
    const t = K.clamp((target - lc) / (li - lc), 0, 1);
    c[0] += (ic[0] - c[0]) * t;
    c[1] += (ic[1] - c[1]) * t;
    c[2] += (ic[2] - c[2]) * t;
  }
  A.colour = colour;
  A.LEVEL = LEVEL;

  // A single character in a colour, cached. Used for stars, rain, dust and
  // lights, which are drawn on their own every frame.
  const stampCache = new Map();
  A.stamp = function (ch, rgb) {
    const key = ch + (rgb[0] | 0) + "," + (rgb[1] | 0) + "," + (rgb[2] | 0);
    let cv = stampCache.get(key);
    if (cv) return cv;
    if (stampCache.size > 800) stampCache.clear();
    cv = document.createElement("canvas");
    cv.width = CWc;
    cv.height = CHc;
    const x = cv.getContext("2d");
    x.fillStyle = "rgb(" + (rgb[0] | 0) + "," + (rgb[1] | 0) + "," + (rgb[2] | 0) + ")";
    if (!GI.has(ch)) {
      // A character outside the atlas is set from the font directly.
      x.font = '11px "Departure Mono", ui-monospace, Menlo, monospace';
      x.textBaseline = "alphabetic";
      x.fillText(ch, 0, 11);
      stampCache.set(key, cv);
      return cv;
    }
    x.fillRect(0, 0, CWc, CHc);
    x.globalCompositeOperation = "destination-in";
    x.drawImage(atlas, G(ch) * CWc, 0, CWc, CHc, 0, 0, CWc, CHc);
    stampCache.set(key, cv);
    return cv;
  };
})();
