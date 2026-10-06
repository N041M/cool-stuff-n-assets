// The demo page's viewer. It loads the picked STL with three.js, turns it from
// the file's Z-up into three.js' Y-up, sets it on a floor of 10 mm squares and
// shows its size, triangle count and file. Dragging turns the model, and the
// wheel or a pinch zooms. The model turns slowly on its own unless the system
// asks for reduced motion. The Plain look is drawn here, and looks.js draws the
// Phosphor, Wire and X-ray looks. A frame is drawn only while something moves
// and the stage is on screen.
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createLooks } from "./looks.js";

const root = document.documentElement;
const reducedMQ = window.matchMedia("(prefers-reduced-motion: reduce)");

const stage = document.querySelector("[data-stage]");
const canvas = document.querySelector("[data-canvas]");
const note = document.querySelector("[data-note]");
const turnButton = document.querySelector("[data-turn]");
const buildButton = document.querySelector("[data-build]");
const lookButtons = document.querySelectorAll("[data-look]");
const out = {
  name: document.querySelector("[data-name]"),
  size: document.querySelector("[data-size]"),
  tris: document.querySelector("[data-tris]"),
  file: document.querySelector("[data-file]"),
  bytes: document.querySelector("[data-bytes]"),
};

// The list in the page is the list of models.
const MODELS = Array.from(document.querySelectorAll("[data-model]")).map(function (li) {
  return {
    slug: li.getAttribute("data-model"),
    name: li.querySelector(".pick-name").textContent,
    file: li.querySelector(".dl").getAttribute("href"),
    button: li.querySelector(".pick"),
  };
});

// The first view looks at the front of the model from 35° to its right and
// 22° above, as the preview sheets do.
const VIEW_AZIMUTH = 35 * Math.PI / 180;
const VIEW_ELEVATION = 22 * Math.PI / 180;
const GRID_STEP = 10;

// A single-feature view, set from ?feature= by the script in the head of
// demo.html. The bar names the view and links back to the full page.
const FEATURES = { models: "Models", looks: "Looks" };
const feature = root.getAttribute("data-feature");
if (FEATURES[feature]) {
  const brand = document.querySelector(".brand");
  const full = document.createElement("a");
  full.href = "demo.html";
  full.textContent = brand.textContent;
  brand.replaceChildren(full, " / " + FEATURES[feature]);
  document.title = brand.textContent;
}

// Theme switch, as on the other demos. The page opens dark, and the colours
// of the scene follow the switch.
document.querySelectorAll("[data-set-theme]").forEach(function (b) {
  b.addEventListener("click", function () {
    root.setAttribute("data-theme", b.getAttribute("data-set-theme"));
    document.querySelectorAll("[data-set-theme]").forEach(function (o) {
      o.setAttribute("aria-pressed", String(o === b));
    });
  });
});

// The Read me panel: open and close it, close it with Escape, and copy a
// code block to the clipboard.
(function () {
  const panel = document.getElementById("readme");
  const open = document.querySelector("[data-readme-open]");
  if (!panel || !open) return;
  function show(on) {
    panel.hidden = !on;
    open.setAttribute("aria-expanded", String(on));
    if (on) panel.querySelector("[data-readme-close]").focus();
    else open.focus();
  }
  open.addEventListener("click", function () { show(panel.hidden); });
  panel.querySelector("[data-readme-close]").addEventListener("click", function () { show(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !panel.hidden) show(false); });
  panel.querySelectorAll("[data-copy-code]").forEach(function (button) {
    button.addEventListener("click", function () {
      const text = button.parentElement.querySelector("code").textContent;
      if (!navigator.clipboard) return;
      navigator.clipboard.writeText(text).then(function () {
        button.textContent = "Copied";
        setTimeout(function () { button.textContent = "Copy"; }, 1500);
      }, function () {});
    });
  });
})();

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
} catch (err) {
  note.textContent = "This page needs WebGL";
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
// The crease lines of the other looks are cut at the build height with a clipping plane.
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(30, 4 / 3, 0.5, 5000);
scene.add(camera);

// Soft light from above and below, and two lights that ride with the camera,
// so the side being looked at is always lit from the upper left.
const sky = new THREE.HemisphereLight(0xffffff, 0x8a8478, 1.1);
scene.add(sky);
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(-0.7, 1.1, 0.5);
key.target.position.set(0, 0, -1);
camera.add(key, key.target);
const rim = new THREE.DirectionalLight(0xffffff, 0.6);
rim.position.set(1, 0.3, -0.4);
rim.target.position.set(0, 0, -1);
camera.add(rim, rim.target);

const material = new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0, flatShading: true });
const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
mesh.visible = false;
scene.add(mesh);

