// Efectos: partículas, anillos, proyectiles y textos flotantes.
import * as THREE from 'three';
import { tex } from './assets.js';

const MAX = 700;
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

export class Fx {
  constructor(scene, layer) {
    this.scene = scene;
    this.layer = layer; // contenedor DOM para textos
    this.own = [];
    const keep = (o) => { this.own.push(o); return o; };

    // Partículas instanciadas.
    this.pGeo = keep(new THREE.IcosahedronGeometry(1, 0));
    this.pMat = keep(new THREE.MeshBasicMaterial({ toneMapped: false }));
    this.pMesh = new THREE.InstancedMesh(this.pGeo, this.pMat, MAX);
    this.pMesh.count = 0;
    this.pMesh.frustumCulled = false;
    this.pMesh.setColorAt(0, tmpColor.set(0xffffff));
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
    this.mats = new Map();
    this.rings = [];
    this.texts = [];
    this.textPool = [];
  }

  basic(color) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, toneMapped: false });
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

  burst(x, y, z, o = {}) {
    const n = o.n ?? 8, speed = o.speed ?? 4, life = o.life ?? 0.45, size = o.size ?? 0.09;
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
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }

  ring(x, z, r0, r1, color, dur = 0.35, fill = false) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
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
      if (p.y < 0.04) { p.y = 0.04; p.vy *= -0.35; }
    }
    for (const p of this.p) {
      const s = p.size * (1 - (p.t / p.life) ** 2);
      d.position.set(p.x, p.y, p.z);
      d.scale.setScalar(s);
      d.rotation.set(p.t * 7, p.t * 5, 0);
      d.updateMatrix();
      this.pMesh.setMatrixAt(n, d.matrix);
      this.pMesh.setColorAt(n, tmpColor.set(p.color));
      n++;
    }
    this.pMesh.count = n;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

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
    for (const r of this.rings) { r.m.material.dispose(); if (r.ownGeo) r.m.geometry.dispose(); }
    for (const t of this.texts) t.el.remove();
    for (const o of this.own) o.dispose?.();
    this.pMesh.dispose();
  }
}
