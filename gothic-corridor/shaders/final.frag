// Final: bloom, the grade and grain, at the canvas's own resolution.

layout(location = 0) out vec4 oColor;

uniform sampler2D uHdr;
uniform sampler2D uBloom;
uniform vec2 uOut;
uniform float uTime;
uniform float uGrain;

void main() {
  vec2 uv = gl_FragCoord.xy / uOut;
  vec3 light = texture(uHdr, uv).rgb + texture(uBloom, uv).rgb * 0.06;
  oColor = vec4(grain(grade(light, uv), 0.04 * uGrain, uTime), 1.0);
}
