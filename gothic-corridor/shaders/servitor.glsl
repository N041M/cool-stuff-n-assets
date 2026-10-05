// The servitor. Its own frame has x to its right, y up and z forward, with
// the origin between its feet. The camera sees its left side, so the
// mechanical arm, the metal half of the face and the optic are on the left.

#define M_ROBE 20.0
#define M_SKIN 21.0
#define M_GUNMETAL 22.0
#define M_BRASS 23.0
#define M_LENS 24.0
#define M_CABLE 25.0
#define M_SEAL 26.0
#define M_PARCH 27.0

vec3 servitorLocal(vec3 p) {
  vec3 d = p - SERV_POS;
  return vec3(dot(d.xz, SERV_R), d.y, dot(d.xz, SERV_F));
}

// Robe, cowl and hood, hollowed where the face sits.
float sdRobe(vec3 q) {
  vec3 qs = vec3(q.x / 1.12, q.y, q.z);
  float skirt = sdRoundCone(qs, vec3(0.0, 0.05, -0.01), vec3(0.0, 1.0, 0.03), 0.33, 0.19) * 0.95;
  float torso = sdEllipsoid(q - vec3(0.0, 1.2, 0.05), vec3(0.215, 0.26, 0.16));
  float hump = sdEllipsoid(q - vec3(0.0, 1.37, -0.02), vec3(0.24, 0.13, 0.17));
  float d = smin(skirt, torso, 0.1);
  d = smin(d, hump, 0.08);
  float ang = atan(q.x, q.z);
  float drape = 0.016 * sin(ang * 6.0 + 1.9 * sin(ang * 2.0 + 0.7) + q.y * 1.1);
  drape += 0.007 * sin(ang * 13.0 + 2.0 * noise2(vec2(ang * 2.0, q.y * 2.5)) + q.y * 3.0);
  drape += 0.004 * (noise2(vec2(ang * 9.0, q.y * 14.0)) - 0.5);
  d -= drape * smoothstep(1.3, 0.1, q.y) + 0.003 * sin(ang * 23.0 + q.y * 30.0) * smoothstep(1.5, 1.0, q.y);
  d = smin(d, sdRoundCone(q, vec3(0.0, 1.5, 0.1), vec3(0.0, 1.36, -0.03), 0.15, 0.21), 0.05);
  d = smin(d, sdRoundCone(q, vec3(0.2, 1.36, 0.04), vec3(0.27, 1.02, 0.11), 0.07, 0.095), 0.04);
  float hood = sdEllipsoid(q - vec3(0.0, 1.55, 0.17), vec3(0.165, 0.185, 0.2));
  hood = smin(hood, sdEllipsoid(q - vec3(0.0, 1.67, 0.11), vec3(0.08, 0.08, 0.1)), 0.05);
  d = smin(d, hood, 0.05);
  d = smax(d, -sdEllipsoid(q - vec3(0.0, 1.51, 0.34), vec3(0.115, 0.15, 0.13)), 0.02);
  d = max(d, -sdEllipsoid(q - vec3(0.0, 1.53, 0.19), vec3(0.13, 0.15, 0.16)));
  return d;
}

// The left arm: shoulder plate, joints, pistons and a claw round the censer chain.
vec2 sdArm(vec3 q) {
  const vec3 S = vec3(-0.25, 1.33, 0.06);
  const vec3 E = vec3(-0.31, 1.1, 0.2);
  const vec3 Wr = vec3(-0.225, 1.04, 0.44);
  const vec3 H = vec3(-0.2, 0.99, 0.49);
  float pauldron = smax(sdEllipsoid(q - vec3(-0.225, 1.385, 0.05), vec3(0.085, 0.05, 0.095)), 1.36 - q.y, 0.008);
  float metal = pauldron;
  metal = min(metal, sdCapsule(q, S, E, 0.032));
  vec3 ua = normalize(E - S);
  vec3 side = normalize(cross(ua, vec3(0.0, 0.0, 1.0)));
  metal = min(metal, sdCapsule(q, S + side * 0.045 + ua * 0.03, E + side * 0.04 - ua * 0.05, 0.011));
  metal = min(metal, sdCapsule(q, S - side * 0.04 + ua * 0.05, E - side * 0.04 - ua * 0.04, 0.009));
  metal = min(metal, sdRoundCone(q, E, Wr, 0.04, 0.028));
  vec3 fa = normalize(Wr - E);
  metal = min(metal, sdCapsule(q, E + fa * 0.05 + vec3(0.0, 0.035, 0.0), Wr - fa * 0.04 + vec3(0.0, 0.03, 0.0), 0.012));
  metal = min(metal, sdRoundBox(q - (Wr + vec3(0.006, -0.018, 0.028)), vec3(0.026, 0.02, 0.026), 0.008));
  for (int i = 0; i < 3; i++) {
    float a = float(i) * 2.0944 + 0.6;
    vec3 o = vec3(cos(a), 0.0, sin(a)) * 0.02;
    vec3 k = H + o * 1.2 + vec3(0.0, 0.03, 0.0);
    metal = min(metal, sdCapsule(q, Wr + vec3(0.006, -0.03, 0.035) + o * 0.5, k, 0.0075));
    metal = min(metal, sdCapsule(q, k, H + o * 0.35 - vec3(0.0, 0.004, 0.0), 0.006));
  }
  float joints = min(length(q - S) - 0.054, min(length(q - E) - 0.046, length(q - Wr) - 0.03));
  joints = min(joints, sdTorus((q - S - vec3(0.0, 0.0, 0.0)).yxz, vec2(0.05, 0.01)));
  return metal < joints ? vec2(metal, M_GUNMETAL) : vec2(joints, M_BRASS);
}

