// The Phosphor, Wire and X-ray looks of the viewer.
//
// All three use one shader. It shades the model in a few bands of one colour,
// adds a bright rim where the surface turns away from the eye and darkens
// every few rows of pixels a little, like the scanlines of a tube screen. It
// also leaves out everything above a build height, so the model can grow from
// the bottom with a bright line at the top of the part that is drawn so far.
//
// Phosphor draws the shaded model with its creases faintly lined. Wire draws
// the creases and a faint outline, and keeps the model as an invisible solid
// that hides the lines behind it. X-ray draws the surface see-through and
// brightest at the outline. On a dark stage X-ray adds light, so the layers
// glow where they overlap. On a light stage it lays them down like ink.
//
// Under the model lies a plinth of two rings and a ring of ticks, and a scan
// ring pulses outward from its centre. The colours come from the --ph-*
// variables in demo.css.
import * as THREE from "three";

const vertexShader = /* glsl */ `
  uniform float uMinY;
  uniform float uMaxY;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vH;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vViewPos = mv.xyz;
    vNormalV = normalize(normalMatrix * normal);
    vH = (position.y - uMinY) / max(uMaxY - uMinY, 1e-4);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uDark;
  uniform vec3 uLit;
  uniform vec3 uRim;
  uniform vec3 uHot;
  uniform vec3 uBuild;
  uniform float uTime;
  uniform float uReveal;
  uniform float uXray;
  uniform float uGlow;
  uniform float uAmount;
  uniform float uScan;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  varying float vH;

  void main() {
    // Nothing above the build height is drawn yet.
    if (vH > uReveal) discard;

    vec3 n = normalize(vNormalV);
    if (!gl_FrontFacing) n = -n;
    vec3 v = normalize(-vViewPos);

    // A key light, a soft fill and some light from above, all fixed to the
    // camera. The shade is pulled part of the way to six flat bands, and then
    // squared so the bands stay apart once the colour is brightened for the
    // screen.
    vec3 keyDir = normalize(vec3(0.45, 0.75, 0.55));
    vec3 fillDir = normalize(vec3(-0.75, 0.15, 0.35));
    float key = max(dot(n, keyDir), 0.0);
    float fill = max(dot(n, fillDir), 0.0);
    float hemi = 0.5 + 0.5 * n.y;
    float shade = key * 0.72 + fill * 0.16 + hemi * 0.2;
    shade = mix(shade, floor(shade * 6.0 + 0.5) / 6.0, 0.5);
    shade *= shade;

    vec3 halfDir = normalize(keyDir + v);
    float spec = pow(max(dot(n, halfDir), 0.0), 42.0);
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.6);
    vec3 col = mix(uDark, uLit, clamp(shade, 0.0, 1.1));
    col += uHot * spec * 0.5;
    col += uRim * fres * 0.4;

    // Scanlines. They crawl upward while uTime runs.
    float scan = 1.0 - uScan * (0.5 + 0.5 * sin(gl_FragCoord.y * 1.35 - uTime * 5.0));
    col *= scan;

    float alpha = 1.0;
    if (uXray > 0.5) {
      float body = (0.05 + fres * 1.1) * uAmount;
      col = uRim * scan * mix(1.0, body, uGlow);
      alpha = clamp(body, 0.0, 1.0);
    }

    // The build line is a bright band just under the build height.
    float edge = (1.0 - smoothstep(0.0, 0.03, uReveal - vH)) * (1.0 - step(0.9999, uReveal));
    col = mix(col, uBuild, edge);
    alpha = max(alpha, edge);

    gl_FragColor = vec4(col, alpha);
    #include <colorspace_fragment>
  }
`;

function phosphorMaterial(xray) {
  return new THREE.ShaderMaterial({
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: xray,
    depthWrite: !xray,
    side: xray ? THREE.DoubleSide : THREE.FrontSide,
    // The solid sits a hair behind its own crease lines so they are not lost in it.
    polygonOffset: !xray,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    uniforms: {
      uDark: { value: new THREE.Color() },
      uLit: { value: new THREE.Color() },
      uRim: { value: new THREE.Color() },
      uHot: { value: new THREE.Color() },
      uBuild: { value: new THREE.Color() },
      uTime: { value: 0 },
      uReveal: { value: 1.01 },
      uXray: { value: xray ? 1 : 0 },
      uGlow: { value: 1 },
      uAmount: { value: 1 },
      uScan: { value: 0.1 },
      uMinY: { value: 0 },
      uMaxY: { value: 1 },
    },
  });
}

// A flat circle of radius 1 in the floor plane.
function ring(segments) {
  const points = [];
  for (let i = 0; i < segments; i++) {
    const a = i / segments * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

// The plinth for a footprint of radius 1: a ring around the footprint, a
// smaller ring inside it, 48 ticks around the outside with every fourth one
// longer, and four short spokes on the axes.
function plinthGeometry() {
  const points = [];
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * Math.PI * 2;
    const outer = i % 4 === 0 ? 1.12 : 1.05;
    points.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    points.push(new THREE.Vector3(Math.cos(a) * outer, 0, Math.sin(a) * outer));
  }
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
    points.push(new THREE.Vector3(d[0] * 0.8, 0, d[1] * 0.8));
    points.push(new THREE.Vector3(d[0] * 1.25, 0, d[1] * 1.25));
  });
  return new THREE.BufferGeometry().setFromPoints(points);
}

