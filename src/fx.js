// Efectos: partículas, humo, anillos, marcas en el piso, luces de destello,
// proyectiles y textos flotantes.
import * as THREE from 'three';
import { tex } from './assets.js';
import { puffMaterial, instancedAlpha } from './shaders.js';

const MAX = 700;
const PUFF_MAX = 140;
const SCORCH_MAX = 8;
const STAIN_MAX = 80;
const tmpColor = new THREE.Color();
const v3 = new THREE.Vector3();

function haloTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

// Mancha irregular para las marcas de quemado.
function scorchTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grad.addColorStop(0, 'rgba(255,255,255,.9)');
  grad.addColorStop(0.45, 'rgba(255,255,255,.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.28, d = S * (0.28 + Math.random() * 0.2);
    g.fillStyle = `rgba(0,0,0,${0.25 + Math.random() * 0.4})`;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 4 + Math.random() * 12, 0, 7);
    g.fill();
  }
  return new THREE.CanvasTexture(c);
}

// Mancha de líquido: un charco central con lóbulos y gotas alrededor.
function stainTexture() {
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.filter = 'blur(1.5px)';
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  blob(S / 2, S / 2, S * 0.22);
  for (let i = 0; i < 9; i++) {
    const a = Math.random() * 6.28, d = S * (0.12 + Math.random() * 0.14);
    blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.07 + Math.random() * 0.09));
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * 6.28, d = S * (0.3 + Math.random() * 0.17);
    blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 1.5 + Math.random() * 4);
  }
  return new THREE.CanvasTexture(c);
}

export const STAIN = { blood: 0x5e0505, oil: 0x08080b, slime: 0x2f6a12 };

