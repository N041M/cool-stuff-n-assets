// The static scene, for the bake pass: geometry and materials. Comes after
// common.glsl, and servitor.glsl follows it.

#define M_STONE 1.0
#define M_TRACERY 2.0
#define M_GLASS 3.0
#define M_GLASS_END 4.0
#define M_IRON 5.0
#define M_STATUE 6.0
#define M_ALTAR 7.0
#define M_CLOTH 8.0
// servitor.glsl uses 20 to 29
#define M_CANDLE 100.0

vec2 opU(vec2 a, vec2 b) {
  return a.x < b.x ? a : b;
}

vec2 servitor(vec3 p, vec2 res);

// Positive inside the hall: floor, walls, vault, the end wall and a wall behind the camera.
float sdRoom(vec3 p) {
  float ax = abs(p.x);
  float walls = p.y < SPRING ? HALL_W - ax : 2.0 * HALL_W - length(vec2(ax + HALL_W, p.y - SPRING));
  return min(min(walls, p.y), min(p.z - END_Z, Z0 + 5.0 - p.z));
}

// A compound pier. q.x is the distance in from the wall face and q.z is
// measured along the hall from the pier's centre line.
float sdPier(vec3 q) {
  float d = sdBox2(vec2(q.x - 0.28, q.z), vec2(0.34, 0.4));
  d = min(d, length(vec2(q.x - 0.68, q.z)) - 0.15);
  d = min(d, length(vec2(q.x - 0.3, abs(q.z) - 0.43)) - 0.12);
  d = min(d, length(vec2(q.x - 0.6, abs(q.z) - 0.31)) - 0.07);
  d = max(d, q.y - SPRING);
  float plinth = sdRoundBox(vec3(q.x - 0.36, q.y - 0.2, q.z), vec3(0.52, 0.2, 0.62), 0.02);
  float roll = sdRoundBox(vec3(q.x - 0.34, q.y - 0.46, q.z), vec3(0.47, 0.07, 0.57), 0.06);
  float bell = sdRoundBox(vec3(q.x - 0.34, q.y - (SPRING - 0.25), q.z), vec3(0.44, 0.2, 0.54), 0.08);
  float abacus = sdRoundBox(vec3(q.x - 0.4, q.y - (SPRING - 0.02), q.z), vec3(0.56, 0.07, 0.65), 0.02);
  return min(min(d, min(plinth, roll)), min(bell, abacus));
}

// Hooded stone figure resting its hands on a sword. q.x points out of the
// niche, and the origin is on the niche floor.
float sdStatue(vec3 q) {
  float robe = sdRoundCone(q, vec3(0.0, 0.05, 0.0), vec3(0.0, 2.1, 0.0), 0.3, 0.19);
  float ang = atan(q.z, q.x);
  robe += 0.014 * sin(ang * 9.0 + sin(ang * 3.0)) * smoothstep(2.1, 0.1, q.y);
  float shoulders = sdEllipsoid(q - vec3(0.0, 2.15, 0.0), vec3(0.17, 0.14, 0.31));
  float hood = sdEllipsoid(q - vec3(0.02, 2.5, 0.0), vec3(0.17, 0.21, 0.16));
  hood = smax(hood, -sdEllipsoid(q - vec3(0.17, 2.46, 0.0), vec3(0.08, 0.13, 0.1)), 0.02);
  float body = smin(robe, shoulders, 0.12);
  body = smin(body, hood, 0.06);
  body = smin(body, sdEllipsoid(q - vec3(0.24, 1.72, 0.0), vec3(0.09, 0.08, 0.13)), 0.05);
  float blade = sdBox(q - vec3(0.3, 1.0, 0.0), vec3(0.012, 0.64, 0.045));
  float guard = sdBox(q - vec3(0.3, 1.68, 0.0), vec3(0.025, 0.022, 0.19));
  float grip = sdCapsule(q, vec3(0.3, 1.68, 0.0), vec3(0.3, 1.9, 0.0), 0.022);
  float pommel = length(q - vec3(0.3, 1.93, 0.0)) - 0.04;
  return min(body, min(min(blade, guard), min(grip, pommel)));
}

