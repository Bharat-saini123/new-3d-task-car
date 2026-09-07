import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import './style.css';

const MODEL_COUNT = 24;
const MODEL_BASE = '/car FBX/FBX/';
const models = [];
let step = 0;
let autoRotate = false;
let viewMode = 'iso';
let userRotY = 0.6;
let userRotX = -0.2;
let dragging = false;
let lastPointer = { x: 0, y: 0 };
let animation = null;

const app = document.querySelector('#app');
app.innerHTML = `
  <canvas id="main-canvas"></canvas><div class="loading">Loading FBX assembly...</div>
  <button id="btn-undo" class="icon-btn glass" title="Restart build">↺</button>
  <div id="step-label"><span class="of"></span><span class="nm"></span></div>
  <div id="thumb-panel" class="glass"><canvas id="thumb-canvas" class="thumb-canvas"></canvas><div id="thumb-label">THIS PIECE</div></div>
  <div id="right-controls"><button id="btn-rotate" class="icon-btn glass" title="Auto-rotate">⟲</button><button id="btn-view" class="icon-btn glass" title="Toggle view">▢</button></div>
  <div id="hint">drag to rotate</div>
  <div id="bottom-bar"><button id="btn-prev" class="round-btn" title="Previous">◀</button><div id="slider-wrap"><div id="slider-track"><div id="slider-fill"></div><div id="slider-handle"></div></div></div><button id="btn-next" class="round-btn" title="Next">▶</button><button id="btn-reset" class="round-btn" title="Reset view">⟳</button></div>`;

const canvas = document.querySelector('#main-canvas');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.01, 100);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
const stage = new THREE.Group();
scene.add(stage);

function addLighting(target) {
  target.add(new THREE.HemisphereLight(0xbfe4ff, 0x2a5f86, 0.7));
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(3.2, 5.5, 4); key.castShadow = true; target.add(key);
  const fill = new THREE.DirectionalLight(0xbfe4ff, 0.45);
  fill.position.set(-4, 2, -2); target.add(fill);
}
addLighting(scene);
const ground = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.ShadowMaterial({ opacity: 0.22 }));
ground.rotation.x = -Math.PI / 2; ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);
for (let radius = 1.4; radius <= 3.2; radius += 0.9) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius, radius + 0.02, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = -0.015; scene.add(ring);
}

const thumbScene = new THREE.Scene();
const thumbCamera = new THREE.PerspectiveCamera(35, 1, 0.01, 50);
thumbCamera.position.set(2.6, 2, 3);
const thumbRenderer = new THREE.WebGLRenderer({ canvas: document.querySelector('#thumb-canvas'), antialias: true, alpha: true });
thumbRenderer.setPixelRatio(Math.min(devicePixelRatio, 2));
thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
addLighting(thumbScene);
const thumbGroup = new THREE.Group(); thumbScene.add(thumbGroup);
let lookAt = new THREE.Vector3(0, 1, 0);
let isoPosition = new THREE.Vector3(5, 4, 5);
let topPosition = new THREE.Vector3(0, 7, 2);
let cameraTarget = isoPosition.clone();

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  const rect = thumbRenderer.domElement.getBoundingClientRect();
  thumbRenderer.setSize(rect.width, rect.height, false); thumbCamera.aspect = rect.width / rect.height; thumbCamera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

function cloneModel(index) { return models[index].clone(true); }
function setStage(index, animate = false) {
  stage.clear();
  const model = cloneModel(index);
  const displayScale = [1, 3, 5].includes(index) ? 0.6 : index >= 7 ? 0.5 : 1;
  if (animate) {
    const end = model.position.clone();
    model.position.y += 2.5; model.scale.setScalar(displayScale * 0.78); stage.add(model);
    animation = { model, start: performance.now(), end, displayScale };
  } else { model.scale.setScalar(displayScale); stage.add(model); animation = null; }
}
function updateThumbnail(index) {
  thumbGroup.clear();
  const wrapper = new THREE.Group();
  const model = cloneModel(index);
  wrapper.add(model);
  const bounds = new THREE.Box3().setFromObject(wrapper);
  const size = new THREE.Vector3(); bounds.getSize(size);
  const center = new THREE.Vector3(); bounds.getCenter(center);
  model.position.sub(center);
  wrapper.scale.setScalar(2.05 / Math.max(size.x, size.y, size.z, 0.001));
  thumbGroup.add(wrapper);
}
function updateUi() {
  document.querySelector('.of').textContent = `${step + 1} / ${MODEL_COUNT} — `;
  document.querySelector('.nm').textContent = step === MODEL_COUNT - 1 ? 'Car assembly complete!' : `Assembly ${String(step + 1).padStart(2, '0')}`;
  const percent = step / (MODEL_COUNT - 1) * 100;
  document.querySelector('#slider-fill').style.width = `${percent}%`;
  document.querySelector('#slider-handle').style.left = `${percent}%`;
  document.querySelector('#btn-prev').disabled = step === 0;
  document.querySelector('#btn-next').disabled = step === MODEL_COUNT - 1;
  document.querySelectorAll('.tick').forEach((tick, index) => tick.classList.toggle('done', index <= step));
  updateThumbnail(step);
}
function goTo(nextStep) {
  const target = Math.max(0, Math.min(MODEL_COUNT - 1, nextStep));
  if (target === step) return;
  step = target; setStage(step, true); updateUi();
}

