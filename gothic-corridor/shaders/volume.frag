// Light volume: bakes the daylight in the air into a 3D texture, one slice
// per draw, once. Each texel holds what windowLight and pierShadow give at
// that point, so the air pass reads one texel per step instead of tracing
// the windows.

layout(location = 0) out vec4 oLight;

uniform float uSlice;
uniform vec3 uVolRes;

void main() {
  vec3 p = VOL_MIN + vec3(gl_FragCoord.xy, uSlice + 0.5) / uVolRes * VOL_SIZE;
  float bay;
  vec3 win = windowLight(p, 0.08, bay);
  if (bay < -1.5) win = vec3(0.0);
  else if (bay > -0.5) win *= pierShadow(p);
  oLight = vec4(win, 1.0);
}