vec2 servitor(vec3 p, vec2 res) {
  vec3 q = servitorLocal(p);
  if (sdBox(q - vec3(-0.05, 0.95, 0.1), vec3(0.5, 0.95, 0.55)) > res.x) return res;

  res = opU(res, vec2(sdRobe(q), M_ROBE));
  res = opU(res, sdArm(q));

  // the face: skin, a metal plate over its left half, the optic and a breathing grille
  float face = smin(sdEllipsoid(q - vec3(0.0, 1.52, 0.2), vec3(0.078, 0.098, 0.092)), sdCapsule(q, vec3(0.0, 1.36, 0.1), vec3(0.0, 1.48, 0.17), 0.045), 0.03);
  res = opU(res, vec2(face, M_SKIN));
  float plate = max(sdEllipsoid(q - vec3(0.0, 1.525, 0.205), vec3(0.084, 0.1, 0.094)), q.x + 0.004);
  plate = max(plate, 1.475 - q.y);
  vec3 e = q - vec3(-0.036, 1.535, 0.285);
  plate = min(plate, sdCylY(e.xzy, 0.02, 0.022) - 0.002);
  float jaw = sdRoundBox(q - vec3(0.0, 1.448, 0.268), vec3(0.046, 0.03, 0.032), 0.01);
  vec3 tq = vec3(abs(q.x), q.y, q.z);
  jaw = min(jaw, min(sdCapsule(tq, vec3(0.03, 1.435, 0.285), vec3(0.056, 1.374, 0.274), 0.009), sdCapsule(tq, vec3(0.056, 1.374, 0.274), vec3(0.075, 1.3, 0.21), 0.009)));
  res = opU(res, vec2(min(plate, jaw), M_GUNMETAL));
  res = opU(res, vec2(sdCylY((e - vec3(0.0, 0.0, 0.023)).xzy, 0.014, 0.003), M_LENS));

  // back unit with two candle stacks, and cables into the hood
  float pack = sdRoundBox(q - vec3(0.0, 1.3, -0.2), vec3(0.15, 0.17, 0.08), 0.03);
  vec3 sq = vec3(abs(q.x) - 0.1, q.y - 1.5, q.z + 0.24);
  pack = min(pack, sdCylY(sq, 0.026, 0.065) - 0.003);
  pack = min(pack, sdCylY(sq - vec3(0.0, 0.066, 0.0), 0.042, 0.004));
  res = opU(res, vec2(pack, M_GUNMETAL));
  float cable = min(sdCapsule(tq, vec3(0.05, 1.44, -0.16), vec3(0.06, 1.565, -0.083), 0.013), sdCapsule(tq, vec3(0.06, 1.565, -0.083), vec3(0.04, 1.56, 0.03), 0.013));
  cable = min(cable, sdTorus(vec3(q.x / 1.12, q.y - 1.0, q.z - 0.02), vec2(0.205, 0.012)));
  res = opU(res, vec2(cable, M_CABLE));

  // a wax seal with parchment strips on the chest
  vec3 s = q - vec3(-0.1, 1.28, 0.205);
  res = opU(res, vec2(sdCylY(s.xzy, 0.026, 0.007) - 0.002, M_SEAL));
  vec3 s2 = q - vec3(-0.118, 1.19, 0.198);
  s2.xy = rot2(0.12) * s2.xy;
  float strips = min(sdBox(s2, vec3(0.014, 0.075, 0.0015)), sdBox(q - vec3(-0.088, 1.205, 0.2), vec3(0.012, 0.06, 0.0015)));
  res = opU(res, vec2(strips, M_PARCH));
  return res;
}

Surf servitorSurface(vec3 p, inout vec3 n, float id) {
  vec3 q = servitorLocal(p);
  Surf s = Surf(vec3(0.1), 0.6, 0.0, vec3(0.0), 0.0, 0.0, 0.0, 0.0);
  if (id == M_ROBE) {
    float weave = 0.85 + 0.15 * noise3(q * vec3(300.0, 40.0, 300.0));
    float stain = smoothstep(0.35, 0.0, q.y) * (0.6 + 0.4 * noise3(q * 12.0));
    s.alb = vec3(0.13, 0.032, 0.024) * (0.7 + 0.45 * noise3(q * 18.0)) * weave * (1.0 - 0.55 * stain);
    s.rough = 0.92;
    s.wrap = 0.25;
  } else if (id == M_SKIN) {
    s.alb = vec3(0.42, 0.34, 0.31);
    s.rough = 0.55;
    s.wrap = 0.35;
  } else if (id == M_GUNMETAL) {
    s.alb = vec3(0.14, 0.135, 0.13) * (0.8 + 0.3 * noise3(q * 60.0));
    s.metal = 1.0;
    s.rough = 0.36;
  } else if (id == M_BRASS) {
    s.alb = vec3(0.5, 0.35, 0.15);
    s.metal = 1.0;
    s.rough = 0.3;
  } else if (id == M_LENS) {
    s.alb = vec3(0.0);
    s.emit = uAccent * 6.0;
  } else if (id == M_CABLE) {
    s.alb = vec3(0.025);
    s.rough = 0.5;
  } else if (id == M_SEAL) {
    s.alb = vec3(0.32, 0.03, 0.02);
    s.rough = 0.3;
  } else if (id == M_PARCH) {
    s.alb = vec3(0.5, 0.44, 0.33) * (0.85 + 0.2 * noise3(q * 80.0));
    s.rough = 0.9;
    s.wrap = 0.5;
  }
  return s;
}
