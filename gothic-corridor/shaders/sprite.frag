// Draws one flame, glow or dust mote. Anything behind nearer geometry is
// dropped using the baked distance, and reflections only land on polished floor.

layout(location = 0) out vec4 oColor;

uniform float uTime;
uniform vec4 uFlicker;
uniform vec3 uAccent;

in vec2 vUv;
in float vDist;
in float vPix;
in float vFog;
in vec3 vColor;
flat in vec4 vInfo;

#ifdef LIVE
// The live overlay knows the scene only from the depth map.
uniform sampler2D uDepth;

float sceneDepth(ivec2 px) {
  return DEPTH_NEAR * exp(texture(uDepth, (vec2(px) + 0.5) / uRes).r * log(DEPTH_FAR / DEPTH_NEAR));
}

float floorGloss(ivec2 px) {
  vec3 p = uCamPos + cameraRay(vec2(px) + 0.5) * sceneDepth(px);
  return p.y < 0.03 && abs(p.x) > 0.86 ? 0.45 : 0.0;
}
#else
uniform sampler2D uDay;
uniform sampler2D uAlbedo;

float sceneDepth(ivec2 px) {
  return texelFetch(uDay, px, 0).a;
}

float floorGloss(ivec2 px) {
  return texelFetch(uAlbedo, px, 0).a;
}
#endif

void main() {
  ivec2 px = ivec2(gl_FragCoord.xy);
  float kind = vInfo.z;
  float seed = vInfo.y;
  float gain = vInfo.w * vFog;
  vec2 q = vUv;

  if (kind == 1.0) {
    float gloss = floorGloss(px);
    if (gloss < 0.02) discard;
    q.y = -q.y * 0.45;
    q.x *= 0.8;
    gain *= gloss * 0.4;
  } else if (sceneDepth(px) < vDist - 0.12) {
    discard;
  }

  if (kind == 3.0) {
    float r2 = dot(q, q);
    oColor = vec4(vColor * exp(-r2 * 1.2) * gain * 0.6 * min(vPix * vPix * 4.0, 1.0), 0.0);
    return;
  }

  if (kind == 2.0) {
    float r2 = dot(q, q);
    float pulse = 0.85 + 0.15 * sin(uTime * 2.3 + seed * 6.0);
    oColor = vec4(uAccent * (exp(-r2 * 10.0) * 8.0 + exp(-sqrt(r2) * 3.5) * 0.5) * gain * pulse, 0.0);
    return;
  }

  float fl = uFlicker[int(vInfo.x)];
  float blur = vPix * 0.7;
  float sway = (noise2(vec2(uTime * 3.1 + seed * 20.0, seed * 7.0)) - 0.5) * (0.22 + 1.6 * max(0.0, 1.0 - fl));
  float y = q.y + 0.5;
  q.x -= sway * y * y;
  float width = 0.16 * pow(clamp(1.0 - y, 0.0, 1.0), 0.65) * smoothstep(-0.15, 0.22, y) * (0.85 + 0.25 * fl);
  float ax = abs(q.x);
  float tip = 0.82 + 0.2 * fl + 0.06 * noise2(vec2(uTime * 11.0, seed * 13.0));
  float body = (1.0 - smoothstep(width * 0.55 - blur, width + blur + 0.01, ax)) * smoothstep(-0.15 - blur, 0.05, y) * (1.0 - smoothstep(tip - 0.25 - blur, tip + blur, y));
  float core = (1.0 - smoothstep(width * 0.15, width * 0.6 + blur, ax)) * smoothstep(0.02 - blur, 0.22, y) * (1.0 - smoothstep(0.32, 0.68 + blur, y));
  float base = (1.0 - smoothstep(0.0, width * 1.3 + blur, ax)) * (1.0 - smoothstep(0.0, 0.14 + blur, abs(y - 0.04)));
  vec3 col = vec3(1.0, 0.4, 0.09) * body * 5.0 + vec3(1.0, 0.82, 0.55) * core * 14.0 + vec3(0.25, 0.32, 1.0) * base * 0.8;
  col += vec3(1.0, 0.48, 0.16) * exp(-length(q * vec2(1.4, 1.0)) * 3.0) * 0.4;
  oColor = vec4(col * fl * gain, 0.0);
}
