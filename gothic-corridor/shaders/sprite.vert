// Flames, their reflections in the floor, small glowing lights and dust
// motes, as screen-facing quads sized from their distance.

in vec2 aCorner;
in vec4 aPos;  // centre, then size in metres
in vec4 aInfo; // flicker group, seed, kind, brightness
// kinds: 0 flame, 1 flame mirrored in the floor, 2 glow, 3 dust mote

uniform float uTime;

out vec2 vUv;
out float vDist;
out float vPix;
out float vFog;
out vec3 vColor;
flat out vec4 vInfo;

void hide() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}

void main() {
  vec3 wp = aPos.xyz;
  float kind = aInfo.z;
  vColor = vec3(0.0);
  if (kind == 1.0) wp.y = -wp.y;
  if (kind == 3.0) {
    // each mote wanders in a slow loop and sinks, wrapping back to the top
    float s = aInfo.y * 97.0;
    float sink = mod(wp.y - uTime * 0.02 * (0.5 + fract(s)), 6.5);
    wp = vec3(wp.x, sink + 0.2, wp.z) + vec3(sin(uTime * 0.13 + s), 0.3 * sin(uTime * 0.21 + s * 2.1), cos(uTime * 0.11 + s * 1.3)) * 0.22;
    float bay;
    vec3 win = windowLight(wp, 0.08, bay);
    if (bay < -1.5) { hide(); return; }
    vColor = SUN_COL * win * (bay > -0.5 ? pierShadow(wp) : 1.0) * (0.55 + 0.45 * sin(uTime * 1.7 + s * 5.0));
    if (dot(vColor, vec3(1.0)) < 0.05) { hide(); return; }
  }
  vec3 d = wp - uCamPos;
  vec3 c = d * uCamBasis;
  if (c.z < 0.3) { hide(); return; }
  vec2 ndc = (c.xy / c.z - uLens.zw) / uLens.xy;
  float hPx = max(aPos.w * uRes.y / (2.0 * uLens.y * c.z), 1.0);
  vec2 halfPx = kind == 2.0 || kind == 3.0 ? vec2(hPx * 3.0) : vec2(hPx * 1.4, hPx * 2.2);
  if (kind == 1.0) halfPx.y *= 2.2;
  halfPx += kind == 3.0 ? 1.0 : 3.0;
  gl_Position = vec4(ndc + aCorner * halfPx * 2.0 / uRes, 0.0, 1.0);
  vUv = aCorner * halfPx / hPx;
  vDist = length(d);
  vPix = 1.0 / hPx;
  vFog = exp(-0.034 * vDist);
  vInfo = aInfo;
}
