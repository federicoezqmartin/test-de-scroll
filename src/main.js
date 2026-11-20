// Arranque: renderer, menú con vitrina 3D, y ciclo menú -> partida -> resultados.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import './style.css';
import { HEROES, heroById } from './data.js';
import { buildHero, animateRig, disposeRig } from './models.js';
import { Match } from './match.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { audio } from './audio.js';
import { artUrl, preloadArt } from './assets.js';
import { Gfx, QUALITY, QUALITY_ORDER } from './gfx.js';

const canvas = document.getElementById('game');
const coarse = matchMedia('(pointer: coarse)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  document.getElementById('fatal').hidden = false;
  document.getElementById('menu').hidden = true;
  throw new Error('WebGL no disponible');
}
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

// Entorno suave para que los metales y el vidrio tengan reflejos.
const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
pmrem.dispose();
preloadArt();

// Calidad gráfica. Arranca en Alta (Media en táctiles); si la partida no llega a ~27 cuadros
// por segundo baja sola un nivel. Elegirla a mano, o pasar ?q=alta|media|baja, apaga ese ajuste.
const gfx = new Gfx(renderer);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin storage */ } },
};
const urlQ = new URLSearchParams(location.search).get('q');
const manualQ = QUALITY[urlQ] ? urlQ : QUALITY[store.get('tuzanja-calidad')] ? store.get('tuzanja-calidad') : null;
let autoQuality = !manualQ;
let fpsFrames = 0, fpsTime = 0, fpsWarm = 0; // medición de cuadros por segundo (ver watchFps)
let qualityName = manualQ || (QUALITY[store.get('tuzanja-calidad-auto')] ? store.get('tuzanja-calidad-auto') : coarse ? 'media' : 'alta');

const ui = new UI();
const input = new Input({
  canvas,
  stick: document.getElementById('stick'),
  btnAttack: document.getElementById('btn-attack'),
  btnSuper: document.getElementById('btn-super'),
  onPause: () => togglePause(),
});

if (coarse) input.setTouch(true);

