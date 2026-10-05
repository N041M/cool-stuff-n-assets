// Bake: renders the static scene once into four layers.
//   0: daylight radiance (rgb) and the distance to the surface (a)
//   1: albedo (rgb) and how strongly the floor mirrors the flames (a)
//   2: candle light reaching the surface, one channel per flicker group
//   3: candle light reflected off the surface, one channel per flicker group
// The frame pass recombines them with the current flicker.
//
// map() is large, and the shader compiler makes a full copy of it at every
// place it is called. So every distance query goes through one loop with a
// single call: the ray from the camera, the four samples for the normal, the
// occlusion samples and each shadow ray take their turn.

layout(location = 0) out vec4 oDay;
layout(location = 1) out vec4 oAlbedo;
layout(location = 2) out vec4 oCandleD;
layout(location = 3) out vec4 oCandleS;

uniform vec2 uJitter;

const vec3 END_LIGHT = vec3(0.0, 6.5, END_Z - 0.2);
const int MAX_STEPS = 1000;
const int RAY_STEPS = 240;
const int AO_STEPS = 7;
const int SHADOW_STEPS = 64;

// what the loop is doing
const int RAY = 0;
const int NORMAL = 1;
const int OCCLUSION = 2;
const int SHADOW = 3;

vec3 ambient(vec3 p, vec3 n) {
  vec3 sky = SKY_COL * 0.006 * (0.45 + 0.55 * n.x) * (0.6 + 0.4 * n.y);
  // light thrown up off the sunlit floor
  vec3 bounce = vec3(0.85, 0.85, 0.8) * 0.025 * clamp(0.2 - 0.8 * n.y, 0.0, 1.0);
  // the end window lights the far end of the hall
  float nearEnd = exp((END_Z - p.z) * 0.15);
  sky += SKY_COL * 0.05 * nearEnd * clamp(0.35 - 0.65 * n.z, 0.0, 1.0);
  return sky + bounce;
}

// Offsets of the four samples for the normal, on a tetrahedron.
vec3 tetra(int i) {
  return 0.5773 * (2.0 * vec3(float(((i + 3) >> 1) & 1), float((i >> 1) & 1), float(i & 1)) - 1.0);
}

float aoStep(int i) {
  return 0.015 + 0.6 * pow(float(i) / float(AO_STEPS - 1), 2.0);
}

struct Light {
  vec3 L;
  vec3 col;
  float tmax; // how far the shadow ray goes
  float k;    // penumbra sharpness
  float group; // -1 for daylight, otherwise the candle flicker group
};

vec4 groupMask(float g) {
  return vec4(equal(vec4(g), vec4(0.0, 1.0, 2.0, 3.0)));
}

// Light number li at p: -2 is the sun through the windows, -1 the glow of the
// end window, then the candle clusters. False when it lights nothing here.
bool lightAt(int li, vec3 p, vec3 n, Surf s, float id, float ao, inout vec4 cd, out Light l) {
  l.group = -1.0;
  if (li == -2) {
    float bay;
    vec3 win = windowLight(p, 0.0, bay);
    if (bay < -1.5) return false;
    l.L = SUN_DIR;
    l.col = SUN_COL * win;
    l.tmax = bay > -0.5 ? (HALL_W - 0.05 - p.x) / SUN_DIR.x : (END_Z + 0.05 - p.z) / SUN_DIR.z;
    l.k = 40.0;
  } else if (li == -1) {
    vec3 dv = END_LIGHT - p;
    float dist = length(dv);
    l.L = dv / dist;
    l.col = SKY_COL * 14.0 / (dist * dist + 6.0);
    l.tmax = dist - 1.5;
    l.k = 5.0;
  } else {
    vec4 cl = CLUSTER_L[li];
    vec4 ci = CLUSTER_I[li];
    vec3 dv = cl.xyz - p;
    float dist = length(dv);
    if (dist > ci.y) return false;
    l.L = dv / dist;
    float fall = 1.0 - smoothstep(ci.y * 0.35, ci.y, dist);
    l.col = vec3(ci.x * fall / (dist * dist + cl.w * cl.w + 0.05));
    l.tmax = dist - cl.w - 0.06;
    l.k = 2.5 * dist / cl.w;
    l.group = ci.z;
    // pale wax right beside the flames would burn out to white
    if (id >= M_CANDLE) l.col *= 0.35;
    // a little light bounced around the cluster, without direction
    cd += groupMask(l.group) * l.col.x * 0.04 * ao;
  }
  return (dot(n, l.L) + s.wrap) / (1.0 + s.wrap) > 0.0;
}

