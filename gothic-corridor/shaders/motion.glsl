// Shared by the air and frame passes: time, flicker, noise, the daylight
// volume and the censer's swing.

uniform highp sampler3D uNoise;
uniform highp sampler3D uLight;
uniform float uTime;
uniform vec4 uFlicker;
uniform float uEmber;
uniform vec3 uAccent;

const vec3 CANDLE_COL = vec3(1.0, 0.5, 0.19);
// candlelight through the coloured glass of the votive cups
#define VOTIVE_COL mix(CANDLE_COL, uAccent, 0.55)
const vec3 EMBER_COL = vec3(1.0, 0.32, 0.08);
const float HAZE = 0.016;
// absorption in the air, so the far end sinks into the dark
const float ABSORB = 0.02;
// the faint light every bit of haze gets from its surroundings
const vec3 FOG_AMB = vec3(0.0004, 0.00055, 0.0007);

// Smooth value noise from the 32³ texture of random values.
float tnoise(vec3 p) {
  vec3 y = p - 0.5;
  vec3 i = floor(y);
  vec3 f = fract(y);
  f = f * f * (3.0 - 2.0 * f);
  return textureLod(uNoise, (i + f + 0.5) / 32.0, 0.0).r;
}

// Daylight reaching p through the windows, from the light volume.
vec3 daylight(vec3 p) {
  return SUN_COL * textureLod(uLight, (p - VOL_MIN) / VOL_SIZE, 0.0).rgb;
}

// Clouds passing the sun, from 1 in clear sky down to about 0.7.
float cloud() {
  return 0.68 + 0.4 * smoothstep(0.25, 0.7, tnoise(vec3(uTime * 0.035, 1.7, 3.1)));
}

// Unit vector from the pivot to the censer at a given time.
vec3 censerDir(float time) {
  float a = CENSER_AMP * sin(CENSER_W * time);
  float b = 0.22 * CENSER_AMP * sin(CENSER_W * time + 1.1);
  vec3 F = vec3(SERV_F.x, 0.0, SERV_F.y);
  vec3 R = vec3(SERV_R.x, 0.0, SERV_R.y);
  return normalize(F * sin(a) + R * sin(b) - vec3(0.0, cos(a) * cos(b), 0.0));
}

vec3 censerAt(float time) {
  return CENSER_PIVOT + censerDir(time) * CENSER_LEN;
}