float sdAltar(vec3 p, out float cloth) {
  vec3 q = p - vec3(0.0, 0.0, ALTAR_Z);
  float platform = sdBox(q - vec3(0.0, 0.09, -0.3), vec3(2.0, 0.09, 1.3));
  float body = sdRoundBox(q - vec3(0.0, 0.55, 0.0), vec3(1.25, 0.47, 0.42), 0.02);
  float top = sdRoundBox(q - vec3(0.0, ALTAR_TOP - 0.04, 0.0), vec3(1.38, 0.04, 0.5), 0.015);
  cloth = sdBox(q - vec3(0.0, 0.64, 0.43), vec3(0.9, 0.36, 0.008));
  return min(platform, min(body, top));
}

// The iron rack that holds the votive cups. q.x points into the hall.
float sdRack(vec3 p) {
  vec3 q = vec3(RACK_POS.x - p.x, p.y, p.z - RACK_POS.y);
  float d = 1e3;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec3 s = q - vec3(0.17 - fi * 0.15, 0.788 + fi * 0.14, 0.0);
    d = min(d, sdBox(s, vec3(0.065, 0.012, 0.57)));
    d = min(d, sdBox(s - vec3(0.062, 0.018, 0.0), vec3(0.004, 0.012, 0.57)));
  }
  vec3 e = vec3(q.x, q.y, abs(q.z) - 0.58);
  d = min(d, sdBox(e - vec3(0.21, 0.4, 0.0), vec3(0.013, 0.4, 0.013)));
  d = min(d, sdBox(e - vec3(-0.14, 0.62, 0.0), vec3(0.013, 0.62, 0.013)));
  d = min(d, sdCapsule(e, vec3(0.21, 0.8, 0.0), vec3(-0.14, 1.22, 0.0), 0.01));
  d = min(d, length(e - vec3(-0.14, 1.27, 0.0)) - 0.026);
  d = min(d, sdBox(q - vec3(0.035, 0.14, 0.0), vec3(0.19, 0.01, 0.58)));
  return d;
}

// An iron pricket stand: tripod, pole and drip pan.
float sdStand(vec3 p, vec4 s) {
  vec3 q = p - vec3(s.x, 0.0, s.z);
  float h = s.w;
  float d = sdCapsule(q, vec3(0.0, 0.18, 0.0), vec3(0.0, h - 0.02, 0.0), 0.016);
  d = min(d, sdCylY(q - vec3(0.0, h - 0.012, 0.0), 0.085, 0.006) - 0.004);
  d = min(d, sdEllipsoid(q - vec3(0.0, h * 0.55, 0.0), vec3(0.035, 0.05, 0.035)));
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.0944 + 0.4;
    d = min(d, sdCapsule(q, vec3(0.0, 0.22, 0.0), vec3(cos(a) * 0.22, 0.015, sin(a) * 0.22), 0.011));
  }
  return d;
}

float sdCandle(vec3 p, int i) {
  vec4 a = CANDLE_P[i];
  vec4 b = CANDLE_Q[i];
  vec3 q = p - a.xyz;
  float r = a.w, h = b.x;
  if (b.y > 2.5) return sdCylY(q - vec3(0.0, h * 0.5, 0.0), r - 0.003, h * 0.5 - 0.003) - 0.003;
  float seed = hash11(float(i) * 7.13 + 1.0);
  float d = sdCylY(q - vec3(0.0, h * 0.5, 0.0), r - 0.005, h * 0.5 - 0.005) - 0.005;
  d = smax(d, -(length(q - vec3(0.0, h + r * 0.6, 0.0)) - r * 0.78), 0.006);
  for (int j = 0; j < 3; j++) {
    float aj = seed * 6.2831 + float(j) * 2.1;
    float len = h * (0.12 + 0.4 * hash11(seed * 31.0 + float(j)));
    vec3 c0 = vec3(cos(aj) * r * 0.97, h - 0.008, sin(aj) * r * 0.97);
    d = smin(d, sdCapsule(q, c0, c0 - vec3(0.0, len, 0.0), 0.0035 + 0.003 * hash11(seed * 13.0 + float(j))), 0.008);
  }
  if (b.y < 0.5) d = smin(d, sdEllipsoid(q, vec3(r * 2.0, 0.012, r * 2.0)), 0.015);
  return d;
}