export function createLooks(scene) {
  const solid = new THREE.Mesh(new THREE.BufferGeometry(), phosphorMaterial(false));
  const xray = new THREE.Mesh(solid.geometry, phosphorMaterial(true));
  const materials = [solid.material, xray.material];

  // Crease lines are cut off at the build height by a clipping plane that
  // keeps everything below it.
  const clip = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
  const edges = new THREE.LineSegments(
    new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, clippingPlanes: [clip] })
  );

  const plinthMaterial = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.7, depthWrite: false });
  const circle = ring(96);
  const plinth = new THREE.Group();
  const inner = new THREE.LineLoop(circle, plinthMaterial);
  inner.scale.setScalar(0.72);
  plinth.add(new THREE.LineLoop(circle, plinthMaterial), inner, new THREE.LineSegments(plinthGeometry(), plinthMaterial));

  const scanRing = new THREE.LineLoop(circle, new THREE.LineBasicMaterial({ transparent: true, depthWrite: false }));

  const group = new THREE.Group();
  group.add(solid, xray, edges, plinth, scanRing);
  group.visible = false;
  scene.add(group);

  const colors = { line: new THREE.Color(), wire: new THREE.Color() };
  let look = "plain";
  let data = null;
  let minY = 0;
  let height = 1;
  let footprint = 1;
  let time = 0;
  let reveal = 1;
  let building = false;
  let progress = 0;
  let duration = 1.4;

  // The crease lines are worked out the first time a model is shown in one of
  // these looks, and kept with the model.
  function creases() {
    if (!data.edges) data.edges = new THREE.EdgesGeometry(data.geometry, 32);
    return data.edges;
  }

  function apply() {
    group.visible = look !== "plain" && data !== null;
    if (!group.visible) return;
    edges.geometry = creases();
    solid.visible = look !== "xray";
    solid.material.colorWrite = look !== "wire";
    // Wire also draws the X-ray surface faintly. The hidden solid in front
    // keeps only its nearest layer, which gives curved parts an outline.
    xray.visible = look !== "phosphor";
    xray.material.uniforms.uAmount.value = look === "wire" ? 0.6 : 1;
    edges.material.color.copy(look === "wire" ? colors.wire : colors.line);
    edges.material.opacity = look === "wire" ? 0.95 : look === "xray" ? 0.18 : 0.3;
  }

  function setModel(next) {
    data = next;
    if (data) {
      const box = data.geometry.boundingBox;
      minY = box.min.y;
      height = Math.max(box.max.y - box.min.y, 1e-3);
      footprint = Math.hypot(box.max.x - box.min.x, box.max.z - box.min.z) / 2;
      solid.geometry = xray.geometry = data.geometry;
      materials.forEach(function (m) {
        m.uniforms.uMinY.value = box.min.y;
        m.uniforms.uMaxY.value = box.max.y;
      });
      plinth.scale.setScalar(footprint);
      plinth.position.y = minY;
      scanRing.position.y = minY;
    }
    apply();
  }

  function setLook(name) {
    look = name;
    if (look === "plain") finish();
    apply();
  }

  // read(name) returns the value of a CSS variable.
  function setColors(read) {
    materials.forEach(function (m) {
      m.uniforms.uDark.value.set(read("--ph-dark"));
      m.uniforms.uLit.value.set(read("--ph-lit"));
      m.uniforms.uHot.value.set(read("--ph-hot"));
      m.uniforms.uBuild.value.set(read("--ph-build"));
    });
    solid.material.uniforms.uRim.value.set(read("--ph-rim"));
    xray.material.uniforms.uRim.value.set(read("--ph-xray"));
    colors.line.set(read("--ph-line"));
    colors.wire.set(read("--ph-wire"));
    plinthMaterial.color.set(read("--ph-dim"));
    scanRing.material.color.set(read("--ph-line"));

    // X-ray glows on a dark stage and is laid down like ink on a light one.
    const hsl = new THREE.Color(read("--panel")).getHSL({});
    const glow = hsl.l < 0.5;
    xray.material.blending = glow ? THREE.AdditiveBlending : THREE.NormalBlending;
    xray.material.uniforms.uGlow.value = glow ? 1 : 0;
    apply();
  }

  // Grows the model from the bottom over the given number of seconds.
  function build(seconds) {
    if (look === "plain" || !data) return;
    duration = seconds || 1.4;
    progress = 0;
    reveal = 0;
    building = true;
  }

  function finish() {
    building = false;
    reveal = 1;
  }

  // Moves the build on by dt seconds. The scanlines and the scan ring move
  // only when motion is true. Returns true while another frame is needed.
  function update(dt, motion) {
    if (building) {
      progress = Math.min(1, progress + dt / duration);
      reveal = 1 - Math.pow(1 - progress, 2.2);
      if (progress >= 1) finish();
    }
    if (motion) time += dt;

    const done = reveal >= 1;
    materials.forEach(function (m) {
      m.uniforms.uReveal.value = done ? 1.01 : reveal;
      m.uniforms.uTime.value = time;
    });
    clip.constant = done ? minY + height * 10 : minY + reveal * height;

    const pulse = group.visible && motion;
    scanRing.visible = pulse;
    if (pulse) {
      const cycle = time * 0.35 % 1;
      scanRing.scale.setScalar(footprint * (0.25 + cycle));
      scanRing.material.opacity = (1 - cycle) * 0.5;
    }
    return group.visible && (building || pulse);
  }

  return {
    setModel: setModel,
    setLook: setLook,
    setColors: setColors,
    build: build,
    finish: finish,
    update: update,
  };
}