const looks = createLooks(scene);
let look = "plain";
let shown = false;

let grid = null;
let gridSize = 0;

const controls = new OrbitControls(camera, canvas);
controls.cursorStyle = "grab";
controls.autoRotateSpeed = 1.6;
controls.dampingFactor = 0.08;

function setMotion() {
  const still = reducedMQ.matches;
  controls.enableDamping = !still;
  controls.autoRotate = !still;
  turnButton.setAttribute("aria-pressed", String(controls.autoRotate));
  if (still) looks.finish();
  wake();
}

// Plain is the lit grey model. The other looks are drawn by looks.js.
function setLook(name) {
  const fromPlain = look === "plain";
  look = name;
  lookButtons.forEach(function (b) {
    b.setAttribute("aria-pressed", String(b.getAttribute("data-look") === name));
  });
  mesh.visible = shown && look === "plain";
  looks.setLook(look);
  buildButton.disabled = look === "plain";
  if (fromPlain && look !== "plain" && !reducedMQ.matches) looks.build();
  if (grid) buildGrid(gridSize);
  wake();
}
lookButtons.forEach(function (b) {
  b.addEventListener("click", function () { setLook(b.getAttribute("data-look")); });
});
// Build plays the growth again. It plays under reduced motion too, because it
// runs only when pressed.
buildButton.addEventListener("click", function () {
  looks.build();
  wake();
});

turnButton.addEventListener("click", function () {
  controls.autoRotate = !controls.autoRotate;
  turnButton.setAttribute("aria-pressed", String(controls.autoRotate));
  wake();
});
document.querySelector("[data-reset]").addEventListener("click", function () {
  controls.reset();
  wake();
});
// Each press of + or - zooms as far as a few notches of the wheel.
document.querySelectorAll("[data-zoom]").forEach(function (b) {
  b.addEventListener("click", function () {
    if (b.getAttribute("data-zoom") === "in") controls.dollyIn(0.8);
    else controls.dollyOut(0.8);
    wake();
  });
});
document.querySelectorAll("[data-step]").forEach(function (b) {
  b.addEventListener("click", function () {
    const n = MODELS.length;
    pick((current + Number(b.getAttribute("data-step")) + n) % n);
  });
});
MODELS.forEach(function (m, i) {
  m.button.addEventListener("click", function () { pick(i); });
});

// Colours come from the page, so the scene follows the light or dark theme.
function css(name) {
  return getComputedStyle(root).getPropertyValue(name).trim();
}
function applyTheme() {
  material.color.set(css("--model"));
  sky.groundColor.set(css("--drop"));
  looks.setColors(css);
  if (grid) buildGrid(gridSize);
  wake();
}

// A floor of 10 mm squares under the model, a little wider than its footprint.
// It takes the colour of the look.
function buildGrid(size) {
  if (grid) {
    scene.remove(grid);
    grid.geometry.dispose();
    grid.material.dispose();
  }
  const floor = css(look === "plain" ? "--floor" : "--ph-floor");
  grid = new THREE.GridHelper(size, size / GRID_STEP, floor, floor);
  grid.position.y = -0.05;
  gridSize = size;
  scene.add(grid);
}

// Each model is fetched once. Its size is measured in the file's own axes,
// before it is turned to Y-up.
const loader = new STLLoader();
const cache = new Map();
function load(model) {
  let pending = cache.get(model.slug);
  if (!pending) {
    pending = fetch(model.file).then(function (res) {
      if (!res.ok) throw new Error(res.status + " " + res.statusText);
      return res.arrayBuffer();
    }).then(function (buffer) {
      const geometry = loader.parse(buffer);
      geometry.computeBoundingBox();
      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      geometry.rotateX(-Math.PI / 2);
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      return {
        geometry: geometry,
        size: size,
        triangles: geometry.getAttribute("position").count / 3,
        bytes: buffer.byteLength,
      };
    });
    pending.catch(function () { cache.delete(model.slug); });
    cache.set(model.slug, pending);
  }
  return pending;
}

let current = -1;