vec2 map(vec3 p) {
  float ax = abs(p.x);
  float kb = clamp(floor((Z0 - p.z) / BAY), 0.0, float(NBAYS - 1));
  float zb = Z0 - (kb + 0.5) * BAY;
  float kp = clamp(floor((Z0 - p.z) / BAY + 0.5), 0.0, float(NBAYS));
  float zp = Z0 - kp * BAY;
  vec2 wb = vec2(p.z - zb, p.y);

  // the shell, with openings cut into it
  float d = sdRoom(p);
  if (p.x > 0.0) {
    float splay = clamp((XG - p.x) / (WALL_T * 0.5), 0.0, 1.0);
    d = max(d, -max(sdSideOpening(wb, splay), abs(p.x - XG) - WALL_T * 0.5 - 0.05));
  } else {
    d = max(d, -max(sdLancet(wb, 0.75, 0.55, 2.7), abs(p.x + HALL_W + 0.3) - 0.35));
  }
  if (p.z < END_Z + 0.3) {
    float splay = clamp((p.z - ZG) / (WALL_T * 0.5), 0.0, 1.0);
    d = max(d, -max(sdEndOpening(p.xy, splay), abs(p.z - ZG) - WALL_T * 0.5 - 0.05));
  }
  vec2 res = vec2(d, M_STONE);

  // tracery and glass
  if (p.x > HALL_W) {
    float g = sdSideGlass(wb);
    float slab = abs(p.x - XG);
    res = opU(res, vec2(max(slab - 0.08, -g), M_TRACERY));
    res = opU(res, vec2(max(slab - 0.01, g), M_GLASS));
  }
  if (p.z < END_Z) {
    float g = sdEndGlass(p.xy);
    float slab = abs(p.z - ZG);
    res = opU(res, vec2(max(slab - 0.09, -g), M_TRACERY));
    res = opU(res, vec2(max(slab - 0.01, g), M_GLASS_END));
  }

  // piers on both walls
  res = opU(res, vec2(sdPier(vec3(HALL_W - ax, p.y, p.z - zp)), M_STONE));

  // ribs: transverse at the piers, diagonal and ridge across each bay, and a boss where they cross
  if (p.y > SPRING - 0.3) {
    float band = length(vec2(ax + HALL_W, p.y - SPRING)) - (2.0 * HALL_W - 0.13);
    float tz = abs(p.z - zp) - 0.15;
    float tb = abs(band) - 0.13;
    float ribs = length(max(vec2(tz, tb), 0.0)) + min(max(tz, tb), 0.0) - 0.02;
    vec2 dq = vec2(ax, abs(p.z - zb));
    float diag = abs(dq.x * (BAY * 0.5) - dq.y * HALL_W) / length(vec2(BAY * 0.5, HALL_W));
    ribs = min(ribs, max(diag - 0.09, abs(band + 0.03) - 0.09));
    ribs = min(ribs, max(ax - 0.1, abs(band + 0.03) - 0.1));
    ribs = min(ribs, length(vec3(p.x, p.y - (SPRING + HALL_W * 1.7320508 - 0.18), p.z - zb)) - 0.24);
    res = opU(res, vec2(ribs, M_STONE));
  }

  // statues in the niches and a sill under each one
  if (p.x < -HALL_W + 0.4) {
    float sill = sdRoundBox(vec3(p.x + HALL_W - 0.12, p.y - 0.5, p.z - zb), vec3(0.16, 0.05, 0.82), 0.01);
    res = opU(res, vec2(sill, M_STONE));
    vec3 q = vec3(p.x + HALL_W + 0.38, p.y - 0.55, p.z - zb);
    if (sdBox(q - vec3(0.0, 1.7, 0.0), vec3(0.45, 1.8, 0.45)) < res.x) res = opU(res, vec2(sdStatue(q), M_STATUE));
  }

  // altar
  if (p.z < ALTAR_Z + 1.2) {
    float cloth;
    res = opU(res, vec2(sdAltar(p, cloth), M_ALTAR));
    res = opU(res, vec2(cloth, M_CLOTH));
  }

  // runner carpet
  float carpet = sdBox(vec3(p.x, p.y - 0.007, p.z - (END_Z + 2.4 + Z0 + 4.0) * 0.5), vec3(0.85, 0.007, (Z0 + 4.0 - END_Z - 2.4) * 0.5)) - 0.003;
  res = opU(res, vec2(carpet, M_STONE));

  // iron
  if (sdBox(vec3(RACK_POS.x - p.x - 0.03, p.y - 0.66, p.z - RACK_POS.y), vec3(0.3, 0.68, 0.66)) < res.x) {
    res = opU(res, vec2(sdRack(p), M_IRON));
  }
  for (int s = 0; s < N_STANDS; s++) {
    res = opU(res, vec2(sdStand(p, STANDS[s]), M_IRON));
  }

  // candles, cluster by cluster
  for (int c = uZero; c < N_CLUSTERS; c++) {
    vec4 b = CLUSTER_B[c];
    if (length(p - b.xyz) - b.w > res.x) continue;
    ivec2 rg = CLUSTER_R[c];
    for (int i = rg.x; i < rg.x + rg.y; i++) {
      float dc = sdCandle(p, i);
      if (dc < res.x) res = vec2(dc, M_CANDLE + float(i));
    }
  }

  res = servitor(p, res);
  return res;
}