void shade(Light l, float sh, vec3 n, vec3 v, Surf s, vec3 f0, vec3 diffAlb, inout vec3 day, inout vec4 cd, inout vec4 cs) {
  float ndl = dot(n, l.L);
  float wrapped = (ndl + s.wrap) / (1.0 + s.wrap);
  vec3 diff = l.col * max(wrapped, 0.0) * sh;
  float vh = max(dot(v, normalize(v + l.L)), 0.0);
  vec3 fr = f0 + (1.0 - f0) * pow(1.0 - vh, 5.0);
  vec3 spec = l.col * fr * specGGX(n, v, l.L, s.rough) * max(ndl, 0.0) * sh;
  if (l.group < 0.0) {
    day += diffAlb * diff + spec;
  } else {
    vec4 m = groupMask(l.group);
    cd += m * diff.x;
    cs += m * dot(spec, vec3(0.3333));
  }
}

void main() {
  vec3 ro = uCamPos;
  vec3 rd = cameraRay(gl_FragCoord.xy + uJitter);
  vec3 v = -rd;

  int phase = RAY;
  int k = 0;
  float t = 0.1;
  vec3 p = ro;
  vec3 n = vec3(0.0, 1.0, 0.0);
  vec3 sum = vec3(0.0);
  float id = 0.0;
  float eps = 0.0;
  float occ = 0.0;
  float ao = 1.0;
  Surf s = Surf(vec3(0.0), 1.0, 0.0, vec3(0.0), 0.0, 0.0, 0.0, 0.0);
  vec3 f0 = vec3(0.04);
  vec3 diffAlb = vec3(0.0);
  vec3 day = vec3(0.0);
  vec4 cd = vec4(0.0);
  vec4 cs = vec4(0.0);

  // the shadow ray in flight
  int li = -3;
  Light l = Light(vec3(0.0, 1.0, 0.0), vec3(0.0), 0.0, 1.0, -1.0);
  vec3 sp = p;
  float st = 0.0;
  float res = 1.0;
  float ph = 1e10;

  for (int it = uZero; it < MAX_STEPS; it++) {
    vec3 q = phase == RAY ? ro + rd * t : phase == NORMAL ? p + eps * tetra(k) : phase == OCCLUSION ? p + aoStep(k) * n : sp + l.L * st;
    vec2 m = map(q);
    bool nextLight = false;

    if (phase == RAY) {
      if (abs(m.x) < 0.0003 * t || t > 70.0 || k >= RAY_STEPS) {
        p = ro + rd * t;
        id = m.y;
        eps = 0.0004 * max(1.0, t * 0.6);
        phase = NORMAL;
        k = 0;
      } else {
        t += m.x * 0.85;
        k++;
      }
    } else if (phase == NORMAL) {
      sum += tetra(k) * m.x;
      if (++k == 4) {
        n = normalize(sum);
        s = surface(p, n, id);
        f0 = mix(vec3(0.04), s.alb, s.metal);
        diffAlb = s.alb * (1.0 - s.metal);
        day = s.emit;
        cd += groupMask(s.group) * s.glow;
        // glass and the optic give off their own light and are not lit
        if (dot(s.emit, s.emit) > 0.0) break;
        phase = OCCLUSION;
        k = 0;
      }
    } else if (phase == OCCLUSION) {
      occ += (aoStep(k) - m.x) * pow(0.82, float(k));
      if (++k == AO_STEPS) {
        ao = clamp(1.0 - 1.6 * occ, 0.0, 1.0);
        day += diffAlb * ambient(p, n) * ao;
        sp = p + n * 0.003 * max(1.0, t * 0.3);
        phase = SHADOW;
        nextLight = true;
      }
    } else {
      float h = m.x;
      float y = h * h / (2.0 * ph);
      float d = sqrt(max(h * h - y * y, 0.0));
      res = min(res, l.k * d / max(0.0, st - y));
      ph = h;
      st += clamp(h, 0.01, 0.45);
      k++;
      if (res < 0.003 || st > l.tmax || k >= SHADOW_STEPS) {
        float sh = clamp(res, 0.0, 1.0);
        shade(l, sh * sh * (3.0 - 2.0 * sh), n, v, s, f0, diffAlb, day, cd, cs);
        nextLight = true;
      }
    }

    if (nextLight) {
      // move on to the next light that needs a shadow ray, lighting the ones that do not
      bool found = false;
      for (li = li + 1; li < N_CLUSTERS; li++) {
        if (!lightAt(li, p, n, s, id, ao, cd, l)) continue;
        if (l.tmax <= 0.03) {
          shade(l, 1.0, n, v, s, f0, diffAlb, day, cd, cs);
          continue;
        }
        found = true;
        break;
      }
      if (!found) break;
      st = 0.015;
      res = 1.0;
      ph = 1e10;
      k = 0;
    }
  }

  oDay = vec4(day, t);
  oAlbedo = vec4(diffAlb, s.gloss);
  oCandleD = cd;
  oCandleS = cs;
}
