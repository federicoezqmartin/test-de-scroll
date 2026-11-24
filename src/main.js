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
import { BASE_LOOK } from './looks.js';
import { settings, setSetting, onSettings, autoLevel } from './settings.js';

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

// Calidad gráfica. En "Auto" arranca en Alta (Media en táctiles) y, si la partida no llega a
// ~27 cuadros por segundo, baja sola un nivel. ?q=alta|media|baja fuerza un nivel por esta visita.
const gfx = new Gfx(renderer);
const urlQ = new URLSearchParams(location.search).get('q');
const forcedQ = QUALITY[urlQ] ? urlQ : null;
let fpsFrames = 0, fpsTime = 0, fpsWarm = 0; // medición de cuadros por segundo (ver watchFps)
let qualityName = 'media';
const autoQuality = () => !forcedQ && settings.quality === 'auto';

const ui = new UI();
const input = new Input({
  canvas,
  stick: document.getElementById('stick'),
  btnAttack: document.getElementById('btn-attack'),
  btnSuper: document.getElementById('btn-super'),
  onPause: () => togglePause(),
  onView: () => cycleView(),
  onLockChange: () => syncLock(),
  onLockLost: () => { if (state === 'match' && !paused) togglePause(); },
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
    this.spin.rotation.y = this.angle ?? 0.35 + Math.sin(this.t * 0.6) * 0.55 + (1 - e) * 3; // angle: giro fijo, para pruebas
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
  syncLock();
}

function startMatch(heroId) {
  audio.unlock();
  if (match) match.dispose();
  ui.resetHud();
  lastHero = heroId;
  match = new Match({
    heroId, input, hud: ui, layer: ui.layer, env: envMap, quality: gfx.q, settings,
    onEnd: (res) => {
      state = 'results';
      input.enabled = false;
      input.reset();
      syncLock();
      ui.showResults(res);
    },
  });
  ui.bindMatch(match);
  state = 'match';
  paused = false;
  fpsWarm = 0;
  input.reset();
  input.enabled = true;
  ui.setHints(input.touch || coarse, settings.view);
  ui.show('match');
  resize();
  syncLock();
}

// El mouse queda capturado solo jugando, sin pausa, en una vista con cámara propia.
function syncLock() {
  const cam = settings.view !== 'arriba';
  input.lookMode = cam;
  const want = cam && state === 'match' && !paused && !!match && match.state !== 'over' && !input.touch;
  if (want !== input.wantLock) input.setWantLock(want);
  ui.setLockHint(want && !input.locked);
}

// Tecla V: arriba → al hombro → primera persona → arriba.
function cycleView() {
  const order = ['arriba', 'hombro', 'primera'];
  setSetting('view', order[(order.indexOf(settings.view) + 1) % order.length]);
  ui.toast({ arriba: 'Vista de arriba', hombro: 'Vista al hombro', primera: 'Primera persona' }[settings.view]);
}

function togglePause() {
  if (ui.closeSettings()) return; // Esc con la configuración abierta: la cierra
  if (state !== 'match' || !match || match.state === 'over') return;
  paused = !paused;
  input.enabled = !paused;
  if (paused) input.reset();
  ui.setPaused(paused, match);
  syncLock(); // al seguir jugando (clic en el botón) vuelve a capturar el mouse
}

// Configuración: desde el menú, desde la pausa o desde el botón del HUD (que además pausa).
function openSettings() {
  audio.unlock();
  audio.play('ui');
  if (state === 'match' && !paused) togglePause();
  ui.openSettings();
}
ui.onSettingsClose = () => {
  if (state === 'match' && paused) ui.setPaused(true, match);
};

ui.onSelect = (id, byUser) => {
  showcase.setHero(id);
  if (byUser) { audio.unlock(); audio.play('ui'); }
};
// Retratos: el arte original donde existe; si no, una foto del modelo 3D.
const portraits = showcase.portraits();
for (const h of HEROES) if (h.art) portraits[h.id] = artUrl(h.art);
ui.buildRoster(portraits);

// Pone un nivel de calidad concreto.
function setLevel(name) {
  qualityName = name;
  fpsWarm = 0;
  gfx.setQuality(name);
  gfx.setOptions(settings);
  if (match) match.setQuality(gfx.q);
}
// Decide el nivel según la configuración (o el que se forzó por la dirección).
function applyQuality() {
  const saved = autoLevel.get();
  const auto = QUALITY[saved] ? saved : coarse ? 'media' : 'alta';
  const want = forcedQ || (settings.quality === 'auto' ? auto : settings.quality);
  if (want !== qualityName || !gfx.name) setLevel(want);
}

// Aplica la configuración a todo lo que depende de ella. k: lo que cambió (null = todo).
function applySettings(k) {
  if (k === null || k === 'quality') applyQuality();
  // El desenfoque de maqueta solo tiene sentido mirando desde arriba.
  gfx.setOptions({ ...settings, tilt: settings.tilt && settings.view === 'arriba' });
  audio.setVolume(settings.volume);
  audio.setMuted(settings.muted);
  input.lefty = settings.lefty;
  ui.applySettings();
  if (match) match.applySettings(settings);
  if (k === 'view' || k === null) {
    ui.setHints(input.touch || coarse, settings.view);
    syncLock();
  }
  if (k === 'hudScale' || k === 'lefty' || k === null) resize();
}
onSettings(applySettings);
applySettings(null);
ui.setHints(coarse);
ui.show('menu');

const on = (id, fn) => document.getElementById(id).addEventListener('click', fn);
on('play', () => startMatch(ui.selected));
on('again', () => startMatch(lastHero));
on('change', toMenu);
on('resume', togglePause);
on('quit', toMenu);
on('btn-pause', togglePause);
on('btn-settings', openSettings);
on('btn-settings-2', openSettings);
on('btn-gear', openSettings);
on('btn-mute', () => {
  audio.unlock();
  setSetting('muted', !settings.muted);
});
window.addEventListener('keydown', (e) => {
  if (e.code !== 'Enter' || e.repeat || ui.settingsOpen) return;
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
  if (!autoQuality() || paused || state !== 'match' || match.state !== 'play' || raw > 3) {
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
    setLevel(QUALITY_ORDER[i - 1]);
    autoLevel.set(qualityName);
    ui.toast(`Bajé los gráficos a ${QUALITY[qualityName].label} para que vaya más fluido. Se cambia en Configuración.`);
  }
}

let last = performance.now();
let shownFrames = 0, shownTime = 0; // contador de cuadros por segundo que se muestra
function loop(now) {
  requestAnimationFrame(loop);
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw);
  last = now;
  shownFrames++;
  shownTime += raw;
  if (shownTime >= 0.5) {
    if (settings.fps) ui.setFps(Math.round(shownFrames / shownTime));
    shownFrames = shownTime = 0;
  }
  if (state === 'menu') {
    showcase.update(dt);
    gfx.setLook(BASE_LOOK);
    gfx.render(showcase.scene, showcase.camera, dt);
  } else if (match) {
    if (!paused) match.update(dt);
    gfx.setLook(match.look);
    gfx.render(match.scene, match.camera, dt);
    watchFps(raw);
  }
}
requestAnimationFrame(loop);

// Gancho de depuración para pruebas automáticas.
window.__trifulca = { get match() { return match; }, get state() { return state; }, get quality() { return qualityName; }, gfx, showcase, input, settings, setSetting, startMatch, toMenu, setQuality: setLevel };