/* ───────────── materials ───────────── */

struct Surf {
  vec3 alb;
  float rough;
  float metal;
  vec3 emit;  // light the surface gives off on its own
  float glow; // candle light the surface gives off (wax, glass cups)
  float group;
  float gloss; // how strongly the floor mirrors the flames
  float wrap;  // light wrapping round translucent wax and cloth
};

Surf servitorSurface(vec3 p, inout vec3 n, float id);

// Ashlar courses: (block hash, distance to the nearest joint).
vec2 ashlar(vec2 uv, vec2 size) {
  float row = floor(uv.y / size.y);
  float u = uv.x / size.x + mod(row, 2.0) * 0.5;
  vec2 f = vec2(fract(u) * size.x, fract(uv.y / size.y) * size.y);
  float joint = min(min(f.x, size.x - f.x), min(f.y, size.y - f.y));
  return vec2(hash12(vec2(floor(u), row)), joint);
}

uniform vec3 uAccent;

Surf surface(vec3 p, inout vec3 n, float id) {
  Surf s = Surf(vec3(0.2), 0.8, 0.0, vec3(0.0), 0.0, 0.0, 0.0, 0.0);
  if (id >= M_CANDLE) {
    int i = int(id - M_CANDLE + 0.5);
    vec4 a = CANDLE_P[i];
    vec4 b = CANDLE_Q[i];
    s.group = b.z;
    if (b.y > 2.5) {
      s.alb = uAccent * 0.95;
      s.rough = 0.12;
      s.glow = b.w * 1.6 * (0.6 + 0.4 * smoothstep(0.0, b.x, p.y - a.y));
      return s;
    }
    float y = p.y - a.y;
    s.alb = vec3(0.42, 0.36, 0.27) * (0.9 + 0.1 * noise3(p * 90.0));
    s.rough = 0.45;
    s.wrap = 0.3;
    s.glow = b.w * (0.015 + 0.45 * pow(smoothstep(b.x - 0.06, b.x, y), 2.0));
    return s;
  }
  if (id >= 20.0) return servitorSurface(p, n, id);

  if (id == M_GLASS) {
    float k = floor((Z0 - p.z) / BAY);
    vec2 w = vec2(p.z - (Z0 - (k + 0.5) * BAY), p.y);
    s.alb = vec3(0.0);
    s.emit = SKY_COL * sideGlassTint(w, 0.0) * (2.2 + 0.8 * noise2(w * 3.0 + k * 7.0));
    return s;
  }
  if (id == M_GLASS_END) {
    s.alb = vec3(0.0);
    s.emit = SKY_COL * endGlassTint(p.xy, 0.0) * 3.2;
    return s;
  }
  if (id == M_IRON) {
    s.alb = vec3(0.05, 0.045, 0.04);
    s.metal = 1.0;
    s.rough = 0.45;
    return s;
  }
  if (id == M_STATUE) {
    s.alb = vec3(0.22, 0.2, 0.18) * (0.8 + 0.25 * fbm2(p.yz * 6.0));
    s.rough = 0.65;
    return s;
  }
  if (id == M_CLOTH) {
    float border = smoothstep(0.02, 0.0, abs(abs(p.x) - 0.8)) + smoothstep(0.02, 0.0, abs(p.y - 0.36));
    s.alb = mix(vec3(0.28, 0.025, 0.02), vec3(0.42, 0.28, 0.1), clamp(border, 0.0, 1.0));
    s.rough = 0.95;
    s.wrap = 0.4;
    return s;
  }
  if (id == M_ALTAR) {
    s.alb = vec3(0.16, 0.145, 0.13) * (0.85 + 0.2 * fbm2(p.xy * 4.0));
    s.rough = 0.5;
    return s;
  }

  // floor, carpet and dressed stone
  if (p.y < 0.03 && abs(p.x) < 0.86 && p.z > END_Z + 2.39) {
    float ax = abs(p.x);
    vec3 c = vec3(0.2, 0.022, 0.02);
    c = mix(c, vec3(0.36, 0.22, 0.08), smoothstep(0.012, 0.004, abs(ax - 0.73)));
    c = mix(c, vec3(0.1, 0.012, 0.01), smoothstep(0.79, 0.81, ax));
    c *= 0.75 + 0.35 * noise2(p.xz * vec2(60.0, 3.0)) * noise2(p.xz * 9.0 + 3.0);
    s.alb = c;
    s.rough = 1.0;
    s.wrap = 0.2;
    return s;
  }
  if (p.y < 0.005) {
    vec2 slab = ashlar(vec2(p.x + 0.17, p.z), vec2(0.9, 0.72));
    float joint = smoothstep(0.003, 0.016, slab.y);
    float mottle = fbm2(p.xz * 2.3);
    s.alb = vec3(0.085, 0.078, 0.07) * (0.6 + 0.55 * slab.x) * (0.75 + 0.5 * mottle) * mix(0.35, 1.0, joint);
    s.gloss = 0.6 * joint * (0.55 + 0.45 * mottle);
    s.rough = mix(0.7, 0.22, s.gloss);
    vec2 tilt = vec2(hash12(vec2(slab.x, 3.1)), hash12(vec2(slab.x, 7.7))) - 0.5;
    n = normalize(n + vec3(tilt.x, 0.0, tilt.y) * 0.02);
    return s;
  }
  vec3 an = abs(n);
  vec2 uv = an.x > an.z ? p.zy : p.xy;
  if (an.y > max(an.x, an.z)) uv = p.xz;
  vec2 blk = ashlar(uv + vec2(0.3, 0.0), vec2(0.86, 0.43));
  float joint = smoothstep(0.004, 0.02, blk.y);
  vec3 c = vec3(0.11, 0.105, 0.1) * (0.72 + 0.4 * blk.x) * (0.8 + 0.35 * fbm2(uv * 3.0));
  c *= mix(0.45, 1.0, joint);
  // soot running down the stone, and damp rising from the floor
  float soot = smoothstep(0.45, 0.8, fbm2(vec2(uv.x * 5.0, uv.y * 0.35 + uv.x * 0.2)));
  c *= 1.0 - 0.55 * soot;
  float damp = smoothstep(1.4, 0.0, p.y + 0.6 * fbm2(uv * 1.7));
  c *= mix(1.0, 0.45, damp);
  vec3 tilt = vec3(hash12(vec2(blk.x, 1.3)), hash12(vec2(blk.x, 5.1)), hash12(vec2(blk.x, 9.7))) - 0.5;
  n = normalize(n + tilt * 0.06 * joint);
  if (id == M_TRACERY) c = vec3(0.16, 0.15, 0.14);
  s.alb = c;
  s.rough = 0.85;
  return s;
}
