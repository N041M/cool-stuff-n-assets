// Bloom chain. Mode 0 downsamples with a 13-tap filter, mode 1 upsamples
// with a 3x3 tent and is blended additively onto the next larger level.

layout(location = 0) out vec4 oColor;

uniform sampler2D uSrc;
uniform vec2 uTexel; // one texel of the source
uniform vec2 uDst;   // size of the target in pixels
uniform int uMode;
uniform bool uFirst; // the first downsample clamps fireflies from the flames

vec3 tap(vec2 uv) {
  return texture(uSrc, uv).rgb;
}

vec3 clampLuma(vec3 c) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return c / (1.0 + l * 0.25);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uDst;
  vec2 t = uTexel;
  vec3 c;
  if (uMode == 0) {
    vec3 a = tap(uv + t * vec2(-2.0, 2.0)), b = tap(uv + t * vec2(0.0, 2.0)), cc = tap(uv + t * vec2(2.0, 2.0));
    vec3 d = tap(uv + t * vec2(-2.0, 0.0)), e = tap(uv), f = tap(uv + t * vec2(2.0, 0.0));
    vec3 g = tap(uv + t * vec2(-2.0, -2.0)), h = tap(uv + t * vec2(0.0, -2.0)), i = tap(uv + t * vec2(2.0, -2.0));
    vec3 j = tap(uv + t * vec2(-1.0, 1.0)), k = tap(uv + t * vec2(1.0, 1.0));
    vec3 l = tap(uv + t * vec2(-1.0, -1.0)), m = tap(uv + t * vec2(1.0, -1.0));
    if (uFirst) {
      a = clampLuma(a); b = clampLuma(b); cc = clampLuma(cc); d = clampLuma(d); e = clampLuma(e); f = clampLuma(f);
      g = clampLuma(g); h = clampLuma(h); i = clampLuma(i); j = clampLuma(j); k = clampLuma(k); l = clampLuma(l); m = clampLuma(m);
    }
    c = e * 0.125 + (a + cc + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  } else {
    c = tap(uv) * 4.0;
    c += (tap(uv + t * vec2(-1.0, 0.0)) + tap(uv + t * vec2(1.0, 0.0)) + tap(uv + t * vec2(0.0, 1.0)) + tap(uv + t * vec2(0.0, -1.0))) * 2.0;
    c += tap(uv + t * vec2(-1.0, -1.0)) + tap(uv + t * vec2(1.0, -1.0)) + tap(uv + t * vec2(-1.0, 1.0)) + tap(uv + t * vec2(1.0, 1.0));
    c /= 16.0;
  }
  oColor = vec4(c, 1.0);
}
