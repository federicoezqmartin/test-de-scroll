// Arena: grilla de colisiones + todo lo que se ve del escenario.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { MAP_HALF } from './data.js';

export const T = { FLOOR: 0, WALL: 1, CRATE: 2, WATER: 3, BUSH: 4, CORE: 5 };
const CHAR = { '.': T.FLOOR, '#': T.WALL, X: T.CRATE, '~': T.WATER, g: T.BUSH, M: T.CORE };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crateTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#c98d4b';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#b97b3c';
  for (let i = 0; i < 4; i++) g.fillRect(0, i * 32 + 14, 128, 3);
  g.strokeStyle = '#8a5526';
  g.lineWidth = 14;
  g.strokeRect(7, 7, 114, 114);
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(14, 14);
  g.lineTo(114, 114);
  g.stroke();
  g.fillStyle = '#5e3a1a';
  for (const [x, y] of [[14, 14], [114, 14], [14, 114], [114, 114]]) {
    g.beginPath();
    g.arc(x, y, 4, 0, 7);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class World {
  constructor(scene) {
    this.scene = scene;
    const top = MAP_HALF.map((h) => h + [...h.slice(0, -1)].reverse().join(''));
    const rows = [...top, ...top.slice(0, -1).reverse()];
    this.W = rows[0].length;
    this.H = rows.length;
    this.grid = new Uint8Array(this.W * this.H);
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) this.grid[r * this.W + c] = CHAR[rows[r][c]] ?? T.FLOOR;

    this.spawns = [
      [[10, this.H - 2], [7, this.H - 2], [13, this.H - 2]],
      [[10, 1], [13, 1], [7, 1]],
    ].map((list) => list.map(([c, r]) => ({ x: this.cx(c), z: this.cz(r) })));
    this.reactor = { x: 0, z: 0 };

    // Costo extra para caminar pegado a obstáculos (los bots doblan más abierto).
    this.cost = new Float32Array(this.W * this.H);
    for (let r = 0; r < this.H; r++)
      for (let c = 0; c < this.W; c++) {
        let near = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (this.blocksMove(c + dc, r + dr)) near++;
        this.cost[r * this.W + c] = near ? 0.35 : 0;
      }

    this.group = new THREE.Group();
    scene.add(this.group);
    this.disposables = [];
    this.build();
  }

  // --- grilla ---------------------------------------------------------------
  col(x) { return Math.floor(x + this.W / 2); }
  row(z) { return Math.floor(z + this.H / 2); }
  cx(c) { return c - this.W / 2 + 0.5; }
  cz(r) { return r - this.H / 2 + 0.5; }
  type(c, r) {
    if (c < 0 || r < 0 || c >= this.W || r >= this.H) return T.WALL;
    return this.grid[r * this.W + c];
  }
  blocksMove(c, r) { const t = this.type(c, r); return t === T.WALL || t === T.CRATE || t === T.WATER || t === T.CORE; }
  blocksShot(c, r) { const t = this.type(c, r); return t === T.WALL || t === T.CRATE || t === T.CORE; }
  shotBlockedAt(x, z) { return this.blocksShot(this.col(x), this.row(z)); }
  bushAt(x, z) { return this.type(this.col(x), this.row(z)) === T.BUSH; }

  circleFree(x, z, rad) {
    const c0 = this.col(x), r0 = this.row(z);
    for (let r = r0 - 1; r <= r0 + 1; r++)
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (!this.blocksMove(c, r)) continue;
        const minx = c - this.W / 2, minz = r - this.H / 2;
        const dx = x - Math.max(minx, Math.min(x, minx + 1));
        const dz = z - Math.max(minz, Math.min(z, minz + 1));
        if (dx * dx + dz * dz < rad * rad) return false;
      }
    return true;
  }

  // Saca un círculo de adentro de los obstáculos (deslizando por los bordes).
  resolve(p, rad) {
    const c0 = this.col(p.x), r0 = this.row(p.z);
    for (let r = r0 - 1; r <= r0 + 1; r++)
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        if (!this.blocksMove(c, r)) continue;
        const minx = c - this.W / 2, minz = r - this.H / 2;
        const nx = Math.max(minx, Math.min(p.x, minx + 1));
        const nz = Math.max(minz, Math.min(p.z, minz + 1));
        const dx = p.x - nx, dz = p.z - nz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rad * rad) continue;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), push = (rad - d) / d;
          p.x += dx * push;
          p.z += dz * push;
        } else {
          const l = p.x - minx, rr = minx + 1 - p.x, t = p.z - minz, b = minz + 1 - p.z;
          const m = Math.min(l, rr, t, b);
          if (m === l) p.x = minx - rad;
          else if (m === rr) p.x = minx + 1 + rad;
          else if (m === t) p.z = minz - rad;
          else p.z = minz + 1 + rad;
        }
      }
  }

  // Distancia que recorre un disparo antes de chocar (hasta max).
  rayShot(x, z, dx, dz, max) {
    const step = 0.1;
    for (let d = 0; d < max; d += step) if (this.shotBlockedAt(x + dx * d, z + dz * d)) return d;
    return max;
  }
  shotClear(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
    if (d < 0.01) return true;
    return this.rayShot(x0, z0, dx / d, dz / d, d) >= d;
  }
  walkClear(x0, z0, x1, z1, rad = 0.43) {
    const dx = x1 - x0, dz = z1 - z0, d = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(d / 0.3));
    for (let i = 1; i <= n; i++) if (!this.circleFree(x0 + (dx * i) / n, z0 + (dz * i) / n, rad)) return false;
    return true;
  }
  nearestFreeTile(c, r) {
    c = Math.max(0, Math.min(this.W - 1, c));
    r = Math.max(0, Math.min(this.H - 1, r));
    if (!this.blocksMove(c, r)) return { c, r };
    for (let ring = 1; ring < 8; ring++) {
      let best = null, bd = 1e9;
      for (let dr = -ring; dr <= ring; dr++)
        for (let dc = -ring; dc <= ring; dc++) {
          if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
          if (this.blocksMove(c + dc, r + dr)) continue;
          const d = dc * dc + dr * dr;
          if (d < bd) { bd = d; best = { c: c + dc, r: r + dr }; }
        }
      if (best) return best;
    }
    return { c, r };
  }
  nearestFree(x, z, rad = 0.4) {
    const lim = 0.5 + rad * 0.2;
    x = Math.max(-this.W / 2 + lim, Math.min(this.W / 2 - lim, x));
    z = Math.max(-this.H / 2 + lim, Math.min(this.H / 2 - lim, z));
    if (this.circleFree(x, z, rad)) return { x, z };
    const t = this.nearestFreeTile(this.col(x), this.row(z));
    return { x: this.cx(t.c), z: this.cz(t.r) };
  }

  // --- visual ---------------------------------------------------------------
  keep(o) { this.disposables.push(o); return o; }

  build() {
    const { W, H } = this;
    const rand = rng(7);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();

    // Piso: una losa por baldosa (las de agua van hundidas).
    const floorGeo = this.keep(new THREE.BoxGeometry(1, 0.6, 1));
    const floorMat = this.keep(new THREE.MeshStandardMaterial({ roughness: 0.95 }));
    const floor = new THREE.InstancedMesh(floorGeo, floorMat, W * H);
    floor.receiveShadow = true;
    let i = 0;
    const waterTiles = [], bushTiles = [], walls = [], crates = [];
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++) {
        const t = this.type(c, r);
        const x = this.cx(c), z = this.cz(r);
        const water = t === T.WATER;
        dummy.position.set(x, water ? -0.72 : -0.3, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        floor.setMatrixAt(i, dummy.matrix);
        const even = (c + r) % 2 === 0;
        if (water) col.set(0x1f7f96);
        else if (t === T.BUSH) col.set(even ? 0xbdbb68 : 0xb1af5c);
        else col.set(even ? 0xeccb86 : 0xdfb970);
        col.offsetHSL(0, 0, (rand() - 0.5) * 0.025);
        floor.setColorAt(i++, col);
        if (water) waterTiles.push([x, z]);
        if (t === T.BUSH) bushTiles.push([x, z]);
        if (t === T.WALL) walls.push([x, z, 0.92 + rand() * 0.14, 0]);
        if (t === T.CRATE) crates.push([x, z]);
      }
    this.group.add(floor);

    // Borde de la arena.
    for (let c = -1; c <= W; c++) {
      walls.push([this.cx(c), this.cz(-1), 0.8, 1]);
      walls.push([this.cx(c), this.cz(H), 0.4, 1]);
    }
    for (let r = 0; r < H; r++) {
      walls.push([this.cx(-1), this.cz(r), 0.6, 1]);
      walls.push([this.cx(W), this.cz(r), 0.6, 1]);
    }

    // Muros.
    const wallGeo = this.keep(new RoundedBoxGeometry(0.985, 1, 0.985, 2, 0.09));
    const pos = wallGeo.attributes.position;
    const shade = new Float32Array(pos.count * 3);
    for (let v = 0; v < pos.count; v++) {
      const k = pos.getY(v) > 0.3 ? 1 : 0.66;
      shade[v * 3] = shade[v * 3 + 1] = shade[v * 3 + 2] = k;
    }
    wallGeo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
    const wallMat = this.keep(new THREE.MeshStandardMaterial({ roughness: 0.8, vertexColors: true }));
    const wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, walls.length);
    wallMesh.castShadow = wallMesh.receiveShadow = true;
    const stone = [0x7c9bb0, 0x7392a8, 0x86a5b8];
    walls.forEach(([x, z, h, border], n) => {
      dummy.position.set(x, h / 2, z);
      dummy.scale.set(1, h, 1);
      dummy.updateMatrix();
      wallMesh.setMatrixAt(n, dummy.matrix);
      col.set(border ? 0x55708a : stone[Math.floor(rand() * 3)]);
      wallMesh.setColorAt(n, col);
    });
    this.group.add(wallMesh);

    // Cajones.
    if (crates.length) {
      const crateGeo = this.keep(new THREE.BoxGeometry(0.94, 0.94, 0.94));
      const crateMat = this.keep(new THREE.MeshStandardMaterial({ map: this.keep(crateTexture()), roughness: 0.85 }));
      const crateMesh = new THREE.InstancedMesh(crateGeo, crateMat, crates.length);
      crateMesh.castShadow = crateMesh.receiveShadow = true;
      crates.forEach(([x, z], n) => {
        dummy.position.set(x, 0.47, z);
        dummy.scale.set(1, 1, 1);
        dummy.rotation.set(0, Math.floor(rand() * 4) * (Math.PI / 2), 0);
        dummy.updateMatrix();
        crateMesh.setMatrixAt(n, dummy.matrix);
      });
      dummy.rotation.set(0, 0, 0);
      this.group.add(crateMesh);
    }

    // Agua.
    const waterGeo = this.keep(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
    this.waterMat = this.keep(new THREE.MeshStandardMaterial({
      color: 0x3fd0ee, transparent: true, opacity: 0.86, roughness: 0.12, metalness: 0.15,
      emissive: 0x0b5f7a, emissiveIntensity: 0.5,
    }));
    this.water = new THREE.InstancedMesh(waterGeo, this.waterMat, Math.max(1, waterTiles.length));
    this.water.count = waterTiles.length;
    waterTiles.forEach(([x, z], n) => {
      dummy.position.set(x, 0, z);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      this.water.setMatrixAt(n, dummy.matrix);
    });
    this.water.position.y = -0.16;
    this.water.receiveShadow = true;
    this.group.add(this.water);

    // Pasto alto: varios mechones por baldosa.
    const PER = 6;
    const bushGeo = this.keep(new THREE.IcosahedronGeometry(0.36, 0));
    const bushMat = this.keep(new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }));
    this.bushMesh = new THREE.InstancedMesh(bushGeo, bushMat, Math.max(1, bushTiles.length * PER));
    this.bushMesh.count = bushTiles.length * PER;
    this.bushMesh.castShadow = true;
    this.bushMesh.receiveShadow = true;
    this.bushPer = PER;
    this.bushes = [];
    this.bushIndex = new Map();
    const greens = [0x3fae4a, 0x2f9a41, 0x57c35c, 0x38a548];
    bushTiles.forEach(([x, z], n) => {
      const blobs = [];
      for (let k = 0; k < PER; k++) {
        const bx = x + (k % 3 - 1) * 0.3 + (rand() - 0.5) * 0.16;
        const bz = z + (k < 3 ? -0.2 : 0.2) + (rand() - 0.5) * 0.16;
        blobs.push({ x: bx, z: bz, sx: 0.85 + rand() * 0.3, sy: 1.25 + rand() * 0.45, ry: rand() * 6.28, ph: rand() * 6.28 });
        col.set(greens[Math.floor(rand() * greens.length)]);
        this.bushMesh.setColorAt(n * PER + k, col);
      }
      const b = { x, z, blobs, sq: 0, target: 0, dirty: true };
      this.bushes.push(b);
      this.bushIndex.set(this.row(z) * W + this.col(x), b);
    });
    this.group.add(this.bushMesh);
    this.dummy = dummy;

    // Base de la isla.
    const baseGeo = this.keep(new THREE.BoxGeometry(W + 2, 3, H + 2));
    const baseMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x3d5368, roughness: 1 }));
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = -2.1;
    base.receiveShadow = true;
    this.group.add(base);

    // Mar.
    const seaGeo = this.keep(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2));
    const seaMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x1a6d92, roughness: 0.35, metalness: 0.1 }));
    const sea = new THREE.Mesh(seaGeo, seaMat);
    sea.position.y = -3;
    this.group.add(sea);

    // Plataformas de salida.
    const padGeo = this.keep(new THREE.RingGeometry(0.34, 0.47, 28).rotateX(-Math.PI / 2));
    this.spawns.forEach((list, team) => {
      const mat = this.keep(new THREE.MeshBasicMaterial({
        color: team === 0 ? 0x2f9bff : 0xff4757, transparent: true, opacity: 0.55, depthWrite: false,
      }));
      for (const s of list) {
        const m = new THREE.Mesh(padGeo, mat);
        m.position.set(s.x, 0.02, s.z);
        this.group.add(m);
      }
    });

    this.buildReactor();
  }

  buildReactor() {
    const g = new THREE.Group();
    const metal = this.keep(new THREE.MeshStandardMaterial({ color: 0x33414f, roughness: 0.45, metalness: 0.6 }));
    const trim = this.keep(new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.5, metalness: 0.3 }));
    const glow = this.keep(new THREE.MeshStandardMaterial({ color: 0xd6ff4a, emissive: 0xc8ff3a, emissiveIntensity: 1.4, roughness: 0.3 }));
    const add = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(this.keep(geo), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      g.add(m);
      return m;
    };
    add(new THREE.CylinderGeometry(0.5, 0.56, 0.5, 8), metal, 0, 0.25, 0);
    add(new THREE.CylinderGeometry(0.42, 0.5, 0.12, 8), trim, 0, 0.56, 0);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      add(new THREE.CylinderGeometry(0.05, 0.07, 1.25, 6), metal, Math.cos(a) * 0.42, 0.9, Math.sin(a) * 0.42);
    }
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 8), metal, 0, 1.55, 0);
    this.coreOrb = add(new THREE.IcosahedronGeometry(0.27, 0), glow, 0, 1.05, 0);
    this.coreRing = add(new THREE.TorusGeometry(0.4, 0.035, 6, 24), trim, 0, 1.05, 0);
    this.coreLight = new THREE.PointLight(0xc8ff3a, 6, 7, 1.6);
    this.coreLight.position.set(0, 1.4, 0);
    g.add(this.coreLight);
    g.position.set(this.reactor.x, 0, this.reactor.z);
    this.group.add(g);
  }

  // Aplasta el pasto donde hay un luchador visible; el resto se mece.
  update(time, dt, occupied) {
    for (const b of this.bushes) b.target = 0;
    for (const o of occupied) {
      const b = this.bushIndex.get(this.row(o.z) * this.W + this.col(o.x));
      if (b) b.target = 1;
    }
    const d = this.dummy;
    let n = 0;
    for (const b of this.bushes) {
      b.sq += (b.target - b.sq) * Math.min(1, dt * 10);
      for (const k of b.blobs) {
        const sway = Math.sin(time * 1.7 + k.ph) * 0.05;
        const sy = k.sy * (1 - b.sq * 0.5);
        d.position.set(k.x, 0.36 * sy * 0.78, k.z);
        d.scale.set(k.sx * (1 + b.sq * 0.12), sy, k.sx * (1 + b.sq * 0.12));
        d.rotation.set(sway, k.ry, sway * 0.7);
        d.updateMatrix();
        this.bushMesh.setMatrixAt(n++, d.matrix);
      }
    }
    this.bushMesh.instanceMatrix.needsUpdate = true;
    d.rotation.set(0, 0, 0);

    this.water.position.y = -0.16 + Math.sin(time * 1.3) * 0.02;
    this.coreOrb.rotation.y = time * 1.4;
    this.coreOrb.rotation.x = time * 0.8;
    this.coreOrb.position.y = 1.05 + Math.sin(time * 2.2) * 0.07;
    this.coreRing.rotation.x = Math.PI / 2 + Math.sin(time * 1.1) * 0.5;
    this.coreRing.rotation.y = time * 0.9;
    this.coreLight.intensity = 5 + Math.sin(time * 5) * 1.2;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const o of this.disposables) o.dispose?.();
  }
}