function pick(i, keepHash) {
  if (i === current) return;
  current = i;
  const model = MODELS[i];
  MODELS.forEach(function (m, j) { m.button.setAttribute("aria-pressed", String(j === i)); });
  out.name.textContent = model.name;
  out.file.href = model.file;
  out.file.textContent = model.slug + ".stl";
  out.size.textContent = "–";
  out.tris.textContent = "–";
  out.bytes.textContent = "";
  canvas.setAttribute("aria-label", model.name + ", turned in 3D");
  note.textContent = "Loading";
  if (!keepHash) history.replaceState(null, "", "#" + model.slug);

  load(model).then(function (data) {
    if (current !== i) return;
    show(data);
    out.size.textContent = [data.size.x, data.size.y, data.size.z].map(function (v) { return v.toFixed(1); }).join(" × ") + " mm";
    out.tris.textContent = data.triangles.toLocaleString("en-US");
    out.bytes.textContent = (data.bytes / 1024).toFixed(1) + " KB";
    note.textContent = "";
  }, function (err) {
    if (current !== i) return;
    shown = false;
    mesh.visible = false;
    looks.setModel(null);
    note.textContent = "Could not load " + model.slug + ".stl";
    console.warn(err);
    wake();
  });
}

// Sets the model on the floor and frames it so its bounding sphere fits the
// narrower side of the stage. In the looks other than Plain the model grows
// from the bottom, unless the system asks for reduced motion.
function show(data) {
  const box = data.geometry.boundingBox;
  const sphere = data.geometry.boundingSphere;
  mesh.geometry = data.geometry;
  shown = true;
  mesh.visible = look === "plain";
  looks.setModel(data);
  looks.finish();
  if (!reducedMQ.matches) looks.build();

  const span = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  buildGrid(Math.ceil(span * 1.5 / (GRID_STEP * 2)) * GRID_STEP * 2);

  const target = new THREE.Vector3(0, (box.min.y + box.max.y) / 2, 0);
  const vfov = camera.fov * Math.PI / 180;
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  const r = sphere.radius;
  const d = r / Math.sin(Math.min(vfov, hfov) / 2) * 1.02;
  camera.position.set(
    target.x + d * Math.cos(VIEW_ELEVATION) * Math.sin(VIEW_AZIMUTH),
    target.y + d * Math.sin(VIEW_ELEVATION),
    target.z + d * Math.cos(VIEW_ELEVATION) * Math.cos(VIEW_AZIMUTH)
  );
  camera.near = Math.max(0.1, r / 50);
  camera.far = r * 40;
  camera.updateProjectionMatrix();
  controls.target.copy(target);
  controls.minDistance = r * 0.6;
  controls.maxDistance = r * 8;
  controls.update();
  controls.saveState();
  wake();
}

// Drawing. A frame is drawn while the model turns, while it is dragged or
// settling after a drag, while it grows, while the scanlines and scan ring of
// the other looks move, and once after any other change.
let frame = 0;
let last = 0;
let dragging = false;
let visible = true;

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
  last = now;
  const moved = controls.update(dt);
  const busy = looks.update(dt, !reducedMQ.matches);
  renderer.render(scene, camera);
  if (visible && (controls.autoRotate || dragging || moved || busy)) {
    frame = requestAnimationFrame(tick);
  } else {
    frame = 0;
    last = 0;
  }
}
function wake() {
  if (!frame) frame = requestAnimationFrame(tick);
}
controls.addEventListener("change", wake);
controls.addEventListener("start", function () { dragging = true; wake(); });
controls.addEventListener("end", function () { dragging = false; wake(); });

function resize() {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  wake();
}
new ResizeObserver(resize).observe(stage);

new IntersectionObserver(function (entries) {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) wake();
}).observe(stage);

new MutationObserver(applyTheme).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
reducedMQ.addEventListener("change", setMotion);

// The address can name a model, as in #servo-skull-drone.
function fromHash() {
  const slug = decodeURIComponent(location.hash.slice(1));
  return MODELS.findIndex(function (m) { return m.slug === slug; });
}
window.addEventListener("hashchange", function () {
  const i = fromHash();
  if (i >= 0) pick(i, true);
});

resize();
applyTheme();
setMotion();
// The Looks view opens in Phosphor, so the model grows in as it loads.
if (feature === "looks") setLook("phosphor");
pick(Math.max(fromHash(), 0), true);
