// Una partida 3 contra 3: luchadores, combate, núcleos, reglas, cámara.
import * as THREE from 'three';
import { HEROES, RULES, TEAMS, BOT_NAMES, heroById } from './data.js';
import { buildHero, animateRig, disposeRig } from './models.js';
import { World } from './world.js';
import { Fx } from './fx.js';
import { audio } from './audio.js';
import { Bot } from './ai.js';

const R = 0.4; // radio de un luchador
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const ME = 0; // equipo del jugador
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
const ENEMY_COLOR = 0xff3355;

export class Match {
  constructor({ heroId, input, hud, layer, onEnd, lowQuality = false }) {
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

    const scene = (this.scene = new THREE.Scene());
    scene.background = new THREE.Color(0x1b5a7c);
    scene.fog = new THREE.Fog(0x1b5a7c, 70, 150);
    this.camera = new THREE.PerspectiveCamera(36, 1, 1, 240);
    this.camT = new THREE.Vector3();
    this.camDist = 17;
    this.limX = 6;
    this.limZ0 = -10;
    this.limZ1 = 10;

    scene.add(new THREE.HemisphereLight(0xe2f2ff, 0xb39768, 1.3));
    const sun = (this.sun = new THREE.DirectionalLight(0xfff1d8, 2.5));
    sun.castShadow = true;
    const q = lowQuality ? 1024 : 2048;
    sun.shadow.mapSize.set(q, q);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    this.world = new World(scene);
    this.fx = new Fx(scene, layer);
    this.projectiles = [];
    this.lobs = [];
    this.zones = [];
    this.cores = [];
    this.fighters = [];
    this.own = [];

    this.markerGeo = this.keep(new THREE.RingGeometry(0.46, 0.6, 32).rotateX(-Math.PI / 2));
    this.shieldGeo = this.keep(new THREE.SphereGeometry(0.95, 20, 14));

    // Equipos: el jugador + 2 aliados distintos, 3 rivales distintos.
    const others = shuffle(HEROES.filter((h) => h.id !== heroId).map((h) => h.id));
    const foes = shuffle(HEROES.map((h) => h.id)).slice(0, 3);
    const names = shuffle([...BOT_NAMES]);
    const lanes = [0, -1, 1];
    [heroId, others[0], others[1]].forEach((id, i) => this.addFighter(ME, i, id, i === 0, i === 0 ? 'Vos' : names.pop(), lanes[i]));
    foes.forEach((id, i) => this.addFighter(1, i, id, false, names.pop(), lanes[i]));
    this.player = this.fighters[0];
    this.camT.set(this.player.x, 0, this.player.z);

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
      moveAmt: 0, phase: 0, kick: 0, punch: 0, pop: 1, lastHurtT: -99, lastActT: -99,
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
    const shieldMat = new THREE.MeshBasicMaterial({
      color: TEAMS[team].color, transparent: true, opacity: 0.25, depthWrite: false, toneMapped: false,
    });
    f.shield = new THREE.Mesh(this.shieldGeo, shieldMat);
    f.shield.position.y = 0.75;
    f.shield.visible = false;
    rig.root.add(f.shield);
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
    this.camDist = perpH / (2 * Math.tan((this.camera.fov * DEG) / 2));
    this.camera.updateProjectionMatrix();
    // Límites de cámara: que no se vea mar de más en los bordes de la isla.
    const halfD = perpH / 2 / 0.85, halfW = (perpH * aspect) / 2;
    const W = this.world.W, H = this.world.H;
    this.limX = Math.max(0, W / 2 + 1.5 - halfW * 0.85);
    this.limZ1 = H / 2 + 1.3 - halfD * 0.8;
    this.limZ0 = Math.min(this.limZ1, -H / 2 - 1 + halfD * 0.9);
    const half = Math.max(15, Math.min(26, perpH * 0.9));
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
    this.time += dt;
    this.input.update();
    if (this.state === 'intro') this.updateIntro(dt);
    this.controlPlayer();
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

  controlPlayer() {
    const p = this.player, inp = this.input;
    const events = inp.take();
    if (this.state !== 'play') {
      p.mvx = p.mvz = 0;
      this.setIndicator(null);
      return;
    }
    p.mvx = inp.move.x;
    p.mvz = inp.move.z;
    if (!p.alive) return this.setIndicator(null);

    if (inp.touch) {
      for (const ev of events) {
        const sup = ev.kind === 'super';
        const spec = sup ? p.def.super : p.def.attack;
        const a = ev.auto ? this.autoAim(p, spec) : { x: ev.x, z: ev.z, dist: ev.mag * spec.range };
        if (sup) this.trySuper(p, a.x, a.z, a.dist);
        else this.tryAttack(p, a.x, a.z, a.dist);
      }
      const pv = inp.preview;
      if (!pv || (pv.kind === 'super' && p.super < 1)) return this.setIndicator(null);
      const spec = pv.kind === 'super' ? p.def.super : p.def.attack;
      this.setIndicator({ spec, isSuper: pv.kind === 'super', x: pv.x, z: pv.z, dist: pv.mag * spec.range });
    } else {
      const g = this.mouseGround();
      let dx = g.x - p.x, dz = g.z - p.z;
      const d = Math.hypot(dx, dz) || 1;
      dx /= d; dz /= d;
      for (const ev of events) if (ev.kind === 'super') this.trySuper(p, dx, dz, d);
      if (inp.fire) this.tryAttack(p, dx, dz, d);
      const sup = inp.superHeld && p.super >= 1;
      this.setIndicator({ spec: sup ? p.def.super : p.def.attack, isSuper: sup, x: dx, z: dz, dist: d });
    }
  }

  autoAim(f, spec) {
    let best = null, bd = spec.range * 1.25 + (spec.aoe || spec.radius || 0);
    for (const e of this.fighters) {
      if (e.team === f.team || !e.alive || !e.visTo[f.team]) continue;
      const d = Math.hypot(e.x - f.x, e.z - f.z);
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return { x: Math.sin(f.face), z: Math.cos(f.face), dist: spec.range * 0.75 };
    const tt = spec.kind === 'lob' ? spec.flight : spec.speed ? bd / spec.speed : 0;
    const dx = best.x + best.velx * tt * 0.8 - f.x, dz = best.z + best.velz * tt * 0.8 - f.z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l, dist: l };
  }

  buildIndicator() {
    const g = (this.ind = new THREE.Group());
    this.indMat = this.keep(new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    }));
    this.indRect = new THREE.Mesh(this.keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5)), this.indMat);
    this.indDisc = new THREE.Mesh(this.keep(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)), this.indMat);
    this.indFans = new Map();
    g.add(this.indRect, this.indDisc);
    g.renderOrder = 4;
    g.visible = false;
    this.scene.add(g);
  }

  fan(arcDeg) {
    let m = this.indFans.get(arcDeg);
    if (!m) {
      const arc = arcDeg * DEG;
      m = new THREE.Mesh(this.keep(new THREE.CircleGeometry(1, 24, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2)), this.indMat);
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
    this.indMat.color.set(a.isSuper ? 0xffe14a : 0xffffff);
    this.indMat.opacity = !a.isSuper && p.ammo < 1 ? 0.12 : a.isSuper ? 0.4 : 0.26;
    const s = a.spec;
    this.indRect.visible = this.indDisc.visible = false;
    for (const f of this.indFans.values()) f.visible = false;
    const showFan = (deg, range) => {
      const f = this.fan(deg);
      f.visible = true;
      f.scale.setScalar(range);
    };
    switch (s.kind) {
      case 'shots':
        if (s.spread > 0) showFan(s.spread + 12, s.range);
        else {
          this.indRect.visible = true;
          this.indRect.scale.set(Math.max(0.42, s.radius * 2), 1, this.world.rayShot(p.x, p.z, a.x, a.z, s.range));
        }
        break;
      case 'melee': showFan(s.arc, s.range); break;
      case 'dash':
        this.indRect.visible = true;
        this.indRect.scale.set(s.width, 1, Math.max(0.3, this.dashLength(p, a.x, a.z, s.range)));
        break;
      default: {
        const d = clamp(a.dist, 1.2, s.range);
        this.indDisc.visible = true;
        this.indDisc.position.set(0, 0, d);
        this.indDisc.scale.setScalar(s.aoe || s.radius);
        this.indRect.visible = true;
        this.indRect.scale.set(0.1, 1, d);
      }
    }
  }

  // -------------------------------------------------------------- combate --
  sfx(name, src, vol = 1) {
    const d = Math.hypot(src.x - this.camT.x, src.z - this.camT.z);
    audio.play(name, vol * clamp(1 - d / 17, 0, 1) ** 1.4);
  }

  markAttack(f, dx, dz) {
    f.aim = Math.atan2(dx, dz);
    f.aimHold = 0.5;
    f.lastActT = this.time;
    f.revealT = Math.max(f.revealT, 0.9);
    f.kick = 1;
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
    this.markAttack(f, dx, dz);
    if (f.team === ME || f.visTo[ME]) {
      this.fx.ring(f.x, f.z, 0.5, 2.2, 0xffe14a, 0.4);
      this.fx.text(f.x, f.rig.height + 0.9, f.z, f.def.super.name.toUpperCase() + '!', 'super');
    }
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
        const color = f.team === ME ? SHOT_COLOR[s.visual] : ENEMY_COLOR;
        const mesh = this.fx.projectile(s.visual, color);
        mesh.position.set(f.x, 1, f.z);
        const mark = new THREE.Mesh(this.fx.geos.ring, new THREE.MeshBasicMaterial({
          color, transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false,
        }));
        mark.position.set(t.x, 0.05, t.z);
        mark.scale.setScalar(s.aoe);
        this.scene.add(mark);
        this.lobs.push({ fx: f.x, fz: f.z, tx: t.x, tz: t.z, t: 0, dur: s.flight, spec: s, owner: f, team: f.team, mesh, mark, color });
        break;
      }
      case 'melee':
        for (let i = 0; i < s.hits; i++) f.queue.push({ t: i * s.interval, fn: () => this.meleeHit(f, s, i) });
        break;
      case 'leap': {
        const d = clamp(dist, 1.5, s.range);
        const t = this.world.nearestFree(f.x + dx * d, f.z + dz * d, R);
        f.action = { type: 'leap', t: 0, dur: s.dur, fx: f.x, fz: f.z, tx: t.x, tz: t.z, spec: s };
        break;
      }
      case 'dash': {
        const d = this.dashLength(f, dx, dz, s.range);
        f.action = { type: 'dash', t: 0, dur: s.dur, fx: f.x, fz: f.z, tx: f.x + dx * d, tz: f.z + dz * d, spec: s, hit: new Set() };
        break;
      }
      case 'zone': {
        const d = clamp(dist, 0, s.range);
        const t = this.clampToArena(f.x + dx * d, f.z + dz * d);
        this.addZone(t.x, t.z, s, f);
        break;
      }
      default: break;
    }
    void isSuper;
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

  spawnShot(f, s, ang, repeat) {
    if (!f.alive) return;
    if (repeat) this.sfx(s.sfx, f, 0.8);
    const dx = Math.sin(ang), dz = Math.cos(ang);
    const color = f.team === ME ? SHOT_COLOR[s.visual] : ENEMY_COLOR;
    const mesh = this.fx.projectile(s.visual, color);
    const x = f.x + dx * 0.55, z = f.z + dz * 0.55;
    mesh.position.set(x, 0.8, z);
    mesh.rotation.y = ang;
    f.kick = 1;
    if (f.team === ME || f.visTo[ME]) this.fx.burst(x, 0.8, z, { n: 4, color: [color, 0xffffff], speed: 2.5, up: 1, life: 0.2, size: 0.08, vx: dx * 4, vz: dz * 4 });
    this.projectiles.push({
      x, z, dx, dz, speed: s.speed, left: s.range - 0.55, r: s.radius, dmg: s.dmg, owner: f, team: f.team,
      pierce: !!s.pierce, knock: s.knock || 0, hit: new Set(), mesh, color, visual: s.visual, trail: 0,
    });
  }

  meleeHit(f, s, i) {
    if (!f.alive) return;
    if (i > 0) this.sfx(s.sfx, f, 0.9);
    f.kick = 1;
    const ang = f.aim + (i % 2 ? 0.25 : -0.25);
    if (f.team === ME || f.visTo[ME]) this.fx.slash(f.x, f.z, ang, s.arc, s.range, f.team === ME ? 0xdff6ff : 0xff8a9a);
    for (const e of this.fighters) {
      if (e.team === f.team || !e.alive || e.action) continue;
      const dx = e.x - f.x, dz = e.z - f.z, d = Math.hypot(dx, dz);
      if (d > s.range + R * 0.6) continue;
      if (d > 0.5 && Math.abs(angDiff(Math.atan2(dx, dz), f.aim)) > (s.arc * DEG) / 2 + 0.15) continue;
      if (!this.world.shotClear(f.x, f.z, e.x, e.z)) continue;
      this.damage(e, s.dmg, f, { kx: (dx / (d || 1)) * 2.5, kz: (dz / (d || 1)) * 2.5 });
    }
  }

  aoe(x, z, radius, dmg, src, knock = 0) {
    for (const e of this.fighters) {
      if (e.team === src.team || !e.alive || e.action) continue;
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
    const seen = e.team === ME || e.visTo[ME];
    if (seen) {
      const cls = e.isPlayer ? 'hurt' : src && src.isPlayer ? 'mine' : e.team === ME ? 'ally' : '';
      this.fx.text(e.x, e.rig.height + 0.5 + e.airY, e.z, String(amt), cls);
      this.fx.burst(e.x, 0.8, e.z, { n: 5, color: [0xffffff, e.def.color], speed: 3.5, life: 0.3, size: 0.08 });
    }
    if (e.isPlayer) {
      audio.play('hurt');
      this.shake = Math.max(this.shake, 0.22);
      this.hud.hurt();
    } else if (src && src.isPlayer) audio.play('hit');
    else this.sfx('hit', e, 0.5);
    if (e.hp <= 0) this.kill(e, src);
  }

  kill(e, src) {
    e.alive = false;
    e.hp = 0;
    e.respawnT = RULES.respawn;
    e.action = null;
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
    this.fx.burst(e.x, 0.8, e.z, { n: 26, color: [e.def.color, 0xffffff, TEAMS[e.team].color], speed: 6, up: 5, life: 0.7, size: 0.14 });
    this.fx.ring(e.x, e.z, 0.4, 2.4, TEAMS[e.team].color, 0.45);
    this.sfx('death', e);
    this.hud.feed(src || null, e);
    if (e.isPlayer) {
      this.shake = 0.6;
      this.hud.setRespawn(Math.ceil(e.respawnT));
    }
  }

  respawn(f) {
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
      this.hud.setRespawn(null);
      audio.play('respawn');
    }
  }

  // ----------------------------------------------------------- luchadores --
  updateFighter(f, dt) {
    if (!f.alive) {
      f.respawnT -= dt;
      if (f.isPlayer && this.state === 'play') this.hud.setRespawn(Math.max(1, Math.ceil(f.respawnT)));
      if (f.respawnT <= 0 && this.state === 'play') this.respawn(f);
      return;
    }
    f.attackCd -= dt; f.shieldT -= dt; f.revealT -= dt; f.aimHold -= dt;
    f.kick = Math.max(0, f.kick - dt * 5);
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
      const amt = Math.min(1, ml);
      f.x += (mx * f.def.speed + f.kx) * dt;
      f.z += (mz * f.def.speed + f.kz) * dt;
      const k = Math.exp(-9 * dt);
      f.kx *= k; f.kz *= k;
      this.world.resolve(f, R);
      f.moveAmt += ((amt > 0.1 ? amt : 0) - f.moveAmt) * Math.min(1, dt * 12);
      f.phase += dt * f.def.speed * 2.1 * amt;
      if (amt > 0.1) f.moveAng = Math.atan2(mx, mz);
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
      if (f.team === ME || f.visTo[ME]) this.fx.burst(f.x, 0.5, f.z, { n: 5, color: [0x3fae4a, 0x57c35c], speed: 2.2, up: 2.5, life: 0.4, size: 0.09 });
    }
  }

  updateAction(f, dt) {
    const a = f.action, s = a.spec;
    a.t += dt;
    const u = Math.min(1, a.t / a.dur);
    f.x = a.fx + (a.tx - a.fx) * u;
    f.z = a.fz + (a.tz - a.fz) * u;
    f.moveAmt = 0;
    const seen = f.team === ME || f.visTo[ME];
    if (a.type === 'leap') {
      f.airY = Math.sin(u * Math.PI) * 3.4;
      if (u >= 1) {
        f.action = null;
        f.airY = 0;
        this.aoe(f.x, f.z, s.aoe, s.dmg, f, s.knock);
        this.fx.ring(f.x, f.z, 0.4, s.aoe, 0xff8a2a, 0.45);
        this.fx.ring(f.x, f.z, 0.2, s.aoe, 0xffd23f, 0.3, true);
        this.fx.burst(f.x, 0.3, f.z, { n: 30, color: [0xff6a1a, 0xffd23f, 0x52424a], speed: 8, up: 5, life: 0.6, size: 0.16 });
        this.sfx('boom', f);
        const d = Math.hypot(f.x - this.camT.x, f.z - this.camT.z);
        this.shake = Math.max(this.shake, clamp(0.6 - d / 20, 0, 0.6));
      }
    } else {
      if (seen) this.fx.burst(f.x, 0.8, f.z, { n: 2, color: [0xdff6ff, 0xff3f6c], speed: 1, up: 0.5, life: 0.25, size: 0.13, grav: 0 });
      for (const e of this.fighters) {
        if (e.team === f.team || !e.alive || e.action || a.hit.has(e)) continue;
        if (Math.hypot(e.x - f.x, e.z - f.z) < s.width) {
          a.hit.add(e);
          this.damage(e, s.dmg, f, null);
        }
      }
      if (u >= 1) {
        f.action = null;
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
        p.x += p.dx * sd; p.z += p.dz * sd; p.left -= sd;
        if (this.world.shotBlockedAt(p.x, p.z)) {
          this.fx.burst(p.x, 0.8, p.z, { n: 6, color: [p.color, 0xffffff], speed: 3, life: 0.25, size: 0.08, vx: -p.dx * 2, vz: -p.dz * 2 });
          dead = true;
          break;
        }
        for (const e of this.fighters) {
          if (e.team === p.team || !e.alive || e.action || p.hit.has(e)) continue;
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
      p.mesh.position.set(p.x, 0.8, p.z);
      if (p.visual === 'ember' || p.visual === 'orb') p.mesh.userData.core.rotation.x += dt * 9;
      p.trail -= dt;
      if (p.trail <= 0) {
        p.trail = p.visual === 'orb' ? 0.02 : 0.045;
        this.fx.burst(p.x, 0.8, p.z, { n: 1, color: p.color, speed: 0.4, up: 0.3, life: 0.22, size: p.visual === 'orb' ? 0.2 : 0.07, grav: 0 });
      }
    }
  }

  updateLobs(dt) {
    for (let i = this.lobs.length - 1; i >= 0; i--) {
      const l = this.lobs[i], s = l.spec;
      l.t += dt;
      const u = Math.min(1, l.t / l.dur);
      l.mesh.position.set(l.fx + (l.tx - l.fx) * u, 0.9 + Math.sin(u * Math.PI) * 3.2 - u * 0.7, l.fz + (l.tz - l.fz) * u);
      l.mesh.userData.core.rotation.x += dt * 10;
      l.mark.material.opacity = 0.35 + u * 0.5;
      if (u < 1) continue;
      this.aoe(l.tx, l.tz, s.aoe, s.dmg, l.owner, 0);
      this.fx.ring(l.tx, l.tz, 0.3, s.aoe, l.color, 0.35);
      this.fx.ring(l.tx, l.tz, 0.2, s.aoe, l.color, 0.25, true);
      this.fx.burst(l.tx, 0.3, l.tz, { n: 18, color: [l.color, 0xffffff], speed: 6, up: 4, life: 0.5, size: 0.12 });
      this.sfx('boom', { x: l.tx, z: l.tz }, 0.7);
      if (s.zone) this.addZone(l.tx, l.tz, s.zone, l.owner);
      this.fx.remove(l.mesh);
      this.scene.remove(l.mark);
      l.mark.material.dispose();
      this.lobs.splice(i, 1);
    }
  }

  addZone(x, z, s, owner) {
    const color = owner.team === ME ? ZONE_COLOR[s.visual] : ENEMY_COLOR;
    const g = new THREE.Group();
    const fill = new THREE.Mesh(this.fx.geos.disc, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false,
    }));
    const edge = new THREE.Mesh(this.fx.geos.ring, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false,
    }));
    g.add(fill, edge);
    g.position.set(x, 0.045, z);
    g.scale.setScalar(s.radius);
    this.scene.add(g);
    this.zones.push({ x, z, spec: s, owner, t: 0, tickT: 0, g, fill, edge, color });
  }

  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i], s = z.spec;
      z.t += dt;
      const delay = s.delay || 0;
      if (z.t < delay) {
        z.fill.material.opacity = 0.1 + 0.25 * Math.abs(Math.sin(z.t * 14));
        continue;
      }
      z.fill.material.opacity = 0.2 + 0.07 * Math.sin(z.t * 6);
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
        z.fill.material.dispose();
        z.edge.material.dispose();
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
            if (!f.alive || f.action) continue;
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
      won, winner, score: this.score,
      fighters: this.fighters.map((f) => ({
        name: f.name, hero: f.def.id, heroName: f.def.name, team: f.team, isPlayer: f.isPlayer, ...f.stats,
      })),
    };
  }

  // ---------------------------------------------------------------- vista --
  updateView(dt, rawDt) {
    const p = this.player, w = this.world;
    const anim = { t: this.time, move: 0, phase: 0, kick: 0 };
    const occupied = [];
    for (const f of this.fighters) {
      const seen = f.alive && (f.team === ME || f.visTo[ME]);
      const root = f.rig.root;
      root.visible = seen;
      f.ring.visible = seen && !f.action;
      if (seen) {
        if (f.inBush) occupied.push(f);
        root.position.set(f.x, f.airY, f.z);
        root.rotation.y = f.face;
        const e = 1 - (1 - f.pop) ** 3;
        root.scale.setScalar((0.2 + 0.8 * e) * (1 + f.punch * 0.1));
        if (f.action && f.action.type === 'dash') root.rotation.x = 0.5;
        else root.rotation.x = f.action ? -0.4 : 0;
        anim.move = f.moveAmt; anim.phase = f.phase; anim.kick = f.kick;
        animateRig(f.rig, anim);
        f.ring.position.set(f.x, 0.035, f.z);
        const ready = f.super >= 1;
        f.ring.scale.setScalar(ready ? 1.1 + Math.sin(this.time * 9) * 0.08 : 1);
        f.shield.visible = f.shieldT > 0;
        if (f.shield.visible) f.shield.material.opacity = 0.2 + Math.sin(this.time * 12) * 0.08;
      }
    }

    // cámara
    const a = 1 - Math.exp(-rawDt * 7);
    const tx = clamp(p.x, -this.limX, this.limX);
    const tz = clamp(p.z - 1, this.limZ0, this.limZ1);
    this.camT.x += (tx - this.camT.x) * a;
    this.camT.z += (tz - this.camT.z) * a;
    this.zoom += ((this.state === 'intro' ? 1.25 : 1) - this.zoom) * (1 - Math.exp(-rawDt * 2.5));
    this.shake = Math.max(0, this.shake - rawDt * 2.2);
    const sh = this.shake * this.shake * 1.6;
    const d = this.camDist * this.zoom;
    this.camera.position.set(
      this.camT.x + (Math.random() - 0.5) * sh,
      d * 0.85 + (Math.random() - 0.5) * sh,
      this.camT.z + d * 0.527 + (Math.random() - 0.5) * sh,
    );
    this.camera.lookAt(this.camT.x, 0.4, this.camT.z);
    this.camera.updateMatrixWorld();
    this.sun.position.set(this.camT.x - 10, 24, this.camT.z - 8);
    this.sun.target.position.set(this.camT.x, 0, this.camT.z);

    // etiquetas
    const v = this.tmp;
    for (const f of this.fighters) {
      const seen = f.alive && (f.team === ME || f.visTo[ME]);
      if (!seen) { f.tag.place(0, 0, false); continue; }
      v.set(f.x, f.rig.height + 0.3 + f.airY, f.z).project(this.camera);
      f.tag.place((v.x * 0.5 + 0.5) * this.vw, (-v.y * 0.5 + 0.5) * this.vh, v.z < 1);
      f.tag.sync(f);
    }
    this.hud.setSuper(p.super);
    w.update(this.time, dt, occupied);
    this.fx.update(dt, this.camera, this.vw, this.vh);
  }

  dispose() {
    for (const f of this.fighters) {
      disposeRig(f.rig);
      f.tag.remove();
    }
    for (const p of this.projectiles) this.fx.remove(p.mesh);
    for (const l of this.lobs) { this.fx.remove(l.mesh); l.mark.material.dispose(); }
    for (const z of this.zones) { z.fill.material.dispose(); z.edge.material.dispose(); }
    for (const c of this.cores) this.fx.remove(c.mesh);
    this.fx.dispose();
    this.world.dispose();
    for (const o of this.own) o.dispose?.();
    this.sun.shadow.map?.dispose();
  }
}
