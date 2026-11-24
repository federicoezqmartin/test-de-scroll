// Una partida 3 contra 3: luchadores, combate, núcleos, reglas, cámara.
import * as THREE from 'three';
import { HEROES, RULES, TEAMS, BOT_NAMES, heroById, applyTeamPalette } from './data.js';
import { buildHero, animateRig, disposeRig } from './models.js';
import { World } from './world.js';
import { Fx } from './fx.js';
import { audio } from './audio.js';
import { Bot } from './ai.js';
import { shaderTime, grassFighters, grassShocks, shieldMaterial, zoneMaterial, indicatorMaterial, skyMaterial } from './shaders.js';
import { Debris } from './physics.js';
import { SKILL, TEAM_PALETTES } from './settings.js';
import { ViewModel } from './viewmodel.js';
import { LOOKS, mixLook } from './looks.js';

const R = 0.4; // radio de un luchador
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const ME = 0; // equipo del jugador
const NO_OFF = { x: 0, y: 0, z: 0 };
// Lo que tira el jugador en primera persona nace achicado: recién salido del arma está a un
// metro del ojo y taparía media pantalla. Recupera su tamaño en los primeros metros.
const NEAR_K = 0.4;
// La esfera de Tuerca y el frasco grande de Pompa son mucho más grandes que un disparo común:
// a un metro del ojo, aun al 40 %, eran una bola encandilante. Nacen más chicos todavía.
const NEAR_BIG = { orb: 0.2, bigflask: 0.28 };
const nearK = (visual) => NEAR_BIG[visual] ?? NEAR_K;
// El halo de lo disparado está pensado para verse desde arriba, a unos 20 m. En primera persona
// uno lo sigue por detrás, justo en el centro de la mira, y tapaba la pantalla: va más chico.
const OWN_HALO = 0.45;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

const SHOT_COLOR = { bolt: 0xffc23a, ember: 0xff8a2a, dart: 0x7df9ff, orb: 0x39e6ff, flask: 0xff6fd0, bigflask: 0x9dff3a };
const ZONE_COLOR = { stars: 0xa98bff, toxic: 0x8dff4a };
const UP = new THREE.Vector3(0, 1, 0);
const WOOD = [0xa9743c, 0x8a5526, 0xc98d4b, 0x6e4420];
const BLOOD = [0x8a0a0a, 0xb01010, 0x5e0505];
const DIRT = [0x6b4a2a, 0x8a6a44, 0x4e3620];
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), vAxis = new THREE.Vector3();
const DEFAULT_Q = { shadow: 2048, shadowRadius: 2.4, lights: 0, boost: 1, fxScale: 1 };
// Vistas: 'arriba' (cenital), 'hombro' (tercera persona) y 'primera'. La puntería sigue siendo
// plana en las tres: mirar arriba o abajo solo cambia a qué distancia cae lo que se tira en arco.
const TOP_FOV = 36;
const PITCH0 = { hombro: -0.22, primera: -0.14 };
const PITCH_LIM = { hombro: [-1.05, 0.32], primera: [-1.35, 1.15] };
const LOOK_K = 0.0023; // radianes por píxel de mouse, con sensibilidad 1
// Ayuda de puntería en táctil, al hombro y en primera persona. Trabaja solo sobre el yaw porque
// la puntería es sobre el piso. slow: parte del giro del dedo que queda con la mira sobre un
// rival. pull: qué tan rápido se corre la cámara hacia el rival cercano al centro (por segundo).
// cone: hasta qué ángulo de la mira lo busca el imán.
const ASSIST = { suave: { slow: 0.6, pull: 2.4, cone: 0.28 }, fuerte: { slow: 0.4, pull: 5, cone: 0.38 } };
const ASSIST_REACH = 9; // metros mínimos de alcance de la ayuda (los de cuerpo a cuerpo también la tienen al acercarse)
const AUTO_CONE = 1.2; // tocar sin arrastrar busca rival dentro de este ángulo alrededor de la mira
const CENTER = new THREE.Vector2(0, 0);
const HAZE = 0x9ccbe0; // color del horizonte: cielo bajo, niebla y mar lejano se funden en él

export class Match {
  constructor({ heroId, input, hud, layer, onEnd, env = null, quality = null, settings = {} }) {
    // Lo que se fija al empezar: colores de equipo, dificultad y nombre. El resto se puede cambiar en plena partida.
    applyTeamPalette(TEAM_PALETTES[settings.teamColors] || TEAM_PALETTES.clasico);
    this.skill = SKILL[settings.difficulty] || SKILL.normal;
    this.applySettings(settings);
    this.streak = 0;
    this.streakT = -99;
    const q = (this.q = quality || DEFAULT_Q);
    this.hitStop = 0;
    this.zoomKick = 0;
    this.ambT = 0;
    this.input = input;
    this.hud = hud;
    this.onEnd = onEnd;
    this.time = 0;
    this.state = 'intro';
    this.introT = 3;
    this.introN = 4;
    this.overT = 0;
    this.shake = 0;
    this.zoom = 1.7;
    this.leadTeam = -1;
    this.countdown = 0;
    this.coreT = RULES.coreFirst;
    this.vw = 1;
    this.vh = 1;
    this.markTgt = null; // rival al que iría el disparo automático (se marca en pantalla, solo en táctil)
    this.markShown = null;
    this.atkT = -99; // último ataque del jugador en táctil: el imán sigue un rato después de tocar

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(HAZE);
    scene.fog = new THREE.Fog(HAZE, 70, 150);
    if (env) {
      scene.environment = env;
      scene.environmentIntensity = 0.38;
    }
    this.camera = new THREE.PerspectiveCamera(TOP_FOV, 1, 1, 240);
    this.yaw = Math.PI; // hacia dónde mira la cámara en las vistas al hombro y en primera persona
    this.pitch = -0.15;
    this.camMode = null; // vista que se está mostrando (al morir se ve desde arriba)
    // Luz y color de la vista (ver looks.js): el actual y del que se parte al cambiar de vista.
    this.look = { ...LOOKS.arriba };
    this.lookPrev = { ...LOOKS.arriba };
    this.blend = 1;
    this.camFrom = new THREE.Vector3();
    this.lookFrom = new THREE.Vector3();
    this.lookCur = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3();
    this.camDir = new THREE.Vector3();
    this.fovFrom = TOP_FOV;
    this.nearFrom = 1;
    this.camT = new THREE.Vector3();
    this.camDist = 17;
    this.limX = 6;
    this.limZ0 = -10;
    this.limZ1 = 10;

    // Sol cálido con sombras, relleno frío sin sombras desde el lado de la cámara.
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0xa9814e, 0.6);
    scene.add(this.hemi);
    const sun = (this.sun = new THREE.DirectionalLight(0xffdfb0, 3.4));
    sun.castShadow = true;
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    sun.shadow.radius = q.shadowRadius;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.025;
    scene.add(sun, sun.target);
    const fill = (this.fill = new THREE.DirectionalLight(0x9fd0ff, 0.32));
    fill.position.set(8, 10, 12);
    scene.add(fill);
    this.sunDir = new THREE.Vector3(-12, 17, -9).normalize();
    this.lightRight = new THREE.Vector3().crossVectors(UP, this.sunDir).normalize();
    this.lightUp = new THREE.Vector3().crossVectors(this.sunDir, this.lightRight);
    this.shadowHalf = 15;
    this.snapT = new THREE.Vector3();

    this.own = []; // geometrías y materiales propios de la partida, para liberarlos al salir
    this.sky = new THREE.Mesh(this.keep(new THREE.SphereGeometry(200, 32, 16)), this.keep(skyMaterial(this.sunDir, HAZE)));
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.sky.userData.noAO = true;
    scene.add(this.sky);

    this.world = new World(scene);
    this.fx = new Fx(scene, layer, q);
    this.debris = new Debris(scene, this.world, {
      max: Math.round(170 * q.fxScale),
      onSplash: (x, z, y, size) => { this.fx.splash(x, z, y, size); this.sfx('splash', { x, z }, 0.5); },
    });
    // No se mancha el agua, ni arriba de un muro, ni fuera de la isla.
    this.fx.canStain = (x, z) => {
      const w = this.world, c = w.col(x), r = w.row(z);
      return c >= 0 && r >= 0 && c < w.W && r < w.H && !w.blocksMove(c, r);
    };
    this.shocks = [{ t: 1, dur: 1 }, { t: 1, dur: 1 }];
    this.shockI = 0;
    this.projectiles = [];
    this.lobs = [];
    this.zones = [];
    this.cores = [];
    this.fighters = [];

    this.markerGeo = this.keep(new THREE.RingGeometry(0.46, 0.6, 32).rotateX(-Math.PI / 2));
    this.shieldGeo = this.keep(new THREE.SphereGeometry(0.95, 24, 16));
    this.blobGeo = this.keep(new THREE.PlaneGeometry(1.7, 1.7).rotateX(-Math.PI / 2));
    this.blobMat = this.keep(new THREE.MeshBasicMaterial({
      map: this.fx.halo, color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    }));

    // Equipos: el jugador + 2 aliados distintos, 3 rivales distintos.
    const others = shuffle(HEROES.filter((h) => h.id !== heroId).map((h) => h.id));
    const foes = shuffle(HEROES.map((h) => h.id)).slice(0, 3);
    const names = shuffle([...BOT_NAMES]);
    const lanes = [0, -1, 1];
    const me = String(settings.playerName || 'Vos');
    [heroId, others[0], others[1]].forEach((id, i) => this.addFighter(ME, i, id, i === 0, i === 0 ? me : names.pop(), lanes[i]));
    foes.forEach((id, i) => this.addFighter(1, i, id, false, names.pop(), lanes[i]));
    this.player = this.fighters[0];
    this.camT.set(this.player.x, 0, this.player.z);
    this.yaw = this.player.face;
    this.pitch = PITCH0[this.view] ?? -0.15;
    // Arma vista en primera persona. Cuelga de la cámara, así que la cámara va en la escena.
    scene.add(this.camera);
    this.vm = new ViewModel(heroId, this.camera);
    this.vm.rig.fxU.uRim.value.copy(this.player.rig.fxU.uRim.value);
    this.gunPos = new THREE.Vector3();
    this.offV = new THREE.Vector3();