export class Fx {
  // q: nivel de calidad (boost de brillo para el bloom, cantidad de partículas y de luces).
  constructor(scene, layer, q = {}) {
    this.scene = scene;
    this.layer = layer; // contenedor DOM para textos
    this.boost = q.boost ?? 1;
    this.fxScale = q.fxScale ?? 1;
    this.own = [];
    const keep = (o) => { this.own.push(o); return o; };

    // Partículas instanciadas.
    this.pGeo = keep(new THREE.IcosahedronGeometry(1, 0));
    this.pMat = keep(new THREE.MeshBasicMaterial({ toneMapped: false }));
    this.pMesh = new THREE.InstancedMesh(this.pGeo, this.pMat, MAX);
    this.pMesh.count = 0;
    this.pMesh.frustumCulled = false;
    this.pMesh.setColorAt(0, tmpColor.set(0xffffff));
    this.pMesh.userData.noAO = true;
    scene.add(this.pMesh);
    this.p = [];
    this.dummy = new THREE.Object3D();

    this.halo = keep(haloTexture());
    this.geos = {
      bolt: keep(new THREE.CapsuleGeometry(0.085, 0.42, 4, 8).rotateX(Math.PI / 2)),
      ember: keep(new THREE.IcosahedronGeometry(0.19, 0)),
      dart: keep(new THREE.ConeGeometry(0.1, 0.9, 8).rotateX(Math.PI / 2)),
      orb: keep(new THREE.IcosahedronGeometry(0.55, 2)),
      flask: keep(new THREE.SphereGeometry(0.2, 12, 10)),
      bigflask: keep(new THREE.SphereGeometry(0.32, 14, 12)),
      ring: keep(new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2)),
      disc: keep(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2)),
    };
    // Humo y polvo.
    this.puffGeo = keep(new THREE.PlaneGeometry(1, 1));
    this.puffAlpha = new THREE.InstancedBufferAttribute(new Float32Array(PUFF_MAX), 1);
    this.puffAlpha.setUsage(THREE.DynamicDrawUsage);
    this.puffGeo.setAttribute('aAlpha', this.puffAlpha);
    this.puffMesh = new THREE.InstancedMesh(this.puffGeo, keep(puffMaterial(this.halo)), PUFF_MAX);
    this.puffMesh.count = 0;
    this.puffMesh.frustumCulled = false;
    this.puffMesh.renderOrder = 5;
    this.puffMesh.setColorAt(0, tmpColor.set(0xffffff));
    scene.add(this.puffMesh);
    this.puffs = [];
    this.puffDummy = new THREE.Object3D();

    // Marcas de quemado en el piso.
    this.scorchGeo = keep(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2));
    this.scorchTex = keep(scorchTexture());
    this.scorches = [];
    for (let i = 0; i < SCORCH_MAX; i++) {
      const mat = keep(new THREE.MeshBasicMaterial({
        map: this.scorchTex, color: 0x140c08, transparent: true, opacity: 0, depthWrite: false,
        polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
      }));
      const m = new THREE.Mesh(this.scorchGeo, mat);
      m.visible = false;
      m.renderOrder = 1;
      scene.add(m);
      this.scorches.push({ m, t: 0, dur: 0 });
    }

    // Manchas de líquido en el piso (sangre, aceite): quedan un rato y después se borran.
    this.stainGeo = keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    this.stainAlpha = new THREE.InstancedBufferAttribute(new Float32Array(STAIN_MAX), 1);
    this.stainAlpha.setUsage(THREE.DynamicDrawUsage);
    this.stainGeo.setAttribute('aAlpha', this.stainAlpha);
    this.stainMesh = new THREE.InstancedMesh(this.stainGeo, keep(instancedAlpha(new THREE.MeshStandardMaterial({
      map: keep(stainTexture()), transparent: true, depthWrite: false, roughness: 0.22, metalness: 0,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    }))), STAIN_MAX);
    this.stainMesh.frustumCulled = false;
    this.stainMesh.receiveShadow = true;
    this.stainMesh.renderOrder = 1;
    this.stainMesh.setColorAt(0, tmpColor.set(0xffffff));
    scene.add(this.stainMesh);
    this.stains = [];
    this.stainNext = 0;
    this.stainDummy = new THREE.Object3D();
    this.canStain = () => true; // la partida lo reemplaza: no se mancha el agua ni arriba de un muro

    // Luces de destello reutilizables (explosiones, súper).
    this.lights = [];
    for (let i = 0; i < (q.lights ?? 0); i++) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 1.8);
      scene.add(l);
      this.lights.push({ l, t: 1, dur: 1, peak: 0 });
    }

    this.mats = new Map();
    this.rings = [];
    this.texts = [];
    this.textPool = [];
  }

  basic(color) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
      m.color.multiplyScalar(this.boost);
      this.mats.set(color, m);
      this.own.push(m);
    }
    return m;
  }

  haloSprite(color, size) {
    const mat = new THREE.SpriteMaterial({
      map: this.halo, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85,
    });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(size);
    return s;
  }

  projectile(visual, color) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.geos[visual] || this.geos.ember, this.basic(color));
    g.add(core);
    const size = { orb: 3.2, bigflask: 1.7, flask: 1.2, dart: 1.3, bolt: 1.1, ember: 1.1 }[visual] || 1.1;
    g.add(this.haloSprite(color, size));
    g.userData.core = core;
    this.scene.add(g);
    return g;
  }

  // Núcleo: el ícono del arte como cartel que siempre mira a cámara, con resplandor.
  coreMesh() {
    const g = new THREE.Group();
    if (!this.coreMat) {
      this.coreMat = new THREE.SpriteMaterial({ map: tex('nucleo.webp'), transparent: true, toneMapped: false });
      this.coreMat.color.multiplyScalar(1 + (this.boost - 1) * 0.45);
      this.own.push(this.coreMat);
    }
    g.add(this.haloSprite(0xa8ff3a, 1.7));
    const s = new THREE.Sprite(this.coreMat);
    s.scale.set(0.7, 0.8, 1);
    g.add(s);
    g.userData.sprite = s;
    this.scene.add(g);
    return g;
  }

  remove(obj) {
    this.scene.remove(obj);
    obj.traverse?.((o) => { if (o.isSprite && o.material !== this.coreMat) o.material.dispose(); });
  }

  // hot: false para tierra, hojas o piedra (no deben brillar con el bloom).
  burst(x, y, z, o = {}) {
    const n0 = o.n ?? 8, speed = o.speed ?? 4, life = o.life ?? 0.45, size = o.size ?? 0.09;
    const n = n0 > 1 ? Math.max(1, Math.round(n0 * this.fxScale)) : n0;
    const k = o.hot === false ? 1 : this.boost;
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? 0xffffff];
    for (let i = 0; i < n; i++) {
      if (this.p.length >= MAX) return;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      const up = (o.up ?? 2.5) * (0.3 + Math.random());
      this.p.push({
        x: x + Math.cos(a) * (o.spread ?? 0.1), y, z: z + Math.sin(a) * (o.spread ?? 0.1),
        vx: Math.cos(a) * sp + (o.vx ?? 0), vy: up, vz: Math.sin(a) * sp + (o.vz ?? 0),
        life: life * (0.6 + Math.random() * 0.7), t: 0,
        size: size * (0.6 + Math.random() * 0.8), grav: o.grav ?? 9, drag: o.drag ?? 2.5,
        color: colors[Math.floor(Math.random() * colors.length)], k, stain: o.stain || null,
      });
    }
  }

  // Bocanadas suaves de humo o polvo.
  puff(x, y, z, o = {}) {
    const n = Math.max(1, Math.round((o.n ?? 3) * this.fxScale));
    for (let i = 0; i < n; i++) {
      if (this.puffs.length >= PUFF_MAX) return;
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 0.6) * (0.3 + Math.random());
      this.puffs.push({
        x: x + Math.cos(a) * (o.spread ?? 0.15), y, z: z + Math.sin(a) * (o.spread ?? 0.15),
        vx: Math.cos(a) * sp, vy: (o.rise ?? 0.6) * (0.5 + Math.random()), vz: Math.sin(a) * sp,
        t: 0, life: (o.life ?? 0.8) * (0.7 + Math.random() * 0.6), size: (o.size ?? 0.6) * (0.7 + Math.random() * 0.6),
        alpha: o.alpha ?? 0.5, color: o.color ?? 0xd9c7a0,
      });
    }
  }

  // Mancha en el piso. grow > 0 la hace crecer de a poco, como un charco.
  stain(kind, x, z, size, o = {}) {
    if (!this.canStain(x, z)) return;
    const i = this.stainNext;
    this.stainNext = (i + 1) % STAIN_MAX;
    this.stains[i] = {
      x, z, rot: Math.random() * 6.28, size, s0: o.grow ? size * 0.25 : size * 0.7, grow: o.grow ?? 0.12,
      t: 0, life: o.life ?? 18, alpha: o.alpha ?? 0.9, color: STAIN[kind] ?? STAIN.blood,
    };
  }

  // Salpicadura de agua: columna de gotas y onda.
  splash(x, z, y = -0.14, size = 0.5) {
    this.burst(x, y + 0.1, z, { n: Math.round(6 + size * 10), color: [0xd8f6ff, 0x9fe6f5, 0xffffff], speed: 1.6 + size, up: 4 + size * 3, life: 0.55, size: 0.07, hot: false });
    this.ring(x, z, 0.1, 0.5 + size, 0xd8f6ff, 0.5);
    this.rings[this.rings.length - 1].m.position.y = y + 0.03;
  }

  scorch(x, z, radius, dur = 7) {
    let best = this.scorches[0];
    for (const s of this.scorches) if (!s.m.visible) { best = s; break; } else if (s.t / s.dur > best.t / best.dur) best = s;
    best.m.visible = true;
    best.m.position.set(x, 0.012, z);
    best.m.rotation.y = Math.random() * 6.28;
    best.m.scale.setScalar(radius);
    best.t = 0;
    best.dur = dur;
  }

  flash(x, y, z, color, intensity = 30, dur = 0.35) {
    if (!this.lights.length) return;
    let best = this.lights[0];
    for (const f of this.lights) if (f.t / f.dur > best.t / best.dur) best = f;
    best.l.position.set(x, y, z);
    best.l.color.set(color);
    best.t = 0;
    best.dur = dur;
    best.peak = intensity;
  }

  ring(x, z, r0, r1, color, dur = 0.35, fill = false) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    mat.color.multiplyScalar(fill ? 1 : this.boost);
    const m = new THREE.Mesh(fill ? this.geos.disc : this.geos.ring, mat);
    m.position.set(x, 0.06, z);
    m.renderOrder = 3;
    this.scene.add(m);
    this.rings.push({ m, r0, r1, t: 0, dur, a: fill ? 0.5 : 0.9 });
  }

  // Abanico que se desvanece (tajos cuerpo a cuerpo).
  slash(x, z, ang, arcDeg, range, color) {
    const arc = (arcDeg * Math.PI) / 180;
    const geo = new THREE.RingGeometry(range * 0.45, range, 20, 1, -Math.PI / 2 - arc / 2, arc).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    mat.color.multiplyScalar(this.boost);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0.7, z);
    m.rotation.y = ang;
    this.scene.add(m);
    this.rings.push({ m, r0: 0.8, r1: 1.05, t: 0, dur: 0.16, a: 0.85, ownGeo: true });
  }

  text(x, y, z, str, cls = '') {
    const el = this.textPool.pop() || document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = str;
    this.layer.appendChild(el);
    this.texts.push({ el, x: x + (Math.random() - 0.5) * 0.5, y, z, t: 0 });
  }

  update(dt, camera, w, h) {
    // partículas
    const d = this.dummy;
    let n = 0;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i];
      p.t += dt;
      if (p.t >= p.life) { this.p[i] = this.p[this.p.length - 1]; this.p.pop(); continue; }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k; p.vz *= k;
      p.vy -= p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.04) {
        if (p.stain) {
          // gota de líquido: al tocar el piso deja su marca y desaparece
          if (Math.random() < 0.55) this.stain(p.stain, p.x, p.z, 0.16 + Math.random() * 0.3, { life: 14 });
          this.p[i] = this.p[this.p.length - 1]; this.p.pop();
          continue;
        }
        p.y = 0.04; p.vy *= -0.35;
      }
    }
    for (const p of this.p) {
      const s = p.size * (1 - (p.t / p.life) ** 2);
      d.position.set(p.x, p.y, p.z);
      d.scale.setScalar(s);
      d.rotation.set(p.t * 7, p.t * 5, 0);
      d.updateMatrix();
      this.pMesh.setMatrixAt(n, d.matrix);
      this.pMesh.setColorAt(n, tmpColor.set(p.color).multiplyScalar(p.k));
      n++;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

    // humo y polvo: siempre de frente a la cámara
    const pd = this.puffDummy;
    pd.quaternion.copy(camera.quaternion);
    let pn = 0;
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.t += dt;
      if (p.t >= p.life) { this.puffs[i] = this.puffs[this.puffs.length - 1]; this.puffs.pop(); continue; }
      const k = Math.exp(-2.2 * dt);
      p.vx *= k; p.vz *= k;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    for (const p of this.puffs) {
      const u = p.t / p.life;
      pd.position.set(p.x, p.y, p.z);
      pd.scale.setScalar(p.size * (0.45 + u * 1.25));
      pd.updateMatrix();
      this.puffMesh.setMatrixAt(pn, pd.matrix);
      this.puffMesh.setColorAt(pn, tmpColor.set(p.color));
      this.puffAlpha.array[pn] = p.alpha * (1 - u) * (1 - u) * Math.min(1, u * 9);
      pn++;
    }
    this.puffMesh.count = pn;
    this.puffMesh.instanceMatrix.needsUpdate = true;
    this.puffAlpha.needsUpdate = true;
    if (this.puffMesh.instanceColor) this.puffMesh.instanceColor.needsUpdate = true;

    // manchas
    const sd = this.stainDummy;
    let sn = 0;
    for (let i = 0; i < STAIN_MAX; i++) {
      const st = this.stains[i];
      if (!st) continue;
      st.t += dt;
      if (st.t >= st.life) { this.stains[i] = null; continue; }
      const grow = Math.min(1, st.t / Math.max(0.01, st.grow));
      const size = st.s0 + (st.size - st.s0) * (1 - (1 - grow) ** 2);
      sd.position.set(st.x, 0.014 + i * 0.00004, st.z);
      sd.rotation.set(0, st.rot, 0);
      sd.scale.set(size, 1, size);
      sd.updateMatrix();
      this.stainMesh.setMatrixAt(sn, sd.matrix);
      this.stainMesh.setColorAt(sn, tmpColor.set(st.color));
      this.stainAlpha.array[sn] = st.alpha * Math.min(1, (st.life - st.t) / (st.life * 0.3));
      sn++;
    }
    this.stainMesh.count = sn;
    this.stainMesh.instanceMatrix.needsUpdate = true;
    this.stainAlpha.needsUpdate = true;
    if (this.stainMesh.instanceColor) this.stainMesh.instanceColor.needsUpdate = true;

    // marcas en el piso
    for (const s of this.scorches) {
      if (!s.m.visible) continue;
      s.t += dt;
      const u = s.t / s.dur;
      s.m.material.opacity = 0.62 * Math.min(1, s.t * 6) * (1 - Math.max(0, (u - 0.5) * 2));
      if (u >= 1) s.m.visible = false;
    }

    // luces de destello
    for (const f of this.lights) {
      if (f.t >= f.dur) { f.l.intensity = 0; continue; }
      f.t += dt;
      const u = Math.min(1, f.t / f.dur);
      f.l.intensity = f.peak * (1 - u) * (1 - u);
    }

    // anillos
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.t += dt;
      const u = Math.min(1, r.t / r.dur);
      const e = 1 - (1 - u) ** 3;
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
      r.m.material.opacity = r.a * (1 - u);
      if (u >= 1) {
        this.scene.remove(r.m);
        r.m.material.dispose();
        if (r.ownGeo) r.m.geometry.dispose();
        this.rings.splice(i, 1);
      }
    }

    // textos
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.t += dt;
      if (t.t > 0.8) {
        t.el.remove();
        this.textPool.push(t.el);
        this.texts.splice(i, 1);
        continue;
      }
      v3.set(t.x, t.y + t.t * 1.4, t.z).project(camera);
      const sx = (v3.x * 0.5 + 0.5) * w, sy = (-v3.y * 0.5 + 0.5) * h;
      const pop = t.t < 0.12 ? 0.6 + (t.t / 0.12) * 0.6 : 1.2 - Math.min(0.2, (t.t - 0.12) * 1.5);
      t.el.style.transform = `translate3d(${sx.toFixed(1)}px,${sy.toFixed(1)}px,0) translate(-50%,-50%) scale(${pop.toFixed(2)})`;
      t.el.style.opacity = t.t > 0.55 ? String(1 - (t.t - 0.55) / 0.25) : '1';
    }
  }

  dispose() {
    this.scene.remove(this.pMesh);
    this.scene.remove(this.puffMesh);
    this.scene.remove(this.stainMesh);
    this.stainMesh.dispose();
    for (const s of this.scorches) this.scene.remove(s.m);
    for (const f of this.lights) this.scene.remove(f.l);
    this.puffMesh.dispose();
    for (const r of this.rings) { r.m.material.dispose(); if (r.ownGeo) r.m.geometry.dispose(); }
    for (const t of this.texts) t.el.remove();
    for (const o of this.own) o.dispose?.();
    this.pMesh.dispose();
  }
}