// ---------------------------------------------------------------- vitrina --
class Showcase {
  constructor() {
    const s = (this.scene = new THREE.Scene());
    s.background = new THREE.Color(0x0e1a2e);
    s.fog = new THREE.Fog(0x0e1a2e, 9, 22);
    s.environment = envMap;
    s.environmentIntensity = 0.6;
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 60);
    s.add(new THREE.HemisphereLight(0xdcebff, 0x39445c, 1.1));
    const key = new THREE.DirectionalLight(0xfff1d8, 2.8);
    key.position.set(-3, 6, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -3, right: 3, top: 3, bottom: -3, near: 1, far: 20 });
    key.shadow.normalBias = 0.03;
    s.add(key);
    this.rim = new THREE.PointLight(0xffffff, 30, 12, 1.8);
    this.rim.position.set(2.5, 2.2, -3);
    s.add(this.rim);

    const stone = new THREE.MeshStandardMaterial({ color: 0x2a3b57, roughness: 0.7, metalness: 0.2 });
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.4, 0.3, 40), stone);
    ped.position.y = -0.15;
    ped.receiveShadow = true;
    this.glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const trim = new THREE.Mesh(new THREE.TorusGeometry(1.26, 0.035, 8, 60), this.glowMat);
    trim.rotation.x = Math.PI / 2;
    trim.position.y = 0.005;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 48), new THREE.MeshStandardMaterial({ color: 0x122039, roughness: 0.9 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.3;
    floor.receiveShadow = true;
    s.add(ped, trim, floor);
    this.spin = new THREE.Group();
    s.add(this.spin);
    this.rig = null;
    this.t = 0;
    this.pop = 1;
    this.kickT = 1.2;
    this.kick = 0;
  }

  setHero(id) {
    if (this.rig) { this.spin.remove(this.rig.root); disposeRig(this.rig); }
    this.rig = buildHero(id);
    this.spin.add(this.rig.root);
    const c = new THREE.Color(heroById(id).color);
    this.glowMat.color.copy(c);
    this.rim.color.copy(c);
    this.pop = 0;
    this.kickT = 0.9;
  }

  // Encuadra al personaje dentro del hueco libre del menú.
  frame(w, h, rect) {
    const cam = this.camera;
    cam.aspect = w / h;
    const k = 2 * Math.tan((cam.fov * Math.PI) / 360);
    const fitH = 2.9 / (k * 0.92 * (rect.height / h));
    const fitW = 2.7 / (k * cam.aspect * 0.92 * (rect.width / w));
    const d = Math.max(5, fitH, fitW);
    cam.position.set(0, 1.45, d);
    cam.lookAt(0, 0.82, 0);
    cam.setViewOffset(w, h, w / 2 - (rect.left + rect.width / 2), h / 2 - (rect.top + rect.height / 2), w, h);
    cam.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    this.pop = Math.min(1, this.pop + dt * 3.5);
    this.kick = Math.max(0, this.kick - dt * 4);
    this.kickT -= dt;
    if (this.kickT <= 0) { this.kick = 1; this.kickT = 2.4; }
    if (!this.rig) return;
    const e = 1 - (1 - this.pop) ** 3;
    this.rig.root.scale.setScalar(0.4 + 0.6 * e);
    this.spin.rotation.y = 0.35 + Math.sin(this.t * 0.6) * 0.55 + (1 - e) * 3;
    const walk = (Math.sin(this.t * 0.45) + 1) / 2 > 0.72 ? 1 : 0;
    this.move = (this.move || 0) + (walk - (this.move || 0)) * Math.min(1, dt * 6);
    animateRig(this.rig, { t: this.t, move: this.move, phase: this.t * 10, kick: this.kick });
  }

  // Retratos chicos de cada personaje para las tarjetas.
  portraits() {
    const out = {};
    const size = 144;
    const cam = new THREE.PerspectiveCamera(26, 1, 0.5, 30);
    const prevBg = this.scene.background, prevFog = this.scene.fog;
    const keepRig = this.rig;
    if (keepRig) this.spin.remove(keepRig.root);
    this.scene.fog = null;
    this.spin.rotation.y = 0.45;
    renderer.setPixelRatio(1);
    renderer.setSize(size, size, false);
    for (const h of HEROES) {
      const rig = buildHero(h.id);
      animateRig(rig, { t: 0, move: 0, phase: 0, kick: 0 });
      this.spin.add(rig.root);
      this.scene.background = new THREE.Color(h.color).multiplyScalar(0.32);
      const top = rig.height;
      cam.position.set(0, top * 0.72, 4.6);
      cam.lookAt(0, top * 0.6, 0);
      renderer.render(this.scene, cam);
      try { out[h.id] = canvas.toDataURL('image/png'); } catch { /* sin retrato */ }
      this.spin.remove(rig.root);
      disposeRig(rig);
    }
    this.scene.background = prevBg;
    this.scene.fog = prevFog;
    if (keepRig) this.spin.add(keepRig.root);
    return out;
  }
}

const showcase = new Showcase();
let match = null;
let state = 'menu';
let paused = false;
let lastHero = ui.selected;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  gfx.setSize(w, h);
  if (match) match.resize(w, h);
  if (state === 'menu') showcase.frame(w, h, ui.stage.getBoundingClientRect());
}

function toMenu() {
  if (match) { match.dispose(); match = null; }
  state = 'menu';
  paused = false;
  input.enabled = false;
  input.reset();
  ui.resetHud();
  ui.show('menu');
  resize();
}

function startMatch(heroId) {
  audio.unlock();
  if (match) match.dispose();
  ui.resetHud();
  lastHero = heroId;
  match = new Match({
    heroId, input, hud: ui, layer: ui.layer, env: envMap, quality: gfx.q,
    onEnd: (res) => {
      state = 'results';
      input.enabled = false;
      input.reset();
      ui.showResults(res);
    },
  });
  state = 'match';
  paused = false;
  fpsWarm = 0;
  input.reset();
  input.enabled = true;
  ui.setHints(input.touch || coarse);
  ui.show('match');
  resize();
}