    this.buildIndicator();
    this.ray = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.tmp = new THREE.Vector3();
    hud.setScore(0, 0);
    hud.setCountdown(-1, 0);
    hud.setSuper(0);
    hud.setRespawn(null);
  }

  keep(o) { this.own.push(o); return o; }

  // Opciones que se pueden cambiar con la partida en marcha.
  applySettings(s) {
    this.gore = s.gore !== false; // sangre y manchas; apagado, los golpes sueltan chispas blancas
    this.shakeScale = s.shake ?? 1;
    this.zoomUser = s.zoom ?? 1;
    this.showNumbers = s.dmgNumbers !== false;
    const prev = this.view;
    this.view = ['arriba', 'hombro', 'primera'].includes(s.view) ? s.view : 'arriba';
    this.sens = s.sens ?? 1;
    this.fovUser = s.fov ?? 90;
    this.invertY = !!s.invertY;
    this.assist = ASSIST[s.aimAssist] || null;
    // Al pasar a una vista con cámara propia, se arranca mirando hacia donde mira el personaje.
    if (this.player && prev && prev !== this.view && this.view !== 'arriba') {
      this.yaw = this.player.face;
      this.pitch = PITCH0[this.view];
    }
  }

  get firstPerson() { return this.view !== 'arriba'; }

  // Dirección en pantalla (x a la derecha, z hacia abajo) a dirección del mundo. En la vista de
  // arriba "arriba en la pantalla" es -z; en las otras, hacia donde mira la cámara.
  toWorld(x, z, out) {
    const yaw = this.firstPerson ? this.yaw : Math.PI;
    const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -Math.cos(yaw), rz = Math.sin(yaw);
    out.x = rx * x - fx * z;
    out.z = rz * x - fz * z;
    return out;
  }

  addFighter(team, slot, heroId, isPlayer, name, lane) {
    const def = heroById(heroId);
    const rig = buildHero(heroId);
    const sp = this.world.spawns[team][slot];
    const dir = team === ME ? Math.PI : 0;
    const f = {
      id: this.fighters.length, team, slot, def, isPlayer, name,
      x: sp.x, z: sp.z, airY: 0, kx: 0, kz: 0, mvx: 0, mvz: 0, velx: 0, velz: 0,
      hp: def.hp, maxHp: def.hp, ammo: RULES.ammoMax, attackCd: 0, super: 0, superTold: false,
      alive: true, respawnT: 0, shieldT: 0, revealT: 0, aimHold: 0, aim: dir, moveAng: dir, face: dir,
      moveAmt: 0, phase: 0, kick: 0, punch: 0, pop: 1, ghost: false,
      ivx: 0, ivz: 0, leanX: 0, leanZ: 0, hitX: 0, hitZ: 1, corpse: null, lastHurtT: -99, lastActT: -99,
      inBush: false, visTo: [true, true], cores: 0, action: null, queue: [], rig, bot: null,
      stats: { kills: 0, deaths: 0, dmg: 0, cores: 0 },
    };
    rig.root.rotation.order = 'YXZ';
    this.scene.add(rig.root);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isPlayer ? 0xffe14a : TEAMS[team].color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false,
    });
    f.ring = new THREE.Mesh(this.markerGeo, ringMat);
    f.ring.renderOrder = 2;
    this.scene.add(f.ring);
    const shieldMat = shieldMaterial(TEAMS[team].color);
    f.shield = new THREE.Mesh(this.shieldGeo, shieldMat);
    f.shield.position.y = 0.75;
    f.shield.visible = false;
    rig.root.add(f.shield);
    rig.fxU.uRim.value.set(isPlayer ? 0xfff0c0 : TEAMS[team].color).multiplyScalar(isPlayer ? 0.35 : 0.5);
    f.rimBase = rig.fxU.uRim.value.clone(); // cada vista lo muestra más o menos (look.rim)
    f.blob = new THREE.Mesh(this.blobGeo, this.blobMat);
    f.blob.renderOrder = 1;
    this.scene.add(f.blob);
    f.stepN = 0;
    // Pose de reposo de cada parte, para devolverla tras la caída del cuerpo.
    f.parts = [rig.torso, rig.head, rig.armL, rig.armR, rig.legL, rig.legR];
    f.rest = f.parts.map((g) => g.rotation.clone());
    this.own.push(ringMat, shieldMat);
    f.tag = this.hud.makeTag(f);
    if (!isPlayer) f.bot = new Bot(f, this, lane);
    this.fighters.push(f);
    return f;
  }

  resize(w, h) {
    this.vw = w;
    this.vh = h;
    const aspect = w / h;
    this.camera.aspect = aspect;
    const perpH = Math.max(12, 11.5 / aspect);
    this.camDist = perpH / (2 * Math.tan((TOP_FOV * DEG) / 2));
    this.camera.updateProjectionMatrix();
    // Límites de cámara: que no se vea mar de más en los bordes de la isla.
    const halfD = perpH / 2 / 0.85, halfW = (perpH * aspect) / 2;
    const W = this.world.W, H = this.world.H;
    this.limX = Math.max(0, W / 2 + 1.5 - halfW * 0.85);
    this.limZ1 = H / 2 + 1.3 - halfD * 0.8;
    this.limZ0 = Math.min(this.limZ1, -H / 2 - 1 + halfD * 0.9);
    this.shadowHalfTop = Math.max(15, Math.min(26, perpH * 0.9));
    this.setShadowHalf(this.camMode && this.camMode !== 'arriba' ? 20 : this.shadowHalfTop);
    this.camera.updateProjectionMatrix();
  }

  setShadowHalf(half) {
    if (half === this.shadowHalf) return;
    this.shadowHalf = half;
    const sc = this.sun.shadow.camera;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 1; sc.far = 80;
    sc.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- bucle --
  update(rawDt) {
    let dt = rawDt;
    if (this.state === 'over') {
      this.overT += rawDt;
      dt = rawDt * 0.3;
      if (this.overT > 2.6 && !this.ended) {
        this.ended = true;
        this.onEnd(this.result);
      }
    }
    if (this.hitStop > 0) {
      this.hitStop -= rawDt;
      dt *= 0.08;
    }
    this.time += dt;
    shaderTime.value = this.time;
    this.input.update();
    if (this.state === 'intro') this.updateIntro(dt);
    this.controlPlayer(rawDt);
    for (const f of this.fighters) {
      if (!f.bot) continue;
      if (this.state === 'play') f.bot.update(dt);
      else f.mvx = f.mvz = 0;
    }
    for (const f of this.fighters) this.updateFighter(f, dt);
    this.updateVisibility();
    this.updateProjectiles(dt);
    this.updateLobs(dt);
    this.updateZones(dt);
    this.updateCores(dt);
    this.debris.update(dt);
    this.shocks.forEach((sh, i) => {
      sh.t += dt;
      grassShocks.value[i].set(sh.x || 0, sh.z || 0, sh.radius || 1, sh.t < sh.dur ? sh.strength * (1 - sh.t / sh.dur) : 0);
    });
    if (this.state === 'play') this.updateRules(dt);
    this.updateView(dt, rawDt);
  }

  updateIntro(dt) {
    this.introT -= dt;
    const n = Math.ceil(this.introT);
    if (n !== this.introN) {
      this.introN = n;
      if (n > 0) {
        this.hud.big(String(n), 'count');
        audio.play('tick');
      } else {
        this.state = 'play';
        this.hud.big('¡A pelear!', 'go');
        audio.play('go');
      }
    }
  }

  // ------------------------------------------------------------- jugador --
  mouseGround() {
    this.ray.setFromCamera(this.input.ndc, this.camera);
    return this.ray.ray.intersectPlane(this.ground, this.tmp) || this.tmp.set(this.player.x, 0, this.player.z - 1);
  }

  // Punto del piso bajo la mira (centro de la pantalla). Mirando al horizonte o más arriba,
  // un punto lejano hacia adelante: así los ataques en arco van al máximo alcance.
  aimPoint() {
    const p = this.player, fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    this.ray.setFromCamera(CENTER, this.camera);
    const r = this.ray.ray;
    if (r.direction.y < -0.01 && r.intersectPlane(this.ground, this.tmp)) {
      const dx = this.tmp.x - p.x, dz = this.tmp.z - p.z;
      if (Math.hypot(dx, dz) > 0.7 && dx * fx + dz * fz > 0) return this.tmp;
    }
    return this.tmp.set(p.x + fx * 40, 0, p.z + fz * 40);
  }

  controlPlayer(dt = 1 / 60) {
    const p = this.player, inp = this.input;
    const events = inp.take();
    const look = inp.takeLook();
    const fp = this.firstPerson;
    // La ayuda de puntería es solo para el dedo: con mouse no cambia nada.
    const touchCam = fp && p.alive && inp.touch;
    const help = touchCam ? this.assist : null;
    if (fp && p.alive) {
      const k = LOOK_K * this.sens;
      this.yaw -= look.x * k * (help && look.x ? this.aimFriction(p, help) : 1);
      this.pitch -= look.y * k * (this.invertY ? -1 : 1);
      const [lo, hi] = PITCH_LIM[this.view];
      this.pitch = clamp(this.pitch, lo, hi);
    }
    this.markTgt = touchCam && this.state === 'play' ? this.autoTarget(p, p.def.attack, this.yaw, AUTO_CONE) : null;
    if (this.state !== 'play') {
      p.mvx = p.mvz = 0;
      this.setIndicator(null);
      return;
    }
    if (help) {
      if (events.length || inp.t.attack || inp.t.super) this.atkT = this.time;
      const moving = Math.hypot(inp.move.x, inp.move.z) > 0.2;
      if (moving || this.time - this.atkT < 0.6) this.aimMagnet(p, help, dt);
    }
    const w = this.toWorld(inp.move.x, inp.move.z, { x: 0, z: 0 });
    p.mvx = w.x;
    p.mvz = w.z;
    if (!p.alive) return this.setIndicator(null);
    if (fp) {
      // El cuerpo mira hacia donde mira la cámara, aunque camine para el costado.
      p.aim = this.yaw;
      p.aimHold = Math.max(p.aimHold, 0.12);
    }

    if (inp.touch) {
      const v = { x: 0, z: 0 };
      for (const ev of events) {
        const sup = ev.kind === 'super';
        const spec = sup ? p.def.super : p.def.attack;
        // Tocar sin arrastrar apunta solo; en las vistas con cámara propia, solo a lo que tenés adelante.
        const a = ev.auto ? this.autoAim(p, spec, fp ? this.yaw : null, AUTO_CONE) : { ...this.toWorld(ev.x, ev.z, v), dist: ev.mag * spec.range };
        if (sup) this.trySuper(p, a.x, a.z, a.dist);
        else this.tryAttack(p, a.x, a.z, a.dist);
      }
      const pv = inp.preview;
      if (!pv || (pv.kind === 'super' && p.super < 1)) return this.setIndicator(null);
      const spec = pv.kind === 'super' ? p.def.super : p.def.attack;
      this.toWorld(pv.x, pv.z, v);
      this.setIndicator({ spec, isSuper: pv.kind === 'super', x: v.x, z: v.z, dist: pv.mag * spec.range });
    } else {
      const g = fp ? this.aimPoint() : this.mouseGround();
      let dx = g.x - p.x, dz = g.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      for (const ev of events) if (ev.kind === 'super') this.trySuper(p, dx, dz, d);
      if (inp.fire) this.tryAttack(p, dx, dz, d);
      const sup = inp.superHeld && p.super >= 1;
      this.setIndicator({ spec: sup ? p.def.super : p.def.attack, isSuper: sup, x: dx, z: dz, dist: d });
    }
  }

  // Rival más cercano al que puede ir el disparo automático. yaw y cone: si se pasan (vistas con
  // cámara propia), solo cuentan los que están dentro de ese ángulo y sin muro en el medio,
  // porque detrás de los muros altos no se los ve.
  autoTarget(f, spec, yaw = null, cone = Math.PI) {
    let best = null, bd = spec.range * 1.25 + (spec.aoe || spec.radius || 0);
    for (const e of this.fighters) {
      if (e.team === f.team || !e.alive || !e.visTo[f.team]) continue;
      if (yaw !== null && Math.abs(angDiff(Math.atan2(e.x - f.x, e.z - f.z), yaw)) > cone) continue;
      const d = Math.hypot(e.x - f.x, e.z - f.z);
      if (d >= bd) continue;
      if (yaw !== null && !this.world.shotClear(f.x, f.z, e.x, e.z)) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  autoAim(f, spec, yaw = null, cone = Math.PI) {
    const best = this.autoTarget(f, spec, yaw, cone);
    const a0 = yaw ?? f.face;
    if (!best) return { x: Math.sin(a0), z: Math.cos(a0), dist: spec.range * 0.75 };
    const bd = Math.hypot(best.x - f.x, best.z - f.z);
    const tt = spec.kind === 'lob' ? spec.flight : spec.speed ? bd / spec.speed : 0;
    const dx = best.x + best.velx * tt * 0.8 - f.x, dz = best.z + best.velz * tt * 0.8 - f.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l, dist: l };
  }

  // Rivales hacia los que puede ir la ayuda de puntería, con su distancia y su ángulo respecto de
  // la mira. Nunca uno escondido en el pasto ni uno detrás de un muro o un cajón.
  assistTargets(f) {
    const out = [], reach = Math.max(ASSIST_REACH, f.def.attack.range * 1.25);
    for (const e of this.fighters) {
      if (e.team === f.team || !e.alive || !e.visTo[f.team]) continue;
      const d = Math.hypot(e.x - f.x, e.z - f.z);
      if (d > reach || d < 0.3) continue;
      const off = angDiff(Math.atan2(e.x - f.x, e.z - f.z), this.yaw);
      if (Math.abs(off) > 0.6) continue; // lejos de la mira: no hace falta mirar si hay muro
      if (!this.world.shotClear(f.x, f.z, e.x, e.z)) continue;
      out.push({ e, d, off });
    }
    return out;
  }

  // Fricción: cuánto queda del giro del dedo. 1 sin rival bajo la mira; help.slow con la mira
  // encima de uno. En el borde del rival se suelta de a poco, para que no se sienta un escalón.
  aimFriction(f, help) {
    let k = 1;
    for (const { d, off } of this.assistTargets(f)) {
      const half = Math.atan2(R + 0.3, d); // medio ancho del rival visto desde el jugador
      const a = Math.abs(off);
      if (a >= half * 2) continue;
      const w = a <= half ? 1 : 2 - a / half;
      k = Math.min(k, 1 - (1 - help.slow) * w);
    }
    return k;
  }

  // Imán: corre la cámara de a poco hacia el rival más cerca del centro de la mira. Tira más
  // cuanto más centrado está, así no arranca de golpe cuando un rival entra al cono.
  aimMagnet(f, help, dt) {
    let best = null;
    for (const t of this.assistTargets(f)) if (Math.abs(t.off) < help.cone && (!best || Math.abs(t.off) < Math.abs(best.off))) best = t;
    if (!best) return;
    const w = 1 - Math.abs(best.off) / help.cone;
    this.yaw += best.off * (1 - Math.exp(-help.pull * w * dt));
  }

  buildIndicator() {
    const g = (this.ind = new THREE.Group());
    this.indMatR = this.keep(indicatorMaterial(0));
    this.indMatC = this.keep(indicatorMaterial(1));
    this.indRect = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5)), this.indMatR);
    this.indDisc = new THREE.Mesh(this.keep(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)), this.indMatC);
    this.indFans = new Map();
    g.add(this.indRect, this.indDisc);
    // Arco punteado de los ataques que van por el aire (frasco, salto), para las vistas con cámara propia.
    this.arcN = 18;
    this.arcMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    const dotGeo = this.keep(new THREE.SphereGeometry(1, 8, 6));
    this.arcDots = this.keep(new THREE.InstancedMesh(dotGeo, this.arcMat, this.arcN));
    this.arcDots.frustumCulled = false;
    // Copia tenue que se ve a través de muros y cajones: el frasco pasa por encima.
    this.arcGhostMat = this.keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthTest: false, depthWrite: false, toneMapped: false }));
    const ghost = this.keep(new THREE.InstancedMesh(dotGeo, this.arcGhostMat, this.arcN));
    ghost.instanceMatrix = this.arcDots.instanceMatrix;
    ghost.frustumCulled = false;
    ghost.renderOrder = 5;
    this.arcDots.add(ghost);
    this.arcDots.visible = false;
    this.arcM = new THREE.Matrix4();
    g.add(this.arcDots);
    g.renderOrder = 4;
    g.visible = false;
    this.scene.add(g);
  }

  fan(arcDeg) {
    let m = this.indFans.get(arcDeg);
    if (!m) {
      const arc = arcDeg * DEG;
      m = new THREE.Mesh(this.keep(new THREE.CircleGeometry(1, 24, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2)), this.indMatC);
      this.indFans.set(arcDeg, m);
      this.ind.add(m);
    }
    return m;
  }

  setIndicator(a) {
    const g = this.ind, p = this.player;
    if (!a) { g.visible = false; return; }
    g.visible = true;
    g.position.set(p.x, 0.05, p.z);
    g.rotation.y = Math.atan2(a.x, a.z);
    const alpha = !a.isSuper && p.ammo < 1 ? 0.4 : a.isSuper ? 1.25 : 0.9;
    for (const m of [this.indMatR, this.indMatC]) {
      m.uniforms.uColor.value.set(a.isSuper ? 0xffe14a : 0xffffff);
      m.uniforms.uAlpha.value = alpha;
    }
    const lenR = this.indMatR.uniforms.uLen, lenC = this.indMatC.uniforms.uLen;
    const s = a.spec;
    this.indRect.visible = this.indDisc.visible = this.arcDots.visible = false;
    for (const f of this.indFans.values()) f.visible = false;
    const showFan = (deg, range) => {
      const f = this.fan(deg);
      f.visible = true;
      f.scale.setScalar(range);
      lenC.value = range;
    };
    switch (s.kind) {
      case 'shots':
        if (s.spread > 0) showFan(s.spread + 12, s.range);
        else {
          this.indRect.visible = true;
          this.indRect.scale.set(Math.max(0.42, s.radius * 2), 1, (lenR.value = this.world.rayShot(p.x, p.z, a.x, a.z, s.range)));
        }
        break;
      case 'melee': showFan(s.arc, s.range); break;
      case 'dash':
        this.indRect.visible = true;
        this.indRect.scale.set(s.width, 1, (lenR.value = Math.max(0.3, this.dashLength(p, a.x, a.z, s.range))));
        break;
      case 'line':
        this.indRect.visible = true;
        this.indRect.scale.set(s.width, 1, (lenR.value = Math.max(1, this.world.rayShot(p.x, p.z, a.x, a.z, s.range))));
        break;
      default: {
        const d = clamp(a.dist, 1.2, s.range);
        this.indDisc.visible = true;
        this.indDisc.position.set(0, 0, d);
        this.indDisc.scale.setScalar((lenC.value = s.aoe || s.radius));
        this.indRect.visible = true;
        this.indRect.scale.set(0.1, 1, (lenR.value = d));
        // Desde atrás o desde los ojos el disco en el piso no alcanza para ver por dónde pasa.
        if (this.camMode !== 'arriba' && (s.kind === 'lob' || s.kind === 'leap')) this.setArc(s.kind, d, a.isSuper);
      }
    }
  }

  // Los puntos corren hacia donde va a caer y siguen la misma curva que el frasco o el salto.
  setArc(kind, d, sup) {
    const m = this.arcM, n = this.arcN, run = (this.time * 1.4) % 1;
    this.arcMat.color.set(sup ? 0xffe14a : 0xffffff);
    this.arcGhostMat.color.copy(this.arcMat.color);
    for (let i = 0; i < n; i++) {
      const u = (i + run) / n;
      const y = kind === 'lob' ? 0.9 + Math.sin(u * Math.PI) * 3.2 - u * 0.7 : 0.6 + Math.sin(u * Math.PI) * 3.4;
      // Los primeros puntos quedan pegados a la cámara: nacen chiquitos.
      const e = clamp((u - 0.05) / 0.15, 0, 1);
      const sc = 0.06 * e * e * (3 - 2 * e);
      m.makeScale(sc, sc, sc).setPosition(0, y - 0.05, d * u);
      this.arcDots.setMatrixAt(i, m);
    }
    this.arcDots.instanceMatrix.needsUpdate = true;
    this.arcDots.visible = true;
  }

  // -------------------------------------------------------------- combate --
  sfx(name, src, vol = 1) {
    const d = Math.hypot(src.x - this.camT.x, src.z - this.camT.z);
    audio.play(name, vol * clamp(1 - d / 17, 0, 1) ** 1.4);
  }

  markAttack(f, dx, dz, sup = false) {
    f.aim = Math.atan2(dx, dz);
    f.aimHold = 0.5;
    f.lastActT = this.time;
    f.revealT = Math.max(f.revealT, 0.9);
    f.kick = 1;
    f.atkN = (f.atkN || 0) + 1; // la vista en primera persona anima el arma con cada ataque nuevo
    f.atkSup = sup;
  }

  tryAttack(f, dx, dz, dist) {
    if (this.state !== 'play' || !f.alive || f.action || f.ammo < 1 || f.attackCd > 0) return false;
    const a = f.def.attack;
    f.ammo -= 1;
    f.attackCd = a.cd;
    this.markAttack(f, dx, dz);
    this.perform(f, a, dx, dz, dist, false);
    return true;
  }

  trySuper(f, dx, dz, dist) {
    if (this.state !== 'play' || !f.alive || f.action || f.super < 1) return false;
    f.super = 0;
    f.superTold = false;
    this.markAttack(f, dx, dz, true);
    if (f.team === ME || f.visTo[ME]) {
      // El anillo en el piso, visto desde los ojos, es una franja amarilla que cruza la pantalla.
      const own = f.isPlayer && this.vm.root.visible;
      if (!own) this.fx.ring(f.x, f.z, 0.5, 2.2, 0xffe14a, 0.4);
      // Desde los ojos, la luz de siempre quedaría pegada al arma y bañaría de amarillo los muros
      // cercanos, que ocupan media pantalla: va más adelante y más suave.
      const ahead = own ? 3 : 0;
      this.fx.flash(f.x + dx * ahead, 1.3, f.z + dz * ahead, 0xffe14a, own ? 10 : 28, 0.35);
      this.fx.text(f.x, f.rig.height + 0.9, f.z, f.def.super.name.toUpperCase() + '!', 'super');
    }
    if (f.isPlayer) this.zoomKick = 1;
    this.perform(f, f.def.super, dx, dz, dist, true);
    return true;
  }

  perform(f, s, dx, dz, dist, isSuper) {
    const ang = Math.atan2(dx, dz);
    this.sfx(s.sfx, f);
    switch (s.kind) {
      case 'shots':
        if (s.interval > 0) {
          for (let i = 0; i < s.count; i++) f.queue.push({ t: i * s.interval, fn: () => this.spawnShot(f, s, f.aim, i > 0) });
        } else {
          for (let i = 0; i < s.count; i++) {
            const off = s.count > 1 ? (i / (s.count - 1) - 0.5) * s.spread * DEG : 0;
            this.spawnShot(f, s, ang + off, false);
          }
        }
        break;
      case 'lob': {
        const d = clamp(dist, 1.2, s.range);
        const t = this.clampToArena(f.x + dx * d, f.z + dz * d);
        const color = f.team === ME ? SHOT_COLOR[s.visual] : TEAMS[1].shot;
        const mesh = this.fx.projectile(s.visual, color);
        const off = this.gunOffset(f, f.x, 0.9, f.z);
        mesh.position.set(f.x + off.x, 0.9 + off.y, f.z + off.z);
        if (off !== NO_OFF) {
          mesh.scale.setScalar(nearK(s.visual));
          mesh.userData.halo.scale.multiplyScalar(OWN_HALO);
          this.fx.ownShot(mesh);
        }
        const mark = new THREE.Mesh(this.fx.geos.disc, zoneMaterial(color, 'warn'));
        mark.renderOrder = 2;
        mark.position.set(t.x, 0.05, t.z);
        mark.scale.setScalar(s.aoe);
        this.scene.add(mark);
        this.lobs.push({ fx: f.x, fz: f.z, tx: t.x, tz: t.z, t: 0, dur: s.flight, spec: s, owner: f, team: f.team, mesh, mark, color, off });
        break;
      }
      case 'melee':
        for (let i = 0; i < s.hits; i++) f.queue.push({ t: i * s.interval, fn: () => this.meleeHit(f, s, i) });
        break;
      case 'leap': {
        const d = clamp(dist, 1.5, s.range);
        const t = this.world.nearestFree(f.x + dx * d, f.z + dz * d, R);
        f.action = { type: 'leap', t: 0, dur: s.dur, fx: f.x, fz: f.z, tx: t.x, tz: t.z, spec: s };
        f.ghost = true;
        break;
      }
      case 'dash': {
        const d = this.dashLength(f, dx, dz, s.range);
        f.action = { type: 'dash', t: 0, dur: s.dur, fx: f.x, fz: f.z, tx: f.x + dx * d, tz: f.z + dz * d, spec: s, hit: new Set() };
        f.ghost = !s.vuln;
        break;
      }
      case 'zone': {
        const d = clamp(dist, 0, s.range);
        const t = this.clampToArena(f.x + dx * d, f.z + dz * d);
        this.addZone(t.x, t.z, s, f);
        break;
      }
      case 'line': this.lineHit(f, s, dx, dz); break;
      default: break;
    }
  }

  clampToArena(x, z) {
    const w = this.world;
    return { x: clamp(x, -w.W / 2 + 0.5, w.W / 2 - 0.5), z: clamp(z, -w.H / 2 + 0.5, w.H / 2 - 0.5) };
  }

  dashLength(f, dx, dz, range) {
    let d = 0;
    while (d + 0.2 <= range && this.world.circleFree(f.x + dx * (d + 0.2), f.z + dz * (d + 0.2), R)) d += 0.2;
    return d;
  }

  // Golpe en línea (la zanja): daña todo lo que haya en el rectángulo y cura al que pega.
  lineHit(f, s, dx, dz) {
    const len = Math.max(1, this.world.rayShot(f.x, f.z, dx, dz, s.range));
    let dealt = 0;
    for (const e of this.fighters) {
      if (e.team === f.team || !e.alive || e.ghost) continue;
      const rx = e.x - f.x, rz = e.z - f.z;
      const along = rx * dx + rz * dz, side = Math.abs(rx * dz - rz * dx);
      if (along < -0.3 || along > len + R || side > s.width / 2 + R) continue;
      const before = e.hp;
      this.damage(e, s.dmg, f, { kx: dx * s.knock, kz: dz * s.knock });
      dealt += before - Math.max(0, e.hp);
    }
    if (dealt > 0 && s.heal) {
      const h = Math.round(Math.min(f.maxHp - f.hp, dealt * s.heal));
      f.hp += h;
      if (h > 0 && (f.team === ME || f.visTo[ME])) this.fx.text(f.x, f.rig.height + 0.6, f.z, '+' + h, 'heal');
    }
    const w = this.world;
    for (let d = 0.4; d <= len + 0.6; d += 0.5) {
      const c = w.col(f.x + dx * d), r = w.row(f.z + dz * d);
      if (w.damageCrate(c, r, s.dmg * 1.4) === 'broken') this.breakCrate(c, r, dx, dz);
      if (w.cutBush(c, r)) this.fx.burst(w.cx(c), 0.5, w.cz(r), { n: 12, color: [0x4d9a26, 0x78bf3a, 0x8fc440], speed: 3.5, up: 4.5, life: 0.8, size: 0.09, grav: 7, hot: false, spread: 0.4 });
    }
    this.debris.impulse(f.x + dx * len * 0.5, f.z + dz * len * 0.5, len * 0.6 + 1, 5);
    if (f.team === ME || f.visTo[ME]) {
      const d0 = f.isPlayer && this.vm.root.visible ? 1.4 : 0.5; // en primera persona, los primeros terrones saltarían en la cara
      for (let d = d0; d < len; d += 0.45) {
        const x = f.x + dx * d, z = f.z + dz * d;
        this.debris.add('rock', x, 0.1, z, (Math.random() - 0.5) * 3 + dz * (Math.random() - 0.5) * 4, 3.5 + Math.random() * 3, (Math.random() - 0.5) * 3 - dx * (Math.random() - 0.5) * 4, { size: 0.07 + Math.random() * 0.12, color: DIRT[Math.floor(Math.random() * 3)], life: 6 });
        this.fx.burst(x, 0.15, z, { n: 5, color: [0x6b4a2a, 0x9a6e3c, 0xd9b46a, 0x3a2a1c], speed: 2.6, up: 4.5, life: 0.55, size: 0.15, spread: s.width * 0.3, hot: false });
        this.fx.puff(x, 0.25, z, { n: 1, size: 1.0, life: 0.9, alpha: 0.4, rise: 0.9, color: 0xb9925c });
        if (Math.round(d / 0.45) % 3 === 0) this.fx.scorch(x, z, s.width * 0.75, 5);
      }
    }
    const cd = Math.hypot(f.x - this.camT.x, f.z - this.camT.z);
    this.shake = Math.max(this.shake, clamp(0.5 - cd / 20, 0, 0.5));
  }

  spawnShot(f, s, ang, repeat) {
    if (!f.alive) return;
    if (repeat) this.sfx(s.sfx, f, 0.8);
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const color = f.team === ME ? SHOT_COLOR[s.visual] : TEAMS[1].shot;
    const mesh = this.fx.projectile(s.visual, color);
    const x = f.x + dx * 0.55, z = f.z + dz * 0.55;
    const off = this.gunOffset(f, x, 0.8, z, angDiff(ang, f.aim) > 0.01 ? 1 : 0);
    mesh.position.set(x + off.x, 0.8 + off.y, z + off.z);
    if (off !== NO_OFF) {
      mesh.scale.setScalar(nearK(s.visual));
      mesh.userData.halo.scale.multiplyScalar(OWN_HALO);
      this.fx.ownShot(mesh);
    }
    mesh.rotation.y = ang;
    f.kick = 1;
    const recoil = s.pierce ? 3 : s.dmg > 800 ? 1.7 : 0.5; // el arma empuja hacia atrás al que dispara
    f.kx -= dx * recoil;
    f.kz -= dz * recoil;
    if (f.team === ME || f.visTo[ME]) {
      this.fx.burst(mesh.position.x, mesh.position.y, mesh.position.z, { n: 4, color: [color, 0xffffff], speed: 2.5, up: 1, life: 0.2, size: 0.08, vx: dx * 4, vz: dz * 4 });
      if (s.visual === 'bolt') {
        // casquillo que salta hacia el costado
        const side = Math.random() < 0.5 ? 1 : -1;
        this.debris.add('box', f.x + dx * 0.3, 0.85, f.z + dz * 0.3, dz * side * 2.4 - dx, 3.2, -dx * side * 2.4 - dz, { size: [0.05, 0.05, 0.12], color: 0xd9a441, life: 3.5, spin: 22 });
      }
    }
    this.projectiles.push({
      x, z, dx, dz, speed: s.speed, left: s.range - 0.55, r: s.radius, dmg: s.dmg, owner: f, team: f.team,
      pierce: !!s.pierce, knock: s.knock || 0, hit: new Set(), mesh, color, visual: s.visual, trail: 0, off, gone: 0,
    });
  }

  // En primera persona lo que tira el jugador sale del arma que se ve en pantalla. Es solo dónde
  // se dibuja: el disparo sigue saliendo del centro del personaje y la diferencia se achica
  // en los primeros metros (ver visualOff).
  gunOffset(f, x, y, z, i = 0) {
    const m = f.isPlayer ? this.vm.muzzleWorld(this.gunPos, i) : null;
    return m ? { x: m.x - x, y: m.y - y, z: m.z - z } : NO_OFF;
  }

  visualOff(off, k) {
    const e = (1 - clamp(k, 0, 1)) ** 2;
    return this.offV.set(off.x * e, off.y * e, off.z * e);
  }

  meleeHit(f, s, i) {
    if (!f.alive) return;
    if (i > 0) this.sfx(s.sfx, f, 0.9);
    f.kick = 1;
    f.hitN = (f.hitN || 0) + 1;
    const ang = f.aim + (i % 2 ? 0.25 : -0.25);
    // En primera persona el tajo se ve en las cuchillas; el arco en el piso taparía la pantalla.
    const own = f.isPlayer && this.vm.root.visible;
    if ((f.team === ME || f.visTo[ME]) && !own) this.fx.slash(f.x, f.z, ang, s.arc, s.range, f.team === ME ? 0xdff6ff : 0xff8a9a);
    this.hitObstacle(f.x + Math.sin(f.aim) * 0.9, f.z + Math.cos(f.aim) * 0.9, Math.sin(f.aim), Math.cos(f.aim), s.dmg);
    for (const e of this.fighters) {
      if (e.team === f.team || !e.alive || e.ghost) continue;
      const dx = e.x - f.x, dz = e.z - f.z, d = Math.hypot(dx, dz);
      if (d > s.range + R * 0.6) continue;
      if (d > 0.5 && Math.abs(angDiff(Math.atan2(dx, dz), f.aim)) > (s.arc * DEG) / 2 + 0.15) continue;
      if (!this.world.shotClear(f.x, f.z, e.x, e.z)) continue;
      this.damage(e, s.dmg, f, { kx: (dx / (d || 1)) * 2.5, kz: (dz / (d || 1)) * 2.5 });
    }
  }

  aoe(x, z, radius, dmg, src, knock = 0) {
    for (const e of this.fighters) {
      if (e.team === src.team || !e.alive || e.ghost) continue;
      const dx = e.x - x, dz = e.z - z, d = Math.hypot(dx, dz);
      if (d > radius + R * 0.5) continue;
      this.damage(e, dmg, src, knock ? { kx: (dx / (d || 1)) * knock, kz: (dz / (d || 1)) * knock } : null);
    }
  }

  damage(e, amount, src, push) {
    if (this.state !== 'play' || !e.alive || e.shieldT > 0) return;
    const amt = Math.round(amount);
    e.hp -= amt;
    e.lastHurtT = this.time;
    e.revealT = Math.max(e.revealT, 0.7);
    e.punch = 1;
    if (push) { e.kx += push.kx; e.kz += push.kz; }
    if (src && src !== e) {
      src.stats.dmg += amt;
      src.super = Math.min(1, src.super + amt / src.def.superNeed);
      if (src.super >= 1 && !src.superTold) {
        src.superTold = true;
        if (src.isPlayer) audio.play('ready');
      }
    }
    // De dónde vino el golpe: hacia allá salta la sangre, se inclina el cuerpo y, si muere, cae.
    let hx = push ? push.kx : src ? e.x - src.x : 0, hz = push ? push.kz : src ? e.z - src.z : 0;
    const hl = Math.hypot(hx, hz);
    if (hl > 0.01) { hx /= hl; hz /= hl; e.hitX = hx; e.hitZ = hz; }
    const jolt = clamp(amt / 900, 0.25, 1);
    e.leanX = clamp(e.leanX + hx * jolt, -1.2, 1.2);
    e.leanZ = clamp(e.leanZ + hz * jolt, -1.2, 1.2);
    const seen = e.team === ME || e.visTo[ME];
    if (seen) {
      const cls = e.isPlayer ? 'hurt' : src && src.isPlayer ? 'mine' : e.team === ME ? 'ally' : '';
      if (this.showNumbers) this.fx.text(e.x, e.rig.height + 0.5 + e.airY, e.z, String(amt), cls);
      this.bleed(e, amt, hx, hz);
    }
    if (e.isPlayer) {
      audio.play('hurt');
      this.shake = Math.max(this.shake, 0.22);
      this.hud.hurt();
      if (hl > 0.01) this.hud.hitFrom(hx, hz, this.camMode && this.camMode !== 'arriba' ? this.yaw : Math.PI);
    } else if (src && src.isPlayer) audio.play('hit');
    else this.sfx('hit', e, 0.5);
    if (e.hp <= 0) this.kill(e, src);
  }

  kill(e, src) {
    e.alive = false;
    e.hp = 0;
    e.respawnT = RULES.respawn;
    e.action = null;
    e.ghost = false;
    e.airY = 0;
    e.queue.length = 0;
    e.kx = e.kz = 0;
    e.stats.deaths++;
    if (src && src !== e) src.stats.kills++;
    for (let i = 0; i < e.cores; i++) {
      const a = Math.random() * TAU, d = 0.7 + Math.random() * 1.4;
      const t = this.world.nearestFree(e.x + Math.cos(a) * d, e.z + Math.sin(a) * d, 0.3);
      this.spawnCore(e.x, e.z, t.x, t.z);
    }
    e.cores = 0;
    e.ivx = e.ivz = 0;
    e.leanX = e.leanZ = 0;
    this.fx.ring(e.x, e.z, 0.4, 2.4, TEAMS[e.team].color, 0.45);
    this.fx.flash(e.x, 1.2, e.z, TEAMS[e.team].color, 40, 0.4);
    this.die(e);
    if (e.isPlayer || (src && src.isPlayer)) this.hitStop = 0.07;
    if (src && src.isPlayer && src !== e) {
      this.streak = this.time - this.streakT < 6 ? this.streak + 1 : 1;
      this.streakT = this.time;
      if (this.streak >= 2) this.hud.big(['¡Doble baja!', '¡Triple baja!', '¡Imparable!'][Math.min(this.streak, 4) - 2], 'streak');
    }
    this.sfx('death', e);
    this.hud.feed(src || null, e);
    if (e.isPlayer) {
      this.shake = 0.6;
      this.hud.setRespawn(Math.ceil(e.respawnT), src && src !== e ? src : null);
    }
  }

  // Golpe recibido: lo que salta depende de qué está hecho el personaje.
  bleed(e, amt, hx, hz) {
    const kind = e.def.gore.blood, fx = this.fx, y = 0.9 + e.airY;
    const n = clamp(Math.round(amt / 140), 2, 10);
    if (kind === 'blood' && this.gore) {
      fx.burst(e.x, y, e.z, { n, color: BLOOD, speed: 2.2, up: 3.2, life: 0.75, size: 0.07, grav: 16, hot: false, vx: hx * 3.6, vz: hz * 3.6, stain: 'blood' });
      if (amt > 600) fx.stain('blood', e.x + hx * 0.5, e.z + hz * 0.5, 0.5 + Math.random() * 0.4, { life: 16 });
      if (e.def.id === 'nox') fx.burst(e.x, y, e.z, { n: 2, color: [0x34345f, 0x4d4f75], speed: 2, up: 2.5, life: 0.9, size: 0.09, grav: 3, drag: 3, hot: false });
    } else if (kind === 'oil') {
      fx.burst(e.x, y, e.z, { n: Math.ceil(n / 2), color: [0x0a0a0e, 0x1b1b22], speed: 2, up: 3, life: 0.7, size: 0.07, grav: 16, hot: false, vx: hx * 3, vz: hz * 3, stain: 'oil' });
      fx.burst(e.x, y, e.z, { n, color: [0xffe14a, 0xffffff, 0xff9a2a], speed: 5, up: 3, life: 0.3, size: 0.05, vx: hx * 3, vz: hz * 3 });
      if (amt > 500) this.debris.add('box', e.x, y, e.z, hx * 3 + Math.random() - 0.5, 4, hz * 3 + Math.random() - 0.5, { size: [0.06, 0.06, 0.1], color: 0xb9c2cc, life: 5, spin: 18 });
    } else if (kind === 'lava') {
      fx.burst(e.x, y, e.z, { n, color: [0xff5a0a, 0xffc21a, 0xff8a2a], speed: 3, up: 3.5, life: 0.6, size: 0.08, grav: 12, vx: hx * 3, vz: hz * 3 });
      if (amt > 400) this.debris.add('rock', e.x, y, e.z, hx * 3 + Math.random() - 0.5, 4, hz * 3 + Math.random() - 0.5, { size: 0.08 + Math.random() * 0.1, color: 0x3a3231, life: 6 });
    } else {
      fx.burst(e.x, y, e.z, { n: 5, color: [0xffffff, e.def.color], speed: 3.5, life: 0.3, size: 0.08 });
    }
  }

  // Muerte: los de carne caen hacia donde los empujó el golpe; el robot y el gólem se desarman.
  die(e) {
    const fx = this.fx, db = this.debris, hx = e.hitX, hz = e.hitZ;
    const rnd = (a, b) => a + Math.random() * (b - a);
    if (e.def.gore.death === 'break') {
      const push = { dx: hx * 2.5, dz: hz * 2.5, height: 1.1, spread: 0.35 };
      if (e.def.id === 'tuerca') {
        db.burst('box', e.x, 0.3, e.z, 8, { ...push, size: () => [rnd(0.18, 0.34), rnd(0.1, 0.2), rnd(0.14, 0.26)], color: [0xd9701c, 0xe2852c, 0x3a3837], speed: 3.5, up: 6, life: 9 });
        db.burst('rock', e.x, 0.6, e.z, 4, { ...push, size: () => rnd(0.12, 0.22), color: [0xb9c2cc, 0x8f98a3], speed: 3, up: 6, life: 9 });
        db.add('rock', e.x, 1.2, e.z, hx * 3, 6.5, hz * 3, { size: 0.52, color: 0xc4ccd4, life: 9, spin: 6 }); // el casco
        db.burst('box', e.x, 0.6, e.z, 7, { ...push, size: [0.05, 0.05, 0.1], color: 0xb9c2cc, speed: 5, up: 7, life: 6, spin: 20 });
        fx.burst(e.x, 0.8, e.z, { n: 26, color: [0xffe14a, 0xffffff, 0xff9a2a], speed: 7, up: 5, life: 0.5, size: 0.06 });
        fx.stain('oil', e.x, e.z, 1.7, { grow: 2.2, life: 20 });
        fx.puff(e.x, 0.6, e.z, { n: 7, size: 1.2, life: 1.5, alpha: 0.5, rise: 1.4, speed: 1.2, color: 0x2a2a30 });
        this.sfx('clank', e);
      } else {
        db.burst('rock', e.x, 0.3, e.z, 13, { ...push, size: () => rnd(0.16, 0.42), color: [0x3a3231, 0x52424a, 0x2c2527], speed: 3.5, up: 6, life: 9 });
        db.burst('rock', e.x, 0.6, e.z, 6, { ...push, size: () => rnd(0.09, 0.18), color: 0xff5a0a, glow: 2.2, speed: 4.5, up: 7, life: 5 });
        fx.burst(e.x, 0.8, e.z, { n: 30, color: [0xff5a0a, 0xffc21a, 0xff8a2a], speed: 6, up: 6, life: 0.8, size: 0.1, grav: 10 });
        fx.scorch(e.x, e.z, 1.6, 12);
        fx.puff(e.x, 0.6, e.z, { n: 7, size: 1.3, life: 1.4, alpha: 0.45, rise: 1.3, speed: 1.4, color: 0x5a4a44 });
        this.sfx('boom', e, 0.7);
      }
      return;
    }
    // Cuerpo que cae: un péndulo invertido que arranca con el empujón del golpe.
    e.corpse = {
      t: 0, ang: 0.08, w: 2.6, dx: hx, dz: hz, vx: hx * 4.5, vz: hz * 4.5, landed: false,
      pose: e.parts.map(() => new THREE.Euler(rnd(-0.5, 0.5), rnd(-0.3, 0.3), rnd(-0.9, 0.9))),
    };
    if (this.gore) {
      fx.burst(e.x, 1, e.z, { n: 18, color: BLOOD, speed: 3.2, up: 4.5, life: 0.9, size: 0.08, grav: 16, hot: false, vx: hx * 3, vz: hz * 3, stain: 'blood' });
      fx.stain('blood', e.x + hx * 0.8, e.z + hz * 0.8, 1.5 + Math.random() * 0.5, { grow: 2.8, life: 22 });
    } else fx.burst(e.x, 0.8, e.z, { n: 20, color: [e.def.color, 0xffffff], speed: 6, up: 5, life: 0.6, size: 0.12 });
    if (e.def.id === 'nox') fx.burst(e.x, 1, e.z, { n: 12, color: [0x34345f, 0x4d4f75, 0xeadfc6], speed: 3, up: 4, life: 1.4, size: 0.1, grav: 2.5, drag: 3, hot: false });
  }

  // Avanza la caída de un cuerpo y lo retira un rato después.
  updateCorpse(f, dt) {
    const c = f.corpse, root = f.rig.root;
    c.t += dt;
    if (c.ang < Math.PI / 2 || c.w !== 0) {
      c.w += 22 * Math.sin(Math.max(0.1, c.ang)) * dt;
      c.ang += c.w * dt;
      if (c.ang >= Math.PI / 2) {
        c.ang = Math.PI / 2;
        if (!c.landed) {
          c.landed = true;
          this.sfx('thud', f, 0.8);
          this.fx.puff(f.x + c.dx * 0.8, 0.15, f.z + c.dz * 0.8, { n: 4, size: 0.9, life: 0.7, alpha: 0.35, rise: 0.5, speed: 1.2, spread: 0.4, color: 0xdcbd8c });
        }
        c.w = c.w > 2.2 ? -c.w * 0.2 : 0;
      }
    }
    const k = Math.exp(-5 * dt);
    f.x += c.vx * dt; f.z += c.vz * dt;
    c.vx *= k; c.vz *= k;
    this.world.resolve(f, R);
    const out = Math.max(0, (c.t - 3.5) / 0.6); // al final se hunde y desaparece
    root.position.set(f.x, -out * 0.6, f.z);
    root.scale.setScalar(1 - out * 0.4);
    qA.setFromAxisAngle(vAxis.set(c.dz, 0, -c.dx), c.ang);
    root.quaternion.copy(qA).multiply(qB.setFromAxisAngle(UP, f.face));
    const limp = Math.min(1, c.t * 4);
    f.parts.forEach((g, i) => {
      const a = f.rest[i], b = c.pose[i];
      g.rotation.set(a.x + b.x * limp, a.y + b.y * limp, a.z + b.z * limp);
    });
    if (out >= 1) {
      f.corpse = null;
      root.visible = false;
    }
  }

  // Deja al luchador de pie y con el cuerpo como al principio.
  resetPose(f) {
    f.corpse = null;
    f.rig.root.rotation.set(0, f.face, 0);
    f.rig.root.scale.setScalar(1);
    f.parts.forEach((g, i) => g.rotation.copy(f.rest[i]));
  }

  // Algo pega contra una baldosa sólida: astillas si es un cajón (y se rompe si no aguanta),
  // esquirlas de piedra si es un muro.
  hitObstacle(x, z, dx, dz, dmg) {
    const w = this.world, c = w.col(x), r = w.row(z);
    if (!w.blocksShot(c, r)) return;
    const res = w.damageCrate(c, r, dmg);
    const bx = x - dx * 0.3, bz = z - dz * 0.3;
    if (res === 'broken') this.breakCrate(c, r, dx, dz);
    else if (res === 'hit') {
      this.debris.burst('box', bx, 0.6, bz, 2, { size: () => [0.13 + Math.random() * 0.1, 0.03, 0.05], color: WOOD, speed: 2.2, up: 3.2, dx: -dx * 2, dz: -dz * 2, life: 4, spin: 16, spread: 0.1, height: 0.4 });
      this.sfx('wood', { x, z }, 0.35);
    } else this.debris.burst('rock', bx, 0.6, bz, 2, { size: () => 0.05 + Math.random() * 0.07, color: [0x8a98a6, 0x6f7f8e], speed: 2.4, up: 3, dx: -dx * 2.2, dz: -dz * 2.2, life: 5, spread: 0.1, height: 0.4 });
  }

  // Onda expansiva: rompe cajones, puede cortar el pasto, empuja escombros y aplasta el pasto.
  blast(x, z, radius, dmg, cutGrass) {
    const w = this.world;
    for (const [c, r] of w.tilesIn(x, z, radius + 0.35)) {
      if (w.damageCrate(c, r, dmg * 1.4) === 'broken') this.breakCrate(c, r, w.cx(c) - x, w.cz(r) - z);
      if (cutGrass && w.cutBush(c, r)) this.fx.burst(w.cx(c), 0.5, w.cz(r), { n: 12, color: [0x4d9a26, 0x78bf3a, 0x8fc440], speed: 3.5, up: 4.5, life: 0.8, size: 0.09, grav: 7, hot: false, spread: 0.4 });
    }
    this.debris.impulse(x, z, radius * 1.7, 7);
    this.shock(x, z, radius * 1.9, 1);
  }

  shock(x, z, radius, strength) {
    this.shockI = (this.shockI + 1) % 2;
    this.shocks[this.shockI] = { x, z, radius, strength, t: 0, dur: 0.6 };
  }

  breakCrate(c, r, dx, dz) {
    const w = this.world, x = w.cx(c), z = w.cz(r), l = Math.hypot(dx, dz) || 1;
    const rnd = (a, b) => a + Math.random() * (b - a);
    this.debris.burst('box', x, 0.15, z, 13, {
      size: () => [rnd(0.45, 0.85), 0.05, rnd(0.1, 0.17)], color: WOOD, speed: 3.2, up: 6, height: 0.8, spread: 0.4,
      dx: (dx / l) * 3, dz: (dz / l) * 3, life: 10, spin: 10,
    });
    this.fx.burst(x, 0.5, z, { n: 14, color: WOOD, speed: 4, up: 4, life: 0.5, size: 0.06, hot: false });
    this.fx.puff(x, 0.4, z, { n: 5, size: 1.1, life: 0.9, alpha: 0.4, rise: 0.8, speed: 1.4, color: 0xcdb08a });
    this.sfx('wood', { x, z });
    this.shock(x, z, 1.6, 0.5);
    const d = Math.hypot(x - this.camT.x, z - this.camT.z);
    this.shake = Math.max(this.shake, clamp(0.3 - d / 30, 0, 0.3));
  }

  respawn(f) {
    this.resetPose(f);
    const sp = this.world.spawns[f.team][f.slot];
    f.x = sp.x; f.z = sp.z;
    f.hp = f.maxHp;
    f.ammo = RULES.ammoMax;
    f.alive = true;
    f.shieldT = RULES.shield;
    f.pop = 0;
    f.revealT = 0;
    f.lastHurtT = f.lastActT = -99;
    f.face = f.moveAng = f.aim = f.team === ME ? Math.PI : 0;
    this.fx.ring(f.x, f.z, 0.3, 1.6, TEAMS[f.team].color, 0.5);
    if (f.isPlayer) {
      this.yaw = f.face;
      this.pitch = PITCH0[this.view] ?? -0.15;
      this.hud.setRespawn(null);
      audio.play('respawn');
    }
  }

  // ----------------------------------------------------------- luchadores --
  updateFighter(f, dt) {
    if (!f.alive) {
      if (f.corpse) this.updateCorpse(f, dt);
      f.respawnT -= dt;
      if (f.isPlayer && this.state === 'play') this.hud.setRespawn(Math.max(1, Math.ceil(f.respawnT)));
      if (f.respawnT <= 0 && this.state === 'play') this.respawn(f);
      return;
    }
    f.attackCd -= dt; f.shieldT -= dt; f.revealT -= dt; f.aimHold -= dt;
    f.kick = Math.max(0, f.kick - dt * 5);
    const ld = Math.exp(-7 * dt);
    f.leanX *= ld;
    f.leanZ *= ld;
    f.punch = Math.max(0, f.punch - dt * 7);
    f.pop = Math.min(1, f.pop + dt * 4);
    for (let i = f.queue.length - 1; i >= 0; i--) {
      const q = f.queue[i];
      q.t -= dt;
      if (q.t <= 0) { f.queue.splice(i, 1); q.fn(); }
    }
    if (f.ammo < RULES.ammoMax) f.ammo = Math.min(RULES.ammoMax, f.ammo + dt / f.def.attack.reload);
    if (f.hp < f.maxHp && this.time - Math.max(f.lastHurtT, f.lastActT) > RULES.regenDelay)
      f.hp = Math.min(f.maxHp, f.hp + f.maxHp * RULES.regenRate * dt);

    const ox = f.x, oz = f.z;
    if (f.action) this.updateAction(f, dt);
    else {
      let mx = f.mvx, mz = f.mvz;
      const ml = Math.hypot(mx, mz);
      if (ml > 1) { mx /= ml; mz /= ml; }
      // La velocidad no cambia de golpe: acelera y frena en una décima de segundo.
      const acc = 1 - Math.exp(-dt * 15);
      f.ivx += (mx * f.def.speed - f.ivx) * acc;
      f.ivz += (mz * f.def.speed - f.ivz) * acc;
      const amt = Math.min(1, Math.hypot(f.ivx, f.ivz) / f.def.speed);
      f.x += (f.ivx + f.kx) * dt;
      f.z += (f.ivz + f.kz) * dt;
      const k = Math.exp(-9 * dt);
      f.kx *= k; f.kz *= k;
      this.world.resolve(f, R);
      f.moveAmt += ((amt > 0.1 ? amt : 0) - f.moveAmt) * Math.min(1, dt * 12);
      f.phase += dt * f.def.speed * 2.1 * amt;
      const step = Math.floor(f.phase / Math.PI);
      if (step !== f.stepN) {
        f.stepN = step;
        if (!f.inBush && (f.team === ME || f.visTo[ME]))
          this.fx.puff(f.x - mx * 0.2, 0.1, f.z - mz * 0.2, { n: 1, size: 0.42, life: 0.5, alpha: 0.26, rise: 0.35, speed: 0.3, color: 0xdcbd8c });
      }
      if (ml > 0.1) f.moveAng = Math.atan2(mx, mz);
    }
    if (dt > 0) {
      const s = Math.min(1, dt * 10);
      f.velx += ((f.x - ox) / dt - f.velx) * s;
      f.velz += ((f.z - oz) / dt - f.velz) * s;
    }
    const want = f.aimHold > 0 ? f.aim : f.moveAng;
    f.face += angDiff(want, f.face) * Math.min(1, dt * 16);

    const inBush = !f.action && this.world.bushAt(f.x, f.z);
    if (inBush !== f.inBush) {
      f.inBush = inBush;
      if (f.team === ME || f.visTo[ME]) this.fx.burst(f.x, 0.5, f.z, { n: 6, color: [0x4d9a26, 0x78bf3a, 0x8fc440], speed: 2.2, up: 2.8, life: 0.45, size: 0.08, hot: false });
    }
  }

  updateAction(f, dt) {
    const a = f.action, s = a.spec;
    a.t += dt;
    const u = Math.min(1, a.t / a.dur);
    f.x = a.fx + (a.tx - a.fx) * u;
    f.z = a.fz + (a.tz - a.fz) * u;
    f.moveAmt = 0;
    f.ivx = f.ivz = 0;
    const seen = f.team === ME || f.visTo[ME];
    if (a.type === 'leap') {
      f.airY = Math.sin(u * Math.PI) * 3.4;
      if (u >= 1) {
        f.action = null;
        f.ghost = false;
        f.airY = 0;
        this.aoe(f.x, f.z, s.aoe, s.dmg, f, s.knock);
        this.fx.ring(f.x, f.z, 0.4, s.aoe, 0xff8a2a, 0.45);
        this.fx.ring(f.x, f.z, 0.2, s.aoe, 0xffd23f, 0.3, true);
        this.fx.burst(f.x, 0.3, f.z, { n: 30, color: [0xff6a1a, 0xffd23f, 0x52424a], speed: 8, up: 5, life: 0.6, size: 0.16 });
        this.fx.scorch(f.x, f.z, s.aoe * 0.95, 8);
        this.fx.flash(f.x, 1.4, f.z, 0xff7a2a, 70, 0.5);
        this.blast(f.x, f.z, s.aoe, s.dmg, true);
        this.debris.burst('rock', f.x, 0.1, f.z, 10, { size: () => 0.07 + Math.random() * 0.13, color: [0x8a6a44, 0x6b5238, 0x3a3231], speed: 5, up: 6.5, spread: 0.9, life: 7 });
        this.fx.puff(f.x, 0.3, f.z, { n: 8, size: 1.4, life: 1.1, alpha: 0.45, rise: 1.0, speed: 2.4, spread: 0.6, color: 0x8a7868 });
        this.sfx('boom', f);
        const d = Math.hypot(f.x - this.camT.x, f.z - this.camT.z);
        this.shake = Math.max(this.shake, clamp(0.6 - d / 20, 0, 0.6));
      }
    } else {
      if (seen) this.fx.burst(f.x, 0.8, f.z, { n: 2, color: [0xdff6ff, f.def.color], speed: 1, up: 0.5, life: 0.25, size: 0.13, grav: 0 });
      for (const e of this.fighters) {
        if (e.team === f.team || !e.alive || e.ghost || a.hit.has(e)) continue;
        if (Math.hypot(e.x - f.x, e.z - f.z) < s.width) {
          a.hit.add(e);
          this.damage(e, s.dmg, f, null);
        }
      }
      if (u >= 1) {
        f.action = null;
        f.ghost = false;
        const dl = Math.hypot(a.tx - a.fx, a.tz - a.fz) || 1, ddx = (a.tx - a.fx) / dl, ddz = (a.tz - a.fz) / dl;
        this.hitObstacle(f.x + ddx * 0.7, f.z + ddz * 0.7, ddx, ddz, s.dmg * 1.6);
        this.world.resolve(f, R);
      }
    }
  }

  updateVisibility() {
    for (const f of this.fighters) {
      for (let team = 0; team < 2; team++) {
        if (f.team === team || !f.inBush || f.revealT > 0) { f.visTo[team] = true; continue; }
        let near = false;
        for (const o of this.fighters) {
          if (o.team !== team || !o.alive) continue;
          if (Math.hypot(o.x - f.x, o.z - f.z) < 2.3) { near = true; break; }
        }
        f.visTo[team] = near;
      }
    }
  }

  // -------------------------------------------------------- proyectiles --
  updateProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const steps = Math.max(1, Math.ceil((p.speed * dt) / 0.25));
      const sd = (p.speed * dt) / steps;
      let dead = false;
      for (let s = 0; s < steps && !dead; s++) {
        p.x += p.dx * sd; p.z += p.dz * sd; p.left -= sd; p.gone += sd;
        if (this.world.shotBlockedAt(p.x, p.z)) {
          this.fx.burst(p.x, 0.8, p.z, { n: 6, color: [p.color, 0xffffff], speed: 3, life: 0.25, size: 0.08, vx: -p.dx * 2, vz: -p.dz * 2 });
          this.hitObstacle(p.x, p.z, p.dx, p.dz, p.dmg);
          if (p.pierce) this.blast(p.x, p.z, 1.3, p.dmg, false);
          dead = true;
          break;
        }
        for (const e of this.fighters) {
          if (e.team === p.team || !e.alive || e.ghost || p.hit.has(e)) continue;
          const dx = e.x - p.x, dz = e.z - p.z, rr = p.r + R;
          if (dx * dx + dz * dz > rr * rr) continue;
          p.hit.add(e);
          this.damage(e, p.dmg, p.owner, p.knock ? { kx: p.dx * p.knock, kz: p.dz * p.knock } : null);
          if (!p.pierce) { dead = true; break; }
        }
        if (p.left <= 0) dead = true;
      }
      if (dead) {
        this.fx.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }
      p.mesh.position.set(p.x, 0.8, p.z).add(this.visualOff(p.off, p.gone / 2.5));
      if (p.off !== NO_OFF) { const k0 = nearK(p.visual); p.mesh.scale.setScalar(k0 + (1 - k0) * Math.min(1, p.gone / 3)); }
      if (p.visual === 'ember' || p.visual === 'orb') p.mesh.userData.core.rotation.x += dt * 9;
      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = p.visual === 'orb' ? 0.02 : 0.045;
        const mp = p.mesh.position;
        this.fx.burst(mp.x, mp.y, mp.z, { n: 1, color: p.color, speed: 0.4, up: 0.3, life: 0.22, size: p.visual === 'orb' ? 0.2 : 0.07, grav: 0 });
      }
    }
  }

  updateLobs(dt) {
    for (let i = this.lobs.length - 1; i >= 0; i--) {
      const l = this.lobs[i], s = l.spec;
      l.t += dt;
      const u = Math.min(1, l.t / l.dur);
      l.mesh.position.set(l.fx + (l.tx - l.fx) * u, 0.9 + Math.sin(u * Math.PI) * 3.2 - u * 0.7, l.fz + (l.tz - l.fz) * u).add(this.visualOff(l.off, u / 0.35));
      if (l.off !== NO_OFF) { const k0 = nearK(s.visual); l.mesh.scale.setScalar(k0 + (1 - k0) * Math.min(1, u / 0.4)); }
      l.mesh.userData.core.rotation.x += dt * 10;
      l.mark.material.uniforms.uAlpha.value = 0.55 + u * 0.6;
      if (u < 1) continue;
      this.aoe(l.tx, l.tz, s.aoe, s.dmg, l.owner, 0);
      this.fx.ring(l.tx, l.tz, 0.3, s.aoe, l.color, 0.35);
      this.fx.ring(l.tx, l.tz, 0.2, s.aoe, l.color, 0.25, true);
      this.fx.burst(l.tx, 0.3, l.tz, { n: 18, color: [l.color, 0xffffff], speed: 6, up: 4, life: 0.5, size: 0.12 });
      const wet = this.world.type(this.world.col(l.tx), this.world.row(l.tz)) === 3;
      if (wet) { this.fx.splash(l.tx, l.tz, -0.14, 1.3); this.sfx('splash', { x: l.tx, z: l.tz }); } else this.fx.scorch(l.tx, l.tz, s.aoe * 0.8, 6);
      this.blast(l.tx, l.tz, s.aoe, s.dmg, !!s.zone);
      this.debris.burst('box', l.tx, 0.3, l.tz, 6, { size: [0.07, 0.012, 0.05], color: [0xffd6f2, 0xe8f6ff], speed: 4, up: 4.5, life: 4, spin: 20 });
      this.fx.flash(l.tx, 1.1, l.tz, l.color, 34, 0.4);
      this.fx.puff(l.tx, 0.3, l.tz, { n: 5, size: 1.0, life: 0.9, alpha: 0.4, rise: 0.9, speed: 1.6, color: l.color });
      this.sfx('boom', { x: l.tx, z: l.tz }, 0.7);
      if (s.zone) this.addZone(l.tx, l.tz, s.zone, l.owner);
      this.fx.remove(l.mesh);
      this.scene.remove(l.mark);
      l.mark.material.dispose();
      this.lobs.splice(i, 1);
    }
  }

  addZone(x, z, s, owner) {
    const color = owner.team === ME ? ZONE_COLOR[s.visual] : TEAMS[1].shot;
    const mat = zoneMaterial(color, s.visual);
    const g = new THREE.Mesh(this.fx.geos.disc, mat);
    g.position.set(x, 0.045, z);
    g.scale.setScalar(s.radius);
    g.renderOrder = 2;
    this.scene.add(g);
    this.zones.push({ x, z, spec: s, owner, t: 0, tickT: 0, g, mat, color });
  }

  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i], s = z.spec;
      z.t += dt;
      const delay = s.delay || 0;
      if (z.t < delay) {
        z.mat.uniforms.uCharge.value = z.t / delay;
        continue;
      }
      z.mat.uniforms.uCharge.value = 1;
      z.mat.uniforms.uAlpha.value = Math.min(1, (delay + s.dur - z.t) / 0.4);
      z.tickT -= dt;
      if (z.tickT <= 0) {
        z.tickT += s.tick;
        this.aoe(z.x, z.z, s.radius, s.dmg, z.owner, 0);
        if (s.visual === 'stars') {
          for (let k = 0; k < 7; k++) {
            const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * s.radius;
            this.fx.burst(z.x + Math.cos(a) * d, 3.5 + Math.random() * 1.5, z.z + Math.sin(a) * d, {
              n: 1, color: [z.color, 0xffffff], speed: 0.3, up: -9, life: 0.5, size: 0.17, grav: 14, drag: 0,
            });
          }
          this.sfx('dart', z, 0.5);
        } else {
          for (let k = 0; k < 5; k++) {
            const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * s.radius;
            this.fx.burst(z.x + Math.cos(a) * d, 0.1, z.z + Math.sin(a) * d, {
              n: 1, color: [z.color, 0xd8ffb0], speed: 0.3, up: 2.2, life: 0.6, size: 0.12, grav: 1,
            });
          }
        }
      }
      if (z.t >= delay + s.dur) {
        this.scene.remove(z.g);
        z.mat.dispose();
        this.zones.splice(i, 1);
      }
    }
  }

  // -------------------------------------------------------------- núcleos --
  spawnCore(fx, fz, tx, tz) {
    const mesh = this.fx.coreMesh();
    mesh.position.set(fx, 1, fz);
    this.cores.push({ x: fx, z: fz, fx, fz, tx, tz, t: 0, dur: 0.6, landed: false, mesh, ph: Math.random() * 6 });
  }

  updateCores(dt) {
    if (this.state === 'play') {
      this.coreT -= dt;
      if (this.coreT <= 0) {
        this.coreT = RULES.coreEvery;
        let total = this.cores.length;
        for (const f of this.fighters) total += f.cores;
        if (total < RULES.maxCores) {
          const a = Math.random() * TAU, d = 1.5 + Math.random() * 1.2;
          const t = this.world.nearestFree(this.world.reactor.x + Math.cos(a) * d, this.world.reactor.z + Math.sin(a) * d, 0.3);
          this.spawnCore(this.world.reactor.x, this.world.reactor.z, t.x, t.z);
          this.sfx('lob', this.world.reactor, 0.6);
        }
      }
    }
    for (let i = this.cores.length - 1; i >= 0; i--) {
      const c = this.cores[i];
      let y;
      if (!c.landed) {
        c.t += dt;
        const u = Math.min(1, c.t / c.dur);
        c.x = c.fx + (c.tx - c.fx) * u;
        c.z = c.fz + (c.tz - c.fz) * u;
        y = 0.6 + Math.sin(u * Math.PI) * 1.9 + (1 - u) * 0.5;
        if (u >= 1) c.landed = true;
      } else {
        y = 0.6 + Math.sin(this.time * 3 + c.ph) * 0.09;
        let taker = null;
        if (this.state === 'play')
          for (const f of this.fighters) {
            if (!f.alive || f.ghost) continue;
            if (Math.hypot(f.x - c.x, f.z - c.z) < 0.85) { taker = f; break; }
          }
        if (taker) {
          taker.cores++;
          taker.stats.cores++;
          this.fx.burst(c.x, 0.7, c.z, { n: 10, color: [0xc8ff3a, 0xffffff], speed: 3, up: 4, life: 0.45, size: 0.09 });
          if (taker.isPlayer) audio.play('pickup');
          else this.sfx('pickup', taker, 0.45);
          this.fx.remove(c.mesh);
          this.cores.splice(i, 1);
          continue;
        }
      }
      c.mesh.position.set(c.x, y, c.z);
      c.mesh.rotation.y += dt * 2.2;
    }
  }

  updateRules(dt) {
    const tot = [0, 0];
    for (const f of this.fighters) if (f.alive) tot[f.team] += f.cores;
    this.score = tot;
    this.hud.setScore(tot[0], tot[1]);
    const G = RULES.goal;
    const lead = tot[0] >= G && tot[0] > tot[1] ? 0 : tot[1] >= G && tot[1] > tot[0] ? 1 : -1;
    if (lead !== this.leadTeam) {
      this.leadTeam = lead;
      this.countdown = RULES.countdown;
      this.hud.setCountdown(lead, RULES.countdown);
      if (lead >= 0) audio.play('ready');
    }
    if (lead >= 0) {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const now = Math.ceil(this.countdown);
      if (now !== prev && now > 0) {
        this.hud.setCountdown(lead, now);
        audio.play(now <= 5 ? 'tick' : 'beep');
      }
      if (this.countdown <= 0) this.finish(lead);
    }
  }

  finish(winner) {
    this.state = 'over';
    const won = winner === ME;
    this.hud.setCountdown(-1, 0);
    this.hud.big(won ? '¡Victoria!' : 'Derrota', won ? 'win' : 'lose');
    audio.play(won ? 'win' : 'lose');
    this.result = {
      won, winner, score: this.score, time: this.time,
      fighters: this.fighters.map((f) => ({
        name: f.name, hero: f.def.id, heroName: f.def.name, team: f.team, isPlayer: f.isPlayer, ...f.stats,
      })),
    };
  }

  // ---------------------------------------------------------------- vista --
  updateView(dt, rawDt) {
    const p = this.player, w = this.world;
    const anim = { t: this.time, move: 0, phase: 0, kick: 0 };
    this.fighters.forEach((f, i) => {
      const on = f.alive && !f.ghost && (f.team === ME || f.visTo[ME]);
      if (i < 6) grassFighters.value[i].set(f.x, f.z, on ? 1 : 0);
    });
    for (const f of this.fighters) {
      const seen = f.alive && (f.team === ME || f.visTo[ME]);
      const root = f.rig.root;
      // En primera persona no se dibuja el cuerpo propio (la cámara está adentro de la cabeza).
      const inside = f.isPlayer && this.camMode === 'primera' && this.blend > 0.6;
      root.visible = (seen || !!f.corpse) && !inside;
      f.ring.visible = seen && !f.ghost && !inside;
      f.blob.visible = seen && !inside;
      if (seen) {
        root.position.set(f.x, f.airY, f.z);
        root.rotation.y = f.face;
        const e = 1 - (1 - f.pop) ** 3;
        root.scale.setScalar((0.2 + 0.8 * e) * (1 + f.punch * 0.1));
        // Los golpes recibidos inclinan el cuerpo hacia donde empujan.
        const cs = Math.cos(f.face), sn = Math.sin(f.face);
        const lf = f.leanX * sn + f.leanZ * cs, ls = f.leanX * cs - f.leanZ * sn;
        root.rotation.x = (f.action ? (f.action.type === 'dash' ? 0.5 : -0.4) : 0) + lf * 0.32;
        root.rotation.z = -ls * 0.32;
        anim.move = f.moveAmt; anim.phase = f.phase; anim.kick = f.kick;
        animateRig(f.rig, anim);
        f.ring.position.set(f.x, 0.035, f.z);
        const ready = f.super >= 1;
        f.ring.scale.setScalar(ready ? 1.1 + Math.sin(this.time * 9) * 0.08 : 1);
        f.shield.visible = f.shieldT > 0;
        if (f.shield.visible) f.shield.material.uniforms.uAlpha.value = Math.min(1, f.shieldT * 3);
        f.rig.fxU.uFlash.value = f.punch * 0.7;
        const lift = Math.max(0.35, 1 - f.airY * 0.18);
        f.blob.position.set(f.x, 0.02, f.z);
        f.blob.scale.setScalar(lift * (f.def.id === 'brasa' ? 1.25 : 1));
      }
    }

    this.updateCamera(rawDt);
    this.vm.update(dt, p, this.camMode === 'primera' && this.blend > 0.6 && p.alive, this.yaw, this.pitch, this.time);
    this.vm.rig.fxU.uFlash.value = p.punch * 0.5;

    // etiquetas: en las vistas con cámara propia se achican con la distancia y la propia no va
    const v = this.tmp, top = this.camMode === 'arriba', cam = this.camera.position;
    for (const f of this.fighters) {
      const seen = f.alive && (f.team === ME || f.visTo[ME]);
      if (!seen || (!top && f.isPlayer)) { f.tag.place(0, 0, false); continue; }
      let k = 1;
      if (!top) {
        const dist = Math.hypot(f.x - cam.x, f.z - cam.z);
        // Rivales detrás de un muro o un cajón: con los muros altos no se los ve, así que su nombre tampoco.
        const hidden = f.team !== ME && w.tall > 0.5 && !w.shotClear(cam.x, cam.z, f.x, f.z);
        if (dist > 32 || hidden) { f.tag.place(0, 0, false); continue; }
        k = clamp(7 / Math.max(dist, 0.1), 0.5, 1.1);
      }
      v.set(f.x, f.rig.height + 0.3 + f.airY, f.z).project(this.camera);
      f.tag.place((v.x * 0.5 + 0.5) * this.vw, (-v.y * 0.5 + 0.5) * this.vh, v.z < 1, k);
      f.tag.sync(f);
    }
    // Aro sobre el rival al que iría el disparo automático, del tamaño del cuerpo a esa distancia.
    const t = top ? null : this.markTgt;
    if (t !== this.markShown) {
      this.markShown?.tag.target(false);
      t?.tag.target(true);
      this.markShown = t;
    }
    if (t) {
      v.set(t.x, t.rig.height * 0.5 + t.airY, t.z).project(this.camera);
      const dist = Math.max(0.5, Math.hypot(t.x - cam.x, t.z - cam.z));
      const focal = this.vh / 2 / Math.tan((this.camera.fov * DEG) / 2);
      const size = clamp((1.7 * focal) / dist, 34, 150);
      this.hud.aimMark((v.x * 0.5 + 0.5) * this.vw, (-v.y * 0.5 + 0.5) * this.vh, size, v.z < 1);
    } else this.hud.aimMark(0, 0, 0, false);
    if (top) {
      v.set(p.x, 0.9, p.z).project(this.camera);
      this.hud.anchor((v.x * 0.5 + 0.5) * this.vw, (-v.y * 0.5 + 0.5) * this.vh);
    } else this.hud.anchor(this.vw / 2, this.vh / 2);
    this.hud.setSuper(p.super);
    this.hud.frame(this, rawDt);
    w.update(this.time, rawDt);
    this.ambient(dt);
    this.fx.update(dt, this.camera, this.vw, this.vh);
  }

  // Cámara de cada vista. Al cambiar de vista (o al morir, que se pasa a la de arriba) la
  // posición, el punto mirado y el campo de visión se mezclan durante 0,4 s.
  updateCamera(rawDt) {
    const p = this.player, cam = this.camera, w = this.world;
    const mode = this.firstPerson && p.alive ? this.view : 'arriba';
    const a = 1 - Math.exp(-rawDt * 7);
    const tx = mode === 'arriba' ? clamp(p.x, -this.limX, this.limX) : p.x;
    const tz = mode === 'arriba' ? clamp(p.z - 1, this.limZ0, this.limZ1) : p.z;
    this.camT.x += (tx - this.camT.x) * a;
    this.camT.z += (tz - this.camT.z) * a;
    this.zoom += ((this.state === 'intro' ? 1.25 : 1) - this.zoom) * (1 - Math.exp(-rawDt * 2.5));
    this.shake = Math.max(0, this.shake - rawDt * 2.2);
    this.zoomKick = Math.max(0, this.zoomKick - rawDt * 3.2);
    const kick = Math.sin(this.zoomKick * Math.PI);
    const pos = this.camPos, look = this.camLook;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
    let fov = TOP_FOV, near = 1;
    if (mode === 'arriba') {
      const d = this.camDist * this.zoom * this.zoomUser * (1 - 0.05 * kick);
      pos.set(this.camT.x, d * 0.85, this.camT.z + d * 0.527);
      look.set(this.camT.x, 0.4, this.camT.z);
    } else {
      const cp = Math.cos(this.pitch);
      const dir = this.camDir.set(fx * cp, Math.sin(this.pitch), fz * cp);
      const eye = p.rig.height * 0.78 + p.airY;
      // campo de visión horizontal elegido, pasado a vertical según la forma de la pantalla
      const hfov = (this.fovUser - (mode === 'hombro' ? 8 : 0)) * DEG;
      fov = clamp((2 * Math.atan(Math.tan(hfov / 2) / cam.aspect)) / DEG, 45, 95) * (1 - 0.06 * kick);
      if (mode === 'primera') {
        const bob = Math.sin(p.phase * 2) * 0.035 * p.moveAmt;
        pos.set(p.x + fx * 0.12, eye + bob, p.z + fz * 0.12);
        look.copy(pos).add(dir);
        near = 0.05;
      } else {
        // Al hombro: la cámara gira alrededor de un punto sobre el hombro derecho.
        const rx = -fz, rz = fx;
        const piv = look.set(p.x + rx * 0.78, eye + 0.42, p.z + rz * 0.78);
        let dist = 3.3 * this.zoomUser;
        for (let t = 0.3; t <= dist; t += 0.15) {
          const x = piv.x - dir.x * t, y = piv.y - dir.y * t, z = piv.z - dir.z * t;
          if (y < w.heightAt(x, z)) { dist = Math.max(0.3, t - 0.25); break; }
        }
        pos.copy(piv).addScaledVector(dir, -dist);
        pos.y = Math.max(0.35, pos.y);
        look.addScaledVector(dir, 6);
        near = 0.1;
      }
    }
    if (mode !== this.camMode) {
      if (this.camMode) {
        this.blend = 0;
        Object.assign(this.lookPrev, this.look);
        this.camFrom.copy(cam.position);
        this.lookFrom.copy(this.lookCur);
        this.fovFrom = cam.fov;
        this.nearFrom = cam.near;
      }
      this.camMode = mode;
      this.world.tallTarget = mode === 'arriba' ? 0 : 1; // muros, cajones y pasto crecen fuera de la vista de arriba
      this.setShadowHalf(mode === 'arriba' ? this.shadowHalfTop : 20);
      this.hud.setView(mode);
    }
    this.blend = Math.min(1, this.blend + rawDt * 2.5);
    const k = this.blend * this.blend * (3 - 2 * this.blend);
    this.applyLook(k);
    if (k < 1) {
      cam.position.lerpVectors(this.camFrom, pos, k);
      this.lookCur.lerpVectors(this.lookFrom, look, k);
      fov = this.fovFrom + (fov - this.fovFrom) * k;
      near = Math.min(near, this.nearFrom);
    } else {
      cam.position.copy(pos);
      this.lookCur.copy(look);
    }
    const sh = this.shake * this.shake * 1.6 * this.shakeScale * (mode === 'arriba' ? 1 : 0.3);
    if (sh > 0) cam.position.add(this.tmp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(sh));
    if (Math.abs(cam.fov - fov) > 0.01 || cam.near !== near) {
      cam.fov = fov;
      cam.near = near;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(this.lookCur);
    cam.updateMatrixWorld();
    this.sky.position.copy(cam.position);

    // El sol sigue a la vista de a pasos de un texel de sombra, para que no titilen los bordes.
    // En las vistas con cámara propia, las sombras se centran adelante del jugador.
    const st = mode === 'arriba' ? this.snapT.set(this.camT.x, 0, this.camT.z) : this.snapT.set(p.x + fx * 9, 0, p.z + fz * 9);
    const texel = (this.shadowHalf * 2) / this.q.shadow;
    const rx = st.dot(this.lightRight), ry = st.dot(this.lightUp);
    st.addScaledVector(this.lightRight, Math.round(rx / texel) * texel - rx).addScaledVector(this.lightUp, Math.round(ry / texel) * texel - ry);
    this.sun.target.position.copy(st);
    this.sun.position.copy(st).addScaledVector(this.sunDir, 34);
  }

  // Luz, niebla y borde de luz de la vista actual, mezclados con los de la anterior mientras
  // dura el cambio de cámara. La exposición y el color los aplica Gfx (main.js le pasa this.look).
  applyLook(k) {
    const L = mixLook(this.lookPrev, LOOKS[this.camMode], k, this.look);
    this.hemi.intensity = L.hemi;
    this.sun.intensity = L.sun;
    this.fill.intensity = L.fill;
    if (this.scene.environment) this.scene.environmentIntensity = L.env;
    this.scene.fog.near = L.fogNear;
    this.scene.fog.far = L.fogFar;
    for (const f of this.fighters) f.rig.fxU.uRim.value.copy(f.rimBase).multiplyScalar(L.rim);
    this.vm.rig.fxU.uRim.value.copy(this.player.rimBase).multiplyScalar(L.rim);
  }

  // Vida de fondo: motas en el aire, vapor del reactor, brasas y destellos de los núcleos.
  ambient(dt) {
    this.ambT += dt;
    if (this.ambT < 0.13) return;
    this.ambT = 0;
    const c = this.camT, fx = this.fx;
    fx.burst(c.x + (Math.random() - 0.5) * 22, 0.4 + Math.random() * 2.6, c.z + (Math.random() - 0.5) * 16, {
      n: 1, color: 0xfff2c8, speed: 0.3, up: 0.12, life: 3.2, size: 0.03, grav: -0.04, drag: 0.4,
    });
    const r = this.world.reactor;
    if (Math.random() < 0.3) fx.puff(r.x, 1.8, r.z, { n: 1, size: 0.6, life: 1.6, alpha: 0.22, rise: 0.9, speed: 0.2, color: 0xd6ffb0 });
    for (const f of this.fighters) {
      if (!f.alive || f.def.id !== 'brasa' || !(f.team === ME || f.visTo[ME])) continue;
      fx.burst(f.x, 1.7 + f.airY, f.z, { n: 1, color: [0xff7a12, 0xffc21a], speed: 0.5, up: 1.6, life: 0.7, size: 0.05, grav: -1.5, drag: 1 });
    }
    // Malheridos: gotean sangre, pierden aceite y humo, o se les apaga la lava.
    for (const f of this.fighters) {
      if (!f.alive || f.hp > f.maxHp * 0.35 || !(f.team === ME || f.visTo[ME])) continue;
      const kind = f.def.gore.blood;
      if (kind === 'blood' && this.gore) fx.burst(f.x, 0.7, f.z, { n: 1, color: BLOOD, speed: 0.5, up: 0.4, life: 0.6, size: 0.05, grav: 14, hot: false, stain: 'blood' });
      else if (kind === 'oil') {
        fx.puff(f.x, 1.3, f.z, { n: 1, size: 0.5, life: 0.9, alpha: 0.4, rise: 1.3, speed: 0.3, color: 0x2a2a30 });
        if (Math.random() < 0.4) fx.burst(f.x, 1, f.z, { n: 3, color: [0xffe14a, 0xffffff], speed: 3, up: 2.5, life: 0.25, size: 0.04 });
      }
    }
    this.hud.setLowHp(this.player.alive && this.player.hp < this.player.maxHp * 0.3);
    for (const k of this.cores) {
      if (k.landed && Math.random() < 0.25) fx.burst(k.x, 0.7, k.z, { n: 1, color: 0xc8ff3a, speed: 0.6, up: 1.2, life: 0.55, size: 0.04, grav: 1 });
    }
  }

  // Cambio de calidad en plena partida: sombras y cantidad de efectos.
  setQuality(q) {
    this.q = q;
    const sh = this.sun.shadow;
    sh.mapSize.set(q.shadow, q.shadow);
    sh.radius = q.shadowRadius;
    sh.map?.dispose();
    sh.map = null;
    this.fx.fxScale = q.fxScale;
  }

  dispose() {
    for (const f of this.fighters) {
      disposeRig(f.rig);
      f.tag.remove();
    }
    for (const p of this.projectiles) this.fx.remove(p.mesh);
    for (const l of this.lobs) { this.fx.remove(l.mesh); l.mark.material.dispose(); }
    for (const z of this.zones) z.mat.dispose();
    for (const c of this.cores) this.fx.remove(c.mesh);
    this.fx.dispose();
    this.debris.dispose();
    this.world.dispose();
    this.vm.dispose();
    for (const o of this.own) o.dispose?.();
    this.sun.shadow.map?.dispose();
  }
}
