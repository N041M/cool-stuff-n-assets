// The censer's smoke, and the closed-form glow of a point light in the haze.
// Needs motion.glsl.

const int SMOKE_STEPS = 28;
const vec3 SMOKE_LO = CENSER_PIVOT + vec3(-0.9, -CENSER_LEN - 0.12, -0.8);
const vec3 SMOKE_HI = CENSER_PIVOT + vec3(0.8, 1.9, 0.9);

// The plume. Smoke at height h left the censer h / rise seconds ago, so it
// is centred on where the censer was then and has spread and drifted since.
float smoke(vec3 p) {
  float base = CENSER_PIVOT.y - CENSER_LEN + 0.06;
  float h = p.y - base;
  if (h < -0.06) return 0.0;
  float age = max(h, 0.0) / 0.17;
  vec3 src = censerAt(uTime - age);
  vec3 tq = p * 2.2 - vec3(0.0, uTime * 0.4, 0.0);
  vec2 turb = (vec2(tnoise(tq), tnoise(tq + 11.0)) - 0.5) * (0.03 + 0.12 * age);
  // a slow draught carries the plume toward the light in front of the servitor
  vec2 drift = vec2(-0.025, 0.045) * age;
  vec2 dxz = p.xz - src.xz - drift - turb;
  float sigma = 0.02 + 0.035 * age;
  float d = exp(-dot(dxz, dxz) / (sigma * sigma)) * pow(0.02 / sigma, 0.75);
  vec3 wq = p * vec3(5.0, 2.6, 5.0) - vec3(0.0, uTime * 0.6, 0.0);
  float wisp = 0.65 * tnoise(wq) + 0.35 * tnoise(wq * 2.3 + 5.0);
  d *= smoothstep(0.2, 0.7, wisp + 0.25 - age * 0.012);
  d *= exp(-age / 9.0) * smoothstep(-0.06, 0.06, h) * smoothstep(SMOKE_HI.y, SMOKE_HI.y - 0.6, p.y);
  return d * 9.0;
}

vec2 smokeSpan(vec3 ro, vec3 rd, float tMax) {
  vec3 inv = 1.0 / rd;
  vec3 t0 = (SMOKE_LO - ro) * inv;
  vec3 t1 = (SMOKE_HI - ro) * inv;
  vec3 tn = min(t0, t1), tf = max(t0, t1);
  return vec2(max(max(tn.x, tn.y), max(tn.z, 0.0)), min(min(tf.x, tf.y), min(tf.z, tMax)));
}

void marchSmoke(vec3 ro, vec3 rd, vec2 span, float jitter, float phase, float sky, vec3 censer, inout vec3 acc, inout float T) {
  float dt = (span.y - span.x) / float(SMOKE_STEPS);
  vec4 rack = CLUSTER_L[0];
  float rackPow = CLUSTER_I[0].x * uFlicker.x;
  for (int i = uZero; i < SMOKE_STEPS; i++) {
    vec3 p = ro + rd * (span.x + (float(i) + jitter) * dt);
    float d = smoke(p);
    if (d < 1e-4) continue;
    vec3 dc = p - censer;
    vec3 dr = p - rack.xyz;
    vec3 light = daylight(p) * (phase * 3.0 * sky);
    light += EMBER_COL * uEmber * 0.012 / (dot(dc, dc) + 0.006);
    light += VOTIVE_COL * rackPow * 0.02 / (dot(dr, dr) + rack.w * rack.w);
    light += FOG_AMB * 4.0;
    float tr = exp(-d * dt);
    acc += T * light * 0.9 * (1.0 - tr);
    T *= tr;
  }
}

// In-scattered light from a point source over the ray segment [0, tEnd],
// in closed form. soft widens the source.
float pointGlow(vec3 ro, vec3 rd, vec3 c, float tEnd, float soft) {
  vec3 oc = c - ro;
  float s0 = dot(oc, rd);
  float h = sqrt(max(dot(oc, oc) - s0 * s0, 0.0) + soft * soft);
  return (atan((tEnd - s0) / h) + atan(s0 / h)) / h * exp(-(HAZE + ABSORB) * max(s0, 0.0));
}
