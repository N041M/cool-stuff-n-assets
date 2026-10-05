// The censer: its shape, how it is lit, and a ray against it. Needs motion.glsl.

// The censer in its own frame: y runs up the chain to the claw, the origin is the body's centre.
float sdCenser(vec3 q, out float chain) {
  float bowl = max(sdEllipsoid(q - vec3(0.0, -0.005, 0.0), vec3(0.085, 0.075, 0.085)), q.y);
  float lid = max(sdEllipsoid(q, vec3(0.08, 0.118, 0.08)), -q.y);
  float rim = sdTorus(q, vec2(0.084, 0.008));
  float foot = sdCylY(q - vec3(0.0, -0.08, 0.0), 0.034, 0.012) - 0.003;
  float fin = min(sdCapsule(q, vec3(0.0, 0.1, 0.0), vec3(0.0, 0.135, 0.0), 0.01), length(q - vec3(0.0, 0.142, 0.0)) - 0.016);
  float body = min(min(bowl, lid), min(rim, min(foot, fin)));
  vec3 ring = vec3(0.0, 0.29, 0.0);
  float c = sdCapsule(q, ring, vec3(0.0, CENSER_LEN, 0.0), 0.0045);
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.0944 + 0.5;
    c = min(c, sdCapsule(q, vec3(cos(a) * 0.08, 0.004, sin(a) * 0.08), ring, 0.0032));
  }
  c = min(c, sdTorus(q - ring, vec2(0.016, 0.004)));
  chain = c;
  return min(body, c);
}

struct Censer {
  vec3 pos;
  mat3 basis; // columns: x, y (up the chain), z
};

Censer censerNow() {
  vec3 up = -censerDir(uTime);
  vec3 x = normalize(cross(up, vec3(SERV_F.x, 0.0, SERV_F.y)));
  vec3 z = cross(x, up);
  return Censer(CENSER_PIVOT - up * CENSER_LEN, mat3(x, up, z));
}

vec3 shadeCenser(Censer cz, vec3 p, vec3 rd) {
  vec3 q = (p - cz.pos) * cz.basis;
  float chain;
  float e = 0.0006;
  vec2 k = vec2(1.0, -1.0);
  vec3 nl = normalize(k.xyy * sdCenser(q + k.xyy * e, chain) + k.yyx * sdCenser(q + k.yyx * e, chain) +
                      k.yxy * sdCenser(q + k.yxy * e, chain) + k.xxx * sdCenser(q + k.xxx * e, chain));
  float d = sdCenser(q, chain);
  bool isChain = chain <= d + 1e-5;
  vec3 n = cz.basis * nl;
  vec3 v = -rd;
  vec3 alb = isChain ? vec3(0.07, 0.06, 0.05) : vec3(0.62, 0.42, 0.17) * (0.8 + 0.3 * noise3(q * 120.0));
  float rough = isChain ? 0.5 : 0.3;

  vec3 col = alb * vec3(0.02, 0.018, 0.016) * (0.6 + 0.4 * n.y);
  for (int c = uZero; c < N_CLUSTERS; c++) {
    vec4 cl = CLUSTER_L[c];
    vec4 ci = CLUSTER_I[c];
    vec3 dv = cl.xyz - p;
    float d2 = dot(dv, dv);
    if (d2 > ci.y * ci.y) continue;
    vec3 L = dv * inversesqrt(d2);
    float ndl = max(dot(n, L), 0.0);
    vec3 lc = (ci.z < 0.5 ? VOTIVE_COL : CANDLE_COL) * ci.x * uFlicker[int(ci.z)] / (d2 + cl.w * cl.w);
    col += lc * alb * ndl * (0.12 + specGGX(n, v, L, rough));
  }
  float ndl = max(dot(n, SUN_DIR), 0.0);
  col += daylight(p) * cloud() * alb * ndl * (0.12 + specGGX(n, v, SUN_DIR, rough));
  // embers seen through the piercings in the lid
  if (!isChain && q.y > 0.012 && q.y < 0.1) {
    float a = atan(q.z, q.x) / (2.0 * PI);
    float row = q.y < 0.055 ? 0.0 : 1.0;
    float cols = row < 0.5 ? 10.0 : 6.0;
    vec2 cell = vec2((fract(a * cols + row * 0.5) - 0.5) * 2.0, (q.y - (row < 0.5 ? 0.034 : 0.074)) / 0.012);
    float hole = 1.0 - smoothstep(0.35, 0.6, length(cell * vec2(1.0, 0.8)));
    col += EMBER_COL * uEmber * hole * 5.0;
  }
  return col;
}

// Ray against the censer, inside a sphere round its whole swing.
bool traceCenser(Censer cz, vec3 ro, vec3 rd, float tMax, out float tHit) {
  vec3 oc = ro - CENSER_PIVOT;
  float r = CENSER_LEN + 0.16;
  float b = dot(oc, rd);
  float c = dot(oc, oc) - r * r;
  float h = b * b - c;
  if (h < 0.0) return false;
  h = sqrt(h);
  float t = max(-b - h, 0.0);
  float t1 = min(-b + h, tMax);
  float chain;
  for (int i = uZero; i < 80; i++) {
    if (t > t1) return false;
    vec3 q = (ro + rd * t - cz.pos) * cz.basis;
    float d = sdCenser(q, chain);
    if (d < 0.0004 * t) {
      tHit = t;
      return true;
    }
    t += d;
  }
  return false;
}
