// Shared by every pass. The scene constants block from scene.ts comes first.

#define PI 3.14159265

uniform vec2 uRes;
uniform vec3 uCamPos;
uniform mat3 uCamBasis; // right, up, forward
uniform vec4 uLens;     // tan of the half field of view in x and y, then the lens shift
uniform int uZero;      // always 0; keeps loops from being unrolled

vec3 cameraRay(vec2 frag) {
  vec2 ndc = frag / uRes * 2.0 - 1.0;
  return normalize(uCamBasis * vec3(ndc * uLens.xy + uLens.zw, 1.0));
}

/* ───────────── hashes and noise ───────────── */

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}

float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(hash13(i), hash13(i + vec3(1, 0, 0)), u.x);
  float b = mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), u.x);
  float c = mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), u.x);
  float d = mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), u.x);
  return mix(mix(a, b, u.y), mix(c, d, u.y), u.z);
}

float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * noise2(p);
    p = p * 2.03 + 17.1;
    a *= 0.5;
  }
  return s;
}

// Interleaved gradient noise, for dithering ray marches.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

/* ───────────── distance primitives ───────────── */

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

float sdBox2(vec2 p, vec2 b) {
  vec2 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

float sdRoundBox(vec3 p, vec3 b, float r) {
  return sdBox(p, b - r) - r;
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

// Cylinder along y, centred on the origin, with half height h.
float sdCylY(vec3 p, float r, float h) {
  vec2 d = abs(vec2(length(p.xz), p.y)) - vec2(r, h);
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0));
}

float sdTorus(vec3 p, vec2 t) {
  return length(vec2(length(p.xz) - t.x, p.y)) - t.y;
}

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / k1;
}

