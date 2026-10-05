// Frame: relights the baked layers with the current candle flicker, draws
// the swinging censer, and lays the air from the air pass over the result.

layout(location = 0) out vec4 oColor;

uniform sampler2D uDay;
uniform sampler2D uAlbedo;
uniform sampler2D uCandleD;
uniform sampler2D uCandleS;
uniform sampler2D uAir;
uniform bool uDynamic; // false leaves out the censer

/* ───────────── air ───────────── */

// The air pass works at half resolution. Of the four air texels around this
// pixel, the ones whose depth matches this pixel's count most, so the haze
// behind the servitor does not bleed onto its edges.
vec4 airAt(ivec2 px, float t) {
  ivec2 size = textureSize(uAir, 0);
  vec2 f = (vec2(px) + 0.5) * 0.5 - 0.5;
  ivec2 b = ivec2(floor(f));
  vec2 w = fract(f);
  vec4 sum = vec4(0.0);
  float total = 0.0;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 2; i++) {
      ivec2 q = clamp(b + ivec2(i, j), ivec2(0), size - 1);
      float dq = texelFetch(uDay, q * 2, 0).a;
      float bilinear = (i == 0 ? 1.0 - w.x : w.x) * (j == 0 ? 1.0 - w.y : w.y);
      float k = bilinear / (0.01 + abs(dq - t) / max(t, 0.5));
      sum += texelFetch(uAir, q, 0) * k;
      total += k;
    }
  }
  return sum / total;
}

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  vec4 day = texelFetch(uDay, px, 0);
  vec4 alb = texelFetch(uAlbedo, px, 0);
  vec4 cd = texelFetch(uCandleD, px, 0);
  vec4 cs = texelFetch(uCandleS, px, 0);
  vec3 ro = uCamPos;
  vec3 rd = cameraRay(gl_FragCoord.xy);

  vec4 f = uFlicker;
  vec3 candle = VOTIVE_COL * cd.x * f.x + CANDLE_COL * dot(cd.yzw, f.yzw);
  vec3 sheen = VOTIVE_COL * cs.x * f.x + CANDLE_COL * dot(cs.yzw, f.yzw);
  vec3 col = day.rgb * cloud() + alb.rgb * candle + sheen;
  float t = day.a;
  vec4 a = airAt(px, t);

  Censer cz = censerNow();
  float tc;
  if (uDynamic && traceCenser(cz, ro, rd, t, tc)) {
    // only the air in front of the censer covers it
    float k = tc / t;
    a = vec4(a.rgb * k, pow(a.a, k));
    t = tc;
    col = shadeCenser(cz, ro + rd * tc, rd);
  }

  oColor = vec4(col * a.a + a.rgb, t);
}
