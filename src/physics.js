// Escombros con física simple: gravedad, rebote contra el piso y los muros, fricción,
// giro, y caída al agua. Sirve para tablas de cajón, esquirlas de piedra, piezas de
// robot, rocas del gólem y casquillos.
import * as THREE from 'three';

const G = 24; // gravedad
const WALL_H = 1.0;

export class Debris {
  constructor(scene, world, { max = 170, onSplash = null } = {}) {
    this.scene = scene;
    this.world = world;
    this.max = max;
    this.onSplash = onSplash;
    this.bodies = [];
    const mk = (geo, mat) => {
      const m = new THREE.InstancedMesh(geo, mat, max);
      m.count = 0;
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;
      m.userData.noAO = true;
      m.setColorAt(0, new THREE.Color(0xffffff));
      scene.add(m);
      return m;
    };
    this.meshes = [
      mk(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75 })),
      mk(new THREE.IcosahedronGeometry(0.5, 0), new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true })),
    ];
    this.d = new THREE.Object3D();
    this.qSpin = new THREE.Quaternion();
    this.qFlat = new THREE.Quaternion();
    this.euler = new THREE.Euler();
    this.col = new THREE.Color();
  }

  // kind: 'box' (tablas, chapas, casquillos) o 'rock' (esquirlas, rocas).
  add(kind, x, y, z, vx, vy, vz, o = {}) {
    if (this.bodies.length >= this.max) this.bodies.shift();
    const s = o.size ?? 0.15;
    const [sx, sy, sz] = Array.isArray(s) ? s : [s, s, s];
    const ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    this.bodies.push({
      k: kind === 'rock' ? 1 : 0, x, y, z, vx, vy, vz, sx, sy, sz,
      r: Math.min(sx, sy, sz) * 0.5 + 0.015,
      q: new THREE.Quaternion().setFromAxisAngle(ax, Math.random() * 6.28), ax, w: (o.spin ?? 9) * (0.5 + Math.random()),
      color: o.color ?? 0x999999, glow: o.glow ?? 1, t: 0, life: (o.life ?? 7) * (0.8 + Math.random() * 0.4), rest: false,
    });
  }

  // Varias piezas saliendo de un punto, con empuje en una dirección (dx, dz) opcional.
  burst(kind, x, y, z, n, o = {}) {
    const colors = Array.isArray(o.color) ? o.color : [o.color ?? 0x999999];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = (o.speed ?? 4) * (0.35 + Math.random() * 0.9);
      const size = typeof o.size === 'function' ? o.size() : o.size;
      this.add(kind,
        x + Math.cos(a) * (o.spread ?? 0.25) * Math.random(), y + Math.random() * (o.height ?? 0.5), z + Math.sin(a) * (o.spread ?? 0.25) * Math.random(),
        Math.cos(a) * sp + (o.dx ?? 0), (o.up ?? 5) * (0.4 + Math.random() * 0.9), Math.sin(a) * sp + (o.dz ?? 0),
        { ...o, size, color: colors[Math.floor(Math.random() * colors.length)] });
    }
  }

  // Onda expansiva: despierta y empuja lo que esté cerca.
  impulse(x, z, radius, strength) {
    for (const b of this.bodies) {
      const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz);
      if (d > radius) continue;
      const k = strength * (1 - d / radius);
      b.vx += (dx / (d || 1)) * k;
      b.vz += (dz / (d || 1)) * k;
      b.vy += k * 0.8;
      b.w += k * 2;
      b.rest = false;
    }
  }

  floorAt(x, z) {
    const w = this.world;
    if (Math.abs(x) > w.W / 2 + 1 || Math.abs(z) > w.H / 2 + 1) return -3; // fuera de la isla: al mar
    const c = w.col(x), r = w.row(z), t = w.type(c, r);
    if (c < 0 || r < 0 || c >= w.W || r >= w.H) return 0.6; // borde de piedra
    if (t === 3) return -0.2; // agua
    return w.blocksShot(c, r) ? WALL_H : 0;
  }

  update(dt) {
    const counts = [0, 0];
    const d = this.d;
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const b = this.bodies[i];
      b.t += dt;
      if (b.t > b.life + 0.6) { this.bodies.splice(i, 1); continue; }
      if (!b.rest) {
        b.vy -= G * dt;
        // muros: se prueba cada eje por separado para rebotar en el que choca
        let nx = b.x + b.vx * dt;
        if (b.y < this.floorAt(nx, b.z) - 0.05) { b.vx *= -0.35; nx = b.x; b.w *= 0.6; }
        let nz = b.z + b.vz * dt;
        if (b.y < this.floorAt(nx, nz) - 0.05) { b.vz *= -0.35; nz = b.z; b.w *= 0.6; }
        b.x = nx; b.z = nz;
        b.y += b.vy * dt;
        const floor = this.floorAt(b.x, b.z);
        if (floor < -0.1 && b.y < floor + 0.15) {
          // cayó al agua
          this.onSplash?.(b.x, b.z, floor < -1 ? -3 : -0.14, Math.max(b.sx, b.sz));
          this.bodies.splice(i, 1);
          continue;
        }
        if (b.y < floor + b.r) {
          b.y = floor + b.r;
          const hard = -b.vy;
          b.vy = hard > 1.2 ? hard * 0.34 : 0;
          b.vx *= 0.72; b.vz *= 0.72;
          b.w *= 0.55;
          if (b.k === 0) {
            // las tablas terminan apoyadas de plano
            this.euler.setFromQuaternion(b.q, 'YXZ');
            this.qFlat.setFromEuler(this.euler.set(0, this.euler.y, 0, 'YXZ'));
            b.q.slerp(this.qFlat, hard > 1.2 ? 0.45 : 1);
          }
          if (b.vy === 0 && Math.hypot(b.vx, b.vz) < 0.35) { b.rest = true; b.vx = b.vz = 0; }
        }
        if (b.w > 0.05) b.q.premultiply(this.qSpin.setFromAxisAngle(b.ax, b.w * dt));
      }
      const fade = b.t > b.life ? Math.max(0, 1 - (b.t - b.life) / 0.6) : 1;
      const m = this.meshes[b.k], n = counts[b.k]++;
      d.position.set(b.x, b.y - (1 - fade) * b.r * 2, b.z);
      d.quaternion.copy(b.q);
      d.scale.set(b.sx * fade, b.sy * fade, b.sz * fade);
      d.updateMatrix();
      m.setMatrixAt(n, d.matrix);
      m.setColorAt(n, this.col.set(b.color).multiplyScalar(b.glow));
    }
    this.meshes.forEach((m, k) => {
      m.count = counts[k];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    });
  }

  dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      m.material.dispose();
      m.dispose();
    }
  }
}
