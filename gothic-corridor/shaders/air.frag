// Air: haze, light shafts, the censer's smoke and the glow of the candles in
// the air, at half the bake's resolution. Writes the light scattered toward
// the camera (rgb) and how much of the scene still shows through (a).

layout(location = 0) out vec4 oAir;

uniform sampler2D uDay;
uniform int uFrame;
uniform bool uDynamic; // false leaves out the smoke and the censer's glow

const float SHAFT_GAIN = 9.0;
const int FOG_STEPS = 24;

float haze(vec3 p) {
  vec3 w = vec3(0.05, 0.012, 0.07) * uTime;
  float n = tnoise(p * 0.45 + w) * 0.6 + tnoise(p * 1.2 - w * 1.7) * 0.4;
  float h = 0.7 + 0.6 * smoothstep(1.0, 11.0, p.y);
  return HAZE * h * (0.15 + 3.0 * n * n * n);
}

vec4 air(vec3 ro, vec3 rd, float tEnd, vec3 censer) {
  float tMax = min(tEnd, 60.0);
  float jitter = ign(gl_FragCoord.xy + float(uFrame % 64) * vec2(5.588238, 3.712));
  float cs = dot(SUN_DIR, rd);
  float phaseHaze = phaseHG(cs, 0.35);
  float phaseSmoke = phaseHG(cs, 0.55);
  float sky = cloud();
  vec2 span = smokeSpan(ro, rd, tMax);
  bool smoky = uDynamic && span.y > span.x;
  float smokeMid = smoky ? 0.5 * (span.x + span.y) : 1e9;

  // haze in front of the smoke and behind it, kept apart so the smoke can sit between them
  vec3 front = vec3(0.0), back = vec3(0.0);
  float tFront = 1.0, tBack = 1.0;
  float tPrev = 0.0;
  for (int i = uZero; i < FOG_STEPS; i++) {
    float tNext = tMax * pow((float(i) + 1.0) / float(FOG_STEPS), 1.6);
    float t = mix(tPrev, tNext, jitter);
    vec3 p = ro + rd * t;
    float d = haze(p);
    float dt = tNext - tPrev;
    vec3 light = daylight(p) * (phaseHaze * SHAFT_GAIN * sky) + FOG_AMB;
    float tr = exp(-d * dt);
    if (t < smokeMid) {
      front += tFront * light * (1.0 - tr);
      tFront *= tr * exp(-ABSORB * dt);
    } else {
      back += tBack * light * (1.0 - tr);
      tBack *= tr * exp(-ABSORB * dt);
    }
    tPrev = tNext;
  }
  vec3 plume = vec3(0.0);
  float tPlume = 1.0;
  if (smoky) marchSmoke(ro, rd, span, jitter, phaseSmoke, sky, censer, plume, tPlume);
  return vec4(front + tFront * (plume + tPlume * back), tFront * tPlume * tBack);
}

vec3 glows(vec3 ro, vec3 rd, float tEnd, vec3 censer) {
  vec3 sum = vec3(0.0);
  for (int c = uZero; c < N_CLUSTERS; c++) {
    vec4 cl = CLUSTER_L[c];
    vec4 ci = CLUSTER_I[c];
    vec3 col = ci.z < 0.5 ? VOTIVE_COL : CANDLE_COL;
    sum += col * ci.x * uFlicker[int(ci.z)] * pointGlow(ro, rd, cl.xyz, tEnd, cl.w + 0.05);
  }
  if (uDynamic) sum += EMBER_COL * uEmber * 0.5 * pointGlow(ro, rd, censer, tEnd, 0.06);
  sum += SKY_COL * 9.0 * pointGlow(ro, rd, vec3(0.0, 5.5, END_Z + 1.0), tEnd, 2.0);
  return sum * HAZE / (4.0 * PI);
}

void main() {
  // each texel stands for a 2×2 block of the bake and uses its lower-left depth
  ivec2 full = ivec2(gl_FragCoord.xy) * 2;
  float tEnd = texelFetch(uDay, full, 0).a;
  vec3 ro = uCamPos;
  vec3 rd = cameraRay(vec2(full) + 0.5);
  vec3 censer = censerAt(uTime);
  vec4 a = air(ro, rd, tEnd, censer);
  a.rgb += glows(ro, rd, tEnd, censer);
  oAir = a;
}