float sdRoundCone(vec3 p, vec3 a, vec3 b, float r1, float r2) {
  vec3 ba = b - a;
  float l2 = dot(ba, ba);
  float rr = r1 - r2;
  float a2 = l2 - rr * rr;
  float il2 = 1.0 / l2;
  vec3 pa = p - a;
  float y = dot(pa, ba);
  float z = y - l2;
  vec3 xv = pa * l2 - ba * y;
  float x2 = dot(xv, xv);
  float y2 = y * y * l2;
  float z2 = z * z * l2;
  float k = sign(rr) * rr * rr * x2;
  if (sign(z) * a2 * z2 > k) return sqrt(x2 + z2) * il2 - r2;
  if (sign(y) * a2 * y2 < k) return sqrt(x2 + y2) * il2 - r1;
  return (sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float smax(float a, float b, float k) {
  return -smin(-a, -b, k);
}

mat2 rot2(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

/* ───────────── windows ───────────── */

// A pointed (equilateral) lancet as a 2D signed distance, negative inside.
// a is the half width, y0 the sill and ys the springing of the arch.
float sdLancet(vec2 q, float a, float y0, float ys) {
  q.x = abs(q.x);
  float d = q.y < ys ? q.x - a : length(q - vec2(-a, ys)) - 2.0 * a;
  return max(d, y0 - q.y);
}

// Side windows, in each bay of the right-hand wall. q is (z from the bay centre, height).
const float SW_A = 0.85;
const float SW_Y0 = 2.6;
const float SW_YS = 6.0;
const float SW_FR = 0.06;
const float SW_CY = 6.75;
const float XG = HALL_W + WALL_T * 0.5;

// Range of the depth stored in the maps for the live overlay, on a log scale.
const float DEPTH_NEAR = 0.3;
const float DEPTH_FAR = 64.0;

// The opening through the wall. splay widens it toward the inside face.
float sdSideOpening(vec2 q, float splay) {
  return sdLancet(q, SW_A + splay * 0.3, SW_Y0 - splay * 0.45, SW_YS);
}

// The glass between the tracery: two lancets under a quatrefoil.
float sdSideGlass(vec2 q) {
  float a2 = (SW_A - 2.0 * SW_FR) * 0.5;
  float lancets = sdLancet(vec2(abs(q.x) - SW_FR - a2, q.y), a2, SW_Y0 + SW_FR, SW_YS - 0.35);
  vec2 o = abs(q - vec2(0.0, SW_CY));
  float foil = min(length(o - vec2(0.165, 0.0)), length(o - vec2(0.0, 0.165))) - 0.17;
  return min(lancets, foil);
}

// Colour and lead of the side window glass. soft blurs the lead lines, for
// light that has travelled some way from the window.
vec3 sideGlassTint(vec2 q, float soft) {
  vec2 o = q - vec2(0.0, SW_CY);
  if (length(o) < 0.4) {
    float a = atan(o.y, o.x);
    float lobe = floor((a + PI * 1.25) / (PI * 0.5));
    vec3 c = mod(lobe, 2.0) < 0.5 ? vec3(0.75, 0.12, 0.05) : vec3(0.8, 0.46, 0.13);
    c = mix(c, vec3(0.95, 0.88, 0.62), smoothstep(0.075, 0.055, length(o)));
    float lead = abs(length(o) - 0.07);
    return c * (1.0 - 0.8 * (1.0 - smoothstep(0.006, 0.012 + soft, lead)));
  }
  // diamond quarries of slightly uneven old glass
  vec2 d = vec2(q.x + q.y, q.x - q.y) * (1.0 / 0.3);
  vec2 cell = floor(d);
  vec2 g = abs(fract(d) - 0.5);
  float edge = 0.5 - max(g.x, g.y);
  float lead = 1.0 - smoothstep(0.012, 0.03 + soft * 3.0, edge);
  float v = 0.8 + 0.2 * hash12(cell);
  return vec3(0.7, 0.9, 0.92) * v * (1.0 - 0.8 * lead);
}

// End window: three lancets and a rose. q is (x, height).
const float EW_A = 1.9;
const float EW_Y0 = 1.5;
const float EW_YS = 6.6;
const float EW_FR = 0.07;
const float EW_CY = 8.0;
const float ZG = END_Z - WALL_T * 0.5;

float sdEndOpening(vec2 q, float splay) {
  return sdLancet(q, EW_A + splay * 0.35, EW_Y0 - splay * 0.4, EW_YS);
}

float sdEndGlass(vec2 q) {
  float a3 = (EW_A - 4.0 * EW_FR) / 6.0;
  float x = abs(q.x);
  float lancets = min(
    sdLancet(vec2(x, q.y), a3, EW_Y0 + EW_FR, EW_YS - 0.2),
    sdLancet(vec2(x - 2.0 * a3 - 2.0 * EW_FR, q.y), a3, EW_Y0 + EW_FR, EW_YS - 0.2)
  );
  vec2 o = q - vec2(0.0, EW_CY);
  float r = length(o);
  float sector = PI / 4.0;
  float a = mod(atan(o.y, o.x) + sector * 0.5, sector) - sector * 0.5;
  vec2 l = r * vec2(cos(a), sin(a));
  float rose = min(length(l - vec2(0.6, 0.0)) - 0.24, r - 0.24);
  return min(lancets, rose);
}

vec3 endGlassTint(vec2 q, float soft) {
  vec2 o = q - vec2(0.0, EW_CY);
  if (length(o) < 0.9) {
    float a = atan(o.y, o.x);
    float petal = floor((a + PI) / (PI / 4.0));
    vec3 c = mod(petal, 2.0) < 0.5 ? vec3(1.0, 0.25, 0.1) : vec3(0.95, 0.75, 0.35);
    return mix(c, vec3(1.0, 0.92, 0.7), smoothstep(0.26, 0.2, length(o)));
  }
  vec2 g = abs(fract(q * vec2(1.0 / 0.32, 1.0 / 0.42)) - 0.5);
  float edge = 0.5 - max(g.x, g.y);
  float lead = 1.0 - smoothstep(0.015, 0.035 + soft * 3.0, edge);
  return vec3(0.8, 0.9, 0.86) * (1.0 - 0.75 * lead);
}

/* ───────────── daylight ───────────── */

const vec3 SUN_COL = vec3(1.0, 0.97, 0.92) * 7.0;
// Some windows are grimier than others. The third one, behind the servitor, is the clearest.
const float WIN_GAIN[8] = float[8](0.22, 0.45, 1.0, 0.5, 0.85, 0.3, 0.7, 0.55);
const vec3 SKY_COL = vec3(0.58, 0.74, 0.82);

// Daylight let through the window the sun ray from p reaches first, side or
// end. It accounts for the window's shape, tracery, lead and colour, but not
// for anything standing inside the hall. bay is set to the side window's bay,
// to -1 for the end window, or to -2 when the ray reaches no glass. blur
// softens the lead lines, which in the air would read as a mesh.
vec3 windowLight(vec3 p, float blur, out float bay) {
  bay = -2.0;
  float tSide = (HALL_W - p.x) / SUN_DIR.x;
  float tEnd = (END_Z - p.z) / SUN_DIR.z;
  if (tSide < tEnd) {
    float t = (XG - p.x) / SUN_DIR.x;
    vec3 q = p + SUN_DIR * t;
    float k = floor((Z0 - q.z) / BAY);
    if (k < 0.0 || k > float(NBAYS) - 1.0) return vec3(0.0);
    float zc = Z0 - (k + 0.5) * BAY;
    vec2 w = vec2(q.z - zc, q.y);
    float soft = 0.006 + 0.01 * t;
    float m = 1.0 - smoothstep(-soft, soft, sdSideGlass(w));
    if (m <= 0.0) return vec3(0.0);
    vec2 wi = vec2(p.z + SUN_DIR.z * tSide - zc, p.y + SUN_DIR.y * tSide);
    m *= 1.0 - smoothstep(-soft, soft, sdSideOpening(wi, 1.0));
    bay = k;
    return m * sideGlassTint(w, soft + blur) * WIN_GAIN[int(k)];
  }
  float t = (ZG - p.z) / SUN_DIR.z;
  vec3 q = p + SUN_DIR * t;
  vec2 w = q.xy;
  float soft = 0.008 + 0.01 * t;
  float m = 1.0 - smoothstep(-soft, soft, sdEndGlass(w));
  if (m <= 0.0) return vec3(0.0);
  vec2 wi = (p + SUN_DIR * tEnd).xy;
  m *= 1.0 - smoothstep(-soft, soft, sdEndOpening(wi, 1.0));
  bay = -1.0;
  return m * endGlassTint(w, soft + blur);
}

// The light volume covers the hall up to 10 m, where the shafts end. The
// renderer bakes windowLight and pierShadow into it once.
const vec3 VOL_MIN = vec3(-HALL_W, 0.0, END_Z);
const vec3 VOL_SIZE = vec3(2.0 * HALL_W, 10.0, Z0 + 1.5 - END_Z);

// The piers on the right-hand wall, as boxes, for shadows in the air.
float pierShadow(vec3 p) {
  float tw = (HALL_W - p.x) / SUN_DIR.x;
  float zm = p.z + SUN_DIR.z * tw * 0.5;
  float j = floor((Z0 - zm) / BAY + 0.5);
  float vis = 1.0;
  vec2 ro = p.xz;
  vec2 rd = SUN_DIR.xz;
  for (int s = -1; s <= 1; s++) {
    float zk = Z0 - (j + float(s)) * BAY;
    vec2 t0 = (vec2(HALL_W - 0.86, zk - 0.5) - ro) / rd;
    vec2 t1 = (vec2(HALL_W, zk + 0.5) - ro) / rd;
    vec2 tn = min(t0, t1), tf = max(t0, t1);
    float tin = max(max(tn.x, tn.y), 0.0);
    float tout = min(min(tf.x, tf.y), tw);
    vis *= 1.0 - smoothstep(0.0, 0.12, tout - tin);
  }
  return vis;
}

// Henyey-Greenstein phase function.
float phaseHG(float c, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(1.0 + g2 - 2.0 * g * c, 1.5));
}

float specGGX(vec3 n, vec3 v, vec3 l, float rough) {
  vec3 h = normalize(v + l);
  float a = rough * rough;
  float a2 = a * a;
  float nh = max(dot(n, h), 0.0);
  float dd = nh * nh * (a2 - 1.0) + 1.0;
  float D = a2 / (PI * dd * dd);
  float nv = max(dot(n, v), 1e-3);
  float nl = max(dot(n, l), 1e-3);
  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float G = nv / (nv * (1.0 - k) + k) * nl / (nl * (1.0 - k) + k);
  return D * G / (4.0 * nv * nl);
}