function togglePause() {
  if (state !== 'match' || !match || match.state === 'over') return;
  paused = !paused;
  input.enabled = !paused;
  if (paused) input.reset();
  ui.setPaused(paused);
}

ui.onSelect = (id, byUser) => {
  showcase.setHero(id);
  if (byUser) { audio.unlock(); audio.play('ui'); }
};
// Retratos: el arte original donde existe; si no, una foto del modelo 3D.
const portraits = showcase.portraits();
for (const h of HEROES) if (h.art) portraits[h.id] = artUrl(h.art);
ui.buildRoster(portraits);

function setQuality(name, manual) {
  qualityName = name;
  fpsWarm = 0;
  gfx.setQuality(name);
  if (match) match.setQuality(gfx.q);
  ui.setQuality(QUALITY[name].label);
  if (manual) {
    autoQuality = false;
    store.set('tuzanja-calidad', name);
  } else store.set('tuzanja-calidad-auto', name);
}
const cycleQuality = () => {
  audio.unlock();
  audio.play('ui');
  setQuality(QUALITY_ORDER[(QUALITY_ORDER.indexOf(qualityName) + 1) % QUALITY_ORDER.length], true);
};
setQuality(qualityName, !!manualQ && !urlQ ? true : false);
if (urlQ && QUALITY[urlQ]) autoQuality = false;
ui.setHints(coarse);
ui.show('menu');

const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
on('play', () => startMatch(ui.selected));
on('again', () => startMatch(lastHero));
on('change', toMenu);
on('resume', togglePause);
on('quit', toMenu);
on('btn-pause', togglePause);
on('btn-quality', cycleQuality);
on('btn-quality-2', cycleQuality);
const muteBtn = document.getElementById('btn-mute');
muteBtn.classList.toggle('off', audio.muted);
muteBtn.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  muteBtn.classList.toggle('off', audio.muted);
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Enter' || e.repeat) return;
  if (state === 'menu') startMatch(ui.selected);
  else if (state === 'results') startMatch(lastHero);
});
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'match' && !paused) togglePause();
});
if (document.fonts?.ready) document.fonts.ready.then(resize);
resize();

// Mide los cuadros por segundo durante el juego y baja la calidad si no alcanza.
// Espera unos segundos tras empezar o cambiar de nivel, porque ahí se compilan shaders.
function watchFps(raw) {
  if (!autoQuality || paused || state !== 'match' || match.state !== 'play' || raw > 3) {
    fpsFrames = fpsTime = 0;
    return;
  }
  if (fpsWarm < 3) {
    fpsWarm += raw;
    return;
  }
  fpsFrames++;
  fpsTime += raw;
  if (fpsTime < 2.5) return;
  const fps = fpsFrames / fpsTime;
  fpsFrames = fpsTime = 0;
  const i = QUALITY_ORDER.indexOf(qualityName);
  if (fps < 27 && i > 0) {
    setQuality(QUALITY_ORDER[i - 1], false);
    ui.toast(`Bajé los gráficos a ${QUALITY[qualityName].label} para que vaya más fluido. Se cambia desde Pausa.`);
  }
}

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  if (state === 'menu') {
    showcase.update(dt);
    gfx.render(showcase.scene, showcase.camera, dt);
  } else if (match) {
    if (!paused) match.update(dt);
    gfx.render(match.scene, match.camera, dt);
    watchFps(raw);
  }
}
requestAnimationFrame(loop);

// Gancho de depuración para pruebas automáticas.
window.__trifulca = { get match() { return match; }, get state() { return state; }, get quality() { return qualityName; }, gfx, input, startMatch, toMenu, setQuality };
