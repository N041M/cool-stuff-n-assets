// The grade that turns light into display values: exposure, tone curve,
// gamma with a cool cast in the shadows, vignette, and the page background
// as black. ungrade() undoes it exactly, so the live overlay can add light
// to the rendered image.

uniform vec3 uBg; // the page background, in display values

const float EXPOSURE = 1.0;
// gamma per channel: blue lifts a little in the shadows, red sinks a little
const vec3 GAMMA = vec3(2.2 / 1.03, 2.2, 2.2 / 0.97);

float vignette(vec2 uv) {
  vec2 d = (uv - 0.5) * vec2(1.1, 1.0);
  return 1.0 - 0.55 * dot(d, d);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 acesInverse(vec3 y) {
  vec3 a = 2.51 - 2.43 * y;
  vec3 b = 0.03 - 0.59 * y;
  return (-b + sqrt(b * b + 0.56 * y * a)) / (2.0 * a);
}

vec3 grade(vec3 light, vec2 uv) {
  vec3 c = pow(aces(light * EXPOSURE), 1.0 / GAMMA) * vignette(uv);
  return uBg + (1.0 - uBg) * c;
}

vec3 ungrade(vec3 c, vec2 uv) {
  c = max((c - uBg) / (1.0 - uBg) / vignette(uv), 0.0);
  return acesInverse(min(pow(c, GAMMA), vec3(0.995))) / EXPOSURE;
}

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Film grain and a dither that keeps dark gradients from banding.
vec3 grain(vec3 c, float amount, float time) {
  float g = hash(gl_FragCoord.xy + fract(time * 7.31) * 911.0) - 0.5;
  c += g * amount * (0.35 + 0.65 * (1.0 - c));
  return c + (hash(gl_FragCoord.yx * 1.37 + 17.0) - 0.5) / 255.0;
}