const track = document.querySelector('#slider-track');
for (let index = 0; index < MODEL_COUNT; index++) { const tick = document.createElement('div'); tick.className = 'tick'; tick.style.left = `${index / (MODEL_COUNT - 1) * 100}%`; track.appendChild(tick); }
track.addEventListener('pointerdown', event => goTo(Math.round(Math.max(0, Math.min(1, (event.clientX - track.getBoundingClientRect().left) / track.clientWidth)) * (MODEL_COUNT - 1))));
document.querySelector('#btn-prev').onclick = () => goTo(step - 1);
document.querySelector('#btn-next').onclick = () => goTo(step + 1);
document.querySelector('#btn-undo').onclick = () => goTo(0);
document.querySelector('#btn-reset').onclick = () => { userRotY = 0.6; userRotX = -0.2; };
document.querySelector('#btn-rotate').onclick = event => { autoRotate = !autoRotate; event.currentTarget.classList.toggle('active', autoRotate); };
document.querySelector('#btn-view').onclick = event => { viewMode = viewMode === 'iso' ? 'top' : 'iso'; cameraTarget = (viewMode === 'iso' ? isoPosition : topPosition).clone(); event.currentTarget.classList.toggle('active', viewMode === 'top'); };
canvas.onpointerdown = event => { dragging = true; lastPointer = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); };
canvas.onpointermove = event => { if (!dragging) return; userRotY += (event.clientX - lastPointer.x) * 0.008; userRotX = Math.max(-0.9, Math.min(0.9, userRotX + (event.clientY - lastPointer.y) * 0.006)); lastPointer = { x: event.clientX, y: event.clientY }; };
canvas.onpointerup = () => { dragging = false; };

function render() {
  requestAnimationFrame(render);
  if (autoRotate && !dragging) userRotY += 0.006;
  stage.rotation.set(userRotX, userRotY, 0);
  if (animation) { const progress = Math.min(1, (performance.now() - animation.start) / 700); animation.model.position.lerpVectors(new THREE.Vector3(animation.end.x, animation.end.y + 2.5, animation.end.z), animation.end, 1 - Math.pow(1 - progress, 3)); animation.model.scale.setScalar(animation.displayScale * (0.78 + progress * 0.22)); if (progress === 1) animation = null; }
  camera.position.lerp(cameraTarget, 0.08); camera.lookAt(lookAt); renderer.render(scene, camera);
  thumbGroup.rotation.y += 0.012; thumbCamera.lookAt(0, 0, 0); thumbRenderer.render(thumbScene, thumbCamera);
}

async function loadAssembly() {
  const loader = new FBXLoader();
  const rawModels = await Promise.all(Array.from({ length: MODEL_COUNT }, (_, index) => loader.loadAsync(`${MODEL_BASE}shot${String(index + 1).padStart(2, '0')}.fbx`)));
  let largestDimension = 0;
  rawModels.forEach(model => { const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3()); largestDimension = Math.max(largestDimension, size.x, size.y, size.z); });
  const scale = 3.8 / Math.max(largestDimension, 0.001);
  rawModels.forEach(model => { const bounds = new THREE.Box3().setFromObject(model); const center = bounds.getCenter(new THREE.Vector3()); model.scale.setScalar(scale); model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale); model.traverse(object => { if (object.isMesh) { object.castShadow = true; object.receiveShadow = true; } }); models.push(model); });
  const allBounds = new THREE.Box3().setFromObject(new THREE.Group().add(...models.map(model => model.clone(true))));
  lookAt = allBounds.getCenter(new THREE.Vector3()); const maxDimension = Math.max(allBounds.getSize(new THREE.Vector3()).x, allBounds.getSize(new THREE.Vector3()).y, allBounds.getSize(new THREE.Vector3()).z);
  isoPosition = lookAt.clone().add(new THREE.Vector3(1, 0.78, 1).normalize().multiplyScalar(maxDimension * 1.55)); topPosition = lookAt.clone().add(new THREE.Vector3(0.05, 1.5, 0.55).normalize().multiplyScalar(maxDimension * 1.65)); cameraTarget = isoPosition.clone();
  document.querySelector('.loading').remove(); app.classList.add('is-ready'); setStage(0, true); updateUi();
}
loadAssembly().catch(error => { document.querySelector('.loading').textContent = 'Unable to load FBX assets'; console.error(error); });
render();
